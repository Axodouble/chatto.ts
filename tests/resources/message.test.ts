import { describe, it, expect, mock } from 'bun:test'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'
import { MessageBuilder } from '../../src/builders/message'

const validMessageData = {
  id: 'evt_1', roomId: 'R_1', createdAt: '2026-07-09T10:00:00Z',
  actorId: 'U_1', body: 'Hello', reactions: [],
}

// Proto-shaped message (Timestamp object, camelCase). mapMessage() converts it.
const protoMsg = {
  id: 'evt_2', roomId: 'R_1',
  createdAt: { seconds: 0n, nanos: 0 }, actorId: 'U_1', body: 'hi',
  updatedAt: undefined, inReplyTo: '', threadRootEventId: '', reactions: [],
}

function makeCtx(clientImpl: any) {
  const ctx: any = {
    clients: { message: clientImpl },
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
    const msg = makeMessage(validMessageData, makeCtx({}))
    expect(msg.id).toBe('evt_1')
    expect(msg.channelId).toBe('R_1')
    expect(msg.content).toBe('Hello')
  })

  it('exposes author as a full User and channel as a Room', () => {
    const msg = makeMessage(validMessageData, makeCtx({}))
    expect(msg.author).toBeInstanceOf(User)
    expect(msg.author.id).toBe('U_1')
    expect(msg.channel).toBeInstanceOf(Room)
    expect(msg.channel.id).toBe('R_1')
  })

  describe('.reply()', () => {
    it('accepts a plain string, sets inReplyTo/threadRoot, returns hydrated Message', async () => {
      const createMessage = mock().mockResolvedValue({ message: protoMsg })
      const ctx = makeCtx({ createMessage })
      const msg = makeMessage(validMessageData, ctx)
      const reply = await msg.reply('Got it!')
      expect(createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'R_1', inReplyTo: 'evt_1', threadRootEventId: 'evt_1', body: 'Got it!' }),
      )
      expect(reply).toBeInstanceOf(Message)
    })

    it('uses existing threadRootEventId when already a thread reply', async () => {
      const createMessage = mock().mockResolvedValue({ message: protoMsg })
      const ctx = makeCtx({ createMessage })
      const threadData = { ...validMessageData, inReplyTo: 'evt_0', threadRootEventId: 'evt_0' }
      const msg = makeMessage(threadData, ctx)
      await msg.reply(new MessageBuilder().setContent('Also replying'))
      expect(createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ inReplyTo: 'evt_1', threadRootEventId: 'evt_0' }),
      )
    })

    it('does not mutate a caller-supplied MessageBuilder', async () => {
      const createMessage = mock().mockResolvedValue({ message: protoMsg })
      const ctx = makeCtx({ createMessage })
      const msg = makeMessage(validMessageData, ctx)
      const builder = new MessageBuilder().setContent('x')
      await msg.reply(builder)
      expect(builder.buildCreate('R_1').inReplyTo).toBeUndefined()
    })
  })

  describe('.edit()', () => {
    it('accepts a plain string and calls updateMessage', async () => {
      const updateMessage = mock().mockResolvedValue({ message: { ...protoMsg, body: 'Updated' } })
      const ctx = makeCtx({ updateMessage })
      const msg = makeMessage(validMessageData, ctx)
      const updated = await msg.edit('Updated')
      expect(updateMessage).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'R_1', eventId: 'evt_1', body: 'Updated' }),
      )
      expect(updated).toBeInstanceOf(Message)
    })
  })

  describe('.delete() / .react()', () => {
    it('delete calls deleteMessage', async () => {
      const deleteMessage = mock().mockResolvedValue({ deleted: true })
      const ctx = makeCtx({ deleteMessage })
      await makeMessage(validMessageData, ctx).delete()
      expect(deleteMessage).toHaveBeenCalledWith({ roomId: 'R_1', eventId: 'evt_1' })
    })
    it('react calls addReaction', async () => {
      const addReaction = mock().mockResolvedValue({ added: true })
      const ctx = makeCtx({ addReaction })
      await makeMessage(validMessageData, ctx).react('👍')
      expect(addReaction).toHaveBeenCalledWith({ roomId: 'R_1', messageEventId: 'evt_1', emoji: '👍' })
    })
    it('removeReaction calls removeReaction', async () => {
      const removeReaction = mock().mockResolvedValue({ removed: true })
      const ctx = makeCtx({ removeReaction })
      await makeMessage(validMessageData, ctx).removeReaction('👍')
      expect(removeReaction).toHaveBeenCalledWith({ roomId: 'R_1', messageEventId: 'evt_1', emoji: '👍' })
    })
  })
})
