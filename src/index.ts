import { createBot } from './bot';

async function main(): Promise<void> {
  const bot = createBot();

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  await bot.launch();
  console.log('[bot] started — long polling active');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[bot] fatal startup error: ${message}`);
  process.exit(1);
});
