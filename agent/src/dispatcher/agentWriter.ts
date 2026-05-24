import { Contract, JsonRpcProvider, Network, Wallet, parseEther } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';

const AGENT_WRITE_ABI = [
  'function assessRisk(address user) external payable returns (uint256)',
  'function assessRiskWithContext(address user, string calldata extraSignals) external payable returns (uint256)',
  'function generateEmpathyMessage(address user) external payable returns (uint256)',
];

const ASSESS_DEPOSIT_WEI = parseEther('0.4');
const ASSESS_GAS_LIMIT = 10_000_000n;

let _contract: Contract | null = null;

function getContract(): Contract | null {
  if (!config.contracts.agent || !config.servicePrivateKey) {
    return null;
  }
  if (!_contract) {
    const network = new Network(config.network, config.chainId);
    const provider = new JsonRpcProvider(config.rpc, network, { staticNetwork: network });
    const wallet = new Wallet(config.servicePrivateKey, provider);
    _contract = new Contract(config.contracts.agent, AGENT_WRITE_ABI, wallet);
  }
  return _contract;
}

export async function dispatchAssessRisk(user: string): Promise<string | null> {
  const contract = getContract();
  if (!contract) {
    logger.warn({ user }, 'agentWriter: contract not configured');
    return null;
  }
  try {
    const fn = contract.getFunction('assessRisk');
    const tx = await fn(user, {
      value: ASSESS_DEPOSIT_WEI,
      gasLimit: ASSESS_GAS_LIMIT,
    });
    logger.info({ user, tx: tx.hash, depositSTT: 0.4 }, 'dispatchAssessRisk: tx sent');
    return tx.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user, error: msg }, 'dispatchAssessRisk failed');
    return null;
  }
}

export async function dispatchAssessRiskWithContext(
  user: string,
  contextString: string
): Promise<string | null> {
  const contract = getContract();
  if (!contract) {
    logger.warn({ user }, 'agentWriter: contract not configured');
    return null;
  }
  try {
    const fn = contract.getFunction('assessRiskWithContext');
    const tx = await fn(user, contextString, {
      value: ASSESS_DEPOSIT_WEI,
      gasLimit: ASSESS_GAS_LIMIT,
    });
    logger.info(
      { user, tx: tx.hash, depositSTT: 0.4, context: contextString },
      'dispatchAssessRiskWithContext: tx sent'
    );
    return tx.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user, context: contextString, error: msg }, 'dispatchAssessRiskWithContext failed');
    return null;
  }
}

export async function dispatchGenerateEmpathy(user: string): Promise<string | null> {
  const contract = getContract();
  if (!contract) {
    logger.warn({ user }, 'agentWriter: contract not configured');
    return null;
  }
  try {
    const fn = contract.getFunction('generateEmpathyMessage');
    const tx = await fn(user, {
      value: ASSESS_DEPOSIT_WEI,
      gasLimit: ASSESS_GAS_LIMIT,
    });
    logger.info({ user, tx: tx.hash, depositSTT: 0.4 }, 'dispatchGenerateEmpathy: tx sent');
    return tx.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user, error: msg }, 'dispatchGenerateEmpathy failed');
    return null;
  }
}
