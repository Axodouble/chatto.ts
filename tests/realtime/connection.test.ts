import { describe, it, expect, mock, afterEach } from 'bun:test'
import { EventEmitter } from 'events'
import protobuf from 'protobufjs'

function buildServerFrameBuffer(payload: object): Buffer {
  const root = protobuf.parse(`
    syntax = "proto3";
    message RealtimeServerFrame {
      oneof payload {
        RealtimeServerHello hello = 1;
        RealtimeSubscribed subscribed = 2;
        RealtimeEventEnvelope event = 3;
        RealtimeClose close = 7;
        RealtimeError error = 6;
      }
    }
    message RealtimeServerHello { int32 heartbeat_interval_seconds = 1; }
    message RealtimeSubscribed {}
    message RealtimeEventEnvelope { string id = 1; string created_at = 2; string actor_id = 3; }
    message RealtimeClose { bool reconnect = 1; int32 retry_after_ms = 2; string message = 3; }
    message RealtimeError { bool fatal = 1; string message = 2; }
  `, { keepCase: true }).root
  const ServerFrame = root.lookupType('RealtimeServerFrame')
  return Buffer.from(ServerFrame.encode(ServerFrame.create(payload)).finish())
}

class MockWs extends EventEmitter {
  readyState = 1 // OPEN
  binaryType = 'nodebuffer'
  sent: Buffer[] = []
  send(data: Buffer) { this.sent.push(data) }
  close() { this.readyState = 3 }
}

let currentMockWs: MockWs

const WsMockConstructor = mock(() => {
  currentMockWs = new MockWs()
  return currentMockWs
})

const WsMockClass = Object.assign(WsMockConstructor, { OPEN: 1, CLOSED: 3 })

mock.module('ws', () => ({
  default: WsMockClass,
}))

const { RealtimeConnection } = require('../../src/realtime/connection') as typeof import('../../src/realtime/connection')

afterEach(() => {
  WsMockConstructor.mockClear()
})

describe('RealtimeConnection', () => {
  it('sends ClientHello on open, then SubscribeEvents after ServerHello, resolves on Subscribed', async () => {
    WsMockConstructor.mockImplementation(() => {
      const ws = new MockWs()
      currentMockWs = ws
      setImmediate(() => {
        ws.emit('open')
        setImmediate(() => {
          ws.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            ws.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return ws
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    expect(currentMockWs.sent).toHaveLength(2)

    const ClientFrameType = protobuf.parse(`
      syntax = "proto3";
      message RealtimeClientFrame {
        oneof payload { RealtimeClientHello hello = 1; RealtimeSubscribeEvents subscribe_events = 2; }
      }
      message RealtimeClientHello { string bearer_token = 1; }
      message RealtimeSubscribeEvents {}
    `, { keepCase: true }).root.lookupType('RealtimeClientFrame')
    const helloDecoded = ClientFrameType.toObject(
      ClientFrameType.decode(currentMockWs.sent[0]),
      { keepCase: true },
    )
    expect((helloDecoded as any).hello?.bearer_token).toBe('mytoken')

    conn.disconnect()
  })

  it('emits frame event for event envelopes', async () => {
    WsMockConstructor.mockImplementation(() => {
      const ws = new MockWs()
      currentMockWs = ws
      setImmediate(() => {
        ws.emit('open')
        setImmediate(() => {
          ws.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            ws.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return ws
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    const frames: unknown[] = []
    conn.on('frame', f => frames.push(f))

    currentMockWs.emit('message', buildServerFrameBuffer({
      event: { id: 'env_1', created_at: '2026-07-09T10:00:00Z', actor_id: 'user_1' },
    }))

    expect(frames).toHaveLength(1)
    conn.disconnect()
  })

  it('emits close with reconnect=false on ws close event', async () => {
    WsMockConstructor.mockImplementation(() => {
      const ws = new MockWs()
      currentMockWs = ws
      setImmediate(() => {
        ws.emit('open')
        setImmediate(() => {
          ws.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            ws.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return ws
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    const closes: [boolean, number][] = []
    conn.on('close', (reconnect, ms) => closes.push([reconnect, ms]))

    currentMockWs.emit('close')
    expect(closes).toEqual([[false, 0]])
  })
})
