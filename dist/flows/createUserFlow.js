"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInFlow = isInFlow;
exports.cancelFlow = cancelFlow;
exports.startFlow = startFlow;
exports.handleText = handleText;
exports.handleCallback = handleCallback;
const axios_1 = __importDefault(require("axios"));
const telegraf_1 = require("telegraf");
const validators_1 = require("../utils/validators");
const professionOptions_1 = require("../utils/professionOptions");
const dateUtils_1 = require("../utils/dateUtils");
const adminApi_1 = require("../services/adminApi");
// Per-user in-memory session store (keyed by Telegram user ID)
const sessions = new Map();
function isInFlow(userId) {
    return sessions.has(userId);
}
function cancelFlow(userId) {
    sessions.delete(userId);
}
// ─── Keyboard builders ────────────────────────────────────────────────────────
function professionKeyboard() {
    const rows = [];
    for (let i = 0; i < professionOptions_1.professionOptions.length; i += 2) {
        const row = [
            telegraf_1.Markup.button.callback(professionOptions_1.professionOptions[i].label, `profession:${professionOptions_1.professionOptions[i].value}`),
        ];
        if (professionOptions_1.professionOptions[i + 1]) {
            row.push(telegraf_1.Markup.button.callback(professionOptions_1.professionOptions[i + 1].label, `profession:${professionOptions_1.professionOptions[i + 1].value}`));
        }
        rows.push(row);
    }
    return telegraf_1.Markup.inlineKeyboard(rows);
}
function roleKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        professionOptions_1.roleOptions.map((r) => telegraf_1.Markup.button.callback(r.label, `role:${r.value}`)),
    ]);
}
function confirmKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('✅ אישור', 'confirm:yes'),
            telegraf_1.Markup.button.callback('❌ ביטול', 'confirm:no'),
        ],
    ]);
}
// ─── Summary builder ──────────────────────────────────────────────────────────
function buildSummary(draft) {
    return [
        '📋 *סיכום:*',
        `שם: ${draft.full_name}`,
        `משתמש: ${draft.username}`,
        `סיסמה: ${draft.password}`,
        `טלפון: ${draft.phone ?? '—'}`,
        `מקצוע: ${(0, professionOptions_1.getProfessionLabel)(draft.profession)}`,
        `תפקיד: ${(0, professionOptions_1.getRoleLabel)(draft.role)}`,
        `תוקף מנוי: ${draft.subscription_expiration_date ?? '—'}`,
        '',
        'לאשר יצירת משתמש? ✅',
    ].join('\n');
}
// ─── Entry point ──────────────────────────────────────────────────────────────
async function startFlow(ctx) {
    sessions.set(ctx.from.id, { step: 'full_name' });
    await ctx.reply('📝 *יצירת משתמש חדש*\n\nשלב 1/7\nאנא הכנס שם מלא:', {
        parse_mode: 'Markdown',
    });
}
// ─── Text message handler ─────────────────────────────────────────────────────
async function handleText(ctx, text) {
    const userId = ctx.from.id;
    const draft = sessions.get(userId);
    if (!draft)
        return;
    const value = text.trim();
    switch (draft.step) {
        case 'full_name': {
            const normalizedFullName = (0, validators_1.normalizeFullName)(value);
            const err = (0, validators_1.validateFullName)(normalizedFullName);
            if (err) {
                await ctx.reply(`❌ ${err}\nנסה שוב:`);
                return;
            }
            draft.full_name = normalizedFullName;
            draft.step = 'username';
            sessions.set(userId, draft);
            await ctx.reply('שלב 2/7\nאנא הכנס שם משתמש (אותיות קטנות, ללא רווחים):');
            break;
        }
        case 'username': {
            const username = value.toLowerCase();
            const err = (0, validators_1.validateUsername)(username);
            if (err) {
                await ctx.reply(`❌ ${err}\nנסה שוב:`);
                return;
            }
            const availability = await resolveUsernameAvailability(username);
            if (!availability.ok) {
                await ctx.reply(`❌ ${availability.message}\nנסה שוב:`);
                return;
            }
            draft.username = username;
            draft.step = 'password';
            sessions.set(userId, draft);
            await ctx.reply('שלב 3/7\nאנא הכנס סיסמה (לפחות 6 תווים):');
            break;
        }
        case 'password': {
            const err = (0, validators_1.validatePassword)(value);
            if (err) {
                await ctx.reply(`❌ ${err}\nנסה שוב:`);
                return;
            }
            draft.password = value;
            draft.step = 'phone';
            sessions.set(userId, draft);
            await ctx.reply('שלב 4/7\nאנא הכנס מספר טלפון:\n_(אופציונלי — שלח /skip או - לדילוג)_', {
                parse_mode: 'Markdown',
            });
            break;
        }
        case 'phone': {
            draft.phone = (0, validators_1.isSkip)(value) ? undefined : value;
            draft.step = 'profession';
            sessions.set(userId, draft);
            await ctx.reply('שלב 5/7\nבחר מקצוע:', professionKeyboard());
            break;
        }
        case 'subscription_expiration_date': {
            if ((0, validators_1.isSkip)(value)) {
                draft.subscription_expiration_date = undefined;
            }
            else {
                const parsed = (0, dateUtils_1.parseDateDDMMYYYY)(value);
                if (!parsed) {
                    await ctx.reply('❌ פורמט לא תקין. השתמש ב-DD/MM/YYYY\nנסה שוב:');
                    return;
                }
                draft.subscription_expiration_date = parsed;
            }
            draft.step = 'confirm';
            sessions.set(userId, draft);
            await ctx.reply(buildSummary(draft), {
                parse_mode: 'Markdown',
                ...confirmKeyboard(),
            });
            break;
        }
        // profession, role, confirm — require inline keyboard, not free text
        default: {
            await ctx.reply('אנא השתמש בכפתורים כדי להמשיך.');
            break;
        }
    }
}
async function resolveUsernameAvailability(username) {
    try {
        const result = await (0, adminApi_1.checkUsername)(username);
        if (result.exists || result.available === false) {
            return { ok: false, message: 'שם המשתמש כבר קיים, בחר שם אחר' };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, message: resolveUsernameCheckError(err) };
    }
}
function resolveUsernameCheckError(err) {
    if (!axios_1.default.isAxiosError(err))
        return 'לא הצלחתי לבדוק את שם המשתמש, נסה שוב';
    switch (err.response?.status) {
        case 400:
            return 'שם משתמש לא תקין';
        case 403:
            return 'אין הרשאת מנהל';
        default:
            return 'לא הצלחתי לבדוק את שם המשתמש, נסה שוב';
    }
}
// ─── Callback query handler ───────────────────────────────────────────────────
async function handleCallback(ctx, data) {
    const userId = ctx.from.id;
    const draft = sessions.get(userId);
    if (!draft)
        return;
    if (data.startsWith('profession:') && draft.step === 'profession') {
        const value = data.slice('profession:'.length);
        draft.profession = value;
        draft.step = 'role';
        sessions.set(userId, draft);
        await ctx.reply(`✅ מקצוע: ${(0, professionOptions_1.getProfessionLabel)(value)}`);
        await ctx.reply('שלב 6/7\nבחר תפקיד:', roleKeyboard());
        return;
    }
    if (data.startsWith('role:') && draft.step === 'role') {
        const value = data.slice('role:'.length);
        draft.role = value;
        draft.step = 'subscription_expiration_date';
        sessions.set(userId, draft);
        await ctx.reply(`✅ תפקיד: ${(0, professionOptions_1.getRoleLabel)(value)}`);
        await ctx.reply('שלב 7/7\nתוקף מנוי _(DD/MM/YYYY)_ — אופציונלי\n(/skip או - לדילוג):', { parse_mode: 'Markdown' });
        return;
    }
    if (data === 'confirm:yes' && draft.step === 'confirm') {
        await submitCreateUser(ctx, draft);
        return;
    }
    if (data === 'confirm:no' && draft.step === 'confirm') {
        sessions.delete(userId);
        await ctx.reply('❌ הפעולה בוטלה.');
        return;
    }
}
// ─── API submission ───────────────────────────────────────────────────────────
async function submitCreateUser(ctx, draft) {
    const userId = ctx.from.id;
    sessions.delete(userId);
    const payload = {
        username: draft.username,
        password: draft.password,
        full_name: draft.full_name,
        phone: draft.phone,
        profession: draft.profession,
        role: draft.role ?? 'technician',
        subscription_expiration_date: draft.subscription_expiration_date,
    };
    try {
        const response = await (0, adminApi_1.createUser)(payload);
        const created = response.user ?? payload;
        await ctx.reply([
            '✅ המשתמש נוצר בהצלחה',
            '',
            `שם: ${created.full_name}`,
            `משתמש: ${created.username}`,
            `סיסמה: ${payload.password}`,
            `מקצוע: ${(0, professionOptions_1.getProfessionLabel)(created.profession)}`,
            `תפקיד: ${(0, professionOptions_1.getRoleLabel)(created.role)}`,
        ].join('\n'));
    }
    catch (err) {
        await ctx.reply(`❌ ${resolveApiError(err)}`);
    }
}
// ─── Error message resolver ───────────────────────────────────────────────────
function resolveApiError(err) {
    if (!axios_1.default.isAxiosError(err))
        return 'שגיאה לא צפויה';
    const status = err.response?.status;
    const body = err.response?.data;
    const raw = (body?.message ?? body?.error ?? '').toLowerCase();
    switch (status) {
        case 400: {
            if (raw.includes('duplicate') || raw.includes('already') || raw.includes('exists')) {
                return 'המשתמש כבר קיים';
            }
            if (raw.includes('password'))
                return 'הסיסמה חייבת להכיל לפחות 6 תווים';
            if (raw.includes('space') || (raw.includes('username') && raw.includes('invalid'))) {
                return 'שם משתמש לא יכול להכיל רווחים';
            }
            return body?.message ?? body?.error ?? 'שגיאה בנתונים שהוזנו';
        }
        case 401:
            return 'שגיאת אימות — נסה שוב';
        case 403:
            return 'אין הרשאת מנהל';
        case 500:
            return 'שגיאת שרת';
        default:
            return body?.message ?? body?.error ?? 'שגיאה לא צפויה';
    }
}
//# sourceMappingURL=createUserFlow.js.map