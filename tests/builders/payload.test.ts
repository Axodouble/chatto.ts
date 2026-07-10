import { describe, it, expect } from 'bun:test'
import { resolveMessagePayload } from '../../src/builders/payload'
import { MessageBuilder } from '../../src/builders/message'

describe('resolveMessagePayload', () => {
  it('wraps a plain string into a builder', () => {
    const builder = resolveMessagePayload('hello')
    expect(builder).toBeInstanceOf(MessageBuilder)
    expect(builder.buildCreate('room_1')).toMatchObject({ roomId: 'room_1', body: 'hello' })
  })

  it('maps an options object into a builder', () => {
    const builder = resolveMessagePayload({ content: 'hi', alsoSendToChannel: true })
    expect(builder.buildCreate('room_1')).toMatchObject({ body: 'hi', alsoSendToChannel: true })
  })

  it('returns the same builder instance when given a builder', () => {
    const original = new MessageBuilder().setContent('x')
    expect(resolveMessagePayload(original)).toBe(original)
  })
})
