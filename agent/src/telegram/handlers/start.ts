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

  if (consumed.inviter_wallet) {
    await ctx.reply(
      `🎯 *Welcome to Memogent.*\n\n` +
        `✅ Wallet linked (tap to copy):\n\`${consumed.wallet_address}\`\n\n` +
        `You've been *nominated as beneficiary* by:\n` +
        `\`${consumed.inviter_wallet}\`\n\n` +
        `*What is Memogent?*\n` +
        `An autonomous digital inheritance protocol on Somnia. If the inviter's wallet ` +
        `goes inactive long enough — verified by an on-chain AI agent — the protocol ` +
        `executes their will and transfers their on-chain assets to your wallet, no human in the loop.\n\n` +
        `*What is a Time Capsule?*\n` +
        `A private message the inviter may encrypt for you (AES-256-GCM, blob on IPFS, ` +
        `AES key locked on-chain). Only your wallet can unlock it, and only after the ` +
        `will executes. You decrypt it directly in this chat with:\n` +
        `\`/claimcapsule <inviter_address>\`\n\n` +
        `*What I'll send you:*\n` +
        `• 💸 Will execution notif + on-chain proof when inheritance fires\n` +
        `• 💌 AI-written farewell from Memogent Agent (Somnia LLM)\n` +
        `• 🕯️ Time Capsule unlock instruction (when applicable)\n\n` +
        `Send /help for command list, /status to view your linked wallet.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `🎯 *Welcome to Memogent.*\n\n` +
        `✅ Wallet linked (tap to copy):\n\`${consumed.wallet_address}\`\n\n` +
        `*What is Memogent?*\n` +
        `An autonomous digital inheritance protocol on Somnia. Wallets register an on-chain ` +
        `will that auto-executes — moving assets to a named beneficiary — when an AI agent ` +
        `verifies the wallet has been inactive past a configured threshold.\n\n` +
        `From now on you'll receive notifications when:\n` +
        `• A will names *you* as beneficiary and executes (with on-chain tx receipt)\n` +
        `• Memogent's AI flags your linked wallet for inactivity\n` +
        `• A Time Capsule is unlocked for you (decrypt with /claimcapsule)\n\n` +
        `Send /help for command list, /status to view your linked wallet.`,
      { parse_mode: 'Markdown' }
    );
  }
}
