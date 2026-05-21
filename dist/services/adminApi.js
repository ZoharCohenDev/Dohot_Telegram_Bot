"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = createUser;
exports.getStatus = getStatus;
exports.getExpiring = getExpiring;
exports.checkUsername = checkUsername;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const authService_1 = require("./authService");
async function authHeaders() {
    const token = await (0, authService_1.getAccessToken)();
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}
async function withAuthRetry(request) {
    try {
        return await request();
    }
    catch (err) {
        // On 401 refresh once and retry; any subsequent failure propagates to caller
        if (axios_1.default.isAxiosError(err) && err.response?.status === 401) {
            await (0, authService_1.forceRefresh)();
            return await request();
        }
        throw err;
    }
}
async function createUser(payload) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.post(`${config_1.config.dohotApiUrl}/api/admin/users`, payload, { headers });
        return response.data;
    });
}
async function getStatus() {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/status`, { headers });
        return response.data;
    });
}
async function getExpiring(days = 7) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/expiring`, {
            headers,
            params: { days },
        });
        return response.data;
    });
}
async function checkUsername(username) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/users/check-username`, {
            headers,
            params: { username },
        });
        return response.data;
    });
}
//# sourceMappingURL=adminApi.js.map