import cron, { ScheduledTask } from 'node-cron';
import { Markup, Telegraf } from 'telegraf';
import { config } from './config';
import { getExpiring, getStatus, getToday } from './services/adminApi';
import { CreatedUser } from './types';
import { getProfessionLabel } from './utils/professionOptions';

const TIMEZONE = 'Asia/Jerusalem';

function datePartsInJerusalem(date: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
  };
}

function tomorrowDateOnlyInJerusalem(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { year, month, day } = datePartsInJerusalem(tomorrow);
  return `${year}-${month}-${day}`;
}

function formatDateYYYYMMDD(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value ?? '—';

  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

export function normalizeIsraeliPhoneForWhatsApp(phone?: string): string | null {
  const digits = phone?.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

export function createWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function expirationMessage(user: CreatedUser): string {
  return [
    '⚠️ מנוי עומד לפוג מחר',
    '',
    `שם: ${user.full_name}`,
    `שם משתמש: ${user.username}`,
    `טלפון: ${user.phone ?? '—'}`,
    `מקצוע: ${getProfessionLabel(user.profession)}`,
    `תוקף: ${formatDateYYYYMMDD(user.subscription_expiration_date)}`,
  ].join('\n');
}

function renewalWhatsAppMessage(user: CreatedUser): string {
  return `שלום ${user.full_name}, רצינו לעדכן שהמנוי שלך בדוחות עומד להסתיים מחר. נשמח לעזור לך לחדש אותו.`;
}

async function notifyAdmins(bot: Telegraf, message: string): Promise<void> {
  await Promise.all(
    config.adminTelegramIds.map(async (telegramId) => {
      await bot.telegram.sendMessage(telegramId, message);
    }),
  );
}

async function sendTomorrowExpirationNotifications(bot: Telegraf): Promise<void> {
  const tomorrow = tomorrowDateOnlyInJerusalem();
  const response = await getExpiring(1);
  const users = response.users.filter((user) => user.subscription_expiration_date === tomorrow);

  for (const user of users) {
    const phone = normalizeIsraeliPhoneForWhatsApp(user.phone);
    const message = expirationMessage(user);
    const extra = phone
      ? Markup.inlineKeyboard([
          Markup.button.url('שלח WhatsApp', createWhatsAppUrl(phone, renewalWhatsAppMessage(user))),
        ])
      : undefined;

    await Promise.all(
      config.adminTelegramIds.map(async (telegramId) => {
        await bot.telegram.sendMessage(telegramId, message, extra);
      }),
    );
  }
}

async function sendDailySummary(bot: Telegraf): Promise<void> {
  const [status, today, expiring] = await Promise.all([getStatus(), getToday(), getExpiring(7)]);

  await notifyAdmins(
    bot,
    [
      '☀️ סיכום יומי - דוחות',
      '',
      '👥 משתמשים:',
      `סה״כ: ${status.totalUsers}`,
      `פעילים: ${status.activeUsers}`,
      `לא פעילים: ${status.inactiveUsers}`,
      '',
      `🆕 נוצרו היום: ${today.count}`,
      `⏳ מנויים שפגים השבוע: ${expiring.count}`,
      `⚠️ מנויים שפגו: ${status.expiredSubscriptions}`,
    ].join('\n'),
  );
}

function logScheduleError(jobName: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[scheduler] ${jobName} failed: ${message}`);
}

export function startScheduledNotifications(bot: Telegraf): ScheduledTask[] {
  if (!config.enableScheduledNotifications) {
    console.log('[scheduler] scheduled notifications disabled');
    return [];
  }

  const expiryTask = cron.schedule(
    '0 14 * * *',
    () => {
      sendTomorrowExpirationNotifications(bot).catch((err) =>
        logScheduleError('tomorrow expiration notifications', err),
      );
    },
    { timezone: TIMEZONE },
  );

  const summaryTask = cron.schedule(
    '5 9 * * *',
    () => {
      sendDailySummary(bot).catch((err) => logScheduleError('daily summary', err));
    },
    { timezone: TIMEZONE },
  );

  console.log('[scheduler] scheduled notifications enabled');
  return [expiryTask, summaryTask];
}
