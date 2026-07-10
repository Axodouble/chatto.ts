import { describe, it, expect, afterEach, spyOn, mock } from 'bun:test'
import { ConnectError, Code, createRouterTransport } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import { MessageService } from '../../src/gen/chatto/api/v1/messages_pb'
import { GetMessageResponseSchema } from '../../src/gen/chatto/api/v1/messages_pb'
import { createServiceClients, createChattoTransport, toChattoError } from '../../src/rest/transport'
import { ChattoApiError } from '../../src/errors'
import { createClient } from '@connectrpc/connect'

afterEach(() => mock.restore())

describe('toChattoError', () => {
  it('maps a ConnectError to a ChattoApiError preserving the code name', () => {
    const err = toChattoError(new ConnectError('nope', Code.Unauthenticated))
    expect(err).toBeInstanceOf(ChattoApiError)
    expect(err.code).toBe('unauthenticated')
    expect(err.message).toContain('nope')
  })

  it('normalizes multi-word PascalCase codes to snake_case', () => {
    const notFound = toChattoError(new ConnectError('x', Code.NotFound))
    expect(notFound.code).toBe('not_found')

    const permissionDenied = toChattoError(new ConnectError('x', Code.PermissionDenied))
    expect(permissionDenied.code).toBe('permission_denied')
  })
})

describe('createServiceClients', () => {
  it('exposes typed clients that call the generated services', async () => {
    // A router transport lets us stub the server side without network.
    const transport = createRouterTransport(({ service }) => {
      service(MessageService, {
        getMessage: () => create(GetMessageResponseSchema, {
          message: { id: 'evt_1', roomId: 'R_1', actorId: 'U_1', body: 'hi' },
        }),
      })
    })
    const clients = createServiceClients(transport)
    const res = await clients.message.getMessage({ roomId: 'R_1', eventId: 'evt_1' })
    expect(res.message?.id).toBe('evt_1')
    // Sanity: createClient over the same service+transport behaves identically.
    void createClient(MessageService, transport)
  })
})

describe('createChattoTransport', () => {
  it('sends the Authorization header and targets the Connect base URL', async () => {
    let capturedUrl: string | undefined
    let capturedHeaders: Headers | undefined
    spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = String(url)
      capturedHeaders = init?.headers as Headers
      return new Response(
        JSON.stringify({ message: { id: 'evt_1', roomId: 'R_1', actorId: 'U_1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const transport = createChattoTransport('https://chat.example.com', 'mytoken')
    const clients = createServiceClients(transport)
    const res = await clients.message.getMessage({ roomId: 'R_1', eventId: 'evt_1' })

    expect(res.message?.id).toBe('evt_1')
    expect(capturedUrl).toStartWith('https://chat.example.com/api/connect/')
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer mytoken')
  })

  // NOTE: an error-path test asserting that a fetch-level Connect error surfaces to the
  // caller as a ChattoApiError was attempted here and deliberately omitted. Connect-web's
  // own `runUnaryCall` (protocol/run-call.js) wraps the entire interceptor chain in a
  // `.then(res, abort)`, and `abort` unconditionally runs `ConnectError.from(reason)` on
  // whatever the chain rejects with. Since `ChattoApiError` is not `instanceof ConnectError`,
  // any ChattoApiError thrown by `authInterceptor`'s catch block gets re-wrapped into a
  // plain ConnectError (Code.Unknown) before it reaches the RPC caller — verified with a
  // standalone repro against createConnectTransport. So today, callers of
  // createServiceClients() never actually observe a ChattoApiError; they see a generic
  // ConnectError. Shipping the intended assertion here would be a permanently-failing (not
  // flaky) test, so it was left out per the task's fallback guidance; see the fix report
  // for details. This is a pre-existing design gap, out of scope for this fix pass.
})
