import { describe, it, expect, mock } from 'bun:test'
import { Message } from '../../src/resources/message'
import { MessageBuilder } from '../../src/builders/message'

const validMessageData = {
  id: 'evt_1',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  body: 'Hello',
  reactions: [],
}

function makeRestMock(returnValue: unknown) {
  return { post: mock().mockResolvedValue(returnValue) }
}

describe('Message', () => {
  it('exposes data properties', () => {
    const msg = new Message(validMessageData, makeRestMock(null) as any)
    expect(msg.id).toBe('evt_1')
    expect(msg.roomId).toBe('room_1')
    expect(msg.body).toBe('Hello')
    expect(msg.actorId).toBe('user_1')
    expect(msg.createdAt).toBe('2026-07-09T10:00:00Z')
  })

  describe('.edit()', () => {
    it('calls UpdateMessage and returns new Message', async () => {
      const updatedData = { ...validMessageData, body: 'Updated', updatedAt: '2026-07-09T11:00:00Z' }
      const rest = makeRestMock({ message: updatedData })
      const msg = new Message(validMessageData, rest as any)
      const updated = await msg.edit(new MessageBuilder().setContent('Updated'))
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'UpdateMessage',
        expect.objectContaining({ roomId: 'room_1', eventId: 'evt_1', body: 'Updated' }),
        expect.anything(),
      )
      expect(updated).toBeInstanceOf(Message)
      expect(updated.body).toBe('Updated')
    })
  })

  describe('.delete()', () => {
    it('calls DeleteMessage', async () => {
      const rest = makeRestMock({ deleted: true })
      const msg = new Message(validMessageData, rest as any)
      await msg.delete()
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'DeleteMessage',
        { roomId: 'room_1', eventId: 'evt_1' },
        expect.anything(),
      )
    })
  })

  describe('.react()', () => {
    it('calls AddReaction with emoji', async () => {
      const rest = makeRestMock({ added: true })
      const msg = new Message(validMessageData, rest as any)
      await msg.react('👍')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'AddReaction',
        { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍' },
        expect.anything(),
      )
    })
  })

  describe('.removeReaction()', () => {
    it('calls RemoveReaction with emoji', async () => {
      const rest = makeRestMock({ removed: true })
      const msg = new Message(validMessageData, rest as any)
      await msg.removeReaction('👍')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'RemoveReaction',
        { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍' },
        expect.anything(),
      )
    })
  })
})
