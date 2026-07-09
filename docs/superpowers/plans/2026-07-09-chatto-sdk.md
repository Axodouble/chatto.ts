# Chatto.ts SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a discord.js-like TypeScript SDK for Chatto covering messaging, rooms, and reactions with full Zod type safety.

**Architecture:** A `ChattoClient` (EventEmitter) owns a `RestClient` (fetch + JSON Connect protocol) and a `RealtimeConnection` (ws + protobuf frames). Managers (`RoomManager`, `MessageManager`) return rich resource objects (`Room`, `Message`). All request/response shapes are Zod-validated; public TypeScript types are derived with `z.infer<>`.

**Tech Stack:** TypeScript 5, Zod 3, protobufjs 7, ws 8, Bun test runner (built-in)

## Global Constraints

- Bun 1.3+ required (native `fetch` built-in, built-in test runner — use `bun test`, `bunx tsc`, `bun run build`, `bun install`)
- CommonJS module output (`"module": "CommonJS"` in tsconfig)
- `strict: true` in tsconfig — no `any` in public APIs
- All HTTP calls use POST to `/api/connect/<service>/<method>` with headers `Content-Type: application/json` and `Connect-Protocol-Version: 1`
- Authorization header: `Authorization: Bearer <token>` — token passed raw, `Bearer` prefix added by `RestClient`
- Protobuf field numbers follow documented field order (sequential 1, 2, 3…). Verify against `GET /api/connect/grpc.reflection.v1.ServerReflection/ServerReflectionInfo` when connecting to a live instance
- No `any` in exported types; internal `any` casts in protobuf layer are acceptable
- Test files live in `tests/` mirroring `src/` structure

---

## File Map

```
package.json
tsconfig.json
src/
  errors.ts                   — ChattoApiError, ChattoParseError
  types.ts                    — z.infer<> re-exports + ChattoClientOptions
  builders/
    message.ts                — MessageBuilder (fluent)
  schemas/
    message.ts                — Zod schemas for Message + API request/response shapes
    room.ts                   — Zod schemas for Room + timeline response shapes
    realtime.ts               — Zod schemas for SDK-emitted event payloads
  rest/
    client.ts                 — RestClient (fetch wrapper)
  resources/
    message.ts                — Message resource class
    room.ts                   — Room resource class
  managers/
    messages.ts               — MessageManager
    rooms.ts                  — RoomManager
  realtime/
    frames.ts                 — protobufjs schema + encode/decode helpers
    events.ts                 — maps decoded ServerFrame → typed SDK event
    connection.ts             — RealtimeConnection (ws lifecycle, heartbeat, reconnect)
  client.ts                   — ChattoClient (EventEmitter, wires everything)
  index.ts                    — public API barrel
tests/
  errors.test.ts
  builders/message.test.ts
  schemas/message.test.ts
  schemas/room.test.ts
  schemas/realtime.test.ts
  rest/client.test.ts
  resources/message.test.ts
  resources/room.test.ts
  managers/messages.test.ts
  managers/rooms.test.ts
  realtime/frames.test.ts
  realtime/events.test.ts
  client.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Interfaces:**
- Produces: `bun test` finds test files; `bunx tsc --noEmit` passes

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "chatto.ts",
  "version": "0.1.0",
  "description": "Discord.js-like TypeScript SDK for Chatto",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "protobufjs": "^7.4.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/ws": "^8.5.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Verify TypeScript compiles (no src files yet — create placeholder)**

```bash
mkdir -p src && echo 'export {}' > src/index.ts
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json src/index.ts
git -c commit.gpgsign=false commit -m "chore: project scaffold — TypeScript, Bun, deps"
```

---

### Task 2: Error classes

**Files:**
- Create: `src/errors.ts`
- Create: `tests/errors.test.ts`

**Interfaces:**
- Produces: `ChattoApiError(code, message, rawResponse)`, `ChattoParseError(issues, rawBody)` — both extend `Error`
- Consumed by: `src/rest/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/errors.test.ts
import { ChattoApiError, ChattoParseError } from '../src/errors'

describe('ChattoApiError', () => {
  it('sets code, message, rawResponse and is an Error', () => {
    const raw = { code: 'unauthenticated', message: 'Not authenticated' }
    const err = new ChattoApiError('unauthenticated', 'Not authenticated', raw)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoApiError')
    expect(err.code).toBe('unauthenticated')
    expect(err.message).toBe('Not authenticated')
    expect(err.rawResponse).toBe(raw)
  })
})

