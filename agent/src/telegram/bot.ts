import { Bot, GrammyError, HttpError, type Context } from 'grammy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as blockedChat from '../db/repos/blockedChat.js';

export const bot = new Bot<Context>(config.telegram.botToken);

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    if (e.error_code === 403) {
      logger.warn({ updateId: err.ctx.update.update_id }, 'User blocked the bot');
      return;
    }
    logger.error({ code: e.error_code, description: e.description }, 'Grammy API error');
    return;
  }
  if (e instanceof HttpError) {
    logger.error({ message: e.message }, 'Telegram HTTP error');
    return;
  }
  logger.error({ err: e }, 'Unhandled bot error');
});

export async function safeSend(
  chatId: number,
  text: string,
  opts?: Parameters<typeof bot.api.sendMessage>[2]
): Promise<boolean> {
  try {
    await bot.api.sendMessage(chatId, text, opts);
    return true;
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 403) {
      await blockedChat.markBlocked(chatId);
      logger.warn({ chatId }, 'safeSend: user blocked the bot, marked');
      return false;
    }
    if (err instanceof GrammyError && err.error_code === 400) {
      logger.warn({ chatId, description: err.description }, 'safeSend: bad request (user never started bot?)');
      return false;
    }
    logger.error({ chatId, err }, 'safeSend: unexpected error');
    return false;
  }
}
