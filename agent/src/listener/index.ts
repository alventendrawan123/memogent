import { Contract, type EventLog, JsonRpcProvider, Network } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MEMOGENT_AGENT_EVENTS, MEMOGENT_CORE_EVENTS, TIME_CAPSULE_EVENTS } from './abi.js';
import {
  onAssessmentRequested,
  onCapsuleAttached,
  onEmpathyMessageGenerated,
  onExecutionTriggered,
  onRiskDecision,
  onWillExecuted,
  onWillRegistered,
} from './handlers.js';
import { EventPoller } from './poller.js';

const POLL_INTERVAL_MS = 4000;

export type Listener = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createListener(): Listener | null {
  if (!config.contracts.core || !config.contracts.agent) {
    logger.warn('Contract addresses not set — listener disabled');
    return null;
  }

  const network = new Network(config.network, config.chainId);
  const provider = new JsonRpcProvider(config.rpc, network, { staticNetwork: network });

  const agentContract = new Contract(config.contracts.agent, [...MEMOGENT_AGENT_EVENTS], provider);
  const coreContract = new Contract(config.contracts.core, [...MEMOGENT_CORE_EVENTS], provider);
  const capsuleContract = config.contracts.capsule
    ? new Contract(config.contracts.capsule, [...TIME_CAPSULE_EVENTS], provider)
    : null;

  const pollers: EventPoller[] = [
    new EventPoller(
      provider,
      agentContract,
      'AssessmentRequested',
      async (log: EventLog) => {
        await onAssessmentRequested({
          requestId: log.args[0] as bigint,
          user: log.args[1] as string,
          deposit: log.args[2] as bigint,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'AssessmentRequested' },
    ),
    new EventPoller(
      provider,
      agentContract,
      'RiskDecision',
      async (log: EventLog) => {
        await onRiskDecision({
          user: log.args[0] as string,
          classification: log.args[1] as string,
          timestamp: log.args[2] as bigint,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'RiskDecision' },
    ),
    new EventPoller(
      provider,
      agentContract,
      'ExecutionTriggered',
      async (log: EventLog) => {
        await onExecutionTriggered({
          user: log.args[0] as string,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'ExecutionTriggered' },
    ),
    new EventPoller(
      provider,
      agentContract,
      'EmpathyMessageGenerated',
      async (log: EventLog) => {
        await onEmpathyMessageGenerated({
          user: log.args[0] as string,
          message: log.args[1] as string,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'EmpathyMessageGenerated' },
    ),
    new EventPoller(
      provider,
      coreContract,
      'WillRegistered',
      async (log: EventLog) => {
        await onWillRegistered({
          owner: log.args[0] as string,
          beneficiary: log.args[1] as string,
          deadlineMs: log.args[2] as bigint,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'WillRegistered' },
    ),
    new EventPoller(
      provider,
      coreContract,
      'WillExecuted',
      async (log: EventLog) => {
        await onWillExecuted({
          owner: log.args[0] as string,
          beneficiary: log.args[1] as string,
          executedAt: log.args[2] as bigint,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      },
      { intervalMs: POLL_INTERVAL_MS, label: 'WillExecuted' },
    ),
  ];

  if (capsuleContract) {
    pollers.push(
      new EventPoller(
        provider,
        capsuleContract,
        'CapsuleAttached',
        async (log: EventLog) => {
          await onCapsuleAttached({
            owner: log.args[0] as string,
            beneficiary: log.args[1] as string,
            cid: log.args[2] as string,
            contentHash: log.args[3] as string,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        },
        { intervalMs: POLL_INTERVAL_MS, label: 'CapsuleAttached' },
      ),
    );
  }

  return {
    async start() {
      const startBlock = await provider.getBlockNumber();
      logger.info(
        {
          core: config.contracts.core,
          agent: config.contracts.agent,
          capsule: config.contracts.capsule || '(disabled)',
          startBlock,
          pollerCount: pollers.length,
          pollIntervalMs: POLL_INTERVAL_MS,
        },
        'Starting event listener (chunked-polling mode)',
      );
      await Promise.all(pollers.map((p) => p.start(startBlock)));
    },

    async stop() {
      logger.info('Stopping listener');
      for (const poller of pollers) poller.stop();
      provider.destroy();
    },
  };
}
