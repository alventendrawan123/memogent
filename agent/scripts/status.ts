import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

async function main() {
  const { data: w } = await supabase.from('wallet_link').select('*');
  const { data: t } = await supabase
    .from('link_token')
    .select('token, wallet_address, expires_at, inviter_wallet');
  console.log('wallet_link rows:', w?.length ?? 0);
  console.log(JSON.stringify(w, null, 2));
  console.log('link_token rows:', t?.length ?? 0);
  console.log(JSON.stringify(t, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
