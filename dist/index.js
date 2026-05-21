"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("./bot");
async function main() {
    const bot = (0, bot_1.createBot)();
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
//# sourceMappingURL=index.js.map