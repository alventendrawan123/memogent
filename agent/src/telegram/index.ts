import { config } from '../config.js';
import { logger } from '../logger.js';
import { bot } from './bot.js';
import { activityMiddleware } from './middleware/activity.js';
import { handleStart } from './handlers/start.js';
import { handleHelp } from './handlers/help.js';
import { handleStatus } from './handlers/status.js';
import { handleClaimCapsule } from './handlers/claimcapsule.js';
import * as blockedChat from '../db/repos/blockedChat.js';

export type TelegramService = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createTelegramService(): TelegramService | null {
  if (!config.telegram.botToken) {
    logger.warn('Telegram bot token not set — service disabled');
    return null;
  }

  bot.use(activityMiddleware);
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('status', handleStatus);
  bot.command('claimcapsule', handleClaimCapsule);

  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === 'kicked') {
      await blockedChat.markBlocked(ctx.chat.id);
      logger.warn({ chatId: ctx.chat.id }, 'User blocked the bot (my_chat_member kicked)');
    } else if (status === 'member') {
      await blockedChat.markUnblocked(ctx.chat.id);
      logger.info({ chatId: ctx.chat.id }, 'User unblocked the bot');
    }
  });

  return {
    async start() {
      await bot.init();
      logger.info({ username: bot.botInfo.username, id: bot.botInfo.id }, 'Telegram bot initialized');
      void bot.start({
        onStart: (info) => {
          logger.info({ username: info.username }, 'Telegram bot polling started');
        },
      });
    },

    async stop() {
      logger.info('Stopping Telegram bot');
      await bot.stop();
    },
  };
}
