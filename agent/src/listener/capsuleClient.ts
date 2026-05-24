import { Contract, JsonRpcProvider, Network } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { TIME_CAPSULE_VIEW } from './abi.js';

export type CapsuleInfo = {
  cid: string;
  contentHash: string;
  attachedAt: bigint;
};

let _capsuleContract: Contract | null = null;

function getCapsuleContract(): Contract | null {
  if (!config.contracts.capsule) {
    return null;
  }
  if (!_capsuleContract) {
    const network = new Network(config.network, config.chainId);
    const provider = new JsonRpcProvider(config.rpc, network, { staticNetwork: network });
    _capsuleContract = new Contract(
      config.contracts.capsule,
      [...TIME_CAPSULE_VIEW],
      provider
    );
  }
  return _capsuleContract;
}

export async function fetchCapsule(owner: string): Promise<CapsuleInfo | null> {
  const contract = getCapsuleContract();
  if (!contract) {
    return null;
  }
  try {
    const fn = contract.getFunction('getCapsule');
    const result = await fn(owner);
    const cid = result[0] as string;
    const contentHash = result[1] as string;
    const attachedAt = result[2] as bigint;
    if (!cid || cid === '') {
      return null;
    }
    return { cid, contentHash, attachedAt };
  } catch (err) {
    logger.warn({ owner, err }, 'fetchCapsule failed');
    return null;
  }
}

