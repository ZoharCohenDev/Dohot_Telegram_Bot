"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = createBot;
const axios_1 = __importDefault(require("axios"));
const telegraf_1 = require("telegraf");
const config_1 = require("./config");
const adminOnly_1 = require("./middlewares/adminOnly");
const adminApi_1 = require("./services/adminApi");
const professionOptions_1 = require("./utils/professionOptions");
const createUserFlow_1 = require("./flows/createUserFlow");
const adminOnlyForActiveCreateUserFlow = async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !(0, createUserFlow_1.isInFlow)(userId))
        return;
    return (0, adminOnly_1.adminOnly)(ctx, next);
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
function normalizeUsername(value) {
    const username = value?.trim().toLowerCase();
    if (!username)
        return null;
    if (username.length < 3 || username.length > 50)
        return null;
    if (!/^[a-z0-9_.-]+$/.test(username))
        return null;
    return username;
}
function isUser(value) {
    return typeof value === 'object' && value !== null && 'username' in value && 'full_name' in value;
}
function extractUser(response) {
    if (response.user)
        return response.user;
    return isUser(response) ? response : null;
}
function commandArgs(text) {
    return text.trim().split(/\s+/).slice(1);
}
function parseExpiringDays(text) {
    const [, rawDays] = text.trim().split(/\s+/);
    if (!rawDays)
        return 7;
    if (!/^\d+$/.test(rawDays))
        return null;
    const days = Number(rawDays);
    if (days < 1 || days > 90)
        return null;
    return days;
}
function parseExtendArgs(text) {
    const [rawUsername, rawDays] = commandArgs(text);
    if (!rawUsername || !rawDays) {
        return { ok: false, message: 'יש להזין שם משתמש ומספר ימים. לדוגמה: /extend dina123 30' };
    }
    const username = normalizeUsername(rawUsername);
    if (!username)
        return { ok: false, message: 'שם משתמש לא תקין' };
    if (!/^\d+$/.test(rawDays))
        return { ok: false, message: 'מספר הימים חייב להיות בין 1 ל־365' };
    const days = Number(rawDays);
    if (days < 1 || days > 365) {
        return { ok: false, message: 'מספר הימים חייב להיות בין 1 ל־365' };
    }
    return { ok: true, username, days };
}
function formatDateYYYYMMDD(value) {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return value ?? '—';
    const [, yyyy, mm, dd] = match;
    return `${dd}/${mm}/${yyyy}`;
}
function formatDate(value) {
    if (!value)
        return '—';
    const dateOnly = value.slice(0, 10);
    return formatDateYYYYMMDD(dateOnly);
}
function formatTime(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return new Intl.DateTimeFormat('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jerusalem',
    }).format(date);
}
function formatUserDetails(user) {
    return [
        '👤 פרטי משתמש',
        '',
        `שם: ${user.full_name}`,
        `שם משתמש: ${user.username}`,
        `טלפון: ${user.phone ?? '—'}`,
        `מקצוע: ${(0, professionOptions_1.getProfessionLabel)(user.profession)}`,
        `תפקיד: ${(0, professionOptions_1.getRoleLabel)(user.role)}`,
        `סטטוס: ${user.is_active === false ? 'לא פעיל ⛔' : 'פעיל ✅'}`,
        `תוקף מנוי: ${formatDate(user.subscription_expiration_date)}`,
        `נוצר בתאריך: ${formatDate(user.created_at)}`,
    ].join('\n');
}
function formatStatus(status) {
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
function formatExtendSuccess(user, days) {
    return [
        '✅ המנוי הוארך בהצלחה',
        '',
        `שם: ${user.full_name}`,
        `שם משתמש: ${user.username}`,
        `נוספו ימים: ${days}`,
        `תוקף חדש: ${formatDate(user.subscription_expiration_date)}`,
    ].join('\n');
}
function formatExpiring(response) {
    if (response.count === 0 || response.users.length === 0) {
        return '✅ אין מנויים שפגים בתקופה הזו';
    }
    const users = response.users.map((user, index) => [
        `${index + 1}. ${user.full_name}`,
        `@${user.username}`,
        `📞 ${user.phone ?? '—'}`,
        `🛠️ ${(0, professionOptions_1.getProfessionLabel)(user.profession)}`,
        `📅 ${formatDateYYYYMMDD(user.subscription_expiration_date)}`,
    ].join('\n'));
    return [
        `⏳ מנויים שפגים ב־${response.days} ימים הקרובים`,
        '',
        `סה״כ: ${response.count}`,
        '',
        users.join('\n\n'),
    ].join('\n');
}
function formatToday(response) {
    if (response.count === 0 || response.users.length === 0) {
        return 'לא נוצרו משתמשים היום';
    }
    const users = response.users.map((user, index) => [
        `${index + 1}. ${user.full_name}`,
        `@${user.username}`,
        `מקצוע: ${(0, professionOptions_1.getProfessionLabel)(user.profession)}`,
        `תפקיד: ${(0, professionOptions_1.getRoleLabel)(user.role)}`,
        `שעה: ${formatTime(user.created_at)}`,
    ].join('\n'));
    return ['📅 משתמשים שנוצרו היום', '', `סה״כ: ${response.count}`, '', users.join('\n\n')].join('\n');
}
function formatRecord(record, labeler) {
    return Object.entries(record).map(([key, value]) => `${labeler(key)}: ${value}`);
}
function formatAnalytics(analytics) {
    return [
        '📊 ניתוח משתמשים',
        '',
        'לפי מקצוע:',
        ...formatRecord(analytics.byProfession, professionOptions_1.getProfessionLabel),
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
function resolveAdminApiError(err) {
    if (!axios_1.default.isAxiosError(err))
        return 'שגיאה לא צפויה';
    if (!err.response)
        return 'לא הצלחתי להתחבר לשרת';
    const status = err.response?.status;
    const body = err.response?.data;
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
function createBot() {
    const bot = new telegraf_1.Telegraf(config_1.config.botToken);
    // ─── Commands ───────────────────────────────────────────────────────────────
    bot.start((ctx) => ctx.reply([
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
    ].join('\n')));
    bot.command('myid', (ctx) => ctx.reply(`Your Telegram ID is: ${ctx.from.id}`));
    bot.command('commands', adminOnly_1.adminOnly, async (ctx) => {
        await ctx.reply(COMMANDS_MENU);
    });
    bot.command('cancel', async (ctx, next) => {
        if (!(0, createUserFlow_1.isInFlow)(ctx.from.id)) {
            await ctx.reply('אין פעולה פעילה לביטול.');
            return;
        }
        return (0, adminOnly_1.adminOnly)(ctx, next);
    }, async (ctx) => {
        (0, createUserFlow_1.cancelFlow)(ctx.from.id);
        await ctx.reply('❌ הפעולה בוטלה.');
    });
    bot.command('createuser', adminOnly_1.adminOnly, async (ctx) => {
        // Reset any existing flow and start fresh
        if ((0, createUserFlow_1.isInFlow)(ctx.from.id)) {
            (0, createUserFlow_1.cancelFlow)(ctx.from.id);
        }
        await (0, createUserFlow_1.startFlow)(ctx);
    });
    bot.command('status', adminOnly_1.adminOnly, async (ctx) => {
        try {
            const status = await (0, adminApi_1.getStatus)();
            await ctx.reply(formatStatus(status));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.command('expiring', adminOnly_1.adminOnly, async (ctx) => {
        const days = parseExpiringDays(ctx.message.text);
        if (!days) {
            await ctx.reply('מספר הימים חייב להיות בין 1 ל־90');
            return;
        }
        try {
            const response = await (0, adminApi_1.getExpiring)(days);
            await ctx.reply(formatExpiring(response));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.command('finduser', adminOnly_1.adminOnly, async (ctx) => {
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
            const response = await (0, adminApi_1.findUser)(username);
            const user = extractUser(response);
            if (!user) {
                await ctx.reply('המשתמש לא נמצא');
                return;
            }
            await ctx.reply(formatUserDetails(user));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.command('extend', adminOnly_1.adminOnly, async (ctx) => {
        const args = parseExtendArgs(ctx.message.text);
        if (!args.ok) {
            await ctx.reply(args.message);
            return;
        }
        try {
            const response = await (0, adminApi_1.extendUser)(args.username, args.days);
            const user = extractUser(response);
            if (!user) {
                await ctx.reply('המשתמש לא נמצא');
                return;
            }
            await ctx.reply(formatExtendSuccess(user, response.days ?? response.addedDays ?? args.days));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.command('disableuser', adminOnly_1.adminOnly, async (ctx) => {
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
        await ctx.reply(`להשבית את המשתמש ${username}?`, telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('כן, השבת', `disableuser:confirm:${username}`),
                telegraf_1.Markup.button.callback('ביטול', `disableuser:cancel:${username}`),
            ],
        ]));
    });
    bot.command('activateuser', adminOnly_1.adminOnly, async (ctx) => {
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
        await ctx.reply(`להפעיל את המשתמש ${username}?`, telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('כן, הפעל', `activateuser:confirm:${username}`),
                telegraf_1.Markup.button.callback('ביטול', `activateuser:cancel:${username}`),
            ],
        ]));
    });
    bot.command('today', adminOnly_1.adminOnly, async (ctx) => {
        try {
            const response = await (0, adminApi_1.getToday)();
            await ctx.reply(formatToday(response));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.command('analytics', adminOnly_1.adminOnly, async (ctx) => {
        try {
            const response = await (0, adminApi_1.getAnalytics)();
            await ctx.reply(formatAnalytics(response));
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.action(/^disableuser:(confirm|cancel):(.+)$/, adminOnly_1.adminOnly, async (ctx) => {
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
            await (0, adminApi_1.disableUser)(username);
            await ctx.reply(`⛔ המשתמש ${username} הושבת בהצלחה`);
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    bot.action(/^activateuser:(confirm|cancel):(.+)$/, adminOnly_1.adminOnly, async (ctx) => {
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
            await (0, adminApi_1.activateUser)(username);
            await ctx.reply(`✅ המשתמש ${username} הופעל בהצלחה`);
        }
        catch (err) {
            await ctx.reply(`❌ ${resolveAdminApiError(err)}`);
        }
    });
    // ─── Text messages (wizard steps) ──────────────────────────────────────────
    bot.on('text', adminOnlyForActiveCreateUserFlow, async (ctx) => {
        await (0, createUserFlow_1.handleText)(ctx, ctx.message.text);
    });
    // ─── Inline keyboard callbacks ──────────────────────────────────────────────
    bot.on('callback_query', async (ctx, next) => {
        // Always acknowledge immediately to dismiss the loading spinner
        await ctx.answerCbQuery();
        return next();
    }, adminOnlyForActiveCreateUserFlow, async (ctx) => {
        if (!('data' in ctx.callbackQuery))
            return;
        const { data } = ctx.callbackQuery;
        if (!data)
            return;
        await (0, createUserFlow_1.handleCallback)(ctx, data);
    });
    // ─── Global error handler ───────────────────────────────────────────────────
    bot.catch(async (err, ctx) => {
        // Log only the error message, never secrets or tokens
        const message = err instanceof Error ? err.message : 'unknown error';
        console.error(`[bot] unhandled error: ${message}`);
        try {
            await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.');
        }
        catch {
            // Reply might fail (e.g., bot was blocked)
        }
    });
    return bot;
}
//# sourceMappingURL=bot.js.map