import { describe, it, expect, mock } from 'bun:test'
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
})
