import { AdminStatusResponse, CreateUserPayload, CreateUserResponse, ExpiringUsersResponse, UsernameCheckResponse } from '../types';
export declare function createUser(payload: CreateUserPayload): Promise<CreateUserResponse>;
export declare function getStatus(): Promise<AdminStatusResponse>;
export declare function getExpiring(days?: number): Promise<ExpiringUsersResponse>;
export declare function checkUsername(username: string): Promise<UsernameCheckResponse>;
