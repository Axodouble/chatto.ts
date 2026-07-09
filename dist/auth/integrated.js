"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginWithPassword = loginWithPassword;
const zod_1 = require("zod");
const errors_1 = require("../errors");
const LoginResponseSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    token: zod_1.z.string(),
    user: zod_1.z.object({
        id: zod_1.z.string(),
        login: zod_1.z.string(),
    }),
});
async function loginWithPassword(baseUrl, login, password) {
    const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new errors_1.ChattoApiError('unauthenticated', typeof body['error'] === 'string' ? body['error'] : res.statusText, body);
    }
    const body = await res.json();
    const parsed = LoginResponseSchema.safeParse(body);
    if (!parsed.success) {
        throw new errors_1.ChattoParseError(parsed.error.issues, body);
    }
    return parsed.data;
}
//# sourceMappingURL=integrated.js.map