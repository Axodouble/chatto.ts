import { ChattoApiError, ChattoParseError, ChattoValidationError, ChattoAuthError } from '../src/errors'

describe('ChattoAuthError', () => {
  it('carries a code and name', () => {
    const err = new ChattoAuthError('no_credentials', 'cannot refresh')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoAuthError')
    expect(err.code).toBe('no_credentials')
    expect(err.message).toBe('cannot refresh')
  })
})

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

describe('ChattoValidationError', () => {
  it('sets code, message and is an Error', () => {
    const err = new ChattoValidationError('too_many_attachments', 'At most 10 attachments allowed')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoValidationError')
    expect(err.code).toBe('too_many_attachments')
    expect(err.message).toBe('At most 10 attachments allowed')
  })
})
