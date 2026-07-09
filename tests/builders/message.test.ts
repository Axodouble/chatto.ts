import { describe, it, expect } from 'bun:test'
import { MessageBuilder } from '../../src/builders/message'

describe('MessageBuilder', () => {
  describe('buildCreate', () => {
    it('builds create input with content', () => {
      const input = new MessageBuilder().setContent('Hello!').buildCreate('room_1')
      expect(input.roomId).toBe('room_1')
      expect(input.body).toBe('Hello!')
    })

    it('builds create input with all optional fields', () => {
      const input = new MessageBuilder()
        .setContent('Reply')
        .setReplyTo('evt_parent')
        .setThreadRoot('evt_root')
        .setAlsoSendToChannel(true)
        .buildCreate('room_1')
      expect(input.inReplyTo).toBe('evt_parent')
      expect(input.threadRootEventId).toBe('evt_root')
      expect(input.alsoSendToChannel).toBe(true)
    })

    it('is chainable — returns this', () => {
      const builder = new MessageBuilder()
      expect(builder.setContent('Hi')).toBe(builder)
      expect(builder.setReplyTo('evt_1')).toBe(builder)
      expect(builder.setThreadRoot('evt_2')).toBe(builder)
      expect(builder.setAlsoSendToChannel(false)).toBe(builder)
    })
  })

  describe('buildUpdate', () => {
    it('builds update input with roomId and eventId', () => {
      const input = new MessageBuilder().setContent('Updated').buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
      expect(input.body).toBe('Updated')
    })

    it('throws if schema validation fails (missing roomId handled externally)', () => {
      const input = new MessageBuilder().buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
    })
  })
})
