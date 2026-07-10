import { describe, it, expect, mock } from 'bun:test'
import { MessageManager } from '../../src/managers/messages'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'

function makeCtx(postReturn: unknown) {
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

describe('MessageManager', () => {
  it('send() accepts a string and returns a hydrated Message', async () => {
    const ctx = makeCtx({ message: msgData })
    const sent = await new MessageManager(ctx).send('R_1', 'hi')
    expect(ctx.rest.post).toHaveBeenCalledWith(
      'chatto.api.v1.MessageService', 'CreateMessage',
      expect.objectContaining({ roomId: 'R_1', body: 'hi' }), expect.anything(),
    )
    expect(sent).toBeInstanceOf(Message)
  })

  it('fetch() returns a hydrated Message', async () => {
    const ctx = makeCtx({ message: msgData })
    const msg = await new MessageManager(ctx).fetch('R_1', 'evt_1')
    expect(ctx.rest.post).toHaveBeenCalledWith(
      'chatto.api.v1.MessageService', 'GetMessage',
      { roomId: 'R_1', eventId: 'evt_1' }, expect.anything(),
    )
    expect(msg.content).toBe('hi')
  })
})
