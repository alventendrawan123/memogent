/**
 * E2E test for the new EventPoller (Fix #1).
 *
 * Spins up an EventPoller against live Somnia testnet RPC, starting from
 * BEFORE Alice's known WillExecuted block, and verifies the poller:
 *   1. Survives the catch-up window past Somnia's 1000-block cap
 *   2. Fires the handler for Alice's existing WillExecuted event
 *   3. Continues polling without crashing
 */
import 'dotenv/config';
import { Contract, type EventLog, JsonRpcProvider, Network } from 'ethers';
import { config } from '../src/config.js';
import { EventPoller } from '../src/listener/poller.js';

const ALICE = '0x812477C24E55367AA5E920C761C6A1C7dA22215b';
const EXPECTED_WILL_EXECUTED_BLOCK = 397258653;

async function main() {
  if (!config.contracts.core) throw new Error('core address not set');

  const network = new Network(config.network, config.chainId);
  const provider = new JsonRpcProvider(config.rpc, network, {
    staticNetwork: network,
  });

  const coreAbi = [
    'event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)',
  ];
  const core = new Contract(config.contracts.core, coreAbi, provider);

  let captured = 0;
  const captures: { tx: string; block: number; owner: string }[] = [];

  const poller = new EventPoller(
    provider,
    core,
    'WillExecuted',
    async (log: EventLog) => {
      captured++;
      captures.push({
        tx: log.transactionHash,
        block: log.blockNumber,
        owner: log.args[0] as string,
      });
      console.log(
        `  ✓ Handler fired: block ${log.blockNumber} owner ${log.args[0]} tx ${log.transactionHash.slice(0, 12)}…`,
      );
    },
    { intervalMs: 4000, label: 'test:WillExecuted' },
  );

  // Start from BEFORE Alice's WillExecuted so catch-up must work
  const startFromBlock = EXPECTED_WILL_EXECUTED_BLOCK - 50;
  const currentBlock = await provider.getBlockNumber();
  const lookbackBlocks = currentBlock - startFromBlock;

  console.log(`\n═══ EventPoller E2E test ═══`);
  console.log(`Current block:       ${currentBlock}`);
  console.log(`Start block:         ${startFromBlock} (lookback: ${lookbackBlocks} blocks)`);
  console.log(`Expected catch:      Alice WillExecuted @ block ${EXPECTED_WILL_EXECUTED_BLOCK}`);
  console.log(`Cap test:            ${lookbackBlocks > 1000 ? '⚠️  EXCEEDS 1000 — chunking required' : 'within cap'}`);
  console.log(`Polling for ~6 seconds (catch-up should fire on first tick)\n`);

  await poller.start(startFromBlock);
  await new Promise((r) => setTimeout(r, 6_000));
  poller.stop();
  provider.destroy();

  console.log(`\n═══ RESULTS ═══`);
  console.log(`Captures: ${captured}`);
  const aliceCapture = captures.find(
    (c) => c.owner.toLowerCase() === ALICE.toLowerCase(),
  );
  if (aliceCapture) {
    console.log(
      `✅ PASS — Alice's WillExecuted caught (block ${aliceCapture.block})`,
    );
  } else {
    console.log(`❌ FAIL — Alice's WillExecuted NOT caught`);
    if (captures.length > 0) {
      console.log('  Other captures:', captures);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
