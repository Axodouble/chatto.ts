import { z } from 'zod';
declare const LoginResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    token: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        login: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        login: string;
    }, {
        id: string;
        login: string;
    }>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    token: string;
    user: {
        id: string;
        login: string;
    };
}, {
    success: boolean;
    token: string;
    user: {
        id: string;
        login: string;
    };
}>;
export type LoginResult = z.infer<typeof LoginResponseSchema>;
export declare function loginWithPassword(baseUrl: string, login: string, password: string): Promise<LoginResult>;
export {};
//# sourceMappingURL=integrated.d.ts.map