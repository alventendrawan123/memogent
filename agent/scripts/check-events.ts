import 'dotenv/config';
import { ethers } from 'ethers';
import { config } from '../src/config.js';

const OWNER = '0x812477C24E55367AA5E920C761C6A1C7dA22215b'; // Alice

const CORE_EVENT_ABI = [
  'event WillRegistered(address indexed owner, address indexed beneficiary, uint256 deadlineMs)',
  'event WillExecuted(address indexed owner, address indexed beneficiary, uint256 executedAt)',
];

const AGENT_EVENT_ABI = [
  'event RiskDecision(address indexed user, string classification, uint256 timestamp)',
  'event AssessmentReceived(uint256 indexed requestId, address indexed user, string classification)',
  'event EmpathyMessageGenerated(address indexed user, string message)',
];

async function main() {
  if (!config.contracts.core || !config.contracts.agent) {
    throw new Error('Core/agent address not set');
  }
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const currentBlock = await provider.getBlockNumber();
  const CHUNK = 999;
  const TOTAL_LOOKBACK = 30000; // ~30k blocks back, chunked
  const earliestBlock = Math.max(0, currentBlock - TOTAL_LOOKBACK);

  // Helper: chunked queryFilter
  async function chunkedQuery<T>(
    contract: ethers.Contract,
    filter: ethers.DeferredTopicFilter,
    label: string,
  ): Promise<ethers.EventLog[]> {
    const allLogs: ethers.EventLog[] = [];
    let from = earliestBlock;
    while (from <= currentBlock) {
      const to = Math.min(from + CHUNK - 1, currentBlock);
      try {
        const logs = (await contract.queryFilter(filter, from, to)) as ethers.EventLog[];
        if (logs.length > 0) {
          console.log(`  [${label}] chunk ${from}-${to}: ${logs.length} log(s)`);
        }
        allLogs.push(...logs);
      } catch (err) {
        console.warn(`  [${label}] chunk ${from}-${to} failed:`, (err as Error).message.slice(0, 80));
      }
      from = to + 1;
    }
    return allLogs;
  }

  console.log(`Current block: ${currentBlock}`);
  console.log(`Lookback span: block ${0} to ${currentBlock} (last ${TOTAL_LOOKBACK} blocks, ${CHUNK} per chunk)\n`);

  const coreContract = new ethers.Contract(config.contracts.core, CORE_EVENT_ABI, provider);
  const agentContract = new ethers.Contract(config.contracts.agent, AGENT_EVENT_ABI, provider);

  console.log('═══ CORE EVENTS ═══');
  const wrFilter = coreContract.filters.WillRegistered(OWNER);
  const wrLogs = await chunkedQuery(coreContract, wrFilter, 'WillRegistered');
  console.log(`WillRegistered(${OWNER}): ${wrLogs.length} log(s)`);
  for (const log of wrLogs) {
    const evt = log as ethers.EventLog;
    console.log(
      `  • block ${log.blockNumber} tx ${log.transactionHash.slice(0, 10)} — beneficiary: ${evt.args[1]} deadline: ${new Date(Number(evt.args[2])).toISOString()}`,
    );
  }

  const weFilter = coreContract.filters.WillExecuted(OWNER);
  const weLogs = await chunkedQuery(coreContract, weFilter, 'WillExecuted');
  console.log(`WillExecuted(${OWNER}): ${weLogs.length} log(s)`);
  for (const log of weLogs) {
    const evt = log as ethers.EventLog;
    console.log(
      `  • block ${log.blockNumber} tx ${log.transactionHash.slice(0, 10)} — beneficiary: ${evt.args[1]} at ${new Date(Number(evt.args[2]) * 1000).toISOString()}`,
    );
  }

  console.log('\n═══ AGENT EVENTS ═══');
  const arFilter = agentContract.filters.AssessmentReceived(null, OWNER);
  const arLogs = await chunkedQuery(agentContract, arFilter, 'AssessmentReceived');
  console.log(`AssessmentReceived(*, ${OWNER}): ${arLogs.length} log(s)`);
  for (const log of arLogs) {
    const evt = log as ethers.EventLog;
    console.log(
      `  • block ${log.blockNumber} tx ${log.transactionHash.slice(0, 10)} — classification: "${evt.args[2]}"`,
    );
  }

  const rdFilter = agentContract.filters.RiskDecision(OWNER);
  const rdLogs = await chunkedQuery(agentContract, rdFilter, 'RiskDecision');
  console.log(`RiskDecision(${OWNER}): ${rdLogs.length} log(s)`);
  for (const log of rdLogs) {
    const evt = log as ethers.EventLog;
    console.log(
      `  • block ${log.blockNumber} tx ${log.transactionHash.slice(0, 10)} — classification: "${evt.args[1]}" at ${new Date(Number(evt.args[2]) * 1000).toISOString()}`,
    );
  }

  const emFilter = agentContract.filters.EmpathyMessageGenerated(OWNER);
  const emLogs = await chunkedQuery(agentContract, emFilter, 'EmpathyMessageGenerated');
  console.log(`EmpathyMessageGenerated(${OWNER}): ${emLogs.length} log(s)`);
  for (const log of emLogs) {
    const evt = log as ethers.EventLog;
    const msg = String(evt.args[1]);
    console.log(
      `  • block ${log.blockNumber} tx ${log.transactionHash.slice(0, 10)} — message: "${msg.slice(0, 80)}${msg.length > 80 ? '…' : ''}"`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
