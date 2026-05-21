import { randomBytes } from 'node:crypto';
import { isAddress, getAddress } from 'ethers';
import * as linkToken from '../db/repos/linkToken.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: pnpm tsx src/cli/issue-token.ts <wallet_address>');
    process.exit(1);
  }

  if (!isAddress(arg)) {
    console.error(`Invalid Ethereum address: ${arg}`);
    process.exit(1);
  }

  const checksummed = getAddress(arg);
  const nonce = randomBytes(16).toString('hex');

  const token = await linkToken.create(checksummed, nonce, 10 * 60 * 1000);

  logger.info({ wallet: checksummed, token, ttlMin: 10 }, 'Link token issued');

  if (config.telegram.botToken) {
    console.log('\n=== Share this with user ===');
    console.log(`Wallet:  ${checksummed}`);
    console.log(`Token:   ${token}`);
    console.log(`TTL:     10 minutes`);
    console.log('\nNext: user opens the bot URL below in Telegram');
    console.log('(replace <BOT_USERNAME> with your actual bot username from BotFather)\n');
    console.log(`https://t.me/<BOT_USERNAME>?start=${token}`);
  } else {
    console.log(`\nToken: ${token}`);
    console.log('Set TELEGRAM_BOT_TOKEN in .env to get a clickable bot URL.');
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to issue token');
  process.exit(1);
});
