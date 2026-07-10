import type { User } from './resources/user'
import type { Room } from './resources/room'

export class UserCache {
  private readonly cache = new Map<string, Promise<User>>()
  constructor(private readonly fetcher: (id: string) => Promise<User>) {}
  resolve(id: string): Promise<User> {
    const cached = this.cache.get(id)
    if (cached != null) return cached
    const promise = this.fetcher(id).catch(err => {
      this.cache.delete(id)
      throw err
    })
    this.cache.set(id, promise)
    return promise
  }
}

export class RoomCache {
  private readonly cache = new Map<string, Promise<Room>>()
  constructor(private readonly fetcher: (id: string) => Promise<Room>) {}
  resolve(id: string): Promise<Room> {
    const cached = this.cache.get(id)
    if (cached != null) return cached
    const promise = this.fetcher(id).catch(err => {
      this.cache.delete(id)
      throw err
    })
    this.cache.set(id, promise)
    return promise
  }
}
