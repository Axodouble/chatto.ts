import protobuf from 'protobufjs'

const PROTO_SCHEMA = `
syntax = "proto3";
package chatto.realtime.v1;

message RealtimeClientFrame {
  oneof payload {
    RealtimeClientHello hello = 1;
    RealtimeSubscribeEvents subscribe_events = 2;
    RealtimePing ping = 3;
  }
}
message RealtimeClientHello { string bearer_token = 1; }
message RealtimeSubscribeEvents {}
message RealtimePing { string nonce = 1; }

message RealtimeServerFrame {
  oneof payload {
    RealtimeServerHello hello = 1;
    RealtimeSubscribed subscribed = 2;
    RealtimeEventEnvelope event = 3;
    RealtimeHeartbeat heartbeat = 4;
    RealtimePong pong = 5;
    RealtimeError error = 6;
    RealtimeClose close = 7;
  }
}
message RealtimeServerHello { int32 heartbeat_interval_seconds = 1; }
message RealtimeSubscribed {}
message RealtimeEventEnvelope {
  string id = 1;
  string created_at = 2;
  string actor_id = 3;
  oneof event {
    RealtimeMessagePostedEvent message_posted = 4;
    RealtimeMessageEditedEvent message_edited = 5;
    RealtimeMessageRetractedEvent message_retracted = 6;
    RealtimeReactionAddedEvent reaction_added = 7;
    RealtimeReactionRemovedEvent reaction_removed = 8;
  }
}
message RealtimeMessagePostedEvent { string room_id = 1; string message_event_id = 2; }
message RealtimeMessageEditedEvent { string room_id = 1; string message_event_id = 2; }
message RealtimeMessageRetractedEvent { string room_id = 1; string message_event_id = 2; }
message RealtimeReactionAddedEvent {
  string room_id = 1; string message_event_id = 2;
  string emoji = 3; string actor_id = 4;
}
message RealtimeReactionRemovedEvent {
  string room_id = 1; string message_event_id = 2;
  string emoji = 3; string actor_id = 4;
}
message RealtimeHeartbeat {}
message RealtimePong { string nonce = 1; }
message RealtimeError { bool fatal = 1; string message = 2; }
message RealtimeClose { bool reconnect = 1; int32 retry_after_ms = 2; string message = 3; }
`

let _root: protobuf.Root | null = null

function getRoot(): protobuf.Root {
  if (_root == null) {
    _root = protobuf.parse(PROTO_SCHEMA, { keepCase: true }).root
  }
  return _root
}

export interface EventEnvelopePayload {
  id: string
  created_at: string
  actor_id: string
  message_posted?: { room_id: string; message_event_id: string }
  message_edited?: { room_id: string; message_event_id: string }
  message_retracted?: { room_id: string; message_event_id: string }
  reaction_added?: { room_id: string; message_event_id: string; emoji: string; actor_id: string }
  reaction_removed?: { room_id: string; message_event_id: string; emoji: string; actor_id: string }
}

export interface ServerFrame {
  hello?: { heartbeat_interval_seconds: number }
  subscribed?: Record<string, never>
  event?: EventEnvelopePayload
  heartbeat?: Record<string, never>
  pong?: { nonce: string }
  error?: { fatal: boolean; message: string }
  close?: { reconnect: boolean; retry_after_ms: number; message: string }
}

export type ClientFrame =
  | { hello: { bearer_token: string } }
  | { subscribe_events: Record<string, never> }
  | { ping: { nonce: string } }

export function encodeClientFrame(frame: ClientFrame): Buffer {
  const ClientFrame = getRoot().lookupType('chatto.realtime.v1.RealtimeClientFrame')
  return Buffer.from(ClientFrame.encode(ClientFrame.create(frame as object)).finish())
}

export function decodeServerFrame(buffer: Buffer): ServerFrame {
  const ServerFrame = getRoot().lookupType('chatto.realtime.v1.RealtimeServerFrame')
  const decoded = ServerFrame.decode(buffer)
  return ServerFrame.toObject(decoded, { keepCase: true }) as ServerFrame
}
