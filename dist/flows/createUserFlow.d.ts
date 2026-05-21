import { Context } from 'telegraf';
export declare function isInFlow(userId: number): boolean;
export declare function cancelFlow(userId: number): void;
export declare function startFlow(ctx: Context): Promise<void>;
export declare function handleText(ctx: Context, text: string): Promise<void>;
export declare function handleCallback(ctx: Context, data: string): Promise<void>;
