import type { ClientContext } from '../context'
import { ListRoomsResponseSchema, GetRoomResponseSchema } from '../schemas/room'
import { Room } from '../resources/room'

export class RoomManager {
  constructor(private readonly ctx: ClientContext) {}

  async list(): Promise<Room[]> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.RoomDirectoryService',
      'ListRooms',
      {},
      ListRoomsResponseSchema,
    )
    return res.rooms.map(r => new Room(r.room, this.ctx))
  }

  async fetch(roomId: string): Promise<Room> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.RoomDirectoryService',
      'GetRoom',
      { roomId },
      GetRoomResponseSchema,
    )
    return new Room(res.room.room, this.ctx)
  }
}
