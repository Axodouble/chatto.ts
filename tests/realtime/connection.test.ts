import { describe, it, expect } from 'bun:test'
import { EventEmitter } from 'events'
import protobuf from 'protobufjs'
import { RealtimeConnection } from '../../src/realtime/connection'

function buildServerFrameBuffer(payload: object): Buffer {
  const root = protobuf.parse(`
    syntax = "proto3";
    message RealtimeServerFrame {
      oneof frame {
        RealtimeServerHello hello = 1;
        RealtimeSubscribed subscribed = 2;
        RealtimeEventEnvelope event = 3;
        RealtimeError error = 5;
        RealtimeClose close = 6;
      }
    }
    message RealtimeServerHello { uint32 heartbeat_interval_seconds = 4; }
    message RealtimeSubscribed {}
    message RealtimeEventEnvelope { string id = 1; Timestamp created_at = 2; string actor_id = 3; }
    message Timestamp { int64 seconds = 1; int32 nanos = 2; }
    message RealtimeClose { string code = 1; string message = 2; bool reconnect = 3; int32 retry_after_ms = 4; }
    message RealtimeError { string code = 1; string message = 2; bool fatal = 3; }
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

function makeConn(mockWs: MockWs): RealtimeConnection {
  return new RealtimeConnection('ws://chat.example.com/api/realtime', () => 'mytoken', () => mockWs as any)
}

function handshake(mockWs: MockWs) {
  setImmediate(() => {
    mockWs.emit('open')
    setImmediate(() => {
      mockWs.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
      setImmediate(() => {
        mockWs.emit('message', buildServerFrameBuffer({ subscribed: {} }))
      })
    })
  })
}

describe('RealtimeConnection', () => {
  it('sends ClientHello on open, then SubscribeEvents after ServerHello, resolves on Subscribed', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)

    const conn = makeConn(mockWs)
    await conn.connect()

    expect(mockWs.sent).toHaveLength(2)

    const ClientFrameType = protobuf.parse(`
      syntax = "proto3";
      message RealtimeClientFrame {
        oneof frame { RealtimeClientHello hello = 1; RealtimeSubscribeEvents subscribe_events = 2; }
      }
      message RealtimeClientHello { uint32 protocol_version = 1; string bearer_token = 2; }
      message RealtimeSubscribeEvents {}
    `, { keepCase: true }).root.lookupType('RealtimeClientFrame')
    const helloDecoded = ClientFrameType.toObject(
      ClientFrameType.decode(mockWs.sent[0]),
      { keepCase: true },
    )
    expect((helloDecoded as any).hello?.bearer_token).toBe('mytoken')

    conn.disconnect()
  })

  it('emits frame event for event envelopes', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)

    const conn = makeConn(mockWs)
    await conn.connect()

    const frames: unknown[] = []
    conn.on('frame', f => frames.push(f))

    // Server sends timestamps as google.protobuf.Timestamp-shaped messages, not strings.
    mockWs.emit('message', buildServerFrameBuffer({
      event: { id: 'env_1', created_at: { seconds: 1752055200, nanos: 0 }, actor_id: 'user_1' },
    }))

    expect(frames).toHaveLength(1)
    expect((frames[0] as any).event.created_at).toBe('2025-07-09T10:00:00.000Z')
    conn.disconnect()
  })

  it('classifies a raw 1006 close as retry', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)
    const conn = makeConn(mockWs)
    await conn.connect()
    const reasons: any[] = []
    conn.on('close', r => reasons.push(r))
    mockWs.emit('close', 1006, Buffer.from(''))
    expect(reasons).toEqual([{ kind: 'retry', code: 1006, retryAfterMs: 0 }])
  })

  it('classifies a raw 1008 close as auth', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)
    const conn = makeConn(mockWs)
    await conn.connect()
    const reasons: any[] = []
    conn.on('close', r => reasons.push(r))
    mockWs.emit('close', 1008, Buffer.from('authentication required'))
    expect(reasons[0].kind).toBe('auth')
  })

  it('classifies a raw 1002 close as fatal', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)
    const conn = makeConn(mockWs)
    await conn.connect()
    const reasons: any[] = []
    conn.on('close', r => reasons.push(r))
    mockWs.emit('close', 1002, Buffer.from('protocol error'))
    expect(reasons[0].kind).toBe('fatal')
  })

  it('reports a user-initiated disconnect as clean', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)
    const conn = makeConn(mockWs)
    await conn.connect()
    const reasons: any[] = []
    conn.on('close', r => reasons.push(r))
    conn.disconnect()
    mockWs.emit('close', 1000, Buffer.from(''))
    expect(reasons[0].kind).toBe('clean')
  })

  it('rejects connect() when the socket closes before subscribed', async () => {
    const mockWs = new MockWs()
    const conn = makeConn(mockWs)
    const p = conn.connect()
    setImmediate(() => {
      mockWs.emit('open')
      setImmediate(() => {
        mockWs.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
        setImmediate(() => mockWs.emit('close', 1013, Buffer.from('')))
      })
    })
    await expect(p).rejects.toThrow()
  })

  it('emits close only once when frame close precedes ws close', async () => {
    const mockWs = new MockWs()
    handshake(mockWs)
    const conn = makeConn(mockWs)
    await conn.connect()
    const reasons: any[] = []
    conn.on('close', r => reasons.push(r))
    mockWs.emit('message', buildServerFrameBuffer({
      close: { code: 'stream_closed', message: 'x', reconnect: true, retry_after_ms: 1000 },
    }))
    mockWs.emit('close', 1006, Buffer.from(''))
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toEqual({ kind: 'retry', code: 1000, retryAfterMs: 1000 })
  })
})
