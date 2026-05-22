import { Context, Markup } from 'telegraf';
import { appendRevenueRow, FinanceSheetsError, RevenueRow } from '../services/financeSheetsService';

type RevenueStep = 'user' | 'amount' | 'date' | 'expiredDate' | 'paid' | 'paymentMethod' | 'confirm';
type PaymentMethod = 'Bit' | 'Cash' | 'Bank Transfer' | 'Credit Card' | 'Other';

interface RevenueDraft {
  step: RevenueStep;
  user?: string;
  amount?: number;
  date?: string;
  expiredDate?: string;
  paid?: 'Yes' | 'No';
  paymentMethod?: PaymentMethod;
}

const sessions = new Map<number, RevenueDraft>();

export function isInRevenueFlow(userId: number): boolean {
  return sessions.has(userId);
}

export function cancelRevenueFlow(userId: number): void {
  sessions.delete(userId);
}

function todayDDMMYYYY(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')}`;
}

function addSixMonths(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/').map(Number);
  const firstOfTarget = new Date(Date.UTC(yyyy, mm - 1 + 6, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const actualDay = Math.min(dd, lastDay);
  return [
    String(actualDay).padStart(2, '0'),
    String(firstOfTarget.getUTCMonth() + 1).padStart(2, '0'),
    String(firstOfTarget.getUTCFullYear()),
  ].join('/');
}

function parseDate(value: string, allowSkip = false): string | null {
  const trimmed = value.trim();
  if (allowSkip && trimmed === '/skip') return '';
  if (trimmed === '/today') return todayDDMMYYYY();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(yyyy) ||
    date.getUTCMonth() + 1 !== Number(mm) ||
    date.getUTCDate() !== Number(dd)
  ) {
    return null;
  }
  return `${dd}/${mm}/${yyyy}`;
}

function parseAmount(value: string): number | null {
  const amount = Number(value.trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function paidKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Yes', 'revenue:paid:Yes'),
      Markup.button.callback('No', 'revenue:paid:No'),
    ],
  ]);
}

function paymentMethodKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Bit', 'revenue:method:Bit')],
    [Markup.button.callback('Cash', 'revenue:method:Cash')],
    [Markup.button.callback('Bank Transfer', 'revenue:method:Bank Transfer')],
    [Markup.button.callback('Credit Card', 'revenue:method:Credit Card')],
    [Markup.button.callback('Other', 'revenue:method:Other')],
  ]);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('אישור', 'revenue:confirm:yes'),
      Markup.button.callback('ביטול', 'revenue:confirm:no'),
    ],
  ]);
}

function summary(draft: RevenueDraft): string {
  return [
    'סיכום הכנסה',
    '',
    `User: ${draft.user}`,
    `Amount: ${draft.amount}`,
    `Date: ${draft.date}`,
    `Expired Date: ${draft.expiredDate || '—'}`,
    `Paid: ${draft.paid}`,
    `Payment Method: ${draft.paymentMethod}`,
    '',
    'לאשר שמירה?',
  ].join('\n');
}

function toRow(draft: RevenueDraft): RevenueRow {
  return {
    user: draft.user!,
    amount: draft.amount!,
    date: draft.date!,
    expiredDate: draft.expiredDate ?? '',
    paid: draft.paid!,
    paymentMethod: draft.paymentMethod!,
  };
}

function resolveFinanceSheetsError(err: unknown): string {
  if (!(err instanceof FinanceSheetsError)) return 'לא הצלחתי לעדכן את Google Sheets, נסה שוב';

  switch (err.code) {
    case 'not_configured':
      return 'Google Sheets לא מוגדר. בדוק את משתני הסביבה.';
    case 'sheet_not_found':
      return 'לא מצאתי את לשונית הפיננסים ב-Google Sheets.';
    case 'header_not_found':
      return 'לא מצאתי את כותרות ההכנסות בגיליון הפיננסים.';
    case 'permission_denied':
      return 'אין הרשאה לעדכן את Google Sheets. ודא ששיתפת את הגיליון עם חשבון השירות.';
    case 'network':
      return 'לא הצלחתי להתחבר ל-Google Sheets, נסה שוב.';
    default:
      return 'לא הצלחתי לעדכן את Google Sheets, נסה שוב';
  }
}

