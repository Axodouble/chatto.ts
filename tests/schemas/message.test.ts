import {
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from '../../src/schemas/message'

describe('CreateMessageInputSchema', () => {
  it('requires roomId', () => {
    expect(() => CreateMessageInputSchema.parse({})).toThrow()
  })

  it('parses valid create input', () => {
    const input = CreateMessageInputSchema.parse({ roomId: 'room_1', body: 'Hi' })
    expect(input.roomId).toBe('room_1')
    expect(input.body).toBe('Hi')
  })
})

describe('UpdateMessageInputSchema', () => {
  it('requires roomId and eventId', () => {
    expect(() => UpdateMessageInputSchema.parse({ roomId: 'room_1' })).toThrow()
  })

  it('parses valid update input', () => {
    const input = UpdateMessageInputSchema.parse({ roomId: 'room_1', eventId: 'evt_1', body: 'Updated' })
    expect(input.eventId).toBe('evt_1')
  })
})
