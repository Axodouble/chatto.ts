import { describe, it, expect } from 'bun:test'
import { mapFrameToEvent } from '../../src/realtime/events'
import type { ServerFrame } from '../../src/realtime/frames'

const envelope = (event: object) => ({
  event: { id: 'env_1', created_at: '2026-07-09T10:00:00Z', actor_id: 'user_1', ...event },
})

describe('mapFrameToEvent', () => {
  it('returns null for frames without event', () => {
    expect(mapFrameToEvent({ hello: { heartbeat_interval_seconds: 30 } })).toBeNull()
    expect(mapFrameToEvent({ heartbeat: {} })).toBeNull()
    expect(mapFrameToEvent({ subscribed: {} } as ServerFrame)).toBeNull()
  })

  it('maps message_posted to messageCreate', () => {
    const result = mapFrameToEvent(envelope({ message_posted: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageCreate', roomId: 'room_1', messageEventId: 'evt_1' })
  })

  it('maps message_edited to messageUpdate', () => {
    const result = mapFrameToEvent(envelope({ message_edited: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageUpdate', roomId: 'room_1', messageEventId: 'evt_1' })
  })

  it('maps message_retracted to messageDelete', () => {
    const result = mapFrameToEvent(envelope({ message_retracted: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageDelete', event: { roomId: 'room_1', eventId: 'evt_1' } })
  })

  it('maps reaction_added to reactionAdd', () => {
    const result = mapFrameToEvent(envelope({
      reaction_added: { room_id: 'room_1', message_event_id: 'evt_1', emoji: '👍', actor_id: 'user_1' },
    }))
    expect(result).toEqual({
      kind: 'reactionAdd',
      event: { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍', actorId: 'user_1' },
    })
  })

  it('maps reaction_removed to reactionRemove', () => {
    const result = mapFrameToEvent(envelope({
      reaction_removed: { room_id: 'room_1', message_event_id: 'evt_1', emoji: '👍', actor_id: 'user_1' },
    }))
    expect(result).toEqual({
      kind: 'reactionRemove',
      event: { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍', actorId: 'user_1' },
    })
  })

  it('returns null for unrecognised event types', () => {
    const result = mapFrameToEvent({ event: { id: 'env_1', created_at: '', actor_id: '' } })
    expect(result).toBeNull()
  })
})
