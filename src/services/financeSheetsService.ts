import { config } from '../config';
import {
  getGoogleSheetsClient,
  isGoogleSheetsConfigured,
  quoteSheetName,
  spreadsheetId,
} from './googleSheetsService';

export class FinanceSheetsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_configured'
      | 'sheet_not_found'
      | 'header_not_found'
      | 'permission_denied'
      | 'network'
      | 'unknown',
  ) {
    super(message);
    this.name = 'FinanceSheetsError';
  }
}

const EXPENSES_HEADER = ['Date', 'Service', 'Amount', 'Monthly / One-time', 'Paid By', 'Is Active'];
const REVENUE_HEADER = ['User', 'Amount', 'Date', 'Expired Date', 'Paid', 'Payment Method'];

export interface ExpenseRow {
  date: string;
  service: string;
  amount: number;
  recurrence: 'Monthly' | 'One-time';
  paidBy: string;
  isActive: 'Yes' | 'No';
}

export interface RevenueRow {
  user: string;
  amount: number;
  date: string;
  expiredDate: string;
  paid: 'Yes' | 'No';
  paymentMethod: 'Bit' | 'Cash' | 'Bank Transfer' | 'Credit Card' | 'Other';
}

type Section = 'expenses' | 'revenue';
type TargetRow = {
  rowNumber: number;
  startColumnIndex: number;
  width: number;
};

function financeSheetName(): string {
  if (!config.googleSheetsFinanceSheetName) {
    throw new FinanceSheetsError('Google Sheets finance sheet name is missing', 'not_configured');
  }
  return config.googleSheetsFinanceSheetName;
}

export function isFinanceSheetsEnabled(): boolean {
  return config.enableGoogleSheetsSync;
}

function configured(): boolean {
  return Boolean(isGoogleSheetsConfigured() && config.googleSheetsFinanceSheetName);
}

function findHeaderStartIndex(row: string[] | undefined, header: string[]): number {
  if (!row) return -1;

  for (let start = 0; start <= row.length - header.length; start += 1) {
    if (header.every((column, index) => (row[start + index] ?? '').trim() === column)) {
      return start;
    }
  }

  const pipeHeader = header.join('|');
  const pipeHeaderWithSpaces = header.join(' | ');
  const pipeCellIndex = row.findIndex((cell) => {
    const normalized = (cell ?? '').replace(/\s*\|\s*/g, '|').trim();
    return normalized === pipeHeader || (cell ?? '').trim() === pipeHeaderWithSpaces;
  });

  return pipeCellIndex;
}

function rowMatchesHeader(row: string[] | undefined, header: string[]): boolean {
  return findHeaderStartIndex(row, header) !== -1;
}

function rowIsEmpty(row: string[] | undefined, startColumnIndex: number, width: number): boolean {
  if (!row) return true;
  return row
    .slice(startColumnIndex, startColumnIndex + width)
    .every((cell) => (cell ?? '').trim() === '');
}

function columnName(index: number): string {
  let dividend = index + 1;
  let name = '';

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return name;
}

async function sheetIdForName(sheetName: string): Promise<number> {
  const sheets = getGoogleSheetsClient();
  let response;
  try {
    response = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId(),
      fields: 'sheets(properties(sheetId,title))',
    });
  } catch (err) {
    throw normalizeSheetsError(err);
  }

  const sheet = response.data.sheets?.find((item) => item.properties?.title === sheetName);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new FinanceSheetsError('Finance sheet tab was not found', 'sheet_not_found');
  }
  return sheetId;
}

async function insertRowBefore(rowIndex: number): Promise<void> {
  const sheets = getGoogleSheetsClient();
  const sheetId = await sheetIdForName(financeSheetName());

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
              inheritFromBefore: true,
            },
          },
        ],
      },
    });
  } catch (err) {
    throw normalizeSheetsError(err);
  }
}

