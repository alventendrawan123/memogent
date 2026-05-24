import { config } from '../config.js';
import { logger } from '../logger.js';
import { createAutoAssessLoop, type AutoAssessLoop } from './autoAssess.js';

const TICK_INTERVAL_MS = 5 * 60 * 1000;

export type DispatcherService = AutoAssessLoop;

export function createDispatcher(): DispatcherService | null {
  if (!config.contracts.agent) {
    logger.warn('Dispatcher disabled: MEMOGENT_AGENT_ADDRESS not set');
    return null;
  }
  if (!config.servicePrivateKey) {
    logger.warn('Dispatcher disabled: SERVICE_PRIVATE_KEY not set');
    return null;
  }
  return createAutoAssessLoop(TICK_INTERVAL_MS);
}
