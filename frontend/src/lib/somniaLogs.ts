import type { AbiEvent, Address, Log, PublicClient } from "viem";

const CHUNK_SIZE = 999n;
const DEFAULT_MAX_LOOKBACK = 200_000n;

/**
 * Search for the most recent matching event log, walking backward from
 * `latest` in 999-block chunks.
 *
 * Somnia testnet RPC caps eth_getLogs at 1000-block ranges. A naive query
 * with `fromBlock: 0n` is rejected. This helper chunks the search, returning
 * the latest matching log (or null) and bailing once it has scanned
 * `maxLookback` blocks total.
 */
export async function findLatestLog<TAbiEvent extends AbiEvent>(
  client: PublicClient,
  params: {
    address: Address;
    event: TAbiEvent;
    args?: Record<string, unknown>;
    maxLookback?: bigint;
  },
): Promise<Log<bigint, number, false, TAbiEvent, true> | null> {
  const currentBlock = await client.getBlockNumber();
  const maxLookback = params.maxLookback ?? DEFAULT_MAX_LOOKBACK;
  const earliestBlock =
    currentBlock > maxLookback ? currentBlock - maxLookback : 0n;

  let toBlock = currentBlock;
  while (toBlock >= earliestBlock) {
    const fromBlock =
      toBlock > CHUNK_SIZE - 1n ? toBlock - (CHUNK_SIZE - 1n) : 0n;
    const clamped = fromBlock < earliestBlock ? earliestBlock : fromBlock;
    try {
      const logs = await client.getLogs({
        address: params.address,
        event: params.event,
        args: params.args as never,
        fromBlock: clamped,
        toBlock,
      });
      if (logs.length > 0) {
        return logs[logs.length - 1] as Log<
          bigint,
          number,
          false,
          TAbiEvent,
          true
        >;
      }
    } catch (err) {
      console.warn(
        `[somniaLogs] chunk ${clamped}-${toBlock} failed:`,
        (err as Error).message,
      );
    }
    if (clamped === 0n) break;
    toBlock = clamped - 1n;
  }
  return null;
}
