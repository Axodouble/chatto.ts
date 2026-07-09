import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { loginWithPassword } from '../../src/auth/integrated'
import { ChattoApiError, ChattoParseError } from '../../src/errors'

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const successBody = {
  success: true,
  token: 'cht_testtoken123',
  user: { id: 'U123', login: 'testuser' },
}

describe('loginWithPassword', () => {
  let fetchMock: ReturnType<typeof mock>

  beforeEach(() => {
    fetchMock = mock(async (_url: string, _opts?: RequestInit) =>
      makeResponse(200, successBody),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs to /auth/login with login and password', async () => {
    await loginWithPassword('https://chat.example.com', 'testuser', 'secret')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chat.example.com/auth/login')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({ login: 'testuser', password: 'secret' })
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('returns the parsed login result on success', async () => {
    const result = await loginWithPassword('https://chat.example.com', 'testuser', 'secret')
    expect(result.token).toBe('cht_testtoken123')
    expect(result.user.id).toBe('U123')
    expect(result.user.login).toBe('testuser')
    expect(result.success).toBe(true)
  })

  it('throws ChattoApiError on non-OK response', async () => {
    fetchMock = mock(async () => makeResponse(401, { error: 'Invalid credentials' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await expect(
      loginWithPassword('https://chat.example.com', 'bad', 'wrong'),
    ).rejects.toBeInstanceOf(ChattoApiError)
  })

  it('includes error message from response body in ChattoApiError', async () => {
    fetchMock = mock(async () => makeResponse(401, { error: 'Invalid credentials' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const err = await loginWithPassword('https://chat.example.com', 'bad', 'wrong').catch(e => e) as ChattoApiError
    expect(err.message).toBe('Invalid credentials')
    expect(err.code).toBe('unauthenticated')
  })

  it('throws ChattoParseError when response body does not match schema', async () => {
    fetchMock = mock(async () => makeResponse(200, { unexpected: true }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await expect(
      loginWithPassword('https://chat.example.com', 'user', 'pass'),
    ).rejects.toBeInstanceOf(ChattoParseError)
  })

  it('does not send Authorization header', async () => {
    await loginWithPassword('https://chat.example.com', 'testuser', 'secret')
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = opts.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })
})
