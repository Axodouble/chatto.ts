import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient, ConnectError, Code } from '@connectrpc/connect'
import type { Transport, Interceptor, Client } from '@connectrpc/connect'
import { MessageService } from '../gen/chatto/api/v1/messages_pb'
import { UserService } from '../gen/chatto/api/v1/member_directory_pb'
import { RoomDirectoryService } from '../gen/chatto/api/v1/room_directory_pb'
import { RoomService } from '../gen/chatto/api/v1/rooms_pb'
import { ChattoApiError } from '../errors'

// ConnectError.code is a numeric enum; Code[code] yields the PascalCase name.
// Connect wire status names are snake_case (e.g. "not_found",
// "permission_denied"), so normalize to that.
export function toChattoError(err: unknown): ChattoApiError {
  if (err instanceof ConnectError) {
    const name = codeNameOf(err.code)
    // Preserve the original ConnectError as `raw` so consumers can still inspect
    // `.details`/`.metadata`, which the old { code, message } shape lost.
    return new ChattoApiError(name, err.rawMessage, err)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new ChattoApiError('unknown', message, {})
}

function codeNameOf(code: number): string {
  // @connectrpc/connect exports `Code`; map the numeric value to the wire name.
  // Wire names are the enum key in snake_case (e.g. Code.PermissionDenied -> "permission_denied").
  const key = Code[code] as string | undefined
  return key ? key[0].toLowerCase() + key.slice(1).replace(/[A-Z]/g, c => '_' + c.toLowerCase()) : 'unknown'
}

function authInterceptor(token: string): Interceptor {
  return next => async req => {
    req.header.set('Authorization', `Bearer ${token}`)
    return next(req)
  }
}

export function createChattoTransport(baseUrl: string, token: string): Transport {
  return createConnectTransport({
    baseUrl: `${baseUrl}/api/connect`,
    interceptors: [authInterceptor(token)],
  })
}

// connect-web's transport rewraps any non-ConnectError thrown inside an interceptor
// into a generic ConnectError(Code.Unknown), so error mapping cannot happen there.
// Instead, wrap the created client so every method call maps its rejection via
// toChattoError at the point where callers actually observe it.
function mapErrors<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const out = (value as (...a: unknown[]) => unknown).apply(target, args)
        // All currently-wired RPCs are unary and return a Promise. Streaming RPCs
        // return an async-iterable instead, which would bypass this `instanceof
        // Promise` check and skip toChattoError mapping entirely. If a streaming
        // method is ever wired into createServiceClients, its errors (thrown from
        // iteration) must be mapped explicitly at the call site.
        return out instanceof Promise ? out.catch((err: unknown) => { throw toChattoError(err) }) : out
      }
    },
  })
}

export function createServiceClients(transport: Transport): {
  message: Client<typeof MessageService>
  user: Client<typeof UserService>
  roomDirectory: Client<typeof RoomDirectoryService>
  room: Client<typeof RoomService>
} {
  return {
    message: mapErrors(createClient(MessageService, transport)),
    user: mapErrors(createClient(UserService, transport)),
    roomDirectory: mapErrors(createClient(RoomDirectoryService, transport)),
    room: mapErrors(createClient(RoomService, transport)),
  }
}

export type ServiceClients = ReturnType<typeof createServiceClients>