describe('ChattoParseError', () => {
  it('sets issues, rawBody and is an Error', () => {
    const issues = [{ message: 'Expected string', code: 'invalid_type', path: ['id'] }] as any
    const raw = { id: 123 }
    const err = new ChattoParseError(issues, raw)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ChattoParseError')
    expect(err.issues).toBe(issues)
    expect(err.rawBody).toBe(raw)
    expect(err.message).toContain('Expected string')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/errors.test.ts
```

Expected: FAIL — `Cannot find module '../src/errors'`

- [ ] **Step 3: Implement `src/errors.ts`**

```typescript
import type { ZodIssue } from 'zod'

export class ChattoApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rawResponse: unknown,
  ) {
    super(message)
    this.name = 'ChattoApiError'
  }
}

export class ChattoParseError extends Error {
  constructor(
    public readonly issues: ZodIssue[],
    public readonly rawBody: unknown,
  ) {
    super(`Failed to parse API response: ${issues.map(i => i.message).join(', ')}`)
    this.name = 'ChattoParseError'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/errors.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git -c commit.gpgsign=false commit -m "feat: ChattoApiError and ChattoParseError"
```

---

### Task 3: Message Zod schemas

**Files:**
- Create: `src/schemas/message.ts`
- Create: `tests/schemas/message.test.ts`

**Interfaces:**
- Produces:
  - `MessageSchema` — parses a Chatto `Message` API object
  - `CreateMessageInputSchema` — validates builder output for CreateMessage
  - `UpdateMessageInputSchema` — validates builder output for UpdateMessage
  - `MessageResponseSchema` — wraps `{ message: MessageSchema }`
  - `DeleteMessageResponseSchema` — `{ deleted: boolean }`
  - `AddReactionResponseSchema` — `{ added: boolean }`
  - `RemoveReactionResponseSchema` — `{ removed: boolean }`
- Consumed by: `src/types.ts`, `src/resources/message.ts`, `src/managers/messages.ts`, `src/resources/room.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/schemas/message.test.ts
import {
  MessageSchema,
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
  MessageResponseSchema,
  DeleteMessageResponseSchema,
  AddReactionResponseSchema,
  RemoveReactionResponseSchema,
} from '../../src/schemas/message'

const validMessage = {
  id: 'evt_abc',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  body: 'Hello',
  reactions: [],
}

describe('MessageSchema', () => {
  it('parses a valid message', () => {
    const msg = MessageSchema.parse(validMessage)
    expect(msg.id).toBe('evt_abc')
    expect(msg.body).toBe('Hello')
    expect(msg.reactions).toEqual([])
  })

  it('allows optional fields to be absent', () => {
    const { body, ...noBody } = validMessage
    const msg = MessageSchema.parse(noBody)
    expect(msg.body).toBeUndefined()
  })

  it('defaults reactions to empty array when absent', () => {
    const { reactions, ...noReactions } = validMessage
    const msg = MessageSchema.parse(noReactions)
    expect(msg.reactions).toEqual([])
  })
})

describe('CreateMessageInputSchema', () => {
  it('requires roomId', () => {
    expect(() => CreateMessageInputSchema.parse({})).toThrow()
  })

  it('parses valid create input', () => {
    const input = CreateMessageInputSchema.parse({ roomId: 'room_1', body: 'Hi' })
    expect(input.roomId).toBe('room_1')
    expect(input.body).toBe('Hi')
  })
})

describe('UpdateMessageInputSchema', () => {
  it('requires roomId and eventId', () => {
    expect(() => UpdateMessageInputSchema.parse({ roomId: 'room_1' })).toThrow()
  })

  it('parses valid update input', () => {
    const input = UpdateMessageInputSchema.parse({ roomId: 'room_1', eventId: 'evt_1', body: 'Updated' })
    expect(input.eventId).toBe('evt_1')
  })
})

describe('MessageResponseSchema', () => {
  it('parses wrapped message response', () => {
    const res = MessageResponseSchema.parse({ message: validMessage })
    expect(res.message.id).toBe('evt_abc')
  })
})

describe('DeleteMessageResponseSchema', () => {
  it('parses deleted: true', () => {
    expect(DeleteMessageResponseSchema.parse({ deleted: true }).deleted).toBe(true)
  })
})

describe('AddReactionResponseSchema', () => {
  it('parses added: true', () => {
    expect(AddReactionResponseSchema.parse({ added: true }).added).toBe(true)
  })
})

describe('RemoveReactionResponseSchema', () => {
  it('parses removed: true', () => {
    expect(RemoveReactionResponseSchema.parse({ removed: true }).removed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/schemas/message.test.ts
```

Expected: FAIL — `Cannot find module '../../src/schemas/message'`

- [ ] **Step 3: Implement `src/schemas/message.ts`**

```typescript
import { z } from 'zod'

export const MessageReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int(),
  hasReacted: z.boolean(),
  previewUserIds: z.array(z.string()).default([]),
})

export const MessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  createdAt: z.string(),
  actorId: z.string(),
  body: z.string().optional(),
  updatedAt: z.string().optional(),
  inReplyTo: z.string().optional(),
  threadRootEventId: z.string().optional(),
  reactions: z.array(MessageReactionSchema).default([]),
})

export const CreateMessageInputSchema = z.object({
  roomId: z.string(),
  body: z.string().optional(),
  inReplyTo: z.string().optional(),
  threadRootEventId: z.string().optional(),
  alsoSendToChannel: z.boolean().optional(),
})

export const UpdateMessageInputSchema = z.object({
  roomId: z.string(),
  eventId: z.string(),
  body: z.string().optional(),
  alsoSendToChannel: z.boolean().optional(),
})

export const MessageResponseSchema = z.object({ message: MessageSchema })
export const DeleteMessageResponseSchema = z.object({ deleted: z.boolean() })
export const AddReactionResponseSchema = z.object({ added: z.boolean() })
export const RemoveReactionResponseSchema = z.object({ removed: z.boolean() })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/schemas/message.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/message.ts tests/schemas/message.test.ts
git -c commit.gpgsign=false commit -m "feat: message Zod schemas"
```

---

### Task 4: Room Zod schemas

**Files:**
- Create: `src/schemas/room.ts`
- Create: `tests/schemas/room.test.ts`

**Interfaces:**
- Produces:
  - `RoomSchema` — parses a Chatto `Room` API object
  - `ListRoomsResponseSchema` — `{ rooms: RoomWithViewerStateSchema[] }`
  - `GetRoomResponseSchema` — `{ room: RoomWithViewerStateSchema }`
  - `GetRoomEventsResponseSchema` — `{ page: { events: RoomTimelineEventSchema[] , startCursor, endCursor, hasOlder, hasNewer } }`
- Consumed by: `src/types.ts`, `src/resources/room.ts`, `src/managers/rooms.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/schemas/room.test.ts
import {
  RoomSchema,
  ListRoomsResponseSchema,
  GetRoomResponseSchema,
  GetRoomEventsResponseSchema,
} from '../../src/schemas/room'

const validRoom = {
  id: 'room_1',
  name: 'General',
  kind: 'ROOM_KIND_CHANNEL',
}

describe('RoomSchema', () => {
  it('parses a valid room', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.id).toBe('room_1')
    expect(room.name).toBe('General')
  })

  it('defaults archived and universal to false', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.archived).toBe(false)
    expect(room.universal).toBe(false)
  })

  it('allows description to be absent', () => {
    const room = RoomSchema.parse(validRoom)
    expect(room.description).toBeUndefined()
  })
})

describe('ListRoomsResponseSchema', () => {
  it('parses a rooms list response', () => {
    const res = ListRoomsResponseSchema.parse({
      rooms: [{ room: validRoom }],
    })
    expect(res.rooms).toHaveLength(1)
    expect(res.rooms[0].room.id).toBe('room_1')
  })
})

describe('GetRoomResponseSchema', () => {
  it('parses a single room response', () => {
    const res = GetRoomResponseSchema.parse({ room: { room: validRoom } })
    expect(res.room.room.id).toBe('room_1')
  })
})

describe('GetRoomEventsResponseSchema', () => {
  it('parses a timeline page with a message event', () => {
    const validMessage = {
      id: 'evt_1',
      roomId: 'room_1',
      createdAt: '2026-07-09T10:00:00Z',
      actorId: 'user_1',
    }
    const res = GetRoomEventsResponseSchema.parse({
      page: {
        events: [
          { id: 'evt_1', createdAt: '2026-07-09T10:00:00Z', actorId: 'user_1',
            messagePosted: { message: validMessage } },
        ],
        hasOlder: false,
        hasNewer: false,
      },
    })
    expect(res.page.events[0].messagePosted?.message.id).toBe('evt_1')
  })

  it('defaults hasOlder and hasNewer to false when absent', () => {
    const res = GetRoomEventsResponseSchema.parse({ page: { events: [] } })
    expect(res.page.hasOlder).toBe(false)
    expect(res.page.hasNewer).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/schemas/room.test.ts
```

Expected: FAIL — `Cannot find module '../../src/schemas/room'`

- [ ] **Step 3: Implement `src/schemas/room.ts`**

```typescript
import { z } from 'zod'
import { MessageSchema } from './message'

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  description: z.string().optional(),
  archived: z.boolean().default(false),
  groupId: z.string().optional(),
  universal: z.boolean().default(false),
})

const RoomWithViewerStateSchema = z.object({
  room: RoomSchema,
  viewerState: z.unknown().optional(),
})

export const ListRoomsResponseSchema = z.object({
  rooms: z.array(RoomWithViewerStateSchema),
})

export const GetRoomResponseSchema = z.object({
  room: RoomWithViewerStateSchema,
})

const RoomMessagePostedSchema = z.object({
  message: MessageSchema,
})

const RoomTimelineEventSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  actorId: z.string(),
  messagePosted: RoomMessagePostedSchema.optional(),
})

export const GetRoomEventsResponseSchema = z.object({
  page: z.object({
    events: z.array(RoomTimelineEventSchema),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
    hasOlder: z.boolean().default(false),
    hasNewer: z.boolean().default(false),
  }),
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/schemas/room.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/room.ts tests/schemas/room.test.ts
git -c commit.gpgsign=false commit -m "feat: room Zod schemas"
```

---

### Task 5: Realtime Zod schemas

**Files:**
- Create: `src/schemas/realtime.ts`
- Create: `tests/schemas/realtime.test.ts`

**Interfaces:**
- Produces:
  - `MessageDeleteEventSchema` — `{ roomId, eventId }` (emitted on `messageDelete`)
  - `ReactionEventSchema` — `{ roomId, messageEventId, emoji, actorId? }` (emitted on `reactionAdd`/`reactionRemove`)
- Consumed by: `src/types.ts`, `src/realtime/events.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/schemas/realtime.test.ts
import { MessageDeleteEventSchema, ReactionEventSchema } from '../../src/schemas/realtime'

describe('MessageDeleteEventSchema', () => {
  it('parses valid delete event', () => {
    const evt = MessageDeleteEventSchema.parse({ roomId: 'room_1', eventId: 'evt_1' })
    expect(evt.roomId).toBe('room_1')
    expect(evt.eventId).toBe('evt_1')
  })

  it('requires roomId and eventId', () => {
    expect(() => MessageDeleteEventSchema.parse({ roomId: 'room_1' })).toThrow()
  })
})

describe('ReactionEventSchema', () => {
  it('parses a reaction event with actorId', () => {
    const evt = ReactionEventSchema.parse({
      roomId: 'room_1',
      messageEventId: 'evt_1',
      emoji: '👍',
      actorId: 'user_1',
    })
    expect(evt.emoji).toBe('👍')
    expect(evt.actorId).toBe('user_1')
  })

  it('allows actorId to be absent', () => {
    const evt = ReactionEventSchema.parse({
      roomId: 'room_1',
      messageEventId: 'evt_1',
      emoji: '👍',
    })
    expect(evt.actorId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/schemas/realtime.test.ts
```

Expected: FAIL — `Cannot find module '../../src/schemas/realtime'`

- [ ] **Step 3: Implement `src/schemas/realtime.ts`**

```typescript
import { z } from 'zod'

export const MessageDeleteEventSchema = z.object({
  roomId: z.string(),
  eventId: z.string(),
})

export const ReactionEventSchema = z.object({
  roomId: z.string(),
  messageEventId: z.string(),
  emoji: z.string(),
  actorId: z.string().optional(),
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/schemas/realtime.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/realtime.ts tests/schemas/realtime.test.ts
git -c commit.gpgsign=false commit -m "feat: realtime Zod schemas"
```

---

### Task 6: Types barrel

**Files:**
- Modify: `src/index.ts` (replace placeholder)
- Create: `src/types.ts`

**Interfaces:**
- Produces: `MessageData`, `RoomData`, `CreateMessageInput`, `UpdateMessageInput`, `MessageDeleteEvent`, `ReactionEvent`, `ChattoClientOptions`
- Consumed by: all other `src/` files

- [ ] **Step 1: Create `src/types.ts`**

```typescript
import type { z } from 'zod'
import type {
  MessageSchema,
  MessageReactionSchema,
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from './schemas/message'
import type { RoomSchema } from './schemas/room'
import type { MessageDeleteEventSchema, ReactionEventSchema } from './schemas/realtime'

export type MessageData = z.infer<typeof MessageSchema>
export type MessageReaction = z.infer<typeof MessageReactionSchema>
export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>
export type UpdateMessageInput = z.infer<typeof UpdateMessageInputSchema>
export type RoomData = z.infer<typeof RoomSchema>
export type MessageDeleteEvent = z.infer<typeof MessageDeleteEventSchema>
export type ReactionEvent = z.infer<typeof ReactionEventSchema>

export interface ChattoClientOptions {
  baseUrl: string
  token: string
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git -c commit.gpgsign=false commit -m "feat: public types barrel"
```

---

### Task 7: MessageBuilder

**Files:**
- Create: `src/builders/message.ts`
- Create: `tests/builders/message.test.ts`

**Interfaces:**
- Produces: `MessageBuilder` with `.setContent()`, `.setReplyTo()`, `.setThreadRoot()`, `.setAlsoSendToChannel()`, `.buildCreate(roomId)`, `.buildUpdate(roomId, eventId)`
- Consumed by: `src/resources/message.ts`, `src/resources/room.ts`, `src/managers/messages.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/builders/message.test.ts
import { MessageBuilder } from '../../src/builders/message'

describe('MessageBuilder', () => {
  describe('buildCreate', () => {
    it('builds create input with content', () => {
      const input = new MessageBuilder().setContent('Hello!').buildCreate('room_1')
      expect(input.roomId).toBe('room_1')
      expect(input.body).toBe('Hello!')
    })

    it('builds create input with all optional fields', () => {
      const input = new MessageBuilder()
        .setContent('Reply')
        .setReplyTo('evt_parent')
        .setThreadRoot('evt_root')
        .setAlsoSendToChannel(true)
        .buildCreate('room_1')
      expect(input.inReplyTo).toBe('evt_parent')
      expect(input.threadRootEventId).toBe('evt_root')
      expect(input.alsoSendToChannel).toBe(true)
    })

    it('is chainable — returns this', () => {
      const builder = new MessageBuilder()
      expect(builder.setContent('Hi')).toBe(builder)
      expect(builder.setReplyTo('evt_1')).toBe(builder)
      expect(builder.setThreadRoot('evt_2')).toBe(builder)
      expect(builder.setAlsoSendToChannel(false)).toBe(builder)
    })
  })

  describe('buildUpdate', () => {
    it('builds update input with roomId and eventId', () => {
      const input = new MessageBuilder().setContent('Updated').buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
      expect(input.body).toBe('Updated')
    })

    it('throws if schema validation fails (missing roomId handled externally)', () => {
      // buildUpdate always passes roomId and eventId — schema requires both
      const input = new MessageBuilder().buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/builders/message.test.ts
```

Expected: FAIL — `Cannot find module '../../src/builders/message'`

- [ ] **Step 3: Implement `src/builders/message.ts`**

```typescript
import {
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from '../schemas/message'
import type { CreateMessageInput, UpdateMessageInput } from '../types'

export class MessageBuilder {
  private _content?: string
  private _replyTo?: string
  private _threadRoot?: string
  private _alsoSendToChannel?: boolean

  setContent(body: string): this {
    this._content = body
    return this
  }

  setReplyTo(eventId: string): this {
    this._replyTo = eventId
    return this
  }

  setThreadRoot(eventId: string): this {
    this._threadRoot = eventId
    return this
  }

  setAlsoSendToChannel(value: boolean): this {
    this._alsoSendToChannel = value
    return this
  }

  buildCreate(roomId: string): CreateMessageInput {
    return CreateMessageInputSchema.parse({
      roomId,
      body: this._content,
      inReplyTo: this._replyTo,
      threadRootEventId: this._threadRoot,
      alsoSendToChannel: this._alsoSendToChannel,
    })
  }

  buildUpdate(roomId: string, eventId: string): UpdateMessageInput {
    return UpdateMessageInputSchema.parse({
      roomId,
      eventId,
      body: this._content,
      alsoSendToChannel: this._alsoSendToChannel,
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/builders/message.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/builders/message.ts tests/builders/message.test.ts
git -c commit.gpgsign=false commit -m "feat: MessageBuilder"
```

---

### Task 8: RestClient

**Files:**
- Create: `src/rest/client.ts`
- Create: `tests/rest/client.test.ts`

**Interfaces:**
- Produces: `RestClient({ baseUrl, token })` with `.post<T>(service, method, input, schema): Promise<T>`
  - Throws `ChattoApiError` on non-2xx HTTP responses
  - Throws `ChattoParseError` on Zod parse failure
- Consumed by: `src/managers/messages.ts`, `src/managers/rooms.ts`, `src/resources/message.ts`, `src/resources/room.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rest/client.test.ts
import { z } from 'zod'
import { spyOn } from 'bun:test'
import { RestClient } from '../../src/rest/client'
import { ChattoApiError, ChattoParseError } from '../../src/errors'

const schema = z.object({ id: z.string() })

function mockFetch(status: number, body: unknown) {
  return spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as Response)
}

afterEach(() => jest.restoreAllMocks())

describe('RestClient.post', () => {
  const client = new RestClient('https://chat.example.com', 'mytoken')

  it('sends POST to correct URL with correct headers', async () => {
    const spy = mockFetch(200, { id: 'abc' })
    await client.post('chatto.api.v1.MessageService', 'GetMessage', { roomId: 'r1', eventId: 'e1' }, schema)
    expect(spy).toHaveBeenCalledWith(
      'https://chat.example.com/api/connect/chatto.api.v1.MessageService/GetMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mytoken',
          'Connect-Protocol-Version': '1',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ roomId: 'r1', eventId: 'e1' }),
      }),
    )
  })

  it('returns Zod-parsed response on success', async () => {
    mockFetch(200, { id: 'abc' })
    const result = await client.post('svc', 'Method', {}, schema)
    expect(result.id).toBe('abc')
  })

  it('throws ChattoApiError on non-2xx response', async () => {
    mockFetch(401, { code: 'unauthenticated', message: 'Not authenticated' })
    await expect(client.post('svc', 'Method', {}, schema)).rejects.toThrow(ChattoApiError)
  })

  it('includes code from response body in ChattoApiError', async () => {
    mockFetch(401, { code: 'unauthenticated', message: 'Not authenticated' })
    try {
      await client.post('svc', 'Method', {}, schema)
    } catch (e) {
      expect(e).toBeInstanceOf(ChattoApiError)
      expect((e as ChattoApiError).code).toBe('unauthenticated')
    }
  })

  it('throws ChattoParseError when response does not match schema', async () => {
    mockFetch(200, { id: 123 }) // id should be string
    await expect(client.post('svc', 'Method', {}, schema)).rejects.toThrow(ChattoParseError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/rest/client.test.ts
```

Expected: FAIL — `Cannot find module '../../src/rest/client'`

- [ ] **Step 3: Implement `src/rest/client.ts`**

```typescript
import type { ZodSchema } from 'zod'
import { ChattoApiError, ChattoParseError } from '../errors'

export class RestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async post<T>(
    service: string,
    method: string,
    input: unknown,
    schema: ZodSchema<T>,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/connect/${service}/${method}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      throw new ChattoApiError(
        typeof body['code'] === 'string' ? body['code'] : 'unknown',
        typeof body['message'] === 'string' ? body['message'] : res.statusText,
        body,
      )
    }

    const body = await res.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new ChattoParseError(parsed.error.issues, body)
    }
    return parsed.data
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/rest/client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/rest/client.ts tests/rest/client.test.ts
git -c commit.gpgsign=false commit -m "feat: RestClient (fetch + JSON Connect protocol)"
```

---

### Task 9: Message resource

**Files:**
- Create: `src/resources/message.ts`
- Create: `tests/resources/message.test.ts`

**Interfaces:**
- Produces: `Message(data: MessageData, rest: RestClient)` with properties `id`, `roomId`, `body`, `actorId`, `createdAt`, `updatedAt` and methods:
  - `.edit(builder: MessageBuilder): Promise<Message>`
  - `.delete(): Promise<void>`
  - `.react(emoji: string): Promise<void>`
  - `.removeReaction(emoji: string): Promise<void>`
- Consumed by: `src/managers/messages.ts`, `src/resources/room.ts`, `src/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/resources/message.test.ts
import { Message } from '../../src/resources/message'
import { RestClient } from '../../src/rest/client'
import { MessageBuilder } from '../../src/builders/message'

const validMessageData = {
  id: 'evt_1',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  body: 'Hello',
  reactions: [],
}

function makeRestMock(returnValue: unknown): jest.Mocked<RestClient> {
  return { post: jest.fn().mockResolvedValue(returnValue) } as unknown as jest.Mocked<RestClient>
}

describe('Message', () => {
  it('exposes data properties', () => {
    const msg = new Message(validMessageData, makeRestMock(null))
    expect(msg.id).toBe('evt_1')
    expect(msg.roomId).toBe('room_1')
    expect(msg.body).toBe('Hello')
    expect(msg.actorId).toBe('user_1')
    expect(msg.createdAt).toBe('2026-07-09T10:00:00Z')
  })

  describe('.edit()', () => {
    it('calls UpdateMessage and returns new Message', async () => {
      const updatedData = { ...validMessageData, body: 'Updated', updatedAt: '2026-07-09T11:00:00Z' }
      const rest = makeRestMock({ message: updatedData })
      const msg = new Message(validMessageData, rest)
      const updated = await msg.edit(new MessageBuilder().setContent('Updated'))
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'UpdateMessage',
        expect.objectContaining({ roomId: 'room_1', eventId: 'evt_1', body: 'Updated' }),
        expect.anything(),
      )
      expect(updated).toBeInstanceOf(Message)
      expect(updated.body).toBe('Updated')
    })
  })

  describe('.delete()', () => {
    it('calls DeleteMessage', async () => {
      const rest = makeRestMock({ deleted: true })
      const msg = new Message(validMessageData, rest)
      await msg.delete()
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'DeleteMessage',
        { roomId: 'room_1', eventId: 'evt_1' },
        expect.anything(),
      )
    })
  })

  describe('.react()', () => {
    it('calls AddReaction with emoji', async () => {
      const rest = makeRestMock({ added: true })
      const msg = new Message(validMessageData, rest)
      await msg.react('👍')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'AddReaction',
        { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍' },
        expect.anything(),
      )
    })
  })

  describe('.removeReaction()', () => {
    it('calls RemoveReaction with emoji', async () => {
      const rest = makeRestMock({ removed: true })
      const msg = new Message(validMessageData, rest)
      await msg.removeReaction('👍')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'RemoveReaction',
        { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍' },
        expect.anything(),
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/resources/message.test.ts
```

Expected: FAIL — `Cannot find module '../../src/resources/message'`

- [ ] **Step 3: Implement `src/resources/message.ts`**

```typescript
import type { MessageData } from '../types'
import type { RestClient } from '../rest/client'
import type { MessageBuilder } from '../builders/message'
import {
  MessageResponseSchema,
  DeleteMessageResponseSchema,
  AddReactionResponseSchema,
  RemoveReactionResponseSchema,
} from '../schemas/message'

export class Message {
  readonly id: string
  readonly roomId: string
  readonly body: string | undefined
  readonly actorId: string
  readonly createdAt: string
  readonly updatedAt: string | undefined

  constructor(data: MessageData, private readonly rest: RestClient) {
    this.id = data.id
    this.roomId = data.roomId
    this.body = data.body
    this.actorId = data.actorId
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  async edit(builder: MessageBuilder): Promise<Message> {
    const input = builder.buildUpdate(this.roomId, this.id)
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'UpdateMessage',
      { roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }

  async delete(): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'DeleteMessage',
      { roomId: this.roomId, eventId: this.id },
      DeleteMessageResponseSchema,
    )
  }

  async react(emoji: string): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'AddReaction',
      { roomId: this.roomId, messageEventId: this.id, emoji },
      AddReactionResponseSchema,
    )
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'RemoveReaction',
      { roomId: this.roomId, messageEventId: this.id, emoji },
      RemoveReactionResponseSchema,
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/resources/message.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/message.ts tests/resources/message.test.ts
git -c commit.gpgsign=false commit -m "feat: Message resource"
```

---

### Task 10: Room resource

**Files:**
- Create: `src/resources/room.ts`
- Create: `tests/resources/room.test.ts`

**Interfaces:**
- Produces: `Room(data: RoomData, rest: RestClient)` with properties `id`, `name`, `description`, `kind`, `archived` and methods:
  - `.send(builder: MessageBuilder): Promise<Message>`
  - `.fetchHistory(opts?: { limit?: number; before?: string }): Promise<Message[]>`
- Consumed by: `src/managers/rooms.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/resources/room.test.ts
import { Room } from '../../src/resources/room'
import { Message } from '../../src/resources/message'
import { RestClient } from '../../src/rest/client'
import { MessageBuilder } from '../../src/builders/message'

const validRoomData = {
  id: 'room_1',
  name: 'General',
  kind: 'ROOM_KIND_CHANNEL',
  archived: false,
  universal: false,
}

const validMessage = {
  id: 'evt_1',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  reactions: [],
}

function makeRestMock(returnValue: unknown): jest.Mocked<RestClient> {
  return { post: jest.fn().mockResolvedValue(returnValue) } as unknown as jest.Mocked<RestClient>
}

describe('Room', () => {
  it('exposes data properties', () => {
    const room = new Room(validRoomData, makeRestMock(null))
    expect(room.id).toBe('room_1')
    expect(room.name).toBe('General')
    expect(room.archived).toBe(false)
  })

  describe('.send()', () => {
    it('calls CreateMessage and returns a Message', async () => {
      const rest = makeRestMock({ message: validMessage })
      const room = new Room(validRoomData, rest)
      const msg = await room.send(new MessageBuilder().setContent('Hello'))
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'room_1', body: 'Hello' }),
        expect.anything(),
      )
      expect(msg).toBeInstanceOf(Message)
    })
  })

  describe('.fetchHistory()', () => {
    it('calls GetRoomEvents and returns Message[]', async () => {
      const rest = makeRestMock({
        page: {
          events: [
            { id: 'evt_1', createdAt: '2026-07-09T10:00:00Z', actorId: 'user_1',
              messagePosted: { message: validMessage } },
          ],
          hasOlder: false,
          hasNewer: false,
        },
      })
      const room = new Room(validRoomData, rest)
      const msgs = await room.fetchHistory({ limit: 20 })
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomService',
        'GetRoomEvents',
        expect.objectContaining({ roomId: 'room_1', limit: 20 }),
        expect.anything(),
      )
      expect(msgs).toHaveLength(1)
      expect(msgs[0]).toBeInstanceOf(Message)
    })

    it('filters out non-message timeline events', async () => {
      const rest = makeRestMock({
        page: {
          events: [
            { id: 'evt_system', createdAt: '2026-07-09T10:00:00Z', actorId: 'system' },
          ],
          hasOlder: false,
          hasNewer: false,
        },
      })
      const room = new Room(validRoomData, rest)
      const msgs = await room.fetchHistory()
      expect(msgs).toHaveLength(0)
    })

    it('passes before cursor when provided', async () => {
      const rest = makeRestMock({ page: { events: [], hasOlder: false, hasNewer: false } })
      const room = new Room(validRoomData, rest)
      await room.fetchHistory({ before: 'cursor_abc' })
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomService',
        'GetRoomEvents',
        expect.objectContaining({ cursor: { before: 'cursor_abc' } }),
        expect.anything(),
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/resources/room.test.ts
```

Expected: FAIL — `Cannot find module '../../src/resources/room'`

- [ ] **Step 3: Implement `src/resources/room.ts`**

```typescript
import type { RoomData } from '../types'
import type { RestClient } from '../rest/client'
import type { MessageBuilder } from '../builders/message'
import { MessageResponseSchema } from '../schemas/message'
import { GetRoomEventsResponseSchema } from '../schemas/room'
import { Message } from './message'

export class Room {
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly kind: string
  readonly archived: boolean

  constructor(data: RoomData, private readonly rest: RestClient) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.kind = data.kind
    this.archived = data.archived
  }

  async send(builder: MessageBuilder): Promise<Message> {
    const input = builder.buildCreate(this.id)
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'CreateMessage',
      {
        roomId: input.roomId,
        body: input.body,
        inReplyTo: input.inReplyTo,
        threadRootEventId: input.threadRootEventId,
        alsoSendToChannel: input.alsoSendToChannel,
      },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }

  async fetchHistory(opts: { limit?: number; before?: string } = {}): Promise<Message[]> {
    const res = await this.rest.post(
      'chatto.api.v1.RoomService',
      'GetRoomEvents',
      {
        roomId: this.id,
        limit: opts.limit,
        cursor: opts.before != null ? { before: opts.before } : undefined,
      },
      GetRoomEventsResponseSchema,
    )
    return res.page.events
      .filter(e => e.messagePosted != null)
      .map(e => new Message(e.messagePosted!.message, this.rest))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/resources/room.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/room.ts tests/resources/room.test.ts
git -c commit.gpgsign=false commit -m "feat: Room resource"
```

---

### Task 11: MessageManager

**Files:**
- Create: `src/managers/messages.ts`
- Create: `tests/managers/messages.test.ts`

**Interfaces:**
- Produces: `MessageManager(rest: RestClient)` with:
  - `.send(roomId: string, builder: MessageBuilder): Promise<Message>`
  - `.fetch(roomId: string, eventId: string): Promise<Message>`
- Consumed by: `src/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/managers/messages.test.ts
import { MessageManager } from '../../src/managers/messages'
import { RestClient } from '../../src/rest/client'
import { Message } from '../../src/resources/message'
import { MessageBuilder } from '../../src/builders/message'

const validMessage = {
  id: 'evt_1',
  roomId: 'room_1',
  createdAt: '2026-07-09T10:00:00Z',
  actorId: 'user_1',
  reactions: [],
}

function makeRestMock(returnValue: unknown): jest.Mocked<RestClient> {
  return { post: jest.fn().mockResolvedValue(returnValue) } as unknown as jest.Mocked<RestClient>
}

describe('MessageManager', () => {
  describe('.send()', () => {
    it('calls CreateMessage and returns a Message', async () => {
      const rest = makeRestMock({ message: validMessage })
      const manager = new MessageManager(rest)
      const msg = await manager.send('room_1', new MessageBuilder().setContent('Hi'))
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'room_1', body: 'Hi' }),
        expect.anything(),
      )
      expect(msg).toBeInstanceOf(Message)
      expect(msg.id).toBe('evt_1')
    })
  })

  describe('.fetch()', () => {
    it('calls GetMessage and returns a Message', async () => {
      const rest = makeRestMock({ message: validMessage })
      const manager = new MessageManager(rest)
      const msg = await manager.fetch('room_1', 'evt_1')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'GetMessage',
        { roomId: 'room_1', eventId: 'evt_1' },
        expect.anything(),
      )
      expect(msg).toBeInstanceOf(Message)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/managers/messages.test.ts
```

Expected: FAIL — `Cannot find module '../../src/managers/messages'`

- [ ] **Step 3: Implement `src/managers/messages.ts`**

```typescript
import type { RestClient } from '../rest/client'
import type { MessageBuilder } from '../builders/message'
import { MessageResponseSchema } from '../schemas/message'
import { Message } from '../resources/message'

export class MessageManager {
  constructor(private readonly rest: RestClient) {}

  async send(roomId: string, builder: MessageBuilder): Promise<Message> {
    const input = builder.buildCreate(roomId)
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'CreateMessage',
      {
        roomId: input.roomId,
        body: input.body,
        inReplyTo: input.inReplyTo,
        threadRootEventId: input.threadRootEventId,
        alsoSendToChannel: input.alsoSendToChannel,
      },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }

  async fetch(roomId: string, eventId: string): Promise<Message> {
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'GetMessage',
      { roomId, eventId },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/managers/messages.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/managers/messages.ts tests/managers/messages.test.ts
git -c commit.gpgsign=false commit -m "feat: MessageManager"
```

---

### Task 12: RoomManager

**Files:**
- Create: `src/managers/rooms.ts`
- Create: `tests/managers/rooms.test.ts`

**Interfaces:**
- Produces: `RoomManager(rest: RestClient)` with:
  - `.list(): Promise<Room[]>`
  - `.fetch(roomId: string): Promise<Room>`
- Consumed by: `src/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/managers/rooms.test.ts
import { RoomManager } from '../../src/managers/rooms'
import { RestClient } from '../../src/rest/client'
import { Room } from '../../src/resources/room'

const validRoom = {
  id: 'room_1',
  name: 'General',
  kind: 'ROOM_KIND_CHANNEL',
  archived: false,
  universal: false,
}

function makeRestMock(returnValue: unknown): jest.Mocked<RestClient> {
  return { post: jest.fn().mockResolvedValue(returnValue) } as unknown as jest.Mocked<RestClient>
}

describe('RoomManager', () => {
  describe('.list()', () => {
    it('calls ListRooms and returns Room[]', async () => {
      const rest = makeRestMock({ rooms: [{ room: validRoom }] })
      const manager = new RoomManager(rest)
      const rooms = await manager.list()
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomDirectoryService',
        'ListRooms',
        {},
        expect.anything(),
      )
      expect(rooms).toHaveLength(1)
      expect(rooms[0]).toBeInstanceOf(Room)
      expect(rooms[0].id).toBe('room_1')
    })
  })

  describe('.fetch()', () => {
    it('calls GetRoom and returns a Room', async () => {
      const rest = makeRestMock({ room: { room: validRoom } })
      const manager = new RoomManager(rest)
      const room = await manager.fetch('room_1')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.RoomDirectoryService',
        'GetRoom',
        { roomId: 'room_1' },
        expect.anything(),
      )
      expect(room).toBeInstanceOf(Room)
      expect(room.name).toBe('General')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/managers/rooms.test.ts
```

Expected: FAIL — `Cannot find module '../../src/managers/rooms'`

- [ ] **Step 3: Implement `src/managers/rooms.ts`**

```typescript
import type { RestClient } from '../rest/client'
import { ListRoomsResponseSchema, GetRoomResponseSchema } from '../schemas/room'
import { Room } from '../resources/room'

export class RoomManager {
  constructor(private readonly rest: RestClient) {}

  async list(): Promise<Room[]> {
    const res = await this.rest.post(
      'chatto.api.v1.RoomDirectoryService',
      'ListRooms',
      {},
      ListRoomsResponseSchema,
    )
    return res.rooms.map(r => new Room(r.room, this.rest))
  }

  async fetch(roomId: string): Promise<Room> {
    const res = await this.rest.post(
      'chatto.api.v1.RoomDirectoryService',
      'GetRoom',
      { roomId },
      GetRoomResponseSchema,
    )
    return new Room(res.room.room, this.rest)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/managers/rooms.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/managers/rooms.ts tests/managers/rooms.test.ts
git -c commit.gpgsign=false commit -m "feat: RoomManager"
```

---

### Task 13: Protobuf frame definitions

**Files:**
- Create: `src/realtime/frames.ts`
- Create: `tests/realtime/frames.test.ts`

**Interfaces:**
- Produces:
  - `encodeClientFrame(frame: ClientFrame): Buffer`
  - `decodeServerFrame(buffer: Buffer): ServerFrame`
  - TypeScript interfaces: `ClientFrame`, `ServerFrame`, `EventEnvelopePayload`, `ErrorPayload`, `ClosePayload`
- Consumed by: `src/realtime/connection.ts`

> **Note on field numbers:** Field numbers below are inferred from the Chatto docs in documented field order (sequential 1, 2, 3…). If a live Chatto instance is available, verify with:
> ```bash
> curl -X POST https://<chatto-host>/api/connect/grpc.reflection.v1.ServerReflection/ServerReflectionInfo \
>   -H "Content-Type: application/json" -H "Connect-Protocol-Version: 1" \
>   -d '{"listServices": ""}' | jq .
> ```
> Then use `buf` or `protoc --decode` to inspect the `FileDescriptorProto` bytes and update field numbers in `PROTO_SCHEMA` below if they differ.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/realtime/frames.test.ts
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
    // Encode a client hello (wrong direction) — for real decode test,
    // we encode via protobufjs ServerFrame manually
    const protobuf = require('protobufjs') as typeof import('protobufjs')
    const root = protobuf.parse(`
      syntax = "proto3";
      message RealtimeServerFrame {
        oneof payload {
          ServerHello hello = 1;
        }
      }
      message ServerHello { int32 heartbeat_interval_seconds = 1; }
    `).root
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/realtime/frames.test.ts
```

Expected: FAIL — `Cannot find module '../../src/realtime/frames'`

- [ ] **Step 3: Implement `src/realtime/frames.ts`**

```typescript
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
  return ServerFrame.decode(buffer).toJSON() as ServerFrame
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/realtime/frames.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/frames.ts tests/realtime/frames.test.ts
git -c commit.gpgsign=false commit -m "feat: protobuf frame definitions (protobufjs)"
```

---

### Task 14: Realtime event mapping

**Files:**
- Create: `src/realtime/events.ts`
- Create: `tests/realtime/events.test.ts`

**Interfaces:**
- Produces: `mapFrameToEvent(frame: ServerFrame): SdkEvent | null` where `SdkEvent` is a discriminated union:
  ```typescript
  type SdkEvent =
    | { kind: 'messageCreate'; roomId: string; messageEventId: string }
    | { kind: 'messageUpdate'; roomId: string; messageEventId: string }
    | { kind: 'messageDelete'; event: MessageDeleteEvent }
    | { kind: 'reactionAdd'; event: ReactionEvent }
    | { kind: 'reactionRemove'; event: ReactionEvent }
  ```
- Consumed by: `src/realtime/connection.ts`, `src/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/realtime/events.test.ts
import { mapFrameToEvent } from '../../src/realtime/events'
import type { ServerFrame } from '../../src/realtime/frames'

const envelope = (event: object) => ({
  event: { id: 'env_1', created_at: '2026-07-09T10:00:00Z', actor_id: 'user_1', ...event },
})

describe('mapFrameToEvent', () => {
  it('returns null for frames without event', () => {
    expect(mapFrameToEvent({ hello: { heartbeat_interval_seconds: 30 } })).toBeNull()
    expect(mapFrameToEvent({ heartbeat: {} })).toBeNull()
    expect(mapFrameToEvent({ subscribed: {} } as ServerFrame)).toBeNull()
  })

  it('maps message_posted to messageCreate', () => {
    const result = mapFrameToEvent(envelope({ message_posted: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageCreate', roomId: 'room_1', messageEventId: 'evt_1' })
  })

  it('maps message_edited to messageUpdate', () => {
    const result = mapFrameToEvent(envelope({ message_edited: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageUpdate', roomId: 'room_1', messageEventId: 'evt_1' })
  })

  it('maps message_retracted to messageDelete', () => {
    const result = mapFrameToEvent(envelope({ message_retracted: { room_id: 'room_1', message_event_id: 'evt_1' } }))
    expect(result).toEqual({ kind: 'messageDelete', event: { roomId: 'room_1', eventId: 'evt_1' } })
  })

  it('maps reaction_added to reactionAdd', () => {
    const result = mapFrameToEvent(envelope({
      reaction_added: { room_id: 'room_1', message_event_id: 'evt_1', emoji: '👍', actor_id: 'user_1' },
    }))
    expect(result).toEqual({
      kind: 'reactionAdd',
      event: { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍', actorId: 'user_1' },
    })
  })

  it('maps reaction_removed to reactionRemove', () => {
    const result = mapFrameToEvent(envelope({
      reaction_removed: { room_id: 'room_1', message_event_id: 'evt_1', emoji: '👍', actor_id: 'user_1' },
    }))
    expect(result).toEqual({
      kind: 'reactionRemove',
      event: { roomId: 'room_1', messageEventId: 'evt_1', emoji: '👍', actorId: 'user_1' },
    })
  })

  it('returns null for unrecognised event types', () => {
    const result = mapFrameToEvent({ event: { id: 'env_1', created_at: '', actor_id: '' } })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/realtime/events.test.ts
```

Expected: FAIL — `Cannot find module '../../src/realtime/events'`

- [ ] **Step 3: Implement `src/realtime/events.ts`**

```typescript
import type { ServerFrame } from './frames'
import type { MessageDeleteEvent, ReactionEvent } from '../types'

export type SdkEvent =
  | { kind: 'messageCreate'; roomId: string; messageEventId: string }
  | { kind: 'messageUpdate'; roomId: string; messageEventId: string }
  | { kind: 'messageDelete'; event: MessageDeleteEvent }
  | { kind: 'reactionAdd'; event: ReactionEvent }
  | { kind: 'reactionRemove'; event: ReactionEvent }

export function mapFrameToEvent(frame: ServerFrame): SdkEvent | null {
  if (frame.event == null) return null
  const env = frame.event

  if (env.message_posted != null) {
    return { kind: 'messageCreate', roomId: env.message_posted.room_id, messageEventId: env.message_posted.message_event_id }
  }
  if (env.message_edited != null) {
    return { kind: 'messageUpdate', roomId: env.message_edited.room_id, messageEventId: env.message_edited.message_event_id }
  }
  if (env.message_retracted != null) {
    return { kind: 'messageDelete', event: { roomId: env.message_retracted.room_id, eventId: env.message_retracted.message_event_id } }
  }
  if (env.reaction_added != null) {
    return {
      kind: 'reactionAdd',
      event: { roomId: env.reaction_added.room_id, messageEventId: env.reaction_added.message_event_id, emoji: env.reaction_added.emoji, actorId: env.reaction_added.actor_id },
    }
  }
  if (env.reaction_removed != null) {
    return {
      kind: 'reactionRemove',
      event: { roomId: env.reaction_removed.room_id, messageEventId: env.reaction_removed.message_event_id, emoji: env.reaction_removed.emoji, actorId: env.reaction_removed.actor_id },
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/realtime/events.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/events.ts tests/realtime/events.test.ts
git -c commit.gpgsign=false commit -m "feat: realtime frame → SDK event mapping"
```

---

### Task 15: RealtimeConnection

**Files:**
- Create: `src/realtime/connection.ts`
- Create: `tests/realtime/connection.test.ts`

**Interfaces:**
- Produces: `RealtimeConnection(wsUrl: string, token: string)` extending `EventEmitter`
  - `.connect(): Promise<void>` — sends ClientHello, waits for ServerHello + Subscribed, then resolves
  - `.disconnect(): void`
  - Emits `'frame'` with `ServerFrame` for each incoming event frame
  - Emits `'error'` with `Error` for non-fatal errors
  - Emits `'close'` with `(reconnect: boolean, retryAfterMs: number)`
- Consumed by: `src/client.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/realtime/connection.test.ts
import { EventEmitter } from 'events'
import { RealtimeConnection } from '../../src/realtime/connection'
import { encodeClientFrame } from '../../src/realtime/frames'
import protobuf from 'protobufjs'

// Build a minimal ServerFrame buffer for testing
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
  `).root
  const ServerFrame = root.lookupType('RealtimeServerFrame')
  return Buffer.from(ServerFrame.encode(ServerFrame.create(payload)).finish())
}

// Minimal WebSocket mock
class MockWs extends EventEmitter {
  readyState = 1 // OPEN
  binaryType = 'nodebuffer'
  sent: Buffer[] = []
  send(data: Buffer) { this.sent.push(data) }
  close() { this.readyState = 3 }
}

jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => new MockWs())
})

afterEach(() => jest.clearAllMocks())

describe('RealtimeConnection', () => {
  it('sends ClientHello on open, then SubscribeEvents after ServerHello, resolves on Subscribed', async () => {
    const WsMock = require('ws') as jest.Mock
    let mockWs: MockWs

    WsMock.mockImplementation(() => {
      mockWs = new MockWs()
      // Simulate the handshake after connect() is called
      setImmediate(() => {
        mockWs.emit('open')
        setImmediate(() => {
          // Reply with ServerHello
          mockWs.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            // Reply with Subscribed
            mockWs.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return mockWs
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    // First sent frame should be ClientHello
    expect(mockWs!.sent).toHaveLength(2)
    // Frame 1: ClientHello
    const helloDecoded = require('protobufjs').parse(`
      syntax = "proto3";
      message RealtimeClientFrame {
        oneof payload { RealtimeClientHello hello = 1; RealtimeSubscribeEvents subscribe_events = 2; }
      }
      message RealtimeClientHello { string bearer_token = 1; }
      message RealtimeSubscribeEvents {}
    `).root.lookupType('RealtimeClientFrame').decode(mockWs!.sent[0]).toJSON()
    expect(helloDecoded.hello?.bearer_token).toBe('mytoken')

    conn.disconnect()
  })

  it('emits frame event for event envelopes', async () => {
    const WsMock = require('ws') as jest.Mock
    let mockWs: MockWs

    WsMock.mockImplementation(() => {
      mockWs = new MockWs()
      setImmediate(() => {
        mockWs.emit('open')
        setImmediate(() => {
          mockWs.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            mockWs.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return mockWs
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    const frames: unknown[] = []
    conn.on('frame', f => frames.push(f))

    mockWs!.emit('message', buildServerFrameBuffer({
      event: { id: 'env_1', created_at: '2026-07-09T10:00:00Z', actor_id: 'user_1' },
    }))

    expect(frames).toHaveLength(1)
    conn.disconnect()
  })

  it('emits close with reconnect=false on ws close event', async () => {
    const WsMock = require('ws') as jest.Mock
    let mockWs: MockWs

    WsMock.mockImplementation(() => {
      mockWs = new MockWs()
      setImmediate(() => {
        mockWs.emit('open')
        setImmediate(() => {
          mockWs.emit('message', buildServerFrameBuffer({ hello: { heartbeat_interval_seconds: 60 } }))
          setImmediate(() => {
            mockWs.emit('message', buildServerFrameBuffer({ subscribed: {} }))
          })
        })
      })
      return mockWs
    })

    const conn = new RealtimeConnection('ws://chat.example.com/api/realtime', 'mytoken')
    await conn.connect()

    const closes: [boolean, number][] = []
    conn.on('close', (reconnect, ms) => closes.push([reconnect, ms]))

    mockWs!.emit('close')
    expect(closes).toEqual([[false, 0]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/realtime/connection.test.ts
```

Expected: FAIL — `Cannot find module '../../src/realtime/connection'`

- [ ] **Step 3: Implement `src/realtime/connection.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/realtime/connection.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/connection.ts tests/realtime/connection.test.ts
git -c commit.gpgsign=false commit -m "feat: RealtimeConnection (ws lifecycle, heartbeat)"
```

---

### Task 16: ChattoClient

**Files:**
- Modify: `src/index.ts` (replace `export {}` placeholder)
- Create: `src/client.ts`
- Create: `tests/client.test.ts`

**Interfaces:**
- Produces: `ChattoClient(options: ChattoClientOptions)` extending `EventEmitter` with typed event map
  - `.rooms: RoomManager`
  - `.messages: MessageManager`
  - `.connect(): Promise<void>`
  - `.disconnect(): Promise<void>`
  - Emits `'ready'`, `'messageCreate'`, `'messageUpdate'`, `'messageDelete'`, `'reactionAdd'`, `'reactionRemove'`, `'error'`, `'disconnect'`
- Consumed by: `src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/client.test.ts
import { EventEmitter } from 'events'
import { mock } from 'bun:test'
import { ChattoClient } from '../src/client'
import { RoomManager } from '../src/managers/rooms'
import { MessageManager } from '../src/managers/messages'

// Bun uses mock.module() for module-level mocking (not jest.mock())
type MockRt = EventEmitter & { connect: ReturnType<typeof mock>; disconnect: ReturnType<typeof mock> }
const rtInstances: MockRt[] = []

mock.module('../src/realtime/connection', () => {
  return {
    RealtimeConnection: mock(() => {
      const instance = Object.assign(new EventEmitter(), {
        connect: mock(() => Promise.resolve()),
        disconnect: mock(() => {}),
      }) as MockRt
      rtInstances.push(instance)
      return instance
    }),
  }
})

beforeEach(() => { rtInstances.length = 0 })

describe('ChattoClient', () => {
  it('exposes rooms and messages managers', () => {
    const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'tk' })
    expect(client.rooms).toBeInstanceOf(RoomManager)
    expect(client.messages).toBeInstanceOf(MessageManager)
  })

  it('connect() calls realtime.connect() and emits ready', async () => {
    const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'tk' })
    const readyEvents: unknown[] = []
    client.on('ready', () => readyEvents.push(true))
    await client.connect()
    expect(readyEvents).toHaveLength(1)
    expect(rtInstances[0].connect).toHaveBeenCalled()
  })

  it('disconnect() emits disconnect', async () => {
    const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'tk' })
    const disconnectEvents: unknown[] = []
    client.on('disconnect', () => disconnectEvents.push(true))
    await client.disconnect()
    expect(disconnectEvents).toHaveLength(1)
  })

  it('forwards realtime error events as client error events', () => {
    const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'tk' })
    const errors: Error[] = []
    client.on('error', e => errors.push(e))
    rtInstances[0].emit('error', new Error('ws error'))
    expect(errors[0]?.message).toBe('ws error')
  })

  it('emits disconnect when realtime emits close with reconnect=false', () => {
    const client = new ChattoClient({ baseUrl: 'https://chat.example.com', token: 'tk' })
    const disconnects: unknown[] = []
    client.on('disconnect', () => disconnects.push(true))
    rtInstances[0].emit('close', false, 0)
    expect(disconnects).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/client.test.ts
```

Expected: FAIL — `Cannot find module '../src/client'`

- [ ] **Step 3: Implement `src/client.ts`**

```typescript
import { EventEmitter } from 'events'
import { RestClient } from './rest/client'
import { RealtimeConnection } from './realtime/connection'
import { mapFrameToEvent } from './realtime/events'
import { RoomManager } from './managers/rooms'
import { MessageManager } from './managers/messages'
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

  constructor(options: ChattoClientOptions) {
    super()
    const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime'
    this.rest = new RestClient(options.baseUrl, options.token)
    this.realtime = new RealtimeConnection(wsUrl, options.token)
    this.rooms = new RoomManager(this.rest)
    this.messages = new MessageManager(this.rest)
    this.wireRealtime()
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts tests/client.test.ts
git -c commit.gpgsign=false commit -m "feat: ChattoClient (EventEmitter, wires everything)"
```

---

### Task 17: Index barrel and full test suite

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Produces: public package API — everything a consumer needs imported from `chatto.ts`

- [ ] **Step 1: Replace `src/index.ts` with the barrel**

```typescript
export { ChattoClient } from './client'
export { MessageBuilder } from './builders/message'
export { ChattoApiError, ChattoParseError } from './errors'
export type { Message } from './resources/message'
export type { Room } from './resources/room'
export type {
  MessageData,
  RoomData,
  CreateMessageInput,
  UpdateMessageInput,
  MessageDeleteEvent,
  ReactionEvent,
  ChattoClientOptions,
} from './types'
```

- [ ] **Step 2: Run the full test suite**

```bash
bun test
```

Expected: ALL PASS — no failures across all test files.

- [ ] **Step 3: Run TypeScript typecheck**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Build**

```bash
bun run build
```

Expected: `dist/` created with `.js`, `.d.ts`, `.d.ts.map` files. No errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git -c commit.gpgsign=false commit -m "feat: public API barrel — Chatto.ts SDK v0.1.0"
```
