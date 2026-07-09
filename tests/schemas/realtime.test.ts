import { describe, it, expect } from 'bun:test'
import { MessageDeleteEventSchema, ReactionEventSchema } from '../../src/schemas/realtime'

describe('MessageDeleteEventSchema', () => {
  it('parses valid delete event', () => {
    const evt = MessageDeleteEventSchema.parse({ roomId: 'room_1', eventId: 'evt_1' })
    expect(evt.roomId).toBe('room_1')
    expect(evt.eventId).toBe('evt_1')
  })

  it('requires roomId and eventId', () => {
    expect(() => MessageDeleteEventSchema.parse({ roomId: 'room_1' })).toThrow()
  })
})

describe('ReactionEventSchema', () => {
  it('parses a reaction event with actorId', () => {
    const evt = ReactionEventSchema.parse({
      roomId: 'room_1',
      messageEventId: 'evt_1',
      emoji: '👍',
      actorId: 'user_1',
    })
    expect(evt.emoji).toBe('👍')
    expect(evt.actorId).toBe('user_1')
  })

  it('allows actorId to be absent', () => {
    const evt = ReactionEventSchema.parse({
      roomId: 'room_1',
      messageEventId: 'evt_1',
      emoji: '👍',
    })
    expect(evt.actorId).toBeUndefined()
  })
})
