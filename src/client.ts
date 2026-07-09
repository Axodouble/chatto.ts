import { EventEmitter } from 'events'
import { RestClient } from './rest/client'
import { RealtimeConnection } from './realtime/connection'
import { mapFrameToEvent } from './realtime/events'
import { RoomManager } from './managers/rooms'
import { MessageManager } from './managers/messages'
import { loginWithPassword } from './auth/integrated'
import type { Message } from './resources/message'
import type { MessageDeleteEvent, ReactionEvent, ChattoClientOptions } from './types'
import type { ServerFrame } from './realtime/frames'

interface ClientEventMap {
  ready: []
  messageCreate: [message: Message]
  messageUpdate: [message: Message]
  messageDelete: [event: MessageDeleteEvent]
  reactionAdd: [event: ReactionEvent]
  reactionRemove: [event: ReactionEvent]
  error: [err: Error]
  disconnect: []
}

export class ChattoClient extends EventEmitter<ClientEventMap> {
  readonly rooms: RoomManager
  readonly messages: MessageManager
  private readonly rest: RestClient
  private readonly realtime: RealtimeConnection

  constructor(
    options: ChattoClientOptions,
    realtimeFactory?: (wsUrl: string, token: string) => RealtimeConnection,
  ) {
    super()
    const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime'
    this.rest = new RestClient(options.baseUrl, options.token)
    this.realtime = realtimeFactory
      ? realtimeFactory(wsUrl, options.token)
      : new RealtimeConnection(wsUrl, options.token)
    this.rooms = new RoomManager(this.rest)
    this.messages = new MessageManager(this.rest)
    this.wireRealtime()
  }

  static async login(options: { baseUrl: string; login: string; password: string }): Promise<ChattoClient> {
    const { token } = await loginWithPassword(options.baseUrl, options.login, options.password)
    return new ChattoClient({ baseUrl: options.baseUrl, token })
  }

  async connect(): Promise<void> {
    await this.realtime.connect()
    this.emit('ready')
  }

  async disconnect(): Promise<void> {
    this.realtime.disconnect()
    this.emit('disconnect')
  }

  private wireRealtime(): void {
    this.realtime.on('frame', (frame: ServerFrame) => {
      const event = mapFrameToEvent(frame)
      if (event == null) return

      const hydrate = async () => {
        if (event.kind === 'messageCreate') {
          const msg = await this.messages.fetch(event.roomId, event.messageEventId)
          this.emit('messageCreate', msg)
        } else if (event.kind === 'messageUpdate') {
          const msg = await this.messages.fetch(event.roomId, event.messageEventId)
          this.emit('messageUpdate', msg)
        } else if (event.kind === 'messageDelete') {
          this.emit('messageDelete', event.event)
        } else if (event.kind === 'reactionAdd') {
          this.emit('reactionAdd', event.event)
        } else if (event.kind === 'reactionRemove') {
          this.emit('reactionRemove', event.event)
        }
      }

      hydrate().catch(err => {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
      })
    })

    this.realtime.on('error', (err: Error) => this.emit('error', err))

    this.realtime.on('close', (reconnect: boolean, retryAfterMs: number) => {
      if (!reconnect) {
        this.emit('disconnect')
        return
      }
      setTimeout(() => {
        this.realtime.connect().catch(err => {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
        })
      }, retryAfterMs)
    })
  }
}
