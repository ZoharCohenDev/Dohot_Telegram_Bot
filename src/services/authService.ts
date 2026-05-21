import axios from 'axios';
import { config } from '../config';
import { AuthTokens, SupabaseAuthResponse } from '../types';

let tokens: AuthTokens | null = null;

async function login(): Promise<void> {
  const response = await axios.post<SupabaseAuthResponse>(
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      email: `${config.adminUsername}@dohot.app`,
      password: config.adminPassword,
    },
    {
      headers: {
        apikey: config.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
    },
  );

  const { access_token, refresh_token, expires_in } = response.data;
  tokens = {
    access_token,
    refresh_token,
    // Subtract 60 s to refresh before actual expiry
    expires_at: Date.now() + (expires_in - 60) * 1000,
  };
}

async function refreshSession(): Promise<void> {
  if (!tokens?.refresh_token) {
    await login();
    return;
  }

  try {
    const response = await axios.post<SupabaseAuthResponse>(
      `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      { refresh_token: tokens.refresh_token },
      {
        headers: {
          apikey: config.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    tokens = {
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in - 60) * 1000,
    };
  } catch {
    // Refresh token is invalid or expired; fall back to full login
    await login();
  }
}

export async function getAccessToken(): Promise<string> {
  if (!tokens || Date.now() >= tokens.expires_at) {
    await login();
  }
  return tokens!.access_token;
}

export async function forceRefresh(): Promise<void> {
  await refreshSession();
}
