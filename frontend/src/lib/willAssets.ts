import {
  type Address,
  erc20Abi,
  formatEther,
  formatUnits,
  parseAbiItem,
} from "viem";
import { getPublicClient, readContract } from "wagmi/actions";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import { CONTRACTS } from "./contracts";
import { findLatestLog } from "./somniaLogs";
import { wagmiConfig } from "./wagmi";

export type TokenDelivered = {
  address: Address;
  amount: bigint;
  symbol: string;
  decimals: number;
  formatted: string;
};

export type NftDelivered = {
  contract: Address;
  tokenId: bigint;
};

export type ExecutionInfo = {
  txHash: `0x${string}`;
  blockNumber: bigint;
  executedAt: bigint;
};

export type AssetSummary = {
  sttAmount: bigint;
  sttFormatted: string;
  tokens: TokenDelivered[];
  nfts: NftDelivered[];
  execution: ExecutionInfo | null;
};

const ACT_DEPOSIT_STT = 0;
const ACT_DEPOSIT_TOKEN = 1;
const ACT_DEPOSIT_NFT = 2;
const ACT_WITHDRAW_STT = 3;
const ACT_WITHDRAW_TOKEN = 4;
const ACT_WITHDRAW_NFT = 5;

const WILL_EXECUTED_EVENT = parseAbiItem(
  "event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)",
);

export async function computeDeliveredAssets(
  owner: Address,
): Promise<AssetSummary> {
  const history = (await readContract(wagmiConfig, {
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "getVaultHistory",
    args: [owner],
  })) as ReadonlyArray<{
    actType: number;
    asset: Address;
    amount: bigint;
    timestamp: bigint;
    blockNumber: bigint;
  }>;

  let sttAmount = 0n;
  const tokenTotals = new Map<string, bigint>();
  const nftSet = new Set<string>();

  for (const r of history) {
    const key = r.asset.toLowerCase();
    switch (r.actType) {
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
      let symbol = "TOKEN";
      let decimals = 18;
      try {
        const [s, d] = await Promise.all([
          readContract(wagmiConfig, {
            address: addr as Address,
            abi: erc20Abi,
            functionName: "symbol",
          }),
          readContract(wagmiConfig, {
            address: addr as Address,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);
        symbol = s as string;
        decimals = Number(d);
      } catch (err) {
        console.warn(
          `[willAssets] ERC20 metadata fetch failed for ${addr}`,
          err,
        );
      }
      return {
        address: addr as Address,
        amount,
        symbol,
        decimals,
        formatted: trimZeros(formatUnits(amount, decimals)),
      };
    }),
  );

  const nfts: NftDelivered[] = [...nftSet].map((s) => {
    const sep = s.lastIndexOf(":");
    return {
      contract: s.slice(0, sep) as Address,
      tokenId: BigInt(s.slice(sep + 1)),
    };
  });

  const execution = await fetchExecution(owner);

  return {
    sttAmount,
    sttFormatted: trimZeros(formatEther(sttAmount)),
    tokens,
    nfts,
    execution,
  };
}

async function fetchExecution(owner: Address): Promise<ExecutionInfo | null> {
  const client = getPublicClient(wagmiConfig);
  if (!client) return null;
  try {
    const log = await findLatestLog(client, {
      address: CONTRACTS.memogentCore,
      event: WILL_EXECUTED_EVENT,
      args: { owner },
    });
    if (!log?.transactionHash || log.blockNumber == null) return null;
    return {
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      executedAt: log.args?.executedAt ?? 0n,
    };
  } catch {
    return null;
  }
}

function trimZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}
