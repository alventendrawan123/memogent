import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';

const CORE_ABI = [
  'function getVaultHistory(address user) view returns (tuple(uint8 actType, address asset, uint256 amount, uint256 timestamp, uint256 blockNumber)[])',
  'event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)',
];

const ERC20_META_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const ACT_DEPOSIT_STT = 0;
const ACT_DEPOSIT_TOKEN = 1;
const ACT_DEPOSIT_NFT = 2;
const ACT_WITHDRAW_STT = 3;
const ACT_WITHDRAW_TOKEN = 4;
const ACT_WITHDRAW_NFT = 5;

export type TokenDelivered = {
  address: string;
  amount: bigint;
  symbol: string;
  decimals: number;
  formatted: string;
};

export type NftDelivered = {
  contract: string;
  tokenId: bigint;
};

export type AssetSummary = {
  sttAmount: bigint;
  sttFormatted: string;
  tokens: TokenDelivered[];
  nfts: NftDelivered[];
};

export async function computeDeliveredAssets(owner: string): Promise<AssetSummary> {
  if (!config.contracts.core) {
    return { sttAmount: 0n, sttFormatted: '0', tokens: [], nfts: [] };
  }
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const core = new ethers.Contract(config.contracts.core, CORE_ABI, provider);

  type VaultRow = {
    actType: bigint;
    asset: string;
    amount: bigint;
    timestamp: bigint;
    blockNumber: bigint;
  };
  let history: VaultRow[];
  try {
    history = (await core.getFunction('getVaultHistory')(owner)) as VaultRow[];
  } catch (err) {
    logger.warn({ owner, err }, 'computeDeliveredAssets: getVaultHistory failed');
    return { sttAmount: 0n, sttFormatted: '0', tokens: [], nfts: [] };
  }

  let sttAmount = 0n;
  const tokenTotals = new Map<string, bigint>();
  const nftSet = new Set<string>();

  for (const r of history) {
    const key = r.asset.toLowerCase();
    const act = Number(r.actType);
    switch (act) {
      case ACT_DEPOSIT_STT:
        sttAmount += r.amount;
        break;
      case ACT_WITHDRAW_STT:
        sttAmount -= r.amount;
        break;
      case ACT_DEPOSIT_TOKEN:
        tokenTotals.set(key, (tokenTotals.get(key) ?? 0n) + r.amount);
        break;
      case ACT_WITHDRAW_TOKEN:
        tokenTotals.set(key, (tokenTotals.get(key) ?? 0n) - r.amount);
        break;
      case ACT_DEPOSIT_NFT:
        nftSet.add(`${key}:${r.amount}`);
        break;
      case ACT_WITHDRAW_NFT:
        nftSet.delete(`${key}:${r.amount}`);
        break;
    }
  }

  if (sttAmount < 0n) sttAmount = 0n;
  const activeTokens = [...tokenTotals.entries()].filter(([, amt]) => amt > 0n);

  const tokens: TokenDelivered[] = await Promise.all(
    activeTokens.map(async ([addr, amount]) => {
      let symbol = 'TOKEN';
      let decimals = 18;
      try {
        const erc20 = new ethers.Contract(addr, ERC20_META_ABI, provider);
        const [sym, dec] = await Promise.all([
          erc20.getFunction('symbol')() as Promise<string>,
          erc20.getFunction('decimals')() as Promise<bigint>,
        ]);
        symbol = sym;
        decimals = Number(dec);
      } catch {
        // fallback to defaults
      }
      return {
        address: ethers.getAddress(addr),
        amount,
        symbol,
        decimals,
        formatted: trimZeros(ethers.formatUnits(amount, decimals)),
      };
    }),
  );

  const nfts: NftDelivered[] = [...nftSet].map((s) => {
    const sep = s.lastIndexOf(':');
    return {
      contract: ethers.getAddress(s.slice(0, sep)),
      tokenId: BigInt(s.slice(sep + 1)),
    };
  });

  return {
    sttAmount,
    sttFormatted: trimZeros(ethers.formatEther(sttAmount)),
    tokens,
    nfts,
  };
}

export function formatAssetSummary(summary: AssetSummary): string {
  const lines: string[] = [];
  if (summary.sttAmount > 0n) {
    lines.push(`• \`${summary.sttFormatted}\` *STT* (native)`);
  }
  for (const t of summary.tokens) {
    lines.push(`• \`${t.formatted}\` *${escapeMd(t.symbol)}* (\`${t.address}\`)`);
  }
  for (const n of summary.nfts) {
    lines.push(`• NFT *#${n.tokenId.toString()}* (\`${n.contract}\`)`);
  }
  if (lines.length === 0) {
    return '_(No on-chain assets — capsule only.)_';
  }
  return lines.join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[\]])/g, '\\$1');
}

function trimZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}
