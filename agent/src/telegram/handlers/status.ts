import type { Context } from 'grammy';
import * as walletLink from '../../db/repos/walletLink.js';

export async function handleStatus(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const link = await walletLink.getByChatId(chatId);
  if (!link) {
    await ctx.reply(
      'No wallet linked to this chat. Use `/start link_<token>` to link.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const shortAddr = `${link.wallet_address.slice(0, 6)}...${link.wallet_address.slice(-4)}`;
  const linkedDays = Math.floor((Date.now() - link.linked_at) / 86_400_000);
  const lastSeenMinutes = Math.floor((Date.now() - link.last_seen_at) / 60_000);

  await ctx.reply(
    `Wallet: \`${shortAddr}\`\n` +
      `Linked ${linkedDays} day(s) ago\n` +
      `Last seen ${lastSeenMinutes} minute(s) ago`,
    { parse_mode: 'Markdown' }
  );
}
