async function main(): Promise<void> {
  const { createBot } = await import('./bot');
  const { startScheduledNotifications } = await import('./scheduler');
  const bot = createBot();
  const scheduledTasks = startScheduledNotifications(bot);

  // Graceful shutdown
  process.once('SIGINT', () => {
    scheduledTasks.forEach((task) => task.stop());
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    scheduledTasks.forEach((task) => task.stop());
    bot.stop('SIGTERM');
  });

  await bot.launch();
  console.log('[bot] started — long polling active');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[bot] fatal startup error: ${message}`);
  process.exit(1);
});
