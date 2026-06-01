import 'dotenv/config';
import { supabase } from '../src/db/supabase.js';

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: tsx scripts/unbind-token.ts <token>');
  process.exit(1);
}

async function main() {
  const { data: existing, error: getErr } = await supabase
    .from('link_token')
    .select('token, wallet_address, expires_at, inviter_wallet')
    .eq('token', TOKEN)
    .maybeSingle();
  if (getErr) throw getErr;

  if (!existing) {
    console.log(`Token "${TOKEN}" not found in link_token (already unbound or never existed).`);
  } else {
    console.log('Found token:');
    console.log(`  wallet:  ${existing.wallet_address}`);
    console.log(`  inviter: ${existing.inviter_wallet ?? '(self)'}`);
    console.log(
      `  expires: ${new Date(Number(existing.expires_at)).toISOString()}`,
    );

    const { error: delErr } = await supabase
      .from('link_token')
      .delete()
      .eq('token', TOKEN);
    if (delErr) throw delErr;
    console.log('Token deleted.');
  }

  if (!existing?.wallet_address) return;
  const { data: link } = await supabase
    .from('wallet_link')
    .select('wallet_address, chat_id, linked_at')
    .eq('wallet_address', existing.wallet_address)
    .maybeSingle();
  if (link) {
    console.log(
      `Note: wallet ${link.wallet_address} is still bound to chat ${link.chat_id}. Run unbind-all if you also want to clear that.`,
    );
  } else {
    console.log(`Wallet ${existing.wallet_address} has no active wallet_link.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
