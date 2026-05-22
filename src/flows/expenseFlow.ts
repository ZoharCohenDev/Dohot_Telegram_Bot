import { Context, Markup } from 'telegraf';
import { appendExpenseRow, ExpenseRow, FinanceSheetsError } from '../services/financeSheetsService';

type ExpenseStep = 'date' | 'service' | 'amount' | 'recurrence' | 'paidBy' | 'isActive' | 'confirm';

interface ExpenseDraft {
  step: ExpenseStep;
  date?: string;
  service?: string;
  amount?: number;
  recurrence?: 'Monthly' | 'One-time';
  paidBy?: string;
  isActive?: 'Yes' | 'No';
}

const sessions = new Map<number, ExpenseDraft>();

export function isInExpenseFlow(userId: number): boolean {
  return sessions.has(userId);
}

export function cancelExpenseFlow(userId: number): void {
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

function parseDate(value: string): string | null {
  if (value.trim() === '/today') return todayDDMMYYYY();
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
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

function recurrenceKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Monthly', 'expense:recurrence:Monthly'),
      Markup.button.callback('One-time', 'expense:recurrence:One-time'),
    ],
  ]);
}

function activeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Yes', 'expense:active:Yes'),
      Markup.button.callback('No', 'expense:active:No'),
    ],
  ]);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('אישור', 'expense:confirm:yes'),
      Markup.button.callback('ביטול', 'expense:confirm:no'),
    ],
  ]);
}

function summary(draft: ExpenseDraft): string {
  return [
    'סיכום הוצאה',
    '',
    `Date: ${draft.date}`,
    `Service: ${draft.service}`,
    `Amount: ${draft.amount}`,
    `Monthly / One-time: ${draft.recurrence}`,
    `Paid By: ${draft.paidBy}`,
    `Is Active: ${draft.isActive}`,
    '',
    'לאשר שמירה?',
  ].join('\n');
}

function toRow(draft: ExpenseDraft): ExpenseRow {
  return {
    date: draft.date!,
    service: draft.service!,
    amount: draft.amount!,
    recurrence: draft.recurrence!,
    paidBy: draft.paidBy!,
    isActive: draft.isActive!,
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
      return 'לא מצאתי את כותרות ההוצאות בגיליון הפיננסים.';
    case 'permission_denied':
      return 'אין הרשאה לעדכן את Google Sheets. ודא ששיתפת את הגיליון עם חשבון השירות.';
    case 'network':
      return 'לא הצלחתי להתחבר ל-Google Sheets, נסה שוב.';
    default:
      return 'לא הצלחתי לעדכן את Google Sheets, נסה שוב';
  }
}

export async function startExpenseFlow(ctx: Context): Promise<void> {
  sessions.set(ctx.from!.id, { step: 'date' });
  await ctx.reply(`הוספת הוצאה\n\nתאריך? שלח /today או DD/MM/YYYY\nהיום: ${todayDDMMYYYY()}`);
}

export async function handleExpenseText(ctx: Context, text: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  const value = text.trim();

  switch (draft.step) {
    case 'date': {
      const date = parseDate(value);
      if (!date) {
        await ctx.reply('תאריך לא תקין. שלח /today או DD/MM/YYYY');
        return;
      }
      draft.date = date;
      draft.step = 'service';
      sessions.set(userId, draft);
      await ctx.reply('שם השירות?');
      return;
    }
    case 'service': {
      if (!value) {
        await ctx.reply('יש להזין שם שירות');
        return;
      }
      draft.service = value;
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
      draft.step = 'recurrence';
      sessions.set(userId, draft);
      await ctx.reply('Monthly או One-time?', recurrenceKeyboard());
      return;
    }
    case 'paidBy': {
      if (!value) {
        await ctx.reply('יש להזין מי שילם');
        return;
      }
      draft.paidBy = value;
      draft.step = 'isActive';
      sessions.set(userId, draft);
      await ctx.reply('Is Active?', activeKeyboard());
      return;
    }
    default:
      await ctx.reply('אנא השתמש בכפתורים כדי להמשיך.');
  }
}

export async function handleExpenseCallback(ctx: Context, data: string): Promise<void> {
  const userId = ctx.from!.id;
  const draft = sessions.get(userId);
  if (!draft) return;

  if (data === 'expense:recurrence:Monthly' && draft.step === 'recurrence') {
    draft.recurrence = 'Monthly';
    draft.step = 'paidBy';
    sessions.set(userId, draft);
    await ctx.reply('מי שילם? לדוגמה: Owner, Zohar, Roni');
    return;
  }

  if (data === 'expense:recurrence:One-time' && draft.step === 'recurrence') {
    draft.recurrence = 'One-time';
    draft.step = 'paidBy';
    sessions.set(userId, draft);
    await ctx.reply('מי שילם? לדוגמה: Owner, Zohar, Roni');
    return;
  }

  if ((data === 'expense:active:Yes' || data === 'expense:active:No') && draft.step === 'isActive') {
    draft.isActive = data.endsWith(':Yes') ? 'Yes' : 'No';
    draft.step = 'confirm';
    sessions.set(userId, draft);
    await ctx.reply(summary(draft), confirmKeyboard());
    return;
  }

  if (data === 'expense:confirm:no' && draft.step === 'confirm') {
    sessions.delete(userId);
    await ctx.reply('הפעולה בוטלה.');
    return;
  }

  if (data === 'expense:confirm:yes' && draft.step === 'confirm') {
    try {
      await appendExpenseRow(toRow(draft));
      sessions.delete(userId);
      await ctx.reply('✅ ההוצאה נשמרה ב-Google Sheets');
    } catch (err) {
      await ctx.reply(resolveFinanceSheetsError(err));
    }
  }
}
