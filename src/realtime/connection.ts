import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { encodeClientFrame, decodeServerFrame, type ServerFrame, type ClientFrame } from './frames'

interface RealtimeConnectionEvents {
  frame: [frame: ServerFrame]
  error: [err: Error]
  close: [reconnect: boolean, retryAfterMs: number]
}

export class RealtimeConnection extends EventEmitter<RealtimeConnectionEvents> {
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly wsUrl: string,
    private readonly token: string,
  ) {
    super()
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl)
      ;(this.ws as WebSocket & { binaryType: string }).binaryType = 'nodebuffer'

      this.ws.once('open', () => {
        this.send({ hello: { bearer_token: this.token } })
      })

      this.ws.on('message', (data: Buffer) => {
        let frame: ServerFrame
        try {
          frame = decodeServerFrame(data)
        } catch (err) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
          return
        }

        if (frame.hello != null) {
          const intervalMs = frame.hello.heartbeat_interval_seconds * 1000
          this.heartbeatTimer = setInterval(() => {
            this.send({ ping: { nonce: Date.now().toString(36) } })
          }, intervalMs)
          this.send({ subscribe_events: {} })
          return
        }

        if (frame.subscribed != null) {
          resolve()
          return
        }

        if (frame.error != null && frame.error.fatal) {
          reject(new Error(frame.error.message))
          return
        }

        if (frame.close != null) {
          this.cleanup()
          this.emit('close', frame.close.reconnect, frame.close.retry_after_ms)
          return
        }

        this.emit('frame', frame)
      })

      this.ws.on('error', (err: Error) => {
        reject(err)
        this.emit('error', err)
      })

      this.ws.on('close', () => {
        this.cleanup()
        this.emit('close', false, 0)
      })
    })
  }

  disconnect(): void {
    this.cleanup()
    this.ws?.close()
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeClientFrame(frame))
    }
  }

  private cleanup(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
