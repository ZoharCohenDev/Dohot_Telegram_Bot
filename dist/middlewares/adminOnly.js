"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOnly = void 0;
const config_1 = require("../config");
const adminOnly = async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (!userId || !config_1.config.adminTelegramIds.includes(userId)) {
        try {
            await ctx.reply('Unauthorized.');
        }
        catch {
            // Channel posts or contexts without a reply target — silently ignore
        }
        return;
    }
    return next();
};
exports.adminOnly = adminOnly;
//# sourceMappingURL=adminOnly.js.map