async function findTargetRow(section: Section): Promise<TargetRow> {
  if (!configured()) {
    throw new FinanceSheetsError(
      'Google Sheets finance sync is enabled but not configured',
      'not_configured',
    );
  }

  const sid = spreadsheetId();
  const email = config.googleServiceAccountEmail ?? '(not set)';
  const rawKey = config.googlePrivateKey ?? '';
  const keyPreview = rawKey.length > 0
    ? `${rawKey.slice(0, 40)}...(${rawKey.length} chars)`
    : '(not set)';
  const sheetName = financeSheetName();

  console.log('[financeSheets] debug:', {
    section,
    spreadsheetId: sid,
    serviceAccountEmail: email,
    privateKeyPreview: keyPreview,
    sheetName,
    enableGoogleSheetsSync: config.enableGoogleSheetsSync,
    configured: configured(),
  });

  const header = section === 'expenses' ? EXPENSES_HEADER : REVENUE_HEADER;
  const otherHeader = section === 'expenses' ? REVENUE_HEADER : EXPENSES_HEADER;
  const sheets = getGoogleSheetsClient();
  const range = `${quoteSheetName(sheetName)}!A:Z`;
  console.log(`[financeSheets] reading range: ${range}`);
  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range,
    });
    console.log(`[financeSheets] read OK — ${response.data.values?.length ?? 0} rows returned`);
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[financeSheets] read FAILED:', {
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    throw normalizeSheetsError(err);
  }

  const values = (response.data.values ?? []) as string[][];
  const headerIndex = values.findIndex((row) => rowMatchesHeader(row, header));
  if (headerIndex === -1) {
    throw new FinanceSheetsError('Finance section header was not found', 'header_not_found');
  }
  const startColumnIndex = findHeaderStartIndex(values[headerIndex], header);

  const nextOtherHeaderOffset = values
    .slice(headerIndex + 1)
    .findIndex((row) => rowMatchesHeader(row, otherHeader));
  const nextOtherHeaderIndex =
    nextOtherHeaderOffset === -1 ? -1 : headerIndex + 1 + nextOtherHeaderOffset;
  const sectionEndIndex = nextOtherHeaderIndex === -1 ? values.length : nextOtherHeaderIndex;

  for (let index = headerIndex + 1; index < sectionEndIndex; index += 1) {
    if (rowIsEmpty(values[index], startColumnIndex, header.length)) {
      return { rowNumber: index + 1, startColumnIndex, width: header.length };
    }
  }

  if (nextOtherHeaderIndex !== -1) {
    await insertRowBefore(nextOtherHeaderIndex);
    return { rowNumber: nextOtherHeaderIndex + 1, startColumnIndex, width: header.length };
  }

  return { rowNumber: values.length + 1, startColumnIndex, width: header.length };
}

async function updateRow(target: TargetRow, values: Array<string | number>): Promise<void> {
  const sheets = getGoogleSheetsClient();
  const startColumn = columnName(target.startColumnIndex);
  const endColumn = columnName(target.startColumnIndex + target.width - 1);
  const range = `${quoteSheetName(financeSheetName())}!${startColumn}${target.rowNumber}:${endColumn}${target.rowNumber}`;

  console.log(`[financeSheets] writing to range: ${range}`, values);

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
    console.log('[financeSheets] write OK');
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[financeSheets] write FAILED:', {
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    throw normalizeSheetsError(err);
  }
}

function normalizeSheetsError(err: unknown): FinanceSheetsError {
  if (err instanceof FinanceSheetsError) return err;

  const maybe = err as { code?: unknown; response?: { status?: unknown }; message?: unknown };
  const status = maybe.response?.status;
  const code = maybe.code;
  const message = typeof maybe.message === 'string' ? maybe.message : 'Google Sheets error';

  if (status === 403) return new FinanceSheetsError(message, 'permission_denied');
  if (status === 404) return new FinanceSheetsError(message, 'sheet_not_found');
  if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return new FinanceSheetsError(message, 'network');
  }
  return new FinanceSheetsError(message, 'unknown');
}

export async function appendExpenseRow(row: ExpenseRow): Promise<void> {
  if (!config.enableGoogleSheetsSync) return;
  const target = await findTargetRow('expenses');
  await updateRow(target, [
    row.date,
    row.service,
    row.amount,
    row.recurrence,
    row.paidBy,
    row.isActive,
  ]);
}

export async function appendRevenueRow(row: RevenueRow): Promise<void> {
  if (!config.enableGoogleSheetsSync) return;
  const target = await findTargetRow('revenue');
  await updateRow(target, [
    row.user,
    row.amount,
    row.date,
    row.expiredDate,
    row.paid,
    row.paymentMethod,
  ]);
}
