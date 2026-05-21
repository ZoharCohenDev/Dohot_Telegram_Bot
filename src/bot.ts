import axios from 'axios';
import { Context, Markup, MiddlewareFn, Telegraf } from 'telegraf';
import { config } from './config';
import { adminOnly } from './middlewares/adminOnly';
import {
  activateUser,
  disableUser,
  extendUser,
  findUser,
  getAnalytics,
  getExpiring,
  getStatus,
  getToday,
} from './services/adminApi';
import {
  AdminAnalyticsResponse,
  ApiErrorResponse,
  AdminStatusResponse,
  CreatedUser,
  ExpiringUsersResponse,
  TodayUsersResponse,
} from './types';
import { getProfessionLabel, getRoleLabel } from './utils/professionOptions';
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

const COMMANDS_MENU = [
  '🤖 פקודות ניהול דוחות',
  '',
  '👤 משתמשים:',
  '/createuser - יצירת משתמש חדש',
  '/finduser <username> - חיפוש משתמש',
  '/extend <username> <days> - הארכת מנוי',
  '/disableuser <username> - השבתת משתמש',
  '/activateuser <username> - הפעלת משתמש',
  '',
  '📊 סטטיסטיקות:',
  '/status - סטטוס כללי',
  '/expiring [days] - מנויים שפגים בקרוב',
  '/today - משתמשים שנוצרו היום',
  '/analytics - ניתוח משתמשים',
  '',
  '🛠️ עזרה:',
  '/myid - הצגת Telegram ID',
  '/cancel - ביטול פעולה פעילה',
].join('\n');

function normalizeUsername(value: string | undefined): string | null {
  const username = value?.trim().toLowerCase();
  if (!username) return null;
  if (username.length < 3 || username.length > 50) return null;
  if (!/^[a-z0-9_.-]+$/.test(username)) return null;
  return username;
}

function isUser(value: unknown): value is CreatedUser {
  return typeof value === 'object' && value !== null && 'username' in value && 'full_name' in value;
}

function extractUser<T extends { user?: CreatedUser }>(response: T): CreatedUser | null {
  if (response.user) return response.user;
  return isUser(response) ? response : null;
}

function commandArgs(text: string): string[] {
  return text.trim().split(/\s+/).slice(1);
}

function parseExpiringDays(text: string): number | null {
  const [, rawDays] = text.trim().split(/\s+/);
  if (!rawDays) return 7;
  if (!/^\d+$/.test(rawDays)) return null;

  const days = Number(rawDays);
  if (days < 1 || days > 90) return null;
  return days;
}

function parseExtendArgs(
  text: string,
): { ok: true; username: string; days: number } | { ok: false; message: string } {
  const [rawUsername, rawDays] = commandArgs(text);
  if (!rawUsername || !rawDays) {
    return { ok: false, message: 'יש להזין שם משתמש ומספר ימים. לדוגמה: /extend dina123 30' };
  }

  const username = normalizeUsername(rawUsername);
  if (!username) return { ok: false, message: 'שם משתמש לא תקין' };
  if (!/^\d+$/.test(rawDays)) return { ok: false, message: 'מספר הימים חייב להיות בין 1 ל־365' };

  const days = Number(rawDays);
  if (days < 1 || days > 365) {
    return { ok: false, message: 'מספר הימים חייב להיות בין 1 ל־365' };
  }
  return { ok: true, username, days };
}

function formatDateYYYYMMDD(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value ?? '—';

  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const dateOnly = value.slice(0, 10);
  return formatDateYYYYMMDD(dateOnly);
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jerusalem',
  }).format(date);
}

