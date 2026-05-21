"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
exports.forceRefresh = forceRefresh;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
let tokens = null;
async function login() {
    const response = await axios_1.default.post(`${config_1.config.supabaseUrl}/auth/v1/token?grant_type=password`, {
        email: `${config_1.config.adminUsername}@dohot.app`,
        password: config_1.config.adminPassword,
    }, {
        headers: {
            apikey: config_1.config.supabaseAnonKey,
            'Content-Type': 'application/json',
        },
    });
    const { access_token, refresh_token, expires_in } = response.data;
    tokens = {
        access_token,
        refresh_token,
        // Subtract 60 s to refresh before actual expiry
        expires_at: Date.now() + (expires_in - 60) * 1000,
    };
}
async function refreshSession() {
    if (!tokens?.refresh_token) {
        await login();
        return;
    }
    try {
        const response = await axios_1.default.post(`${config_1.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { refresh_token: tokens.refresh_token }, {
            headers: {
                apikey: config_1.config.supabaseAnonKey,
                'Content-Type': 'application/json',
            },
        });
        const { access_token, refresh_token, expires_in } = response.data;
        tokens = {
            access_token,
            refresh_token,
            expires_at: Date.now() + (expires_in - 60) * 1000,
        };
    }
    catch {
        // Refresh token is invalid or expired; fall back to full login
        await login();
    }
}
async function getAccessToken() {
    if (!tokens || Date.now() >= tokens.expires_at) {
        await login();
    }
    return tokens.access_token;
}
async function forceRefresh() {
    await refreshSession();
}
//# sourceMappingURL=authService.js.map