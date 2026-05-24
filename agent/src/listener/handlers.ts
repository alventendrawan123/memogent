import { logger } from '../logger.js';
import { notifyRiskDecision, notifyWillExecuted, type RiskClassification } from '../telegram/dispatcher.js';
import { fetchCapsule } from './capsuleClient.js';

export type { RiskClassification };

export type CapsuleAttachedEvent = {
  owner: string;
  beneficiary: string;
  cid: string;
  contentHash: string;
  txHash: string;
  blockNumber: number;
};

export async function onCapsuleAttached(event: CapsuleAttachedEvent): Promise<void> {
  logger.info(
    {
      owner: event.owner,
      beneficiary: event.beneficiary,
      cid: event.cid,
      tx: event.txHash,
      block: event.blockNumber,
    },
    'Capsule attached'
  );
}

export type AssessmentRequestedEvent = {
  requestId: bigint;
  user: string;
  deposit: bigint;
  txHash: string;
  blockNumber: number;
};

export type RiskDecisionEvent = {
  user: string;
  classification: RiskClassification;
  timestamp: bigint;
  txHash: string;
  blockNumber: number;
};

export type ExecutionTriggeredEvent = {
  user: string;
  txHash: string;
  blockNumber: number;
};

export type WillExecutedEvent = {
  owner: string;
  beneficiary: string;
  executedAt: bigint;
  txHash: string;
  blockNumber: number;
};

export async function onAssessmentRequested(event: AssessmentRequestedEvent): Promise<void> {
  logger.info(
    {
      requestId: event.requestId.toString(),
      user: event.user,
      depositSTT: Number(event.deposit) / 1e18,
      tx: event.txHash,
      block: event.blockNumber,
    },
    'Assessment requested'
  );
}

export async function onRiskDecision(event: RiskDecisionEvent): Promise<void> {
  logger.info(
    {
      user: event.user,
      classification: event.classification,
      tx: event.txHash,
      block: event.blockNumber,
    },
    'Risk decision received'
  );
  await notifyRiskDecision(event.user, event.classification);
}

export async function onExecutionTriggered(event: ExecutionTriggeredEvent): Promise<void> {
  logger.warn(
    {
      user: event.user,
      tx: event.txHash,
      block: event.blockNumber,
    },
    'Execution triggered — inheritance about to fire'
  );
}

export async function onWillExecuted(event: WillExecutedEvent): Promise<void> {
  const capsule = await fetchCapsule(event.owner);
  logger.warn(
    {
      owner: event.owner,
      beneficiary: event.beneficiary,
      executedAt: new Date(Number(event.executedAt) * 1000).toISOString(),
      tx: event.txHash,
      block: event.blockNumber,
      capsuleCid: capsule?.cid ?? null,
    },
    'Will EXECUTED — assets transferred to beneficiary'
  );
  await notifyWillExecuted(event.owner, event.beneficiary, capsule?.cid);
}
