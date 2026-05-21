import axios from 'axios';
import { config } from '../config';
import {
  AdminStatusResponse,
  AdminAnalyticsResponse,
  CreateUserPayload,
  CreateUserResponse,
  CreatedUser,
  ExtendUserResponse,
  ExpiringUsersResponse,
  FindUserResponse,
  TodayUsersResponse,
  UsernameCheckResponse,
} from '../types';
import { getAccessToken, forceRefresh } from './authService';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function withAuthRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    // On 401 refresh once and retry; any subsequent failure propagates to caller
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      await forceRefresh();
      return await request();
    }
    throw err;
  }
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.post<CreateUserResponse>(
      `${config.dohotApiUrl}/api/admin/users`,
      payload,
      { headers },
    );
    return response.data;
  });
}

export async function getStatus(): Promise<AdminStatusResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<AdminStatusResponse>(
      `${config.dohotApiUrl}/api/admin/status`,
      { headers },
    );
    return response.data;
  });
}

export async function getExpiring(days = 7): Promise<ExpiringUsersResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<ExpiringUsersResponse>(
      `${config.dohotApiUrl}/api/admin/expiring`,
      {
        headers,
        params: { days },
      },
    );
    return response.data;
  });
}

export async function checkUsername(username: string): Promise<UsernameCheckResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<UsernameCheckResponse>(
      `${config.dohotApiUrl}/api/admin/users/check-username`,
      {
        headers,
        params: { username },
      },
    );
    return response.data;
  });
}

export async function findUser(username: string): Promise<FindUserResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<FindUserResponse>(
      `${config.dohotApiUrl}/api/admin/users/find`,
      {
        headers,
        params: { username },
      },
    );
    return response.data;
  });
}

export async function extendUser(username: string, days: number): Promise<ExtendUserResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.patch<ExtendUserResponse>(
      `${config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/extend`,
      { days },
      { headers },
    );
    return response.data;
  });
}

export async function disableUser(username: string): Promise<CreatedUser> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.patch<CreatedUser>(
      `${config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/disable`,
      undefined,
      { headers },
    );
    return response.data;
  });
}

export async function activateUser(username: string): Promise<CreatedUser> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.patch<CreatedUser>(
      `${config.dohotApiUrl}/api/admin/users/${encodeURIComponent(username)}/activate`,
      undefined,
      { headers },
    );
    return response.data;
  });
}

export async function getToday(): Promise<TodayUsersResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<TodayUsersResponse>(
      `${config.dohotApiUrl}/api/admin/today`,
      { headers },
    );
    return response.data;
  });
}

export async function getAnalytics(): Promise<AdminAnalyticsResponse> {
  return withAuthRetry(async () => {
    const headers = await authHeaders();
    const response = await axios.get<AdminAnalyticsResponse>(
      `${config.dohotApiUrl}/api/admin/analytics`,
      { headers },
    );
    return response.data;
  });
}
