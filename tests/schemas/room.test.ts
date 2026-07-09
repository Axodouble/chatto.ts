import {
  RoomSchema,
  ListRoomsResponseSchema,
  GetRoomResponseSchema,
  GetRoomEventsResponseSchema,
} from '../../src/schemas/room'

const validRoom = {
  id: 'room_1',
  name: 'General',
  kind: 'ROOM_KIND_CHANNEL',
}

describe('RoomSchema', () => {
  it('parses a valid room', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.id).toBe('room_1')
    expect(room.name).toBe('General')
  })

  it('defaults archived and universal to false', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.archived).toBe(false)
    expect(room.universal).toBe(false)
  })

  it('allows description to be absent', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.description).toBeUndefined()
  })
})

describe('ListRoomsResponseSchema', () => {
  it('parses a rooms list response', () => {
    const res = ListRoomsResponseSchema.parse({
      rooms: [{ room: validRoom }],
    })
    expect(res.rooms).toHaveLength(1)
    expect(res.rooms[0].room.id).toBe('room_1')
  })
})

describe('GetRoomResponseSchema', () => {
  it('parses a single room response', () => {
    const res = GetRoomResponseSchema.parse({ room: { room: validRoom } })
    expect(res.room.room.id).toBe('room_1')
  })
})

describe('GetRoomEventsResponseSchema', () => {
  it('parses a timeline page with a message event', () => {
    const validMessage = {
      id: 'evt_1',
      roomId: 'room_1',
      createdAt: '2026-07-09T10:00:00Z',
      actorId: 'user_1',
    }
    const res = GetRoomEventsResponseSchema.parse({
      page: {
        events: [
          { id: 'evt_1', createdAt: '2026-07-09T10:00:00Z', actorId: 'user_1',
            messagePosted: { message: validMessage } },
        ],
        hasOlder: false,
        hasNewer: false,
      },
    })
    expect(res.page.events[0].messagePosted?.message.id).toBe('evt_1')
  })

  it('defaults hasOlder and hasNewer to false when absent', () => {
    const res = GetRoomEventsResponseSchema.parse({ page: { events: [] } })
    expect(res.page.hasOlder).toBe(false)
    expect(res.page.hasNewer).toBe(false)
  })
})
