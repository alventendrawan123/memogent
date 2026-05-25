import type { Context } from 'grammy';
import { logger } from '../../logger.js';
import * as walletLink from '../../db/repos/walletLink.js';
import * as linkToken from '../../db/repos/linkToken.js';

export async function handleStart(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const payload = ctx.match;
  if (typeof payload !== 'string' || payload.length === 0) {
    await ctx.reply(
      'Welcome to Memogent.\n\n' +
        'To link your wallet, get a link token from the app and use:\n' +
        '`/start link_<your-token>`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (!payload.startsWith('link_')) {
    await ctx.reply('Invalid token format. Expected: `link_<...>`', { parse_mode: 'Markdown' });
    return;
  }

  const consumed = await linkToken.consume(payload);
  if (!consumed) {
    await ctx.reply('Token invalid or expired. Generate a new one from the app.');
    return;
  }

  const existingByWallet = await walletLink.getByWallet(consumed.wallet_address);
  if (existingByWallet && existingByWallet.chat_id !== chatId) {
    await ctx.reply(
      'This wallet is already linked to a different Telegram account. ' +
        'Use the app to unlink the previous chat first.'
    );
    return;
  }

  const existingByChat = await walletLink.getByChatId(chatId);
  if (existingByChat && existingByChat.wallet_address !== consumed.wallet_address) {
    await ctx.reply(
      'This Telegram account is already linked to a different wallet. ' +
        'Use the app to unlink the previous wallet first.'
    );
    return;
  }

  await walletLink.upsert({
    wallet_address: consumed.wallet_address,
    chat_id: chatId,
    linked_at: Date.now(),
    last_seen_at: Date.now(),
  });

  logger.info(
    { chatId, walletAddress: consumed.wallet_address },
    'Wallet linked to Telegram chat'
  );

  const shortAddr = `${consumed.wallet_address.slice(0, 6)}...${consumed.wallet_address.slice(-4)}`;

  if (consumed.inviter_wallet) {
    const shortInviter = `${consumed.inviter_wallet.slice(0, 6)}...${consumed.inviter_wallet.slice(-4)}`;
    await ctx.reply(
      `🎯 Welcome to Memogent!\n\n` +
        `✅ Wallet linked: \`${shortAddr}\`\n\n` +
        `You've been **nominated as beneficiary** by \`${shortInviter}\`.\n\n` +
        `I'll notify you here if their digital will is ever executed, including:\n` +
        `• 💸 Inheritance asset transfer notification\n` +
        `• 💌 AI-generated personal farewell message\n` +
        `• 🕯️ Time Capsule unlock instructions (if any)\n\n` +
        `Use /status anytime to check your linked wallet.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `🎯 Welcome to Memogent!\n\n` +
        `✅ Wallet linked: \`${shortAddr}\`\n\n` +
        `From now on, you'll receive notifications if:\n` +
        `• A will names you as beneficiary and executes\n` +
        `• AI risk classifier flags your wallet\n` +
        `• A Time Capsule is unlocked for you\n\n` +
        `Use /status to check your linked wallet anytime.`,
      { parse_mode: 'Markdown' }
    );
  }
}
