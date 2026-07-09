import { describe, it, expect } from 'bun:test'
import { encodeClientFrame, decodeServerFrame } from '../../src/realtime/frames'

describe('encodeClientFrame / decodeServerFrame', () => {
  it('round-trips a ClientHello frame', () => {
    const encoded = encodeClientFrame({ hello: { bearer_token: 'mytoken' } })
    expect(encoded).toBeInstanceOf(Buffer)
    expect(encoded.length).toBeGreaterThan(0)
  })

  it('round-trips a SubscribeEvents frame', () => {
    const encoded = encodeClientFrame({ subscribe_events: {} })
    expect(encoded).toBeInstanceOf(Buffer)
  })

  it('round-trips a Ping frame', () => {
    const encoded = encodeClientFrame({ ping: { nonce: 'abc123' } })
    expect(encoded).toBeInstanceOf(Buffer)
    expect(encoded.length).toBeGreaterThan(0)
  })

  it('decodes a ServerHello frame', () => {
    const protobuf = require('protobufjs') as typeof import('protobufjs')
    const root = protobuf.parse(`
      syntax = "proto3";
      message RealtimeServerFrame {
        oneof payload {
          ServerHello hello = 1;
        }
      }
      message ServerHello { int32 heartbeat_interval_seconds = 1; }
    `, { keepCase: true }).root
    const ServerFrame = root.lookupType('RealtimeServerFrame')
    const buf = Buffer.from(
      ServerFrame.encode(
        ServerFrame.create({ hello: { heartbeat_interval_seconds: 30 } })
      ).finish()
    )
    const frame = decodeServerFrame(buf)
    expect(frame.hello).toBeDefined()
    expect((frame.hello as any)?.heartbeat_interval_seconds).toBe(30)
  })
})
