import { Context, MiddlewareFn } from 'telegraf';
import { config } from '../config';

export const adminOnly: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id?.toString();

  if (!userId || !config.adminTelegramIds.includes(userId)) {
    try {
      await ctx.reply('Unauthorized.');
    } catch {
      // Channel posts or contexts without a reply target — silently ignore
    }
    return;
  }

  return next();
};
