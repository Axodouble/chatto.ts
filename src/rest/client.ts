import type { ZodSchema } from 'zod'
import { ChattoApiError, ChattoParseError } from '../errors'

export class RestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async post<T>(
    service: string,
    method: string,
    input: unknown,
    schema: ZodSchema<T>,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/connect/${service}/${method}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      throw new ChattoApiError(
        typeof body['code'] === 'string' ? body['code'] : 'unknown',
        typeof body['message'] === 'string' ? body['message'] : res.statusText,
        body,
      )
    }

    const body = await res.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new ChattoParseError(parsed.error.issues, body)
    }
    return parsed.data
  }
}