export async function startRevenueFlow(ctx: Context): Promise<void> {
  sessions.set(ctx.from!.id, { step: 'user' });
  await ctx.reply('הוספת הכנסה\n\nשם משתמש / לקוח?');
}

export async function handleRevenueText(ctx: Context, text: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  const value = text.trim();

  switch (draft.step) {
    case 'user': {
      if (!value) {
        await ctx.reply('יש להזין משתמש');
        return;
      }
      draft.user = value;
      draft.step = 'amount';
      sessions.set(userId, draft);
      await ctx.reply('סכום?');
      return;
    }
    case 'amount': {
      const amount = parseAmount(value);
      if (!amount) {
        await ctx.reply('הסכום חייב להיות מספר חיובי');
        return;
      }
      draft.amount = amount;
      draft.step = 'date';
      sessions.set(userId, draft);
      await ctx.reply(`תאריך תשלום? שלח /today או DD/MM/YYYY\nהיום: ${todayDDMMYYYY()}`);
      return;
    }
    case 'date': {
      const date = parseDate(value);
      if (!date) {
        await ctx.reply('תאריך לא תקין. שלח /today או DD/MM/YYYY');
        return;
      }
      draft.date = date;
      draft.step = 'expiredDate';
      sessions.set(userId, draft);
      await ctx.reply('תאריך תפוגה? שלח /skip, /half (חצי שנה מתאריך התשלום) או DD/MM/YYYY');
      return;
    }
    case 'expiredDate': {
      if (value.trim() === '/half') {
        draft.expiredDate = addSixMonths(draft.date!);
        draft.step = 'paid';
        sessions.set(userId, draft);
        await ctx.reply('Paid?', paidKeyboard());
        return;
      }
      const expiredDate = parseDate(value, true);
      if (expiredDate === null) {
        await ctx.reply('תאריך לא תקין. שלח /skip, /half או DD/MM/YYYY');
        return;
      }
      draft.expiredDate = expiredDate;
      draft.step = 'paid';
      sessions.set(userId, draft);
      await ctx.reply('Paid?', paidKeyboard());
      return;
    }
    default:
      await ctx.reply('אנא השתמש בכפתורים כדי להמשיך.');
  }
}

export async function handleRevenueCallback(ctx: Context, data: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  if ((data === 'revenue:paid:Yes' || data === 'revenue:paid:No') && draft.step === 'paid') {
    draft.paid = data.endsWith(':Yes') ? 'Yes' : 'No';
    draft.step = 'paymentMethod';
    sessions.set(userId, draft);
    await ctx.reply('Payment Method?', paymentMethodKeyboard());
    return;
  }

  if (data.startsWith('revenue:method:') && draft.step === 'paymentMethod') {
    const method = data.slice('revenue:method:'.length) as PaymentMethod;
    draft.paymentMethod = method;
    draft.step = 'confirm';
    sessions.set(userId, draft);
    await ctx.reply(summary(draft), confirmKeyboard());
    return;
  }

  if (data === 'revenue:confirm:no' && draft.step === 'confirm') {
    sessions.delete(userId);
    await ctx.reply('הפעולה בוטלה.');
    return;
  }

  if (data === 'revenue:confirm:yes' && draft.step === 'confirm') {
    try {
      await appendRevenueRow(toRow(draft));
      sessions.delete(userId);
      await ctx.reply('✅ ההכנסה נשמרה ב-Google Sheets');
    } catch (err) {
      await ctx.reply(resolveFinanceSheetsError(err));
    }
  }
}
