import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

const OWNER = process.argv[2] ?? '0x5C1d8a80D090ed3DF7030AC68fC645D148D34d71';

async function main() {
  const now = Date.now();

  const { data: allLinks } = await supabase
    .from('wallet_link')
    .select('wallet_address, last_seen_at, linked_at, chat_id');
  console.log('All wallet_link rows:');
  for (const r of allLinks ?? []) {
    const seenMin = Math.floor((now - Number(r.last_seen_at)) / 60_000);
    const linkedMin = Math.floor((now - Number(r.linked_at)) / 60_000);
    const match = r.wallet_address.toLowerCase() === OWNER.toLowerCase() ? ' ← OWNER' : '';
    console.log(
      `  ${r.wallet_address} chat=${r.chat_id} linked=${linkedMin}min ago, last_seen=${seenMin}min ago${match}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
