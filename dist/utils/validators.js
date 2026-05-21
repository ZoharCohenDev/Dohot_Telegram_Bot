"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFullName = normalizeFullName;
exports.validateFullName = validateFullName;
exports.validateUsername = validateUsername;
exports.validatePassword = validatePassword;
exports.isSkip = isSkip;
const FULL_NAME_ERROR = 'נא להזין שם מלא תקין — שם פרטי ושם משפחה';
const USERNAME_ERROR = 'שם משתמש חייב להיות באנגלית, לפחות 3 תווים, ללא רווחים';
function normalizeFullName(value) {
    return value.trim().split(/\s+/).filter(Boolean).join(' ');
}
function validateFullName(value) {
    const normalized = normalizeFullName(value);
    const words = normalized.split(' ').filter(Boolean);
    if (words.length < 2)
        return FULL_NAME_ERROR;
    if (words.some((word) => word.length < 2))
        return FULL_NAME_ERROR;
    if (/\d/.test(normalized))
        return FULL_NAME_ERROR;
    if (!/^[\p{Script=Hebrew}A-Za-z' -]+$/u.test(normalized))
        return FULL_NAME_ERROR;
    return null;
}
function validateUsername(value) {
    const username = value.trim().toLowerCase();
    if (!username)
        return USERNAME_ERROR;
    if (username.length < 3 || username.length > 50)
        return USERNAME_ERROR;
    if (/\s/.test(username))
        return USERNAME_ERROR;
    if (!/^[a-z0-9_.-]+$/.test(username))
        return USERNAME_ERROR;
    return null;
}
function validatePassword(value) {
    if (value.length < 6)
        return 'הסיסמה חייבת להכיל לפחות 6 תווים';
    return null;
}
function isSkip(value) {
    return value.trim() === '/skip' || value.trim() === '-';
}
//# sourceMappingURL=validators.js.map