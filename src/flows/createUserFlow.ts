import axios from 'axios';
import { Context, Markup } from 'telegraf';
import { CreateUserDraft, CreateUserPayload, ApiErrorResponse } from '../types';
import {
  normalizeFullName,
  validateFullName,
  validateUsername,
  validatePassword,
  isSkip,
} from '../utils/validators';
import {
  professionOptions,
  roleOptions,
  getProfessionLabel,
  getRoleLabel,
} from '../utils/professionOptions';
import { parseDateDDMMYYYY } from '../utils/dateUtils';
import { checkUsername, createUser } from '../services/adminApi';

// Per-user in-memory session store (keyed by Telegram user ID)
const sessions = new Map<number, CreateUserDraft>();

export function isInFlow(userId: number): boolean {
  return sessions.has(userId);
}

export function cancelFlow(userId: number): void {
  sessions.delete(userId);
}

// ─── Keyboard builders ────────────────────────────────────────────────────────

function professionKeyboard() {
  const rows = [];
  for (let i = 0; i < professionOptions.length; i += 2) {
    const row = [
      Markup.button.callback(professionOptions[i].label, `profession:${professionOptions[i].value}`),
    ];
    if (professionOptions[i + 1]) {
      row.push(
        Markup.button.callback(
          professionOptions[i + 1].label,
          `profession:${professionOptions[i + 1].value}`,
        ),
      );
    }
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

function roleKeyboard() {
  return Markup.inlineKeyboard([
    roleOptions.map((r) => Markup.button.callback(r.label, `role:${r.value}`)),
  ]);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ אישור', 'confirm:yes'),
      Markup.button.callback('❌ ביטול', 'confirm:no'),
    ],
  ]);
}

// ─── Summary builder ──────────────────────────────────────────────────────────

function buildSummary(draft: CreateUserDraft): string {
  return [
    '📋 *סיכום:*',
    `שם: ${draft.full_name}`,
    `משתמש: ${draft.username}`,
    `סיסמה: ${draft.password}`,
    `טלפון: ${draft.phone ?? '—'}`,
    `מקצוע: ${getProfessionLabel(draft.profession!)}`,
    `תפקיד: ${getRoleLabel(draft.role!)}`,
    `תוקף מנוי: ${draft.subscription_expiration_date ?? '—'}`,
    '',
    'לאשר יצירת משתמש? ✅',
  ].join('\n');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startFlow(ctx: Context): Promise<void> {
  sessions.set(ctx.from!.id, { step: 'full_name' });
  await ctx.reply('📝 *יצירת משתמש חדש*\n\nשלב 1/7\nאנא הכנס שם מלא:', {
    parse_mode: 'Markdown',
  });
}

// ─── Text message handler ─────────────────────────────────────────────────────

export async function handleText(ctx: Context, text: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  const value = text.trim();

  switch (draft.step) {
    case 'full_name': {
      const normalizedFullName = normalizeFullName(value);
      const err = validateFullName(normalizedFullName);
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
      const err = validateUsername(username);
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
      const err = validatePassword(value);
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
      draft.phone = isSkip(value) ? undefined : value;
      draft.step = 'profession';
      sessions.set(userId, draft);
      await ctx.reply('שלב 5/7\nבחר מקצוע:', professionKeyboard());
      break;
    }

    case 'subscription_expiration_date': {
      if (isSkip(value)) {
        draft.subscription_expiration_date = undefined;
      } else {
        const parsed = parseDateDDMMYYYY(value);
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

async function resolveUsernameAvailability(
  username: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const result = await checkUsername(username);
    if (result.exists || result.available === false) {
      return { ok: false, message: 'שם המשתמש כבר קיים, בחר שם אחר' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: resolveUsernameCheckError(err) };
  }
}

function resolveUsernameCheckError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'לא הצלחתי לבדוק את שם המשתמש, נסה שוב';

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

export async function handleCallback(ctx: Context, data: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  if (data.startsWith('profession:') && draft.step === 'profession') {
    const value = data.slice('profession:'.length);
    draft.profession = value;
    draft.step = 'role';
    sessions.set(userId, draft);
    await ctx.reply(`✅ מקצוע: ${getProfessionLabel(value)}`);
    await ctx.reply('שלב 6/7\nבחר תפקיד:', roleKeyboard());
    return;
  }

  if (data.startsWith('role:') && draft.step === 'role') {
    const value = data.slice('role:'.length) as 'technician' | 'admin';
    draft.role = value;
    draft.step = 'subscription_expiration_date';
    sessions.set(userId, draft);
    await ctx.reply(`✅ תפקיד: ${getRoleLabel(value)}`);
    await ctx.reply(
      'שלב 7/7\nתוקף מנוי _(DD/MM/YYYY)_ — אופציונלי\n(/skip או - לדילוג):',
      { parse_mode: 'Markdown' },
    );
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

async function submitCreateUser(ctx: Context, draft: CreateUserDraft): Promise<void> {
  const userId = ctx.from!.id;
  sessions.delete(userId);

  const payload: CreateUserPayload = {
    username: draft.username!,
    password: draft.password!,
    full_name: draft.full_name!,
    phone: draft.phone,
    profession: draft.profession!,
    role: draft.role ?? 'technician',
    subscription_expiration_date: draft.subscription_expiration_date,
  };

  try {
    const response = await createUser(payload);
    const created = response.user ?? payload;
    await ctx.reply(
      [
        '✅ המשתמש נוצר בהצלחה',
        '',
        `שם: ${created.full_name}`,
        `משתמש: ${created.username}`,
        `סיסמה: ${payload.password}`,
        `מקצוע: ${getProfessionLabel(created.profession)}`,
        `תפקיד: ${getRoleLabel(created.role)}`,
      ].join('\n'),
    );
  } catch (err) {
    await ctx.reply(`❌ ${resolveApiError(err)}`);
  }
}

// ─── Error message resolver ───────────────────────────────────────────────────

function resolveApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'שגיאה לא צפויה';

  const status = err.response?.status;
  const body = err.response?.data as ApiErrorResponse | undefined;
  const raw = (body?.message ?? body?.error ?? '').toLowerCase();

  switch (status) {
    case 400: {
      if (raw.includes('duplicate') || raw.includes('already') || raw.includes('exists')) {
        return 'המשתמש כבר קיים';
      }
      if (raw.includes('password')) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
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
