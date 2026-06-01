import 'dotenv/config';
import { ethers } from 'ethers';
import { config } from '../src/config.js';
import { supabase } from '../src/db/supabase.js';

const OWNER = process.argv[2];
if (!OWNER || !ethers.isAddress(OWNER)) {
  console.error('Usage: tsx scripts/insert-will.ts <owner_address>');
  process.exit(1);
}

const CORE_ABI = [
  'function getWillInfo(address) view returns (address beneficiary, uint256 lastCheckIn, uint256 inactivePeriod, uint256 deadlineTimestamp, bool executed, bool active)',
];

async function main() {
  if (!config.contracts.core) {
    throw new Error('MEMOGENT_CORE_ADDRESS not set');
  }
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const core = new ethers.Contract(config.contracts.core, CORE_ABI, provider);

  type WillInfo = [string, bigint, bigint, bigint, boolean, boolean];
  const info = (await core.getFunction('getWillInfo')(OWNER)) as WillInfo;
  const [beneficiary, lastCheckIn, inactivePeriod, deadlineMs, executed, active] = info;

  console.log('On-chain will info:');
  console.log(`  beneficiary:      ${beneficiary}`);
  console.log(`  lastCheckIn:      ${new Date(Number(lastCheckIn) * 1000).toISOString()}`);
  console.log(`  inactivePeriodSec: ${inactivePeriod.toString()}`);
  console.log(`  deadlineMs:       ${new Date(Number(deadlineMs)).toISOString()}`);
  console.log(`  executed:         ${executed}`);
  console.log(`  active:           ${active}`);

  if (!active || executed) {
    console.error('Will is not active or already executed. Aborting.');
    process.exit(1);
  }

  const registeredAtMs = Number(lastCheckIn) * 1000;

  const { error } = await supabase.from('tracked_will').upsert({
    owner_address: ethers.getAddress(OWNER),
    beneficiary: ethers.getAddress(beneficiary),
    registered_at_ms: registeredAtMs,
    inactive_period_sec: Number(inactivePeriod),
    deadline_ms: Number(deadlineMs),
    last_assessed_at_ms: null,
    last_classification: null,
    active: true,
  });

  if (error) throw error;
  console.log('\n✅ Will inserted into tracked_will with last_assessed=null.');
  console.log('Next autoAssess tick (max 5 min) should dispatch assessRiskWithContext.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
