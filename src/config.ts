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
} as const;
