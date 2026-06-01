import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

async function main() {
  const { data: links, error: listErr } = await supabase
    .from('wallet_link')
    .select('wallet_address, chat_id, linked_at');
  if (listErr) throw listErr;

  console.log(`Found ${links?.length ?? 0} wallet_link rows:`);
  for (const l of links ?? []) {
    console.log(
      `  - ${l.wallet_address} <-> chat ${l.chat_id} (linked ${new Date(Number(l.linked_at)).toISOString()})`,
    );
  }

  if (!links || links.length === 0) {
    console.log('Nothing to unbind in wallet_link.');
  } else {
    const { error: delErr } = await supabase
      .from('wallet_link')
      .delete()
      .gte('chat_id', 0);
    if (delErr) throw delErr;
    const { data: leftover } = await supabase
      .from('wallet_link')
      .select('wallet_address');
    console.log(`wallet_link cleared. Remaining rows: ${leftover?.length ?? 0}`);
  }

  const { data: tokens, error: tokErr } = await supabase
    .from('link_token')
    .select('token, wallet_address, expires_at, inviter_wallet');
  if (tokErr) throw tokErr;
  console.log(`link_token rows: ${tokens?.length ?? 0}`);
  if (tokens && tokens.length > 0) {
    const { error: delTok } = await supabase
      .from('link_token')
      .delete()
      .not('token', 'is', null);
    if (delTok) throw delTok;
    console.log('link_token cleared.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
