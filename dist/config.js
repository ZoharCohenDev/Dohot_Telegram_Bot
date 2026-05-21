"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required env variable: ${name}`);
    return value;
}
exports.config = {
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
};
//# sourceMappingURL=config.js.map