export type CreateUserStep =
  | 'full_name'
  | 'username'
  | 'password'
  | 'phone'
  | 'profession'
  | 'role'
  | 'subscription_expiration_date'
  | 'confirm';

export interface CreateUserDraft {
  step: CreateUserStep;
  full_name?: string;
  username?: string;
  password?: string;
  phone?: string;
  profession?: string;
  role?: 'technician' | 'admin';
  subscription_expiration_date?: string;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  full_name: string;
  phone?: string;
  profession: string;
  role: 'technician' | 'admin';
  subscription_expiration_date?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  /** Unix timestamp ms at which the token expires */
  expires_at: number;
}

export interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface ApiErrorResponse {
  message?: string;
  error?: string;
}

export interface CreatedUser {
  id?: string;
  username: string;
  full_name: string;
  profession: string;
  role: string;
  phone?: string;
  subscription_expiration_date?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface CreateUserResponse {
  user?: CreatedUser;
}

export interface AdminStatusResponse {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  admins: number;
  technicians: number;
  validSubscriptions: number;
  expiredSubscriptions: number;
  expiringSoon: number;
  newUsersThisMonth: number;
}

export interface ExpiringUsersResponse {
  days: number;
  count: number;
  users: CreatedUser[];
}

export interface UsernameCheckResponse {
  username: string;
  exists: boolean;
  available: boolean;
}

export type FindUserResponse = Partial<CreatedUser> & {
  user?: CreatedUser;
};

export type ExtendUserResponse = Partial<CreatedUser> & {
  user?: CreatedUser;
  days?: number;
  addedDays?: number;
};

export interface TodayUsersResponse {
  count: number;
  users: CreatedUser[];
}

export interface AdminAnalyticsResponse {
  byProfession: Record<string, number>;
  byRole: Record<string, number>;
  byStatus: {
    active: number;
    inactive: number;
  };
  newUsersLast7Days: number;
  newUsersThisMonth: number;
}
