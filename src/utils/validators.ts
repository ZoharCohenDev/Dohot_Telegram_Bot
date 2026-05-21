const FULL_NAME_ERROR = 'נא להזין שם מלא תקין — שם פרטי ושם משפחה';
const USERNAME_ERROR = 'שם משתמש חייב להיות באנגלית, לפחות 3 תווים, ללא רווחים';

export function normalizeFullName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(' ');
}

export function validateFullName(value: string): string | null {
  const normalized = normalizeFullName(value);
  const words = normalized.split(' ').filter(Boolean);

  if (words.length < 2) return FULL_NAME_ERROR;
  if (words.some((word) => word.length < 2)) return FULL_NAME_ERROR;
  if (/\d/.test(normalized)) return FULL_NAME_ERROR;
  if (!/^[\p{Script=Hebrew}A-Za-z' -]+$/u.test(normalized)) return FULL_NAME_ERROR;

  return null;
}

export function validateUsername(value: string): string | null {
  const username = value.trim().toLowerCase();

  if (!username) return USERNAME_ERROR;
  if (username.length < 3 || username.length > 50) return USERNAME_ERROR;
  if (/\s/.test(username)) return USERNAME_ERROR;
  if (!/^[a-z0-9_.-]+$/.test(username)) return USERNAME_ERROR;

  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 6) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
  return null;
}

export function isSkip(value: string): boolean {
  return value.trim() === '/skip' || value.trim() === '-';
}
