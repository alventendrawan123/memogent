import type { Context, MiddlewareFn } from 'grammy';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import * as walletLink from '../../db/repos/walletLink.js';

const lastFlushAt = new Map<number, number>();

export const activityMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId !== undefined) {
    const now = Date.now();
    const last = lastFlushAt.get(chatId) ?? 0;
    if (now - last >= config.activityDebounceMs) {
      lastFlushAt.set(chatId, now);
      try {
        await walletLink.updateLastSeen(chatId, now);
      } catch (err) {
        logger.error({ chatId, err }, 'activityMiddleware: updateLastSeen failed');
      }
    }
  }
  await next();
};