function formatUserDetails(user: CreatedUser): string {
  return [
    '👤 פרטי משתמש',
    '',
    `שם: ${user.full_name}`,
    `שם משתמש: ${user.username}`,
    `טלפון: ${user.phone ?? '—'}`,
    `מקצוע: ${getProfessionLabel(user.profession)}`,
    `תפקיד: ${getRoleLabel(user.role)}`,
    `סטטוס: ${user.is_active === false ? 'לא פעיל ⛔' : 'פעיל ✅'}`,
    `תוקף מנוי: ${formatDate(user.subscription_expiration_date)}`,
    `נוצר בתאריך: ${formatDate(user.created_at)}`,
  ].join('\n');
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

function formatExtendSuccess(user: CreatedUser, days: number): string {
  return [
    '✅ המנוי הוארך בהצלחה',
    '',
    `שם: ${user.full_name}`,
    `שם משתמש: ${user.username}`,
    `נוספו ימים: ${days}`,
    `תוקף חדש: ${formatDate(user.subscription_expiration_date)}`,
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

function formatToday(response: TodayUsersResponse): string {
  if (response.count === 0 || response.users.length === 0) {
    return 'לא נוצרו משתמשים היום';
  }

  const users = response.users.map((user, index) =>
    [
      `${index + 1}. ${user.full_name}`,
      `@${user.username}`,
      `מקצוע: ${getProfessionLabel(user.profession)}`,
      `תפקיד: ${getRoleLabel(user.role)}`,
      `שעה: ${formatTime(user.created_at)}`,
    ].join('\n'),
  );

  return ['📅 משתמשים שנוצרו היום', '', `סה״כ: ${response.count}`, '', users.join('\n\n')].join(
    '\n',
  );
}

function formatRecord(record: Record<string, number>, labeler: (value: string) => string): string[] {
  return Object.entries(record).map(([key, value]) => `${labeler(key)}: ${value}`);
}

function formatAnalytics(analytics: AdminAnalyticsResponse): string {
  return [
    '📊 ניתוח משתמשים',
    '',
    'לפי מקצוע:',
    ...formatRecord(analytics.byProfession, getProfessionLabel),
    '',
    'לפי תפקיד:',
    `מנהלים: ${analytics.byRole.admin ?? 0}`,
    `טכנאים: ${analytics.byRole.technician ?? 0}`,
    '',
    'לפי סטטוס:',
    `פעילים: ${analytics.byStatus.active}`,
    `לא פעילים: ${analytics.byStatus.inactive}`,
    '',
    `חדשים ב־7 ימים האחרונים: ${analytics.newUsersLast7Days}`,
    `חדשים החודש: ${analytics.newUsersThisMonth}`,
  ].join('\n');
}

function resolveAdminApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'שגיאה לא צפויה';
  if (!err.response) return 'לא הצלחתי להתחבר לשרת';

  const status = err.response?.status;
  const body = err.response?.data as ApiErrorResponse | undefined;

  switch (status) {
    case 401:
      return 'החיבור פג תוקף, נסה שוב';
    case 403:
      return 'אין הרשאת מנהל';
    case 404:
      return 'המשתמש לא נמצא';
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
        '/commands — תפריט פקודות',
        '/myid — הצגת ה-Telegram ID שלך',
        '/cancel — ביטול פעולה נוכחית',
      ].join('\n'),
    ),
  );

  bot.command('myid', (ctx) => ctx.reply(`Your Telegram ID is: ${ctx.from.id}`));

  bot.command('commands', adminOnly, async (ctx) => {
    await ctx.reply(COMMANDS_MENU);
  });

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

  bot.command('finduser', adminOnly, async (ctx) => {
    const rawUsername = commandArgs(ctx.message.text)[0];
    if (!rawUsername) {
      await ctx.reply('יש להזין שם משתמש. לדוגמה: /finduser dina123');
      return;
    }

    const username = normalizeUsername(rawUsername);
    if (!username) {
      await ctx.reply('שם משתמש לא תקין');
      return;
    }

    try {
      const response = await findUser(username);
      const user = extractUser(response);
      if (!user) {
        await ctx.reply('המשתמש לא נמצא');
        return;
      }
      await ctx.reply(formatUserDetails(user));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.command('extend', adminOnly, async (ctx) => {
    const args = parseExtendArgs(ctx.message.text);
    if (!args.ok) {
      await ctx.reply(args.message);
      return;
    }

    try {
      const response = await extendUser(args.username, args.days);
      const user = extractUser(response);
      if (!user) {
        await ctx.reply('המשתמש לא נמצא');
        return;
      }
      await ctx.reply(formatExtendSuccess(user, response.days ?? response.addedDays ?? args.days));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.command('disableuser', adminOnly, async (ctx) => {
    const rawUsername = commandArgs(ctx.message.text)[0];
    if (!rawUsername) {
      await ctx.reply('יש להזין שם משתמש. לדוגמה: /disableuser dina123');
      return;
    }

    const username = normalizeUsername(rawUsername);
    if (!username) {
      await ctx.reply('שם משתמש לא תקין');
      return;
    }

    await ctx.reply(
      `להשבית את המשתמש ${username}?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('כן, השבת', `disableuser:confirm:${username}`),
          Markup.button.callback('ביטול', `disableuser:cancel:${username}`),
        ],
      ]),
    );
  });

  bot.command('activateuser', adminOnly, async (ctx) => {
    const rawUsername = commandArgs(ctx.message.text)[0];
    if (!rawUsername) {
      await ctx.reply('יש להזין שם משתמש. לדוגמה: /activateuser dina123');
      return;
    }

    const username = normalizeUsername(rawUsername);
    if (!username) {
      await ctx.reply('שם משתמש לא תקין');
      return;
    }

    await ctx.reply(
      `להפעיל את המשתמש ${username}?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('כן, הפעל', `activateuser:confirm:${username}`),
          Markup.button.callback('ביטול', `activateuser:cancel:${username}`),
        ],
      ]),
    );
  });

  bot.command('today', adminOnly, async (ctx) => {
    try {
      const response = await getToday();
      await ctx.reply(formatToday(response));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.command('analytics', adminOnly, async (ctx) => {
    try {
      const response = await getAnalytics();
      await ctx.reply(formatAnalytics(response));
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.action(/^disableuser:(confirm|cancel):(.+)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const [, action, rawUsername] = ctx.match;
    const username = normalizeUsername(rawUsername);
    if (!username) {
      await ctx.reply('שם משתמש לא תקין');
      return;
    }
    if (action === 'cancel') {
      await ctx.reply('הפעולה בוטלה.');
      return;
    }

    try {
      await disableUser(username);
      await ctx.reply(`⛔ המשתמש ${username} הושבת בהצלחה`);
    } catch (err) {
      await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
    }
  });

  bot.action(/^activateuser:(confirm|cancel):(.+)$/, adminOnly, async (ctx) => {
    await ctx.answerCbQuery();
    const [, action, rawUsername] = ctx.match;
    const username = normalizeUsername(rawUsername);
    if (!username) {
      await ctx.reply('שם משתמש לא תקין');
      return;
    }
    if (action === 'cancel') {
      await ctx.reply('הפעולה בוטלה.');
      return;
    }

    try {
      await activateUser(username);
      await ctx.reply(`✅ המשתמש ${username} הופעל בהצלחה`);
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
