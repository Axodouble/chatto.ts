import { z } from 'zod'
import { ChattoApiError, ChattoParseError } from '../errors'

const LoginResponseSchema = z.object({
  success: z.boolean(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    login: z.string(),
  }),
})

export type LoginResult = z.infer<typeof LoginResponseSchema>

export async function loginWithPassword(
  baseUrl: string,
  login: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new ChattoApiError(
      'unauthenticated',
      typeof body['error'] === 'string' ? body['error'] : res.statusText,
      body,
    )
  }

  const body = await res.json()
  const parsed = LoginResponseSchema.safeParse(body)
  if (!parsed.success) {
    throw new ChattoParseError(parsed.error.issues, body)
  }
  return parsed.data
}
