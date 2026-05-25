import { randomBytes } from 'node:crypto';
import { isAddress, getAddress } from 'ethers';
import * as linkToken from '../db/repos/linkToken.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const BOT_USERNAME = 'memogent_v1_bot';
const TTL_HOURS = 24;

async function main(): Promise<void> {
  const ownerArg = process.argv[2];
  const beneficiaryArg = process.argv[3];

  if (!ownerArg || !beneficiaryArg) {
    console.error('Usage: pnpm invite-beneficiary <ownerWallet> <beneficiaryWallet>');
    console.error('');
    console.error('Generates a Telegram invite link to send to the beneficiary.');
    console.error('When they click it, the bot binds their wallet to their Telegram chat,');
    console.error('so notifications can be delivered when the will executes.');
    process.exit(1);
  }

  if (!isAddress(ownerArg)) {
    console.error(`Invalid owner address: ${ownerArg}`);
    process.exit(1);
  }
  if (!isAddress(beneficiaryArg)) {
    console.error(`Invalid beneficiary address: ${beneficiaryArg}`);
    process.exit(1);
  }
  if (ownerArg.toLowerCase() === beneficiaryArg.toLowerCase()) {
    console.error('Owner and beneficiary cannot be the same address.');
    process.exit(1);
  }

  const owner = getAddress(ownerArg);
  const beneficiary = getAddress(beneficiaryArg);
  const nonce = randomBytes(16).toString('hex');

  const token = await linkToken.create(beneficiary, nonce, TTL_HOURS * 60 * 60 * 1000, owner);
  const url = `https://t.me/${BOT_USERNAME}?start=${token}`;

  logger.info({ owner, beneficiary, token, ttlHours: TTL_HOURS }, 'Beneficiary invite generated');

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  📨 Beneficiary Invite Link');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Owner (will creator):  ${owner}`);
  console.log(`  Beneficiary (heir):    ${beneficiary}`);
  console.log(`  TTL:                   ${TTL_HOURS} hours`);
  console.log('');
  console.log('  📤 Send this URL to your beneficiary via WhatsApp / SMS / email:');
  console.log('');
  console.log(`  ${url}`);
  console.log('');
  console.log('  When they click the link:');
  console.log('    1. Telegram opens to @' + BOT_USERNAME);
  console.log('    2. Bot greets them with your nomination context');
  console.log('    3. Their wallet ↔ Telegram chat is bound');
  console.log('    4. From now on, bot can DM them about your will events');
  console.log('');
  console.log('  💡 Suggested message to copy:');
  console.log('');
  console.log(`     "Hai, gua jadiin lo beneficiary di Memogent.`);
  console.log(`      Klik link ini biar lo dapat notif kalau ada update:`);
  console.log(`      ${url}"`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'invite-beneficiary failed');
  process.exit(1);
});
