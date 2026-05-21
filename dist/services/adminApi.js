"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = createUser;
exports.getStatus = getStatus;
exports.getExpiring = getExpiring;
exports.checkUsername = checkUsername;
exports.findUser = findUser;
exports.extendUser = extendUser;
exports.disableUser = disableUser;
exports.activateUser = activateUser;
exports.getToday = getToday;
exports.getAnalytics = getAnalytics;
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
async function findUser(username) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/users/find`, {
            headers,
            params: { username },
        });
        return response.data;
    });
}
async function extendUser(username, days) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.patch(`${config_1.config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/extend`, { days }, { headers });
        return response.data;
    });
}
async function disableUser(username) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.patch(`${config_1.config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/disable`, undefined, { headers });
        return response.data;
    });
}
async function activateUser(username) {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.patch(`${config_1.config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/activate`, undefined, { headers });
        return response.data;
    });
}
async function getToday() {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/today`, { headers });
        return response.data;
    });
}
async function getAnalytics() {
    return withAuthRetry(async () => {
        const headers = await authHeaders();
        const response = await axios_1.default.get(`${config_1.config.dohotApiUrl}/api/admin/analytics`, { headers });
        return response.data;
    });
}
//# sourceMappingURL=adminApi.js.map