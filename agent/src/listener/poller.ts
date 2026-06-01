import type {
  Contract,
  ContractEventName,
  EventLog,
  JsonRpcProvider,
  Log,
} from 'ethers';
import { logger } from '../logger.js';

/**
 * Generic chunked event poller.
 *
 * Replaces ethers v6 `contract.on(event, handler)` which silently breaks on
 * Somnia testnet because the RPC caps eth_getLogs at 1000-block ranges. With
 * Somnia's ~50ms block time, even a few seconds of polling lag pushes the
 * accumulated range past the cap and the built-in PollingEventSubscriber
 * silently stops firing.
 *
 * This implementation polls `eth_getLogs` every `intervalMs` and chunks the
 * catch-up window into 999-block requests, swallowing transient RPC errors
 * so one bad poll does not kill the subscription.
 */
export class EventPoller<TName extends string = string> {
  private lastBlock = 0;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;
  private stopped = false;

  constructor(
    private readonly provider: JsonRpcProvider,
    private readonly contract: Contract,
    private readonly event: TName,
    private readonly handler: (log: EventLog) => Promise<void>,
    private readonly opts: {
      intervalMs: number;
      chunkSize?: number;
      label?: string;
    },
  ) {}

  get label(): string {
    return this.opts.label ?? this.event;
  }

  async start(startBlock?: number): Promise<void> {
    this.lastBlock = startBlock ?? (await this.provider.getBlockNumber());
    logger.info(
      { event: this.label, fromBlock: this.lastBlock, intervalMs: this.opts.intervalMs },
      'EventPoller starting',
    );
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info({ event: this.label }, 'EventPoller stopped');
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, this.opts.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    if (this.tickInFlight) {
      this.scheduleNext();
      return;
    }
    this.tickInFlight = true;
    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock > this.lastBlock) {
        await this.fetchChunked(this.lastBlock + 1, currentBlock);
        this.lastBlock = currentBlock;
      }
    } catch (err) {
      if (!this.stopped) {
        logger.warn(
          { event: this.label, err: (err as Error).message },
          'EventPoller tick failed (will retry next interval)',
        );
      }
    } finally {
      this.tickInFlight = false;
      this.scheduleNext();
    }
  }

  private async fetchChunked(from: number, to: number): Promise<void> {
    const chunkSize = this.opts.chunkSize ?? 999;
    let cursor = from;
    while (cursor <= to) {
      if (this.stopped) return;
      const chunkEnd = Math.min(cursor + chunkSize - 1, to);
      try {
        const logs = (await this.contract.queryFilter(
          this.event as ContractEventName,
          cursor,
          chunkEnd,
        )) as Log[];
        for (const log of logs) {
          if (!('args' in log)) continue;
          try {
            await this.handler(log as EventLog);
          } catch (handlerErr) {
            logger.error(
              {
                event: this.label,
                tx: log.transactionHash,
                err: (handlerErr as Error).message,
              },
              'EventPoller handler threw (logged, continuing)',
            );
          }
        }
        if (logs.length > 0) {
          logger.debug(
            { event: this.label, from: cursor, to: chunkEnd, count: logs.length },
            'EventPoller chunk yielded logs',
          );
        }
      } catch (err) {
        if (!this.stopped) {
          logger.warn(
            {
              event: this.label,
              from: cursor,
              to: chunkEnd,
              err: (err as Error).message,
            },
            'EventPoller chunk failed (skipping)',
          );
        }
      }
      cursor = chunkEnd + 1;
    }
  }
}
