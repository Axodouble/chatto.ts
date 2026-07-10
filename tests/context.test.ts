import { describe, it, expect, mock } from 'bun:test'
import { ChattoContext } from '../src/context'
import { Message } from '../src/resources/message'

// Proto-shaped payloads (camelCase, numeric enums). Mappers in src/rest/mappers.ts convert these.
const protoMember = { user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 1, avatarUrl: undefined }, roles: [] }
const protoRoom = { id: 'R_1', name: 'general', kind: 1, description: '', archived: false, groupId: '', universal: false }
const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

function makeClients(overrides: { getUser?: any; getRoom?: any }) {
  return {
    user: { getUser: overrides.getUser ?? mock().mockResolvedValue({ user: protoMember }) },
    roomDirectory: { getRoom: overrides.getRoom ?? mock().mockResolvedValue({ room: { room: protoRoom } }) },
    message: {},
    room: {},
  }
}

describe('ChattoContext.hydrateMessage', () => {
  it('eagerly populates author (full User) and channel (Room)', async () => {
    const ctx = new ChattoContext(makeClients({}) as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg).toBeInstanceOf(Message)
    expect(msg.author.displayName).toBe('Ceraia')
    expect(msg.channel.name).toBe('general')
  })

  it('caches users across hydrations (getUser called once)', async () => {
    const getUser = mock().mockResolvedValue({ user: protoMember })
    const ctx = new ChattoContext(makeClients({ getUser }) as any)
    await ctx.hydrateMessage(msgData as any)
    await ctx.hydrateMessage(msgData as any)
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('falls back to a partial author when the user fetch fails', async () => {
    const getUser = mock(async () => { throw new Error('boom') })
    const ctx = new ChattoContext(makeClients({ getUser }) as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg.author.id).toBe('U_1')
    expect(msg.author.displayName).toBe('U_1') // partial fallback
  })
})
