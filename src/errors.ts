import type { ZodIssue } from 'zod'

export class ChattoApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rawResponse: unknown,
  ) {
    super(message)
    this.name = 'ChattoApiError'
  }
}

export class ChattoValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ChattoValidationError'
  }
}

export class ChattoAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ChattoAuthError'
  }
}

export class ChattoParseError extends Error {
  constructor(
    public readonly issues: ZodIssue[],
    public readonly rawBody: unknown,
  ) {
    super(`Failed to parse API response: ${issues.map(i => i.message).join(', ')}`)
    this.name = 'ChattoParseError'
  }
}
