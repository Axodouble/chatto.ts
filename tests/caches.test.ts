import { describe, it, expect, mock } from 'bun:test'
import { UserCache, RoomCache } from '../src/caches'
import { User } from '../src/resources/user'

describe('UserCache', () => {
  it('fetches once and serves subsequent calls from cache', async () => {
    const fetcher = mock(async (id: string) => User.partial(id))
    const cache = new UserCache(fetcher)
    const a = await cache.resolve('U_1')
    const b = await cache.resolve('U_1')
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetches distinct ids separately', async () => {
    const fetcher = mock(async (id: string) => User.partial(id))
    const cache = new UserCache(fetcher)
    await cache.resolve('U_1')
    await cache.resolve('U_2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('de-dupes concurrent resolves for the same id into a single fetch', async () => {
    const fetcher = mock(async (id: string) => User.partial(id))
    const cache = new UserCache(fetcher)
    const [a, b] = await Promise.all([cache.resolve('U_1'), cache.resolve('U_1')])
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed fetch, allowing retry', async () => {
    let calls = 0
    const fetcher = mock(async (id: string) => {
      calls++
      if (calls === 1) throw new Error('boom')
      return User.partial(id)
    })
    const cache = new UserCache(fetcher)
    await expect(cache.resolve('U_1')).rejects.toThrow('boom')
    const user = await cache.resolve('U_1')
    expect(user.id).toBe('U_1')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('RoomCache', () => {
  it('fetches once and serves subsequent calls from cache', async () => {
    const room = { id: 'R_1' } as any
    const fetcher = mock(async () => room)
    const cache = new RoomCache(fetcher)
    expect(await cache.resolve('R_1')).toBe(room)
    expect(await cache.resolve('R_1')).toBe(room)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('de-dupes concurrent resolves for the same id into a single fetch', async () => {
    const room = { id: 'R_1' } as any
    const fetcher = mock(async () => room)
    const cache = new RoomCache(fetcher)
    const [a, b] = await Promise.all([cache.resolve('R_1'), cache.resolve('R_1')])
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed fetch, allowing retry', async () => {
    let calls = 0
    const room = { id: 'R_1' } as any
    const fetcher = mock(async () => {
      calls++
      if (calls === 1) throw new Error('boom')
      return room
    })
    const cache = new RoomCache(fetcher)
    await expect(cache.resolve('R_1')).rejects.toThrow('boom')
    const resolved = await cache.resolve('R_1')
    expect(resolved).toBe(room)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
