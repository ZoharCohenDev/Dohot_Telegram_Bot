import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';
import { CreateUserPayload } from '../types';
import { getProfessionLabel } from '../utils/professionOptions';

export interface CreatedUserSheetRowInput {
  payload: CreateUserPayload;
  createdByTelegramId: number;
  createdAt?: Date;
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    config.googleServiceAccountEmail &&
      config.googlePrivateKey &&
      config.googleSheetsSpreadsheetId &&
      config.googleSheetsUsersSheetName,
  );
}

function privateKey(): string {
  return config.googlePrivateKey!.replace(/\\n/g, '\n');
}

export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export function spreadsheetId(): string {
  if (!config.googleSheetsSpreadsheetId) {
    throw new Error('Google Sheets spreadsheet ID is missing');
  }
  return config.googleSheetsSpreadsheetId;
}

export function getGoogleSheetsClient(): sheets_v4.Sheets {
  const auth = new google.auth.JWT({
    email: config.googleServiceAccountEmail,
    key: privateKey(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function formatCreatedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

function sheetRange(): string {
  return `${quoteSheetName(config.googleSheetsUsersSheetName)}!A:H`;
}

export function isGoogleSheetsSyncEnabled(): boolean {
  return config.enableGoogleSheetsSync;
}

export async function appendCreatedUserRow(input: CreatedUserSheetRowInput): Promise<void> {
  if (!config.enableGoogleSheetsSync) return;
  if (!isGoogleSheetsConfigured()) {
    throw new Error('Google Sheets sync is enabled but not configured');
  }

  const sheets = getGoogleSheetsClient();
  const { payload } = input;

  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: sheetRange(),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [
        [
          formatCreatedAt(input.createdAt ?? new Date()),
          payload.full_name,
          payload.username,
          payload.phone ?? '',
          getProfessionLabel(payload.profession),
          payload.role,
          payload.subscription_expiration_date ?? '',
          input.createdByTelegramId,
        ],
      ],
    },
  });
}
