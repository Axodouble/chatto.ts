import { EventEmitter } from 'events'
import { RestClient } from './rest/client'
import { RealtimeConnection, type CloseReason } from './realtime/connection'
import { mapFrameToEvent } from './realtime/events'
import { ChattoContext } from './context'
import { loginWithPassword } from './auth/integrated'
import { TokenStore } from './auth/token-store'
import type { RoomManager } from './managers/rooms'
import type { MessageManager } from './managers/messages'
import type { ThreadManager } from './managers/threads'
import type { UserManager } from './managers/users'
import type { AssetManager } from './managers/assets'
import type { ChattoClientOptions, ClientEventMap, ReconnectOptions } from './types'
import type { ServerFrame } from './realtime/frames'
import { ChattoAuthError } from './errors'


export class ChattoClient extends EventEmitter<ClientEventMap> {
  readonly rooms: RoomManager
  readonly messages: MessageManager
  readonly threads: ThreadManager
  readonly users: UserManager
  readonly assets: AssetManager
  private readonly rest: RestClient
  private readonly realtime: RealtimeConnection
  private readonly ctx: ChattoContext
  private readonly store: TokenStore
  private reconnecting = false
  private reconnectAttempt = 0
  private readonly reconnectOpts: Required<ReconnectOptions>
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    options: ChattoClientOptions,
    realtimeFactory?: (wsUrl: string, getToken: () => string) => RealtimeConnection,
  ) {
    super()
    const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime'
    this.store = new TokenStore(options.baseUrl, options.token, options.credentials)
    this.reconnectOpts = {
      baseDelayMs: options.reconnect?.baseDelayMs ?? 1000,
      maxDelayMs: options.reconnect?.maxDelayMs ?? 30000,
      factor: options.reconnect?.factor ?? 2,
      maxAttempts: options.reconnect?.maxAttempts ?? Infinity,
    }
    const getToken = () => this.store.getToken()
    this.rest = new RestClient(
      options.baseUrl,
      getToken,
      this.store.canRefresh() ? async () => { await this.store.refresh() } : undefined,
    )
    this.realtime = realtimeFactory
      ? realtimeFactory(wsUrl, getToken)
      : new RealtimeConnection(wsUrl, getToken)
    this.ctx = new ChattoContext(this.rest)
    this.rooms = this.ctx.rooms
    this.messages = this.ctx.messages
    this.threads = this.ctx.threads
    this.users = this.ctx.users
    this.assets = this.ctx.assets
    this.on('error', () => {})
    this.wireRealtime()

    const intervalMs = options.refresh?.intervalMs
    if (intervalMs != null && intervalMs > 0 && this.store.canRefresh()) {
      this.refreshTimer = setInterval(() => {
        this.store.refresh()
          .then(() => this.emit('tokenRefresh'))
          .catch(err => this.emit('error', err instanceof Error ? err : new Error(String(err))))
      }, intervalMs)
    }
  }

  static async login(options: { baseUrl: string; login: string; password: string }): Promise<ChattoClient> {
    const { token } = await loginWithPassword(options.baseUrl, options.login, options.password)
    return new ChattoClient({
      baseUrl: options.baseUrl,
      token,
      credentials: { login: options.login, password: options.password },
    })
  }

  async connect(): Promise<void> {
    this.closedByUser = false
    await this.realtime.connect()
    this.emit('ready')
  }

  async disconnect(): Promise<void> {
    this.closedByUser = true
    this.reconnecting = false
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.refreshTimer != null) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
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

    this.realtime.on('close', (reason: CloseReason) => {
      if (this.closedByUser) return
      if (reason.kind === 'clean' || reason.kind === 'fatal') {
        this.emit('disconnect')
        return
      }
      if (reason.kind === 'auth' && !this.store.canRefresh()) {
        this.emit('error', new ChattoAuthError('no_credentials', 'Realtime auth failed and no credentials to refresh'))
        this.emit('disconnect')
        return
      }
      this.startReconnect(reason)
    })
  }

  private startReconnect(reason: CloseReason): void {
    if (this.closedByUser) return
    if (this.reconnecting) return
    this.reconnecting = true
    this.reconnectAttempt = 0
    this.attemptReconnect(reason)
  }

  private attemptReconnect(reason: CloseReason): void {
    if (this.reconnectAttempt >= this.reconnectOpts.maxAttempts) {
      this.reconnecting = false
      this.emit('disconnect')
      return
    }
    const n = this.reconnectAttempt
    const raw = Math.min(
      this.reconnectOpts.baseDelayMs * this.reconnectOpts.factor ** n,
      this.reconnectOpts.maxDelayMs,
    )
    const jittered = raw / 2 + Math.random() * (raw / 2)
    const delay = Math.max(jittered, reason.retryAfterMs)
    this.reconnectAttempt = n + 1
    this.emit('reconnecting', this.reconnectAttempt, delay)
    this.reconnectTimer = setTimeout(() => {
      if (this.closedByUser) {
        this.reconnecting = false
        return
      }
      this.reconnectTimer = null
      this.doReconnect(reason).catch(err => {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
        this.attemptReconnect(reason)
      })
    }, delay)
  }

  private async doReconnect(reason: CloseReason): Promise<void> {
    if (reason.kind === 'auth' && this.store.canRefresh()) {
      await this.store.refresh()
      this.emit('tokenRefresh')
    }
    await this.realtime.connect()
    this.reconnecting = false
    this.reconnectAttempt = 0
  }
}
