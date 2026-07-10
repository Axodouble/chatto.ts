import { describe, it, expect, mock } from 'bun:test'
import { RoomManager } from '../../src/managers/rooms'
import { Room } from '../../src/resources/room'

const validRoom = {
  id: 'room_1',
  name: 'General',
  kind: 'ROOM_KIND_CHANNEL',
  archived: false,
  universal: false,
}

function makeRestMock(returnValue: unknown) {
  return { post: mock().mockResolvedValue(returnValue) }
}

describe('RoomManager', () => {
  describe('.list()', () => {
    it('calls ListRooms and returns Room[]', async () => {
      const rest = makeRestMock({ rooms: [{ room: validRoom }] })
      const manager = new RoomManager({ rest } as any)
      const rooms = await manager.list()
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomDirectoryService',
        'ListRooms',
        {},
        expect.anything(),
      )
      expect(rooms).toHaveLength(1)
      expect(rooms[0]).toBeInstanceOf(Room)
      expect(rooms[0].id).toBe('room_1')
    })
  })

  describe('.fetch()', () => {
    it('calls GetRoom and returns a Room', async () => {
      const rest = makeRestMock({ room: { room: validRoom } })
      const manager = new RoomManager({ rest } as any)
      const room = await manager.fetch('room_1')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomDirectoryService',
        'GetRoom',
        { roomId: 'room_1' },
        expect.anything(),
      )
      expect(room).toBeInstanceOf(Room)
      expect(room.name).toBe('General')
    })
  })
})
