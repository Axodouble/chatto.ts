import { describe, it, expect, mock } from 'bun:test'
import { ChattoContext } from '../src/context'
import { Message } from '../src/resources/message'

const userMember = {
  user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 'PRESENCE_STATUS_ONLINE' },
  roles: [],
}
const roomWrap = { room: { id: 'R_1', name: 'general', kind: 'channel', archived: false, universal: false } }
const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

function restFor(map: Record<string, unknown>) {
  return { post: mock(async (_svc: string, method: string) => map[method]) }
}

describe('ChattoContext.hydrateMessage', () => {
  it('eagerly populates author (full User) and channel (Room)', async () => {
    const rest = restFor({ GetUser: { user: userMember }, GetRoom: { room: roomWrap } })
    const ctx = new ChattoContext(rest as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg).toBeInstanceOf(Message)
    expect(msg.author.displayName).toBe('Ceraia')
    expect(msg.channel.name).toBe('general')
  })

  it('caches users across hydrations (GetUser called once)', async () => {
    const rest = restFor({ GetUser: { user: userMember }, GetRoom: { room: roomWrap } })
    const ctx = new ChattoContext(rest as any)
    await ctx.hydrateMessage(msgData as any)
    await ctx.hydrateMessage(msgData as any)
    const getUserCalls = (rest.post as any).mock.calls.filter((c: any[]) => c[1] === 'GetUser')
    expect(getUserCalls).toHaveLength(1)
  })

  it('falls back to a partial author when the user fetch fails', async () => {
    const rest = { post: mock(async (_s: string, method: string) => {
      if (method === 'GetUser') throw new Error('boom')
      if (method === 'GetRoom') return { room: roomWrap }
      return undefined
    }) }
    const ctx = new ChattoContext(rest as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg.author.id).toBe('U_1')
    expect(msg.author.displayName).toBe('U_1') // partial fallback
  })
})
