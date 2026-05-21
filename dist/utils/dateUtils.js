"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateDDMMYYYY = parseDateDDMMYYYY;
/** Parses DD/MM/YYYY and returns YYYY-MM-DD, or null if invalid. */
function parseDateDDMMYYYY(input) {
    const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match)
        return null;
    const [, dd, mm, yyyy] = match;
    // Use UTC to avoid timezone-shifted date mismatches
    const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    if (isNaN(date.getTime()) ||
        date.getUTCFullYear() !== parseInt(yyyy) ||
        date.getUTCMonth() + 1 !== parseInt(mm) ||
        date.getUTCDate() !== parseInt(dd)) {
        return null;
    }
    return `${yyyy}-${mm}-${dd}`;
}
//# sourceMappingURL=dateUtils.js.map