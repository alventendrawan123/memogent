import { config } from '../config.js';
import { trackedWill } from '../db/repos/index.js';
import type { TrackedWill } from '../db/types.js';
import { dispatchAssessRiskWithContext } from './agentWriter.js';
import { aggregateSignals, signalsToString } from './signalAggregator.js';
import { logger } from '../logger.js';

export function shouldAssess(will: TrackedWill, now: number): boolean {
  if (!will.active) return false;
  if (now >= will.deadline_ms) return false;
  const last = will.last_assessed_at_ms ?? 0;
  return now - last >= config.dispatcher.cooldownMs;
}

export function elapsedPercent(will: TrackedWill, now: number): number {
  const elapsed = now - will.registered_at_ms;
  const period = will.inactive_period_sec * 1000;
  if (period <= 0) return 0;
  return Math.min(100, Math.floor((elapsed / period) * 100));
}

export async function autoAssessTick(): Promise<void> {
  const wills = await trackedWill.listActive();
  if (wills.length === 0) {
    logger.debug('autoAssess tick: no active wills tracked');
    return;
  }

  const now = Date.now();
  logger.info({ activeCount: wills.length }, 'autoAssess tick');

  for (const will of wills) {
    const pct = elapsedPercent(will, now);
    if (!shouldAssess(will, now)) {
      logger.debug(
        {
          owner: will.owner_address,
          pct,
          lastAssessedAgo: will.last_assessed_at_ms
            ? Math.floor((now - will.last_assessed_at_ms) / 60_000)
            : null,
          activeReason: !will.active ? 'inactive' : now >= will.deadline_ms ? 'past-deadline' : 'cooldown',
        },
        'autoAssess: skipping will'
      );
      continue;
    }

    const signals = await aggregateSignals(will.owner_address);
    const contextString = signalsToString(signals);
    logger.info(
      {
        owner: will.owner_address,
        pct,
        lastClassification: will.last_classification,
        signals,
      },
      'autoAssess: dispatching assessRiskWithContext'
    );
    const txHash = await dispatchAssessRiskWithContext(will.owner_address, contextString);

    // Stamp cooldown immediately on a successful dispatch so the next tick
    // doesn't re-fire the same assessment. Previously this relied on the
    // `AssessmentRequested` event handler updating `last_assessed_at_ms`,
    // which leaves a 60+ second window where the Worker can re-dispatch and
    // burn LLM deposit (each dispatch costs ~0.4 STT). The handler still runs
    // later — it just refines `last_classification` once the LLM verdict
    // lands. If the dispatch tx itself failed (txHash === null), skip the
    // stamp so the next tick retries.
    if (txHash) {
      try {
        await trackedWill.recordAssessment(will.owner_address, will.last_classification, now);
      } catch (err) {
        logger.warn(
          { owner: will.owner_address, err },
          'autoAssess: failed to stamp last_assessed_at_ms (cooldown may not engage)',
        );
      }
    }
  }
}

export type AutoAssessLoop = {
  start: () => void;
  stop: () => void;
};

export function createAutoAssessLoop(intervalMs: number): AutoAssessLoop {
  let timer: NodeJS.Timeout | null = null;

  const runTick = (): void => {
    void autoAssessTick().catch((err: unknown) => {
      logger.error({ err }, 'autoAssess tick crashed');
    });
  };

  return {
    start() {
      logger.info({ intervalMin: intervalMs / 60_000 }, 'autoAssess loop starting');
      runTick();
      timer = setInterval(runTick, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info('autoAssess loop stopped');
      }
    },
  };
}
