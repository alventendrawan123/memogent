import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

async function main() {
  const { data: wills, error: listErr } = await supabase
    .from('tracked_will')
    .select(
      'owner_address, beneficiary, deadline_ms, active, last_classification',
    );
  if (listErr) throw listErr;

  console.log(`Found ${wills?.length ?? 0} tracked_will rows:`);
  for (const w of wills ?? []) {
    const deadline = new Date(Number(w.deadline_ms)).toISOString();
    console.log(
      `  - ${w.owner_address} → ${w.beneficiary} | active=${w.active} | deadline=${deadline} | last=${w.last_classification ?? '—'}`,
    );
  }

  if (!wills || wills.length === 0) {
    console.log('Nothing to clear.');
    return;
  }

  const { error: delErr } = await supabase
    .from('tracked_will')
    .delete()
    .not('owner_address', 'is', null);
  if (delErr) throw delErr;

  const { data: leftover } = await supabase
    .from('tracked_will')
    .select('owner_address');
  console.log(`tracked_will cleared. Remaining rows: ${leftover?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
