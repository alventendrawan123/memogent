import { formatDistanceToNowStrict } from "date-fns";
import { formatEther } from "viem";
import { SHANNON_EXPLORER } from "./contracts";

export function shortAddress(address: string | undefined, chars = 4) {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function formatStt(value: bigint | undefined) {
  if (value === undefined) return "0";
  return formatEther(value);
}

export function relativeTime(timestampSeconds: bigint | number | undefined) {
  if (!timestampSeconds) return "—";
  const ms = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return formatDistanceToNowStrict(new Date(ms), { addSuffix: true });
}

export function explorerTx(hash: string) {
  return `${SHANNON_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${SHANNON_EXPLORER}/address/${address}`;
}

export function daysToSeconds(days: number) {
  return BigInt(Math.max(1, Math.floor(days)) * 86400);
}
