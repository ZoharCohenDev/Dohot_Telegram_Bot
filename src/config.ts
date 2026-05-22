import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}. Create .env from .env.example and fill it in.`);
  return value;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  dohotApiUrl: required('DOHOT_API_URL').replace(/\/$/, ''),
  supabaseUrl: required('SUPABASE_URL').replace(/\/$/, ''),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  adminUsername: required('ADMIN_USERNAME'),
  adminPassword: required('ADMIN_PASSWORD'),
  adminTelegramIds: required('ADMIN_TELEGRAM_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  enableScheduledNotifications: process.env.ENABLE_SCHEDULED_NOTIFICATIONS === 'true',
  enableGoogleSheetsSync: process.env.ENABLE_GOOGLE_SHEETS_SYNC === 'true',
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
  googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  googleSheetsUsersSheetName: process.env.GOOGLE_SHEETS_USERS_SHEET_NAME || 'Users',
  googleSheetsFinanceSheetName: process.env.GOOGLE_SHEETS_FINANCE_SHEET_NAME,
} as const;
