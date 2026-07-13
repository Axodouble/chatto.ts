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

  it('maps files and attachmentIds from an options object', () => {
    const file = { data: new Uint8Array([1]), filename: 'a.png', contentType: 'image/png' }
    const builder = resolveMessagePayload({ content: 'hi', files: [file], attachmentIds: ['as_1'] })
    expect(builder.getFiles()).toHaveLength(1)
    expect(builder.getAttachmentIds()).toEqual(['as_1'])
    expect(builder.buildCreate('room_1').body).toBe('hi')
  })

  it('maps an attachment-only options object with no content', () => {
    const file = { data: new Uint8Array([1]), filename: 'a.png' }
    const builder = resolveMessagePayload({ files: [file] })
    expect(builder.getFiles()).toHaveLength(1)
    expect(builder.buildCreate('room_1').body).toBeUndefined()
  })
})
