import { describe, it, expect, mock } from 'bun:test'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'
import { Attachment } from '../../src/resources/attachment'
import { MessageBuilder } from '../../src/builders/message'

const validMessageData = {
  id: 'evt_1', roomId: 'R_1', createdAt: '2026-07-09T10:00:00Z',
  actorId: 'U_1', body: 'Hello', reactions: [],
}

function makeCtx(postReturn: unknown) {
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    assets: { upload: mock(async () => ({ id: 'as_up_1' })) },
    resolveUser: mock(async (id: string) => User.partial(id)),
    resolveRoom: mock(async (id: string) => Room.partial(id, ctx)),
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId),
      channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

function makeMessage(data: any, ctx: any) {
  return new Message(data, ctx, { author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx) })
}

describe('Message', () => {
  it('exposes discord.js-style fields', () => {
    const msg = makeMessage(validMessageData, makeCtx(null))
    expect(msg.id).toBe('evt_1')
    expect(msg.channelId).toBe('R_1')
    expect(msg.content).toBe('Hello')
  })

  it('exposes author as a full User and channel as a Room', () => {
    const msg = makeMessage(validMessageData, makeCtx(null))
    expect(msg.author).toBeInstanceOf(User)
    expect(msg.author.id).toBe('U_1')
    expect(msg.channel).toBeInstanceOf(Room)
    expect(msg.channel.id).toBe('R_1')
  })

  it('hydrates attachments as Attachment instances', () => {
    const data = {
      ...validMessageData,
      attachments: [{ id: 'at_1', filename: 'p.png', contentType: 'image/png', width: 10, height: 10 }],
    }
    const msg = makeMessage(data, makeCtx(null))
    expect(msg.attachments).toHaveLength(1)
    expect(msg.attachments[0]).toBeInstanceOf(Attachment)
    expect(msg.attachments[0]?.id).toBe('at_1')
  })

  it('defaults attachments to an empty array', () => {
    const msg = makeMessage(validMessageData, makeCtx(null))
    expect(msg.attachments).toEqual([])
  })

  describe('.reply()', () => {
    it('accepts a plain string, sets inReplyTo/threadRoot, returns hydrated Message', async () => {
      const replyData = { ...validMessageData, id: 'evt_2' }
      const ctx = makeCtx({ message: replyData })
      const msg = makeMessage(validMessageData, ctx)
      const reply = await msg.reply('Got it!')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'R_1', inReplyTo: 'evt_1', threadRootEventId: 'evt_1', body: 'Got it!' }),
        expect.anything(),
      )
      expect(reply).toBeInstanceOf(Message)
    })

    it('uses existing threadRootEventId when already a thread reply', async () => {
      const threadData = { ...validMessageData, inReplyTo: 'evt_0', threadRootEventId: 'evt_0' }
      const ctx = makeCtx({ message: { ...validMessageData, id: 'evt_2' } })
      const msg = makeMessage(threadData, ctx)
      await msg.reply(new MessageBuilder().setContent('Also replying'))
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'CreateMessage',
        expect.objectContaining({ inReplyTo: 'evt_1', threadRootEventId: 'evt_0' }),
        expect.anything(),
      )
    })

    it('does not mutate a caller-supplied MessageBuilder', async () => {
      const replyData = { ...validMessageData, id: 'evt_2' }
      const ctx = makeCtx({ message: replyData })
      const msg = makeMessage(validMessageData, ctx)
      const builder = new MessageBuilder().setContent('x')
      await msg.reply(builder)
      expect(builder.buildCreate('R_1').inReplyTo).toBeUndefined()
    })

    it('uploads files and attaches them when replying', async () => {
      const ctx = makeCtx({ message: { ...validMessageData, id: 'evt_2' } })
      const msg = makeMessage(validMessageData, ctx)
      await msg.reply({ content: 'here', files: [{ data: new Uint8Array([1]), filename: 'a.png', contentType: 'image/png' }] })
      expect(ctx.assets.upload).toHaveBeenCalledWith('R_1', expect.objectContaining({ filename: 'a.png' }))
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'CreateMessage',
        expect.objectContaining({ attachmentAssetIds: ['as_up_1'], inReplyTo: 'evt_1' }),
        expect.anything(),
      )
    })
  })

  describe('.deleteAttachment()', () => {
    it('calls DeleteAttachment with the attachment id', async () => {
      const ctx = makeCtx({ deleted: true })
      await makeMessage(validMessageData, ctx).deleteAttachment('at_1')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'DeleteAttachment',
        { roomId: 'R_1', eventId: 'evt_1', attachmentId: 'at_1' }, expect.anything(),
      )
    })
  })

  describe('.edit()', () => {
    it('accepts a plain string and calls UpdateMessage', async () => {
      const ctx = makeCtx({ message: { ...validMessageData, body: 'Updated' } })
      const msg = makeMessage(validMessageData, ctx)
      const updated = await msg.edit('Updated')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'UpdateMessage',
        expect.objectContaining({ roomId: 'R_1', eventId: 'evt_1', body: 'Updated' }),
        expect.anything(),
      )
      expect(updated).toBeInstanceOf(Message)
    })
  })

  describe('.delete() / .react()', () => {
    it('delete calls DeleteMessage', async () => {
      const ctx = makeCtx({ deleted: true })
      await makeMessage(validMessageData, ctx).delete()
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'DeleteMessage',
        { roomId: 'R_1', eventId: 'evt_1' }, expect.anything(),
      )
    })
    it('react calls AddReaction', async () => {
      const ctx = makeCtx({ added: true })
      await makeMessage(validMessageData, ctx).react('👍')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'AddReaction',
        { roomId: 'R_1', messageEventId: 'evt_1', emoji: '👍' }, expect.anything(),
      )
    })
  })
})
