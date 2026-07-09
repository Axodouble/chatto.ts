# Chatto.ts SDK Design

**Date:** 2026-07-09  
**Scope:** discord.js-like client SDK for Chatto — messaging, rooms, reactions  
**Runtime:** Node.js 18+  
**Transport:** Fetch + JSON Connect protocol (HTTP), `ws` + `@bufbuild/protobuf` (WebSocket)

---

## Overview

A type-safe, discord.js-inspired TypeScript SDK for Chatto. Users instantiate a `ChattoClient`, call `.connect()`, listen for events, and interact with rooms/messages through rich resource objects and a fluent builder API. Zod is the single source of truth for all types — no code generation, no build pipeline.

---

## Architecture

Six layers, each with a single responsibility:

```
src/
  client.ts              # ChattoClient — EventEmitter, top-level entry point
  rest/
    client.ts            # RestClient — fetch wrapper, JSON Connect protocol
  realtime/
    connection.ts        # RealtimeConnection — ws lifecycle, heartbeat, reconnect
    frames.ts            # @bufbuild/protobuf message definitions (8 frame types)
    events.ts            # Maps raw frames → typed SDK events
  managers/
    rooms.ts             # RoomManager — list, fetch
    messages.ts          # MessageManager — send, fetch, edit, delete
  resources/
    room.ts              # Room — rich object with .send(), .fetchHistory()
    message.ts           # Message — .edit(), .delete(), .react(), .removeReaction()
  builders/
    message.ts           # MessageBuilder — fluent builder for send/edit payloads
  schemas/
    message.ts           # Zod schemas for Message resource + API shapes
    room.ts              # Zod schemas for Room resource
    realtime.ts          # Zod discriminated union over realtime event types
  types.ts               # z.infer<> re-exports — the public TypeScript types
  index.ts               # Public API barrel
```

`ChattoClient` owns a `RestClient` and a `RealtimeConnection`. Managers are properties on the client (`client.rooms`, `client.messages`). Resource objects hold a back-reference to the client so they can make further API calls.

---

## Public API

```typescript
// Connection
const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'xxx' })
await client.connect()    // wires up WebSocket + auth, emits 'ready' when subscribed
await client.disconnect() // graceful close

// Events
client.on('ready', () => {})
client.on('messageCreate', (message: Message) => {})
client.on('messageUpdate', (message: Message) => {})
client.on('messageDelete', ({ roomId, eventId }: MessageDeleteEvent) => {})
client.on('reactionAdd', (event: ReactionEvent) => {})
client.on('reactionRemove', (event: ReactionEvent) => {})
client.on('error', (err: Error) => {})
client.on('disconnect', () => {})

// Rooms
const rooms: Room[]       = await client.rooms.list()
const room: Room          = await client.rooms.fetch(roomId)
const msgs: Message[]     = await room.fetchHistory({ limit?: number, before?: string })
const msg = await room.send(new MessageBuilder().setContent('Hello!'))

// Messages
const msg = await client.messages.send(roomId, new MessageBuilder().setContent('Hi'))
const msg = await client.messages.fetch(roomId, eventId)
await msg.edit(new MessageBuilder().setContent('Updated'))
await msg.delete()
await msg.react('👍')
await msg.removeReaction('👍')

// Builder
new MessageBuilder()
  .setContent('Hello!')
  .setReplyTo(eventId)
  .setThreadRoot(eventId)
  .setAlsoSendToChannel(true)
```

---

## Data Flow

### HTTP Calls

```
user code
  → Manager/Resource method
  → RestClient.post(service, method, Zod-validated input)
  → fetch POST /api/connect/<service>/<method>
      headers: Authorization: Bearer <token>, Connect-Protocol-Version: 1
  → JSON response
  → Zod.parse(responseSchema, body) → typed resource
  → returned to user
```

### Realtime Events

```
WebSocket binary frame
  → RealtimeConnection receives raw Buffer
  → @bufbuild/protobuf decodes → RealtimeServerFrame (oneof)
  → connection.ts dispatches to events.ts
  → events.ts maps frame to SDK event, fetches full resource via REST if needed
      (e.g. message_posted → client.messages.fetch(roomId, eventId))
  → ChattoClient.emit('messageCreate', message)
  → user's .on() handler
```

Chatto's realtime events are invalidation signals — they carry IDs, not full payloads. The SDK hydrates full resource objects before emitting to user code, so event handlers always receive the same types as direct fetch calls.

### Reconnection

`RealtimeConnection` tracks `reconnect` and `retry_after_ms` from `RealtimeClose` frames. On unexpected disconnection it backs off and re-runs the full hello/subscribe handshake. If `reconnect: false`, it emits `'disconnect'` and stops.

---

## WebSocket Protocol

Ten `@bufbuild/protobuf` message types cover the full realtime protocol:

**Client → Server:**
- `RealtimeClientHello` — first frame, carries `bearer_token`
- `RealtimeSubscribeEvents` — activates the live-event stream
- `RealtimePing` — keepalive with nonce

**Server → Client:**
- `RealtimeServerHello` — confirms version, provides `heartbeat_interval_seconds`
- `RealtimeSubscribed` — confirms stream is active
- `RealtimeEventEnvelope` — event payload with `id`, `created_at`, `actor_id`, typed oneof
- `RealtimePong` — echoes ping nonce
- `RealtimeHeartbeat` — periodic server keepalive
- `RealtimeError` — carries `fatal` flag
- `RealtimeClose` — carries `reconnect` flag and `retry_after_ms`

Field numbers are resolved from Chatto's gRPC reflection endpoint at dev time:
`/api/connect/grpc.reflection.v1.ServerReflection/ServerReflectionInfo`

---

## Zod Schemas

Every API boundary has a Zod schema:

- `MessageSchema` — parses a Chatto message object (id, roomId, body, authorId, createdAt, etc.)
- `RoomSchema` — parses a Chatto room object (id, name, description, etc.)
- `CreateMessageInputSchema` — validates `MessageBuilder` output before sending
- `UpdateMessageInputSchema` — validates edit payloads
- `RealtimeEventSchema` — discriminated union over all realtime event payload types

All public TypeScript types are derived with `z.infer<>` and re-exported from `types.ts`.

---

## Error Handling

Two custom error classes:

- **`ChattoApiError`** — thrown on HTTP error responses. Fields: `code` (Connect error code string e.g. `"unauthenticated"`), `message`, `rawResponse`.
- **`ChattoParseError`** — thrown when Zod fails to parse an API response. Fields: `issues` (ZodIssue[]), `rawBody`.

WebSocket behaviour:
- Non-fatal errors → emit `'error'` on client, connection continues
- Fatal `RealtimeError` (fatal: true) → emit `'error'` then attempt reconnect
- `RealtimeClose` with `reconnect: false` → emit `'disconnect'`, stop

Hydration failures (follow-up GET after realtime event fails) → emit `'error'`, drop the event. No partial resource objects reach user code.

---

## Dependencies

```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "@bufbuild/protobuf": "^2.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "typescript": "^5.5.0"
  }
}
```

Node.js 18+ required (native `fetch`). No ConnectRPC packages — JSON-over-HTTP Connect protocol is handled with raw fetch.
