import { describe, it, expect, mock } from 'bun:test'
import { MessageManager } from '../../src/managers/messages'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'
import { ChattoValidationError } from '../../src/errors'

let uploadCounter = 0
function makeCtx(postReturn: unknown) {
  uploadCounter = 0
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    assets: { upload: mock(async () => ({ id: `as_up_${++uploadCounter}` })) },
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

function createArg(ctx: any) {
  return ctx.rest.post.mock.calls.find((c: any[]) => c[1] === 'CreateMessage')[2]
}

const file = { data: new Uint8Array([1, 2, 3]), filename: 'a.png', contentType: 'image/png' }
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

  it('send() uploads pending files and attaches the resulting asset ids', async () => {
    const ctx = makeCtx({ message: msgData })
    await new MessageManager(ctx).send('R_1', { content: 'hi', files: [file, file] })
    expect(ctx.assets.upload).toHaveBeenCalledTimes(2)
    expect(ctx.assets.upload).toHaveBeenCalledWith('R_1', file)
    expect(createArg(ctx).attachmentAssetIds).toEqual(['as_up_1', 'as_up_2'])
  })

  it('send() merges explicit attachment ids before uploaded ones', async () => {
    const ctx = makeCtx({ message: msgData })
    await new MessageManager(ctx).send('R_1', { content: 'hi', attachmentIds: ['as_x'], files: [file] })
    expect(createArg(ctx).attachmentAssetIds).toEqual(['as_x', 'as_up_1'])
  })

  it('send() with only files and no content is allowed', async () => {
    const ctx = makeCtx({ message: msgData })
    await new MessageManager(ctx).send('R_1', { files: [file] })
    expect(createArg(ctx).body).toBeUndefined()
    expect(createArg(ctx).attachmentAssetIds).toEqual(['as_up_1'])
  })

  it('send() throws when more than 10 attachments are supplied', async () => {
    const ctx = makeCtx({ message: msgData })
    const ids = Array.from({ length: 11 }, (_, i) => `as_${i}`)
    await expect(new MessageManager(ctx).send('R_1', { content: 'hi', attachmentIds: ids }))
      .rejects.toBeInstanceOf(ChattoValidationError)
  })

  it('send() validates the attachment count before uploading any files', async () => {
    const ctx = makeCtx({ message: msgData })
    const files = Array.from({ length: 11 }, () => file)
    await expect(new MessageManager(ctx).send('R_1', { content: 'hi', files }))
      .rejects.toBeInstanceOf(ChattoValidationError)
    expect(ctx.assets.upload).not.toHaveBeenCalled()
  })

  it('send() throws when there is neither content nor attachments', async () => {
    const ctx = makeCtx({ message: msgData })
    await expect(new MessageManager(ctx).send('R_1', { content: '' }))
      .rejects.toBeInstanceOf(ChattoValidationError)
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
