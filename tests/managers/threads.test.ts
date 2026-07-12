import { describe, it, expect, mock } from 'bun:test'
import { ThreadManager } from '../../src/managers/threads'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'

function makeCtx(postImpl: (svc: string, method: string, payload: any) => unknown) {
  const ctx: any = {
    rest: { post: mock(async (svc: string, method: string, payload: any) => postImpl(svc, method, payload)) },
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

function msg(id: string) {
  return { id, roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: id, reactions: [] }
}

function event(id: string) {
  return { id, createdAt: 't', actorId: 'U_1', messagePosted: { message: msg(id) } }
}

describe('ThreadManager.fetchHistory', () => {
  it('calls GetThreadEvents with the thread root and a top-level cursor', async () => {
    const ctx = makeCtx(() => ({ page: { events: [event('evt_1')], hasOlder: false, hasNewer: false } }))
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    expect(ctx.rest.post).toHaveBeenCalledWith(
      'chatto.api.v1.ThreadService',
      'GetThreadEvents',
      expect.objectContaining({ roomId: 'R_1', threadRootEventId: 'root_1', limit: 100 }),
      expect.anything(),
    )
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toBeInstanceOf(Message)
  })

  it('filters out non-message timeline events', async () => {
    const ctx = makeCtx(() => ({
      page: { events: [{ id: 'sys', createdAt: 't', actorId: 'system' }], hasOlder: false, hasNewer: false },
    }))
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    expect(msgs).toHaveLength(0)
  })

  it('paginates through older pages via startCursor until hasOlder is false', async () => {
    const pages = [
      { page: { events: [event('evt_3'), event('evt_2')], startCursor: 'c1', hasOlder: true, hasNewer: false } },
      { page: { events: [event('evt_1')], startCursor: 'c2', hasOlder: false, hasNewer: false } },
    ]
    let call = 0
    const ctx = makeCtx((_svc, _method, payload) => {
      const page = pages[call++]
      // first request has no cursor; second must carry the previous startCursor
      if (call === 1) expect(payload.before).toBeUndefined()
      if (call === 2) expect(payload.before).toBe('c1')
      return page
    })
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    expect(ctx.rest.post).toHaveBeenCalledTimes(2)
    expect(msgs.map(m => m.id)).toEqual(['evt_3', 'evt_2', 'evt_1'])
  })

  it('de-duplicates messages by id across pages (first occurrence wins)', async () => {
    const pages = [
      { page: { events: [event('evt_1')], startCursor: 'c1', hasOlder: true, hasNewer: false } },
      { page: { events: [event('evt_1'), event('evt_0')], startCursor: 'c2', hasOlder: false, hasNewer: false } },
    ]
    let call = 0
    const ctx = makeCtx(() => pages[call++])
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    expect(msgs.map(m => m.id)).toEqual(['evt_1', 'evt_0'])
  })

  it('stops when the server repeats a cursor (cycle guard)', async () => {
    const ctx = makeCtx(() => ({
      page: { events: [event('evt_1')], startCursor: 'loop', hasOlder: true, hasNewer: false },
    }))
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    // page 1 fetches then sets cursor 'loop'; page 2 returns 'loop' again -> stop
    expect(ctx.rest.post).toHaveBeenCalledTimes(2)
    expect(msgs).toHaveLength(1)
  })

  it('stops when startCursor is missing or blank even if hasOlder is true', async () => {
    const ctx = makeCtx(() => ({
      page: { events: [event('evt_1')], startCursor: '   ', hasOlder: true, hasNewer: false },
    }))
    const msgs = await new ThreadManager(ctx).fetchHistory('R_1', 'root_1')
    expect(ctx.rest.post).toHaveBeenCalledTimes(1)
    expect(msgs).toHaveLength(1)
  })
})
