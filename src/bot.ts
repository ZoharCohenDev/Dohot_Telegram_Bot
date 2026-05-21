import axios from 'axios';
import { Context, MiddlewareFn, Telegraf } from 'telegraf';
import { config } from './config';
import { adminOnly } from './middlewares/adminOnly';
import { getExpiring, getStatus } from './services/adminApi';
import { ApiErrorResponse, AdminStatusResponse, ExpiringUsersResponse } from './types';
import { getProfessionLabel } from './utils/professionOptions';
import {
  startFlow,
  handleText,
  handleCallback,
  isInFlow,
  cancelFlow,
} from './flows/createUserFlow';

const adminOnlyForActiveCreateUserFlow: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !isInFlow(userId)) return;

  return adminOnly(ctx, next);
};

function parseExpiringDays(text: string): number | null {
  const [, rawDays] = text.trim().split(/\s+/);
  if (!rawDays) return 7;
  if (!/^\d+$/.test(rawDays)) return null;

  const days = Number(rawDays);
  if (days < 1 || days > 90) return null;
  return days;
}

function formatDateYYYYMMDD(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value ?? '—';

  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

function formatStatus(status: AdminStatusResponse): string {
  return [
    '📊 סטטוס דוחות',
    '',
    `👥 סה״כ משתמשים: ${status.totalUsers}`,
    `✅ פעילים: ${status.activeUsers}`,
    `⛔ לא פעילים: ${status.inactiveUsers}`,
    '',
    `🛠️ טכנאים: ${status.technicians}`,
    `👑 מנהלים: ${status.admins}`,
    '',
    `💳 מנויים בתוקף: ${status.validSubscriptions}`,
    `⚠️ מנויים שפגו: ${status.expiredSubscriptions}`,
    `⏳ פגים בקרוב: ${status.expiringSoon}`,
    '',
    `🆕 חדשים החודש: ${status.newUsersThisMonth}`,
  ].join('\n');
}

function formatExpiring(response: ExpiringUsersResponse): string {
  if (response.count === 0 || response.users.length === 0) {
    return '✅ אין מנויים שפגים בתקופה הזו';
  }

  const users = response.users.map((user, index) =>
    [
      `${index + 1}. ${user.full_name}`,
      `@${user.username}`,
      `📞 ${user.phone ?? '—'}`,
      `🛠️ ${getProfessionLabel(user.profession)}`,
      `📅 ${formatDateYYYYMMDD(user.subscription_expiration_date)}`,
    ].join('\n'),
  );

  return [
    `⏳ מנויים שפגים ב־${response.days} ימים הקרובים`,
    '',
    `סה״כ: ${response.count}`,
    '',
    users.join('\n\n'),
  ].join('\n');
}

function resolveAdminApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'שגיאה לא צפויה';

  const status = err.response?.status;
  const body = err.response?.data as ApiErrorResponse | undefined;

  switch (status) {
    case 403:
      return 'אין הרשאת מנהל';
    case 500:
      return 'שגיאת שרת';
    default:
      return body?.message ?? body?.error ?? 'שגיאה לא צפויה';
  }
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.botToken);

  // ─── Commands ───────────────────────────────────────────────────────────────

  bot.start((ctx) =>
    ctx.reply(
      [
        '👋 ברוך הבא לבוט הניהול של Dohot',
        '',
        'פקודות זמינות:',
        '/createuser — יצירת משתמש חדש',
        '/status — סטטוס מערכת',
        '/expiring — מנויים שפגים ב־7 ימים הקרובים',
        '/expiring 30 — מנויים שפגים ב־30 ימים הקרובים',
        '/myid — הצגת ה-Telegram ID שלך',
        '/cancel — ביטול פעולה נוכחית',
      ].join('\n'),
    ),
  );

  bot.command('myid', (ctx) => ctx.reply(`Your Telegram ID is: ${ctx.from.id}`));

  bot.command(
    'cancel',
    async (ctx, next) => {
      if (!isInFlow(ctx.from.id)) {
        await ctx.reply('אין פעולה פעילה לביטול.');
        return;
      }

      return adminOnly(ctx, next);
    },
    async (ctx) => {
      cancelFlow(ctx.from.id);
      await ctx.reply('❌ הפעולה בוטלה.');
    },
  );

  bot.command('createuser', adminOnly, async (ctx) => {
    // Reset any existing flow and start fresh
    if (isInFlow(ctx.from.id)) {
      cancelFlow(ctx.from.id);
    }
    await startFlow(ctx);
  });

  bot.command('status', adminOnly, async (ctx) => {
    try {
      const status = await getStatus();
      await ctx.reply(formatStatus(status));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.command('expiring', adminOnly, async (ctx) => {
    const days = parseExpiringDays(ctx.message.text);
    if (!days) {
      await ctx.reply('מספר הימים חייב להיות בין 1 ל־90');
      return;
    }

    try {
      const response = await getExpiring(days);
      await ctx.reply(formatExpiring(response));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  // ─── Text messages (wizard steps) ──────────────────────────────────────────

  bot.on('text', adminOnlyForActiveCreateUserFlow, async (ctx) => {
    await handleText(ctx, ctx.message.text);
  });

  // ─── Inline keyboard callbacks ──────────────────────────────────────────────

  bot.on(
    'callback_query',
    async (ctx, next) => {
      // Always acknowledge immediately to dismiss the loading spinner
      await ctx.answerCbQuery();
      return next();
    },
    adminOnlyForActiveCreateUserFlow,
    async (ctx) => {
      if (!('data' in ctx.callbackQuery)) return;
      const { data } = ctx.callbackQuery;
      if (!data) return;

      await handleCallback(ctx, data);
    },
  );

  // ─── Global error handler ───────────────────────────────────────────────────

  bot.catch(async (err, ctx) => {
    // Log only the error message, never secrets or tokens
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`[bot] unhandled error: ${message}`);
    try {
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.');
    } catch {
      // Reply might fail (e.g., bot was blocked)
    }
  });

  return bot;
}
