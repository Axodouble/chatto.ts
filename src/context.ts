import type { RestClient } from './rest/client'
import type { MessageData } from './types'
import { Message } from './resources/message'
import { User } from './resources/user'
import { Room } from './resources/room'
import { UserManager } from './managers/users'
import { RoomManager } from './managers/rooms'
import { MessageManager } from './managers/messages'
import { UserCache, RoomCache } from './caches'

export interface ClientContext {
  readonly rest: RestClient
  resolveUser(id: string): Promise<User>
  resolveRoom(id: string): Promise<Room>
  hydrateMessage(data: MessageData): Promise<Message>
}

export class ChattoContext implements ClientContext {
  readonly rest: RestClient
  readonly users: UserManager
  readonly rooms: RoomManager
  readonly messages: MessageManager
  private readonly userCache: UserCache
  private readonly roomCache: RoomCache

  constructor(rest: RestClient) {
    this.rest = rest
    this.users = new UserManager(this)
    this.rooms = new RoomManager(this)
    this.messages = new MessageManager(this)
    this.userCache = new UserCache(id => this.users.fetch(id))
    this.roomCache = new RoomCache(id => this.rooms.fetch(id))
  }

  resolveUser(id: string): Promise<User> {
    return this.userCache.resolve(id)
  }

  resolveRoom(id: string): Promise<Room> {
    return this.roomCache.resolve(id)
  }

  /**
   * Author and channel are resolved through the client's permanent per-client
   * caches (`userCache`/`roomCache`) and are point-in-time snapshots for the
   * lifetime of the client: once cached, they are never re-fetched. Volatile
   * fields on the resolved objects (e.g. `author.presenceStatus`,
   * `author.displayName`, `channel.name`) may go stale if they change
   * upstream. Call `client.users.fetch(id)` / `client.rooms.fetch(id)` for
   * live, uncached data.
   */
  async hydrateMessage(data: MessageData): Promise<Message> {
    const [author, channel] = await Promise.all([
      this.resolveUser(data.actorId).catch(() => User.partial(data.actorId)),
      this.resolveRoom(data.roomId).catch(() => Room.partial(data.roomId, this)),
    ])
    return new Message(data, this, { author, channel })
  }
}
