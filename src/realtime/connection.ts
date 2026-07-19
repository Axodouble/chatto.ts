import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { encodeClientFrame, decodeServerFrame, type ServerFrame, type ClientFrame } from './frames'

export type CloseKind = 'auth' | 'retry' | 'fatal' | 'clean'

export interface CloseReason {
  kind: CloseKind
  code: number
  retryAfterMs: number
}

interface RealtimeConnectionEvents {
  frame: [frame: ServerFrame]
  error: [err: Error]
  close: [reason: CloseReason]
}

const FATAL_CLOSE_CODES = new Set([1002, 1003, 1007, 1010])

export function classifyCloseCode(code: number): CloseKind {
  if (code === 1008) return 'auth'
  if (FATAL_CLOSE_CODES.has(code)) return 'fatal'
  return 'retry'
}

export class RealtimeConnection extends EventEmitter<RealtimeConnectionEvents> {
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private userClosed = false
  private closeEmitted = false
  private alive = false

  constructor(
    private readonly wsUrl: string,
    private readonly getToken: () => string,
    private readonly wsFactory: (url: string) => WebSocket = url => new WebSocket(url),
  ) {
    super()
  }

  connect(): Promise<void> {
    this.userClosed = false
    this.closeEmitted = false
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }

      this.ws = this.wsFactory(this.wsUrl)
      ;(this.ws as WebSocket & { binaryType: string }).binaryType = 'nodebuffer'

      this.ws.once('open', () => {
        this.send({ hello: { protocol_version: 1, bearer_token: this.getToken() } })
      })

      this.ws.on('message', (data: Buffer) => {
        this.alive = true
        let frame: ServerFrame
        try {
          frame = decodeServerFrame(data)
        } catch (err) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
          return
        }

        if (frame.hello != null) {
          const intervalMs = frame.hello.heartbeat_interval_seconds * 1000
          this.alive = true
          this.heartbeatTimer = setInterval(() => {
            if (!this.alive) {
              this.terminate()
              return
            }
            this.alive = false
            this.send({ ping: { nonce: Date.now().toString(36) } })
          }, intervalMs)
          this.send({ subscribe_events: {} })
          return
        }

        if (frame.subscribed != null) {
          settle(resolve)
          return
        }

        if (frame.error != null) {
          const err = new Error(`${frame.error.code}: ${frame.error.message}`)
          if (frame.error.fatal) settle(() => reject(err))
          this.emit('error', err)
          return
        }

        if (frame.close != null) {
          this.cleanup()
          this.emitClose({
            kind: frame.close.reconnect ? 'retry' : 'clean',
            code: 1000,
            retryAfterMs: frame.close.retry_after_ms,
          })
          settle(() => reject(new Error(`realtime closed before subscribe: ${frame.close!.code}`)))
          return
        }

        this.emit('frame', frame)
      })

      this.ws.on('error', (err: Error) => {
        settle(() => reject(err))
        this.emit('error', err)
      })

      this.ws.on('close', (code: number) => {
        this.cleanup()
        const kind = this.userClosed ? 'clean' : classifyCloseCode(code)
        this.emitClose({ kind, code, retryAfterMs: 0 })
        settle(() => reject(new Error(`socket closed before subscribe (code ${code})`)))
      })
    })
  }

  disconnect(): void {
    this.userClosed = true
    this.cleanup()
    this.ws?.close()
  }

  private emitClose(reason: CloseReason): void {
    if (this.closeEmitted) return
    this.closeEmitted = true
    this.emit('close', reason)
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeClientFrame(frame))
    }
  }

  private terminate(): void {
    this.cleanup()
    const ws = this.ws as (WebSocket & { terminate?: () => void }) | null
    if (ws == null) return
    if (typeof ws.terminate === 'function') {
      ws.terminate()
    } else {
      ws.close()
    }
  }

  private cleanup(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
