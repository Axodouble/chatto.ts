import { describe, it, expect, mock, spyOn, afterEach } from 'bun:test'
import { EventEmitter } from 'events'
import { ChattoClient } from '../src/client'
import { RoomManager } from '../src/managers/rooms'
import { MessageManager } from '../src/managers/messages'
import { UserManager } from '../src/managers/users'
import type { RealtimeConnection } from '../src/realtime/connection'

type MockRt = EventEmitter & {
  connect: ReturnType<typeof mock>
  disconnect: ReturnType<typeof mock>
}

function makeMockRt(): MockRt {
  return Object.assign(new EventEmitter(), {
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => {}),
  }) as MockRt
}

function makeClient(mockRt: MockRt): ChattoClient {
  return new ChattoClient(
    { baseUrl: 'https://chat.example.com', token: 'tk' },
    () => mockRt as unknown as RealtimeConnection,
  )
}

describe('ChattoClient', () => {
  it('exposes rooms and messages managers', () => {
    const client = makeClient(makeMockRt())
    expect(client.rooms).toBeInstanceOf(RoomManager)
    expect(client.messages).toBeInstanceOf(MessageManager)
  })

  it('connect() calls realtime.connect() and emits ready', async () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)
    const readyEvents: unknown[] = []
    client.on('ready', () => readyEvents.push(true))
    await client.connect()
    expect(readyEvents).toHaveLength(1)
    expect(mockRt.connect).toHaveBeenCalled()
  })

  it('disconnect() emits disconnect', async () => {
    const client = makeClient(makeMockRt())
    const disconnectEvents: unknown[] = []
    client.on('disconnect', () => disconnectEvents.push(true))
    await client.disconnect()
    expect(disconnectEvents).toHaveLength(1)
  })

  it('forwards realtime error events as client error events', () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)
    const errors: Error[] = []
    client.on('error', e => errors.push(e))
    mockRt.emit('error', new Error('ws error'))
    expect(errors[0]?.message).toBe('ws error')
  })

  it('emits disconnect when realtime emits close with kind=clean', () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)
    const disconnects: unknown[] = []
    client.on('disconnect', () => disconnects.push(true))
    mockRt.emit('close', { kind: 'clean', code: 1000, retryAfterMs: 0 })
    expect(disconnects).toHaveLength(1)
  })

  it('exposes users manager', () => {
    const client = makeClient(makeMockRt())
    expect(client.users).toBeInstanceOf(UserManager)
  })

  it('emits a hydrated Message with author and channel on messageCreate', async () => {
    const mockRt = makeMockRt()
    // rest.post is used by messages.fetch (GetMessage), then GetUser, then GetRoom
    const client = new ChattoClient(
      { baseUrl: 'https://chat.example.com', token: 'tk' },
      () => mockRt as unknown as RealtimeConnection,
    )
    // Stub the context's rest via the messages manager path:
    const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }
    const userMember = { user: { id: 'U_1', login: 'l', displayName: 'Name', deleted: false, presenceStatus: 'PRESENCE_STATUS_ONLINE' }, roles: [] }
    const roomWrap = { room: { id: 'R_1', name: 'general', kind: 'channel', archived: false, universal: false } }
    ;(client as any).ctx.rest.post = mock(async (_s: string, method: string) => {
      if (method === 'GetMessage') return { message: msgData }
      if (method === 'GetUser') return { user: userMember }
      if (method === 'GetRoom') return { room: roomWrap }
    })
    const received: any[] = []
    client.on('messageCreate', m => received.push(m))
    // Real frame shape per src/realtime/frames.ts + src/realtime/events.ts:
    // ServerFrame.event.message_posted = { room_id, message_event_id }
    mockRt.emit('frame', { event: { id: 'e_1', created_at: 't', actor_id: 'U_1', message_posted: { room_id: 'R_1', message_event_id: 'evt_1' } } })
    await new Promise(r => setTimeout(r, 10))
    expect(received[0]?.author.displayName).toBe('Name')
    expect(received[0]?.channel.name).toBe('general')
  })

  it('does not throw when an error is emitted with no user listener', () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)
    // no client.on('error', ...) attached
    expect(() => mockRt.emit('error', new Error('boom'))).not.toThrow()
    void client
  })

  it('refreshes the token and retries when REST returns 401', async () => {
    const mockRt = makeMockRt()
    // Branch on URL: /auth/login mints a fresh token; the Connect call 401s once
    // (with the stale token) then succeeds (with the fresh token).
    let connectCalls = 0
    spyOn(globalThis, 'fetch').mockImplementation(async (url: string) => {
      if (String(url).endsWith('/auth/login')) {
        return { ok: true, status: 200, statusText: 'OK',
          json: async () => ({ success: true, token: 'fresh', user: { id: 'U1', login: 'u' } }) } as Response
      }
      connectCalls += 1
      if (connectCalls === 1) {
        return { ok: false, status: 401, statusText: 'Unauthorized',
          json: async () => ({ code: 'unauthenticated' }) } as Response
      }
      // GetRoom (RoomDirectoryService) response is double-nested: res.room.room
      return { ok: true, status: 200, statusText: 'OK',
        json: async () => ({ room: { room: { id: 'R1', name: 'General', kind: 'ROOM_KIND_CHANNEL', archived: false } } }) } as Response
    })
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'stale', credentials: { login: 'u', password: 'p' } },
      () => mockRt as unknown as RealtimeConnection,
    )
    const room = await client.rooms.fetch('R1')
    expect(room.id).toBe('R1')
  })

  it('emits disconnect on a fatal close without reconnecting', () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)
    const disconnects: unknown[] = []
    client.on('disconnect', () => disconnects.push(true))
    mockRt.emit('close', { kind: 'fatal', code: 1002, retryAfterMs: 0 })
    expect(disconnects).toHaveLength(1)
    expect(mockRt.connect).not.toHaveBeenCalled()
  })

  it('reconnects with a fresh token on an auth close when credentials exist', async () => {
    const mockRt = makeMockRt()
    const loginResponses: string[] = []
    const spy = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      loginResponses.push('login')
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, token: 'fresh', user: { id: 'U1', login: 'u' } }) } as Response
    })
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'stale', credentials: { login: 'u', password: 'p' }, reconnect: { baseDelayMs: 1 } },
      () => mockRt as unknown as RealtimeConnection,
    )
    const refreshed: unknown[] = []
    client.on('tokenRefresh', () => refreshed.push(true))
    mockRt.emit('close', { kind: 'auth', code: 1008, retryAfterMs: 0 })
    await new Promise(r => setTimeout(r, 20))
    expect(spy).toHaveBeenCalled()          // re-login happened
    expect(mockRt.connect).toHaveBeenCalled()
    expect(refreshed).toHaveLength(1)
  })

  it('emits error + disconnect on an auth close with no credentials (no loop)', async () => {
    const mockRt = makeMockRt()
    const client = makeClient(mockRt)   // token-only, no credentials
    const errors: Error[] = []
    const disconnects: unknown[] = []
    client.on('error', e => errors.push(e))
    client.on('disconnect', () => disconnects.push(true))
    mockRt.emit('close', { kind: 'auth', code: 1008, retryAfterMs: 0 })
    await new Promise(r => setTimeout(r, 5))
    expect(errors[0]?.name).toBe('ChattoAuthError')
    expect(disconnects).toHaveLength(1)
    expect(mockRt.connect).not.toHaveBeenCalled()
  })

  it('does not stack overlapping reconnects while one is in flight', async () => {
    const mockRt = makeMockRt()
    let resolveConnect!: () => void
    mockRt.connect = mock(() => new Promise<void>(r => { resolveConnect = r })) as any
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'tk', reconnect: { baseDelayMs: 1 } },
      () => mockRt as unknown as RealtimeConnection,
    )
    mockRt.emit('close', { kind: 'retry', code: 1006, retryAfterMs: 0 })
    mockRt.emit('close', { kind: 'retry', code: 1006, retryAfterMs: 0 })
    await new Promise(r => setTimeout(r, 10))
    expect(mockRt.connect).toHaveBeenCalledTimes(1)
    resolveConnect()
  })

  it('emits reconnecting with attempt number and gives up after maxAttempts', async () => {
    const mockRt = makeMockRt()
    mockRt.connect = mock(() => Promise.reject(new Error('down'))) as any
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'tk', reconnect: { baseDelayMs: 1, maxDelayMs: 2, maxAttempts: 3 } },
      () => mockRt as unknown as RealtimeConnection,
    )
    const attempts: number[] = []
    const disconnects: unknown[] = []
    client.on('reconnecting', a => attempts.push(a))
    client.on('disconnect', () => disconnects.push(true))
    mockRt.emit('close', { kind: 'retry', code: 1006, retryAfterMs: 0 })
    await new Promise(r => setTimeout(r, 50))
    expect(attempts).toEqual([1, 2, 3])
    expect(disconnects).toHaveLength(1)
  })

  it('periodically re-logs-in when refresh.intervalMs is set', async () => {
    const mockRt = makeMockRt()
    const spy = spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, token: 'rotated', user: { id: 'U1', login: 'u' } }) } as Response,
    )
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'tk', credentials: { login: 'u', password: 'p' }, refresh: { intervalMs: 5 } },
      () => mockRt as unknown as RealtimeConnection,
    )
    const refreshed: unknown[] = []
    client.on('tokenRefresh', () => refreshed.push(true))
    await new Promise(r => setTimeout(r, 18))
    await client.disconnect()
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(refreshed.length).toBeGreaterThanOrEqual(2)
  })

  it('does not start a periodic timer without credentials', async () => {
    const mockRt = makeMockRt()
    const spy = spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) } as Response)
    const client = new ChattoClient(
      { baseUrl: 'https://c', token: 'tk', refresh: { intervalMs: 5 } },
      () => mockRt as unknown as RealtimeConnection,
    )
    await new Promise(r => setTimeout(r, 18))
    await client.disconnect()
    expect(spy).not.toHaveBeenCalled()
    void client
  })

  afterEach(() => mock.restore())
})
