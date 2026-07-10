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
    return new ChattoApiError(name, err.rawMessage, { code: name, message: err.rawMessage })
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
    try {
      return await next(req)
    } catch (err) {
      throw toChattoError(err)
    }
  }
}

export function createChattoTransport(baseUrl: string, token: string): Transport {
  return createConnectTransport({
    baseUrl: `${baseUrl}/api/connect`,
    interceptors: [authInterceptor(token)],
  })
}

export function createServiceClients(transport: Transport): {
  message: Client<typeof MessageService>
  user: Client<typeof UserService>
  roomDirectory: Client<typeof RoomDirectoryService>
  room: Client<typeof RoomService>
} {
  return {
    message: createClient(MessageService, transport),
    user: createClient(UserService, transport),
    roomDirectory: createClient(RoomDirectoryService, transport),
    room: createClient(RoomService, transport),
  }
}

export type ServiceClients = ReturnType<typeof createServiceClients>
