import { config } from './config.js';
import { logger } from './logger.js';
import { supabase } from './db/supabase.js';
import { createListener } from './listener/index.js';
import { createTelegramService } from './telegram/index.js';
import { createDispatcher } from './dispatcher/index.js';

async function main(): Promise<void> {
  logger.info(
    { network: config.network, rpc: config.rpc, chainId: config.chainId },
    'Memogent agent starting'
  );

  const { count, error } = await supabase
    .from('wallet_link')
    .select('*', { count: 'exact', head: true });

  if (error) {
    logger.fatal(
      { message: error.message, code: error.code, hint: error.hint, details: error.details },
      'Supabase connection failed'
    );
    process.exit(1);
  }
  logger.info({ walletLinkCount: count ?? 0 }, 'Supabase connected');

  const listener = createListener();
  if (listener) {
    await listener.start();
  }

  const telegram = createTelegramService();
  if (telegram) {
    await telegram.start();
  }

  const dispatcher = createDispatcher();
  if (dispatcher) {
    dispatcher.start();
  }

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down');
    if (dispatcher) dispatcher.stop();
    if (listener) await listener.stop();
    if (telegram) await telegram.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down');
    if (dispatcher) dispatcher.stop();
    if (listener) await listener.stop();
    if (telegram) await telegram.stop();
    process.exit(0);
  });

  logger.info('Agent loop running (press Ctrl+C to exit)');
  await new Promise(() => {});
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Fatal error in main');
  process.exit(1);
});
