import { Contract, JsonRpcProvider, Network } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { walletLink } from '../db/repos/index.js';

export type SignalContext = {
  onChainCheckInAgeHours: number | null;
  walletLastTxAgeHours: number | null;
  telegramLastSeenAgeMin: number | null;
};

const EXPLORER_API_BASE = 'https://shannon-explorer.somnia.network/api/v2';
const CORE_VIEW_ABI = [
  'function getWillInfo(address) view returns (address, uint256, uint256, uint256, bool, bool)',
];

let _coreContract: Contract | null = null;

function getCoreContract(): Contract | null {
  if (!config.contracts.core) return null;
  if (!_coreContract) {
    const network = new Network(config.network, config.chainId);
    const provider = new JsonRpcProvider(config.rpc, network, { staticNetwork: network });
    _coreContract = new Contract(config.contracts.core, CORE_VIEW_ABI, provider);
  }
  return _coreContract;
}

export async function aggregateSignals(userAddress: string): Promise<SignalContext> {
  const now = Date.now();

  let onChainCheckInAgeHours: number | null = null;
  try {
    const core = getCoreContract();
    if (core) {
      const info = await core.getFunction('getWillInfo')(userAddress);
      const lastCheckIn = Number(info[1]);
      if (lastCheckIn > 0) {
        onChainCheckInAgeHours = Math.floor((now / 1000 - lastCheckIn) / 3600);
      }
    }
  } catch (err) {
    logger.warn({ userAddress, err }, 'aggregateSignals: getWillInfo failed');
  }

  let walletLastTxAgeHours: number | null = null;
  try {
    const url = `${EXPLORER_API_BASE}/addresses/${userAddress}/transactions?limit=1`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = (await resp.json()) as { items?: Array<{ timestamp?: string }> };
      const lastTx = data.items?.[0];
      if (lastTx?.timestamp) {
        const txTimeMs = new Date(lastTx.timestamp).getTime();
        walletLastTxAgeHours = Math.floor((now - txTimeMs) / 3600000);
      }
    } else {
      logger.debug({ status: resp.status }, 'aggregateSignals: explorer non-200');
    }
  } catch (err) {
    logger.warn({ userAddress, err }, 'aggregateSignals: explorer fetch failed');
  }

  let telegramLastSeenAgeMin: number | null = null;
  try {
    const link = await walletLink.getByWallet(userAddress);
    if (link?.last_seen_at) {
      telegramLastSeenAgeMin = Math.floor((now - link.last_seen_at) / 60000);
    }
  } catch (err) {
    logger.warn({ userAddress, err }, 'aggregateSignals: wallet_link query failed');
  }

  return { onChainCheckInAgeHours, walletLastTxAgeHours, telegramLastSeenAgeMin };
}

export function signalsToString(s: SignalContext): string {
  const parts: string[] = [];
  if (s.onChainCheckInAgeHours !== null) {
    parts.push(`checkInAgeHours=${s.onChainCheckInAgeHours}`);
  }
  if (s.walletLastTxAgeHours !== null) {
    parts.push(`walletTxAgeHours=${s.walletLastTxAgeHours}`);
  }
  if (s.telegramLastSeenAgeMin !== null) {
    parts.push(`tgLastSeenMin=${s.telegramLastSeenAgeMin}`);
  } else {
    parts.push('tgLastSeenMin=unlinked');
  }
  return parts.join('; ');
}
