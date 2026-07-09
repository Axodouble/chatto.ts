import { describe, it, expect, afterEach, spyOn, mock } from 'bun:test'
import { z } from 'zod'
import { RestClient } from '../../src/rest/client'
import { ChattoApiError, ChattoParseError } from '../../src/errors'

const schema = z.object({ id: z.string() })

function mockFetch(status: number, body: unknown) {
  return spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as Response)
}

afterEach(() => mock.restore())

describe('RestClient.post', () => {
  const client = new RestClient('https://chat.example.com', 'mytoken')

  it('sends POST to correct URL with correct headers', async () => {
    const spy = mockFetch(200, { id: 'abc' })
    await client.post('chatto.api.v1.MessageService', 'GetMessage', { roomId: 'r1', eventId: 'e1' }, schema)
    expect(spy).toHaveBeenCalledWith(
      'https://chat.example.com/api/connect/chatto.api.v1.MessageService/GetMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mytoken',
          'Connect-Protocol-Version': '1',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ roomId: 'r1', eventId: 'e1' }),
      }),
    )
  })

  it('returns Zod-parsed response on success', async () => {
    mockFetch(200, { id: 'abc' })
    const result = await client.post('svc', 'Method', {}, schema)
    expect(result.id).toBe('abc')
  })

  it('throws ChattoApiError on non-2xx response', async () => {
    mockFetch(401, { code: 'unauthenticated', message: 'Not authenticated' })
    await expect(client.post('svc', 'Method', {}, schema)).rejects.toThrow(ChattoApiError)
  })

  it('includes code from response body in ChattoApiError', async () => {
    mockFetch(401, { code: 'unauthenticated', message: 'Not authenticated' })
    try {
      await client.post('svc', 'Method', {}, schema)
    } catch (e) {
      expect(e).toBeInstanceOf(ChattoApiError)
      expect((e as ChattoApiError).code).toBe('unauthenticated')
    }
  })

  it('throws ChattoParseError when response does not match schema', async () => {
    mockFetch(200, { id: 123 }) // id should be string
    await expect(client.post('svc', 'Method', {}, schema)).rejects.toThrow(ChattoParseError)
  })
})
