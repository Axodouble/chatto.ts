import { describe, it, expect } from 'bun:test'
import { decodeServerFrame } from '../../src/realtime/frames'
import { mapFrameToEvent } from '../../src/realtime/events'

// Real frames captured off the wire from a live Chatto server. Unlike fixtures
// we author ourselves (which bake in the SDK's own schema assumptions), these
// bytes originate from the server, so they catch schema drift — e.g. the
// `created_at` field being a google.protobuf.Timestamp message, not a string.
const GOLDEN = {
  // A message_posted event envelope.
  messagePosted:
    '1a540a0f45527a39544170544f516f695a4873120c08a282c2d20610aeb3e0d703' +
    '1a0f55357441384c67773243655561786d52220a0f52314a4135564237493161376a3062' +
    '120f45527a39544170544f516f695a4873',
  // An event envelope carrying field 64 — an event type this SDK does not model.
  unknownEvent:
    '1a440a0f453079397a67466e78424e434b6433120c08a282c2d20610b5e9ecda03' +
    '1a0f55357441384c67773243655561786d8204110a0f52314a4135564237493161376a3062',
} as const

describe('golden server frames', () => {
  it('decodes a real message_posted event without throwing', () => {
    const frame = decodeServerFrame(Buffer.from(GOLDEN.messagePosted, 'hex'))

    expect(frame.event).toBeDefined()
    expect(frame.event!.id).toBe('ERz9TApTOQoiZHs')
    expect(frame.event!.actor_id).toBe('U5tA8Lgw2CeUaxm')
    expect(frame.event!.message_posted).toEqual({
      room_id: 'R1JA5VB7I1a7j0b',
      message_event_id: 'ERz9TApTOQoiZHs',
    })
  })

  it('decodes the Timestamp created_at to a valid ISO string', () => {
    const frame = decodeServerFrame(Buffer.from(GOLDEN.messagePosted, 'hex'))
    const createdAt = frame.event!.created_at

    // Regression guard for the "Invalid byte sequence" bug: created_at must be a
    // real RFC 3339 string, not the raw Timestamp bytes and not garbage.
    expect(createdAt).toBe('2026-07-10T05:20:34.989Z')
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false)
  })

  it('maps a real message_posted frame to a messageCreate event', () => {
    const frame = decodeServerFrame(Buffer.from(GOLDEN.messagePosted, 'hex'))
    expect(mapFrameToEvent(frame)).toEqual({
      kind: 'messageCreate',
      roomId: 'R1JA5VB7I1a7j0b',
      messageEventId: 'ERz9TApTOQoiZHs',
    })
  })

  it('tolerates an unknown event type without throwing', () => {
    const frame = decodeServerFrame(Buffer.from(GOLDEN.unknownEvent, 'hex'))

    expect(frame.event).toBeDefined()
    expect(frame.event!.id).toBe('E0y9zgFnxBNCKd3')
    expect(frame.event!.created_at).toBe('2026-07-10T05:20:34.995Z')
    // No modeled event member → gracefully ignored rather than crashing.
    expect(mapFrameToEvent(frame)).toBeNull()
  })
})
