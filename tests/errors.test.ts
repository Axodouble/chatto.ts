import { ChattoApiError, ChattoParseError } from '../src/errors'

describe('ChattoApiError', () => {
  it('sets code, message, rawResponse and is an Error', () => {
    const raw = { code: 'unauthenticated', message: 'Not authenticated' }
    const err = new ChattoApiError('unauthenticated', 'Not authenticated', raw)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoApiError')
    expect(err.code).toBe('unauthenticated')
    expect(err.message).toBe('Not authenticated')
    expect(err.rawResponse).toBe(raw)
  })
})

describe('ChattoParseError', () => {
  it('sets issues, rawBody and is an Error', () => {
    const issues = [{ message: 'Expected string', code: 'invalid_type', path: ['id'] }] as any
    const raw = { id: 123 }
    const err = new ChattoParseError(issues, raw)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoParseError')
    expect(err.issues).toBe(issues)
    expect(err.rawBody).toBe(raw)
    expect(err.message).toContain('Expected string')
  })
})
