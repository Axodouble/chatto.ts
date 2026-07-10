import { describe, it, expect, mock } from 'bun:test'
import { Room } from '../../src/resources/room'
import { Message } from '../../src/resources/message'
import { User } from '../../src/resources/user'

const roomData = { id: 'R_1', name: 'general', kind: 'ROOM_KIND_CHANNEL', archived: false, universal: false }

// Proto-shaped message (Timestamp object, camelCase). mapMessage() converts it.
const protoMsg = {
  id: 'evt_1', roomId: 'R_1',
  createdAt: { seconds: 0n, nanos: 0 }, actorId: 'U_1', body: 'hi',
  updatedAt: undefined, inReplyTo: '', threadRootEventId: '', reactions: [],
}

function makeCtx(messageClient: any, roomClient: any) {
  const ctx: any = {
    clients: { message: messageClient, room: roomClient },
    resolveUser: mock(async (id: string) => User.partial(id)),
    resolveRoom: mock(async (id: string) => Room.partial(id, ctx)),
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId),
      channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

describe('Room', () => {
  it('exposes data properties', () => {
    const room = new Room(roomData as any, makeCtx({}, {}))
    expect(room.id).toBe('R_1')
    expect(room.name).toBe('general')
  })

  it('Room.partial builds a Room from just an id', () => {
    const ctx = makeCtx({}, {})
    const room = Room.partial('R_9', ctx)
    expect(room.id).toBe('R_9')
  })

  describe('.send()', () => {
    it('accepts a plain string and returns a hydrated Message', async () => {
      const createMessage = mock().mockResolvedValue({ message: protoMsg })
      const ctx = makeCtx({ createMessage }, {})
      const room = new Room(roomData as any, ctx)
      const sent = await room.send('hi')
      expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'R_1', body: 'hi' }))
      expect(sent).toBeInstanceOf(Message)
    })
  })

  describe('.fetchHistory()', () => {
    it('calls getRoomEvents and returns Message[] hydrated via ctx', async () => {
      const getRoomEvents = mock().mockResolvedValue({
        page: {
          events: [
            {
              id: 'evt_1', createdAt: { seconds: 0n, nanos: 0 }, actorId: 'U_1',
              event: { case: 'messagePosted', value: { message: protoMsg } },
            },
          ],
          hasOlder: false,
          hasNewer: false,
        },
      })
      const ctx = makeCtx({}, { getRoomEvents })
      const room = new Room(roomData as any, ctx)
      const msgs = await room.fetchHistory({ limit: 20 })
      expect(getRoomEvents).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'R_1', limit: 20 }))
      expect(msgs).toHaveLength(1)
      expect(msgs[0]).toBeInstanceOf(Message)
    })

    it('filters out non-message timeline events', async () => {
      const getRoomEvents = mock().mockResolvedValue({
        page: {
          events: [
            {
              id: 'evt_system', createdAt: { seconds: 0n, nanos: 0 }, actorId: 'system',
              event: { case: undefined },
            },
          ],
          hasOlder: false,
          hasNewer: false,
        },
      })
      const ctx = makeCtx({}, { getRoomEvents })
      const room = new Room(roomData as any, ctx)
      const msgs = await room.fetchHistory()
      expect(msgs).toHaveLength(0)
    })

    it('passes before cursor when provided', async () => {
      const getRoomEvents = mock().mockResolvedValue({ page: { events: [], hasOlder: false, hasNewer: false } })
      const ctx = makeCtx({}, { getRoomEvents })
      const room = new Room(roomData as any, ctx)
      await room.fetchHistory({ before: 'cursor_abc' })
      expect(getRoomEvents).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { case: 'before', value: 'cursor_abc' } }),
      )
    })
  })
})
