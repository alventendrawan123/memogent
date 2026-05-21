import type { Context } from 'grammy';

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    'Memogent commands:\n' +
      '/start link_<token> — link your wallet to this chat\n' +
      '/status — show your linked wallet + last risk assessment\n' +
      '/help — show this message\n\n' +
      'Memogent monitors wallet activity and automatically executes digital inheritance ' +
      'when AI consensus determines the wallet owner has gone inactive.'
  );
}
