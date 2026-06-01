import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

const ASSESS_COOLDOWN_MS = Number.parseInt(
  process.env.AUTO_ASSESS_COOLDOWN_MS ?? String(60 * 60 * 1000),
  10,
);

async function main() {
  const now = Date.now();
  const { data: wills, error } = await supabase
    .from('tracked_will')
    .select(
      'owner_address, beneficiary, registered_at_ms, deadline_ms, inactive_period_sec, last_assessed_at_ms, last_classification, active',
    );
  if (error) throw error;

  console.log(`Now: ${new Date(now).toISOString()} (${now})`);
  console.log(`Total tracked_will rows: ${wills?.length ?? 0}\n`);

  for (const w of wills ?? []) {
    const deadlineDate = new Date(Number(w.deadline_ms)).toISOString();
    const registeredDate = new Date(Number(w.registered_at_ms)).toISOString();
    const lastAssessed = w.last_assessed_at_ms
      ? new Date(Number(w.last_assessed_at_ms)).toISOString()
      : 'NEVER';
    const lastAssessedMinAgo = w.last_assessed_at_ms
      ? Math.floor((now - Number(w.last_assessed_at_ms)) / 60000)
      : null;
    const cooldownRemainingMin = w.last_assessed_at_ms
      ? Math.max(
          0,
          Math.floor(
            (ASSESS_COOLDOWN_MS - (now - Number(w.last_assessed_at_ms))) /
              60000,
          ),
        )
      : 0;
    const minToDeadline = Math.floor((Number(w.deadline_ms) - now) / 60000);
    const minSinceRegistered = Math.floor(
      (now - Number(w.registered_at_ms)) / 60000,
    );
    const pastDeadline = now >= Number(w.deadline_ms);

    const wouldDispatch =
      w.active &&
      !pastDeadline &&
      (w.last_assessed_at_ms === null ||
        now - Number(w.last_assessed_at_ms) >= ASSESS_COOLDOWN_MS);

    console.log(`─── ${w.owner_address} ───`);
    console.log(`  active:                ${w.active}`);
    console.log(`  beneficiary:           ${w.beneficiary}`);
    console.log(`  registered:            ${registeredDate} (${minSinceRegistered} min ago)`);
    console.log(`  deadline:              ${deadlineDate} (${minToDeadline} min ${pastDeadline ? 'AGO (past)' : 'remaining'})`);
    console.log(`  inactive_period_sec:   ${w.inactive_period_sec}`);
    console.log(`  last_assessed_at_ms:   ${lastAssessed}${lastAssessedMinAgo !== null ? ` (${lastAssessedMinAgo} min ago)` : ''}`);
    console.log(`  last_classification:   ${w.last_classification ?? '—'}`);
    console.log(`  cooldown remaining:    ${cooldownRemainingMin} min`);
    console.log(`  shouldAssess() now:    ${wouldDispatch ? '✅ YES' : '❌ NO'}`);
    if (!wouldDispatch) {
      const reasons: string[] = [];
      if (!w.active) reasons.push('not active');
      if (pastDeadline) reasons.push('past deadline');
      if (
        w.last_assessed_at_ms !== null &&
        now - Number(w.last_assessed_at_ms) < ASSESS_COOLDOWN_MS
      ) {
        reasons.push(`cooldown blocking (${cooldownRemainingMin} min left)`);
      }
      console.log(`  SKIP reason(s):        ${reasons.join(', ')}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
