import { describe, it, expect, mock } from 'bun:test'
import { MessageManager } from '../../src/managers/messages'
import { Message } from '../../src/resources/message'
import { MessageBuilder } from '../../src/builders/message'

const validMessage = {
  id: 'evt_1',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  reactions: [],
}

function makeRestMock(returnValue: unknown) {
  return { post: mock().mockResolvedValue(returnValue) }
}

describe('MessageManager', () => {
  describe('.send()', () => {
    it('calls CreateMessage and returns a Message', async () => {
      const rest = makeRestMock({ message: validMessage })
      const manager = new MessageManager(rest as any)
      const msg = await manager.send('room_1', new MessageBuilder().setContent('Hi'))
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'room_1', body: 'Hi' }),
        expect.anything(),
      )
      expect(msg).toBeInstanceOf(Message)
      expect(msg.id).toBe('evt_1')
    })
  })

  describe('.fetch()', () => {
    it('calls GetMessage and returns a Message', async () => {
      const rest = makeRestMock({ message: validMessage })
      const manager = new MessageManager(rest as any)
      const msg = await manager.fetch('room_1', 'evt_1')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'GetMessage',
        { roomId: 'room_1', eventId: 'evt_1' },
        expect.anything(),
      )
      expect(msg).toBeInstanceOf(Message)
    })
  })
})
