import { Contract, JsonRpcProvider, type ContractEventPayload } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MEMOGENT_AGENT_EVENTS, MEMOGENT_CORE_EVENTS } from './abi.js';
import {
  onAssessmentRequested,
  onRiskDecision,
  onExecutionTriggered,
  onWillExecuted,
} from './handlers.js';

export type Listener = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createListener(): Listener | null {
  if (!config.contracts.core || !config.contracts.agent) {
    logger.warn('Contract addresses not set — listener disabled');
    return null;
  }

  const provider = new JsonRpcProvider(config.rpc, {
    chainId: config.chainId,
    name: config.network,
  });

  const agentContract = new Contract(config.contracts.agent, [...MEMOGENT_AGENT_EVENTS], provider);
  const coreContract = new Contract(config.contracts.core, [...MEMOGENT_CORE_EVENTS], provider);

  return {
    async start() {
      logger.info(
        { core: config.contracts.core, agent: config.contracts.agent },
        'Starting event listener'
      );

      await agentContract.on('AssessmentRequested', async (requestId, user, deposit, eventArg) => {
        const evt = eventArg as ContractEventPayload;
        await onAssessmentRequested({
          requestId,
          user,
          deposit,
          txHash: evt.log.transactionHash,
          blockNumber: evt.log.blockNumber,
        });
      });

      await agentContract.on('RiskDecision', async (user, classification, timestamp, eventArg) => {
        const evt = eventArg as ContractEventPayload;
        await onRiskDecision({
          user,
          classification,
          timestamp,
          txHash: evt.log.transactionHash,
          blockNumber: evt.log.blockNumber,
        });
      });

      await agentContract.on('ExecutionTriggered', async (user, eventArg) => {
        const evt = eventArg as ContractEventPayload;
        await onExecutionTriggered({
          user,
          txHash: evt.log.transactionHash,
          blockNumber: evt.log.blockNumber,
        });
      });

      await coreContract.on('WillExecuted', async (owner, beneficiary, executedAt, eventArg) => {
        const evt = eventArg as ContractEventPayload;
        await onWillExecuted({
          owner,
          beneficiary,
          executedAt,
          txHash: evt.log.transactionHash,
          blockNumber: evt.log.blockNumber,
        });
      });

      const currentBlock = await provider.getBlockNumber();
      logger.info({ currentBlock }, 'Listener subscribed to events');
    },

    async stop() {
      logger.info('Stopping listener');
      await agentContract.removeAllListeners();
      await coreContract.removeAllListeners();
      provider.destroy();
    },
  };
}
