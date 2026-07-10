# Generated Connect-ES Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written Connect transport (`RestClient`) and hand-written request/response Zod schemas with generated, statically-typed Connect-ES clients codegen'd from vendored Chatto protos, keeping the Discord.js-like ergonomic layer unchanged.

**Architecture:** Vendor the `chattocorp/chatto` buf module under `proto/`, generate Protobuf-ES v2 message + service code into `src/gen/` (committed). A single Connect transport (with a Bearer-auth interceptor + `ConnectError`→`ChattoApiError` mapping) backs typed service clients held on `ChattoContext`. A thin mapping layer converts generated proto messages into the SDK's existing plain domain shapes (`MessageData`/`DirectoryMemberData`/`RoomData`), so managers, resources, and hydration keep their current behavior. Realtime frames and login stay untouched.

**Tech Stack:** TypeScript, Bun (test runner), buf v2, `@bufbuild/protobuf` v2, `@bufbuild/protoc-gen-es` v2, `@connectrpc/connect` + `@connectrpc/connect-web`.

## Global Constraints

- Runtime deps to add: `@bufbuild/protobuf`, `@connectrpc/connect`, `@connectrpc/connect-web`. Dev deps to add: `@bufbuild/buf`, `@bufbuild/protoc-gen-es`.
- Generated code lives in `src/gen/` and IS committed. `bun test`, `tsc --noEmit`, and `tsc` (build) must never require running `buf`.
- Public SDK surface (exports, method names, resource properties, event names) must not change. Resource property types stay identical: `Message.createdAt: string` (ISO 8601), `Message.content: string | undefined`, `User.presenceStatus: string` (proto enum name e.g. `PRESENCE_STATUS_ONLINE`), etc.
- Transport base URL keeps today's shape: requests go to `{baseUrl}/api/connect/{fully.qualified.Service}/{Method}`.
- Thrown errors seen by consumers stay the same types: `ChattoApiError(code, message, raw)` for API failures.
- Out of scope, do not modify: `src/realtime/**` (incl. `src/schemas/realtime.ts`), `src/auth/integrated.ts` (login stays a plain REST call).
- Bun is the test runner; tests use `bun:test` (`describe/it/expect/mock`). Run a single file with `bun test tests/path/file.test.ts`.
- After each task: run `bunx tsc --noEmit` and the task's tests; both must pass before committing.

## Confirmed proto facts (source of truth for this plan)

From `chattocorp/chatto` `main`, module root `proto/`:

- **`chatto.api.v1.MessageService`** (`chatto/api/v1/messages.proto`): `CreateMessage(CreateMessageRequest)→CreateMessageResponse{ Message message = 1 }`; `GetMessage(GetMessageRequest)→GetMessageResponse{ Message message = 1 }`; `UpdateMessage(UpdateMessageRequest)→UpdateMessageResponse{ Message message = 2 }`; `DeleteMessage→DeleteMessageResponse{ bool deleted }`; `AddReaction→AddReactionResponse`; `RemoveReaction→RemoveReactionResponse`.
- **`chatto.api.v1.UserService`** (`chatto/api/v1/member_directory.proto`): `GetUser(GetUserRequest{ oneof target { string user_id=1; string login=2 } })→GetUserResponse{ DirectoryMember user = 1 }`; `BatchGetUsers(BatchGetUsersRequest{ repeated string user_ids })→BatchGetUsersResponse{ repeated DirectoryMember users }`; `ListUsers(ListUsersRequest)→ListUsersResponse{ repeated DirectoryMember users }`.
- **`chatto.api.v1.RoomDirectoryService`** (`chatto/api/v1/room_directory.proto`): `ListRooms(ListRoomsRequest)→ListRoomsResponse{ repeated RoomWithViewerState rooms }`; `GetRoom(GetRoomRequest)→GetRoomResponse{ RoomWithViewerState room }`. `RoomWithViewerState{ Room room = 1; RoomViewerState viewer_state = 14 }`.
- **`chatto.api.v1.RoomService`** (`chatto/api/v1/rooms.proto`): `GetRoomEvents(GetRoomEventsRequest)→GetRoomEventsResponse` (defined in `chatto/api/v1/room_timeline.proto`, `GetRoomEventsRequest{ ... oneof cursor { string before=3; string after=... } }`, response wraps a `RoomTimelinePage`).
- **`Message`** (`chatto/api/v1/message_types.proto`): `string id=1; string room_id=2; google.protobuf.Timestamp created_at=3; string actor_id=4; optional string body=5; repeated MessageAttachment attachments=6; google.protobuf.Timestamp updated_at=8; string in_reply_to=9; string thread_root_event_id=10; ...`. `MessageReaction{ string emoji=1; int32 count=2; bool has_reacted=3; repeated string preview_user_ids=4 }`.
- **`DirectoryMember`** (`chatto/api/v1/member_directory.proto`): `{ User user; repeated string roles; google.protobuf.Timestamp created_at (optional) }`. **`User`** (`chatto/api/v1/users.proto`): `string id=1; string login=2; string display_name=3; bool deleted=4; optional string avatar_url=5; PresenceStatus presence_status=6; CustomUserStatus custom_status=7`.
- **`Room`** (`chatto/api/v1/rooms.proto`): `string id=1; RoomKind kind=2; string name=3; string description=4; bool archived=5; string group_id=6; bool universal=7`. `enum RoomKind { ROOM_KIND_UNSPECIFIED=0; ROOM_KIND_CHANNEL=1; ROOM_KIND_DM=2 }`.
- **`enum PresenceStatus`** (`chatto/api/v1/users.proto`): `PRESENCE_STATUS_UNSPECIFIED=0, PRESENCE_STATUS_ONLINE=1, PRESENCE_STATUS_AWAY=2, PRESENCE_STATUS_DO_NOT_DISTURB=3, PRESENCE_STATUS_OFFLINE=4`.
- Module has one BSR dep: `buf.build/bufbuild/protovalidate` (protos `import "buf/validate/validate.proto"`).

Protobuf-ES v2 naming: RPC `CreateMessage` → client method `createMessage`; proto field `room_id` → JS `roomId`; proto message `Message` in `messages_pb`/`message_types_pb` → TS type `Message`; `google.protobuf.Timestamp` field → a `Timestamp` object (NOT a string); a proto3 `optional` scalar → `T | undefined`; a non-`optional` proto3 scalar → always present (`""`/`0`); a singular message field → `T | undefined`; an enum → a numeric enum value.

---

## File Structure

- `proto/` — vendored buf module (protos + `buf.yaml`, `buf.lock`, `buf.gen.yaml`). New.
- `src/gen/**` — generated Protobuf-ES v2 code (committed). New.
- `src/rest/transport.ts` — builds the Connect transport (auth interceptor + error mapping) and the typed service clients. New. Replaces `src/rest/client.ts`.
- `src/rest/mappers.ts` — proto message → domain shape converters. New.
- `src/types.ts` — domain shapes become plain interfaces (decoupled from deleted Zod schemas). Modified.
- `src/context.ts` — holds typed clients instead of `RestClient`. Modified.
- `src/client.ts` — builds the transport, passes it to `ChattoContext`. Modified.
- `src/managers/{messages,users,rooms}.ts` — call typed clients + mappers. Modified.
- `src/resources/{message,room}.ts` — call typed clients + mappers. Modified.
- Deleted: `src/rest/client.ts`, `src/schemas/message.ts`, `src/schemas/user.ts`, `src/schemas/room.ts`, and their tests `tests/rest/client.test.ts`, `tests/schemas/{message,user,room}.test.ts`.
- Kept as-is: `src/realtime/**`, `src/schemas/realtime.ts`, `tests/schemas/realtime.test.ts`, `src/auth/integrated.ts`, `tests/auth/integrated.test.ts`.

---

## Task 1: Vendor protos, toolchain, and codegen

**Files:**
- Create: `proto/buf.yaml`, `proto/buf.gen.yaml`, `proto/buf.lock`, `proto/chatto/api/v1/*.proto` (the import closure)
- Modify: `package.json` (deps + `generate` script), `.gitignore` (if it excludes `dist`-like patterns, ensure `src/gen` is NOT ignored)
- Create (generated, committed): `src/gen/**`

**Interfaces:**
- Produces: generated modules importable as `../gen/chatto/api/v1/messages_pb`, `.../member_directory_pb`, `.../room_directory_pb`, `.../rooms_pb`, `.../room_timeline_pb`, `.../message_types_pb`, `.../users_pb`. Each service file exports its `GenService` (e.g. `MessageService`, `UserService`, `RoomDirectoryService`, `RoomService`) and message descriptors/types (`Message`, `DirectoryMember`, `Room`, `RoomWithViewerState`, request/response types).

- [ ] **Step 1: Add dependencies**

Run:
```bash
bun add @bufbuild/protobuf @connectrpc/connect @connectrpc/connect-web
bun add -d @bufbuild/buf @bufbuild/protoc-gen-es
```

- [ ] **Step 2: Add the `generate` script to `package.json`**

Add to `"scripts"`:
```json
"generate": "buf generate",
```

- [ ] **Step 3: Vendor the protos from chattocorp/chatto**

Fetch the buf config and the proto import closure into `proto/`. The closure for the four services is resolved by buf; fetch the known roots and their imports, preserving package paths (`proto/chatto/api/v1/<file>.proto`). Known files to fetch (add any buf reports missing in Step 5):
```bash
mkdir -p proto/chatto/api/v1
base="https://raw.githubusercontent.com/chattocorp/chatto/main/proto/chatto/api/v1"
for f in common pagination message_types reactions link_previews messages \
         users member_directory rooms room_timeline room_directory; do
  curl -sf "$base/$f.proto" -o "proto/chatto/api/v1/$f.proto"
done
# buf module config + lock (pins the protovalidate BSR dep)
curl -sf "https://raw.githubusercontent.com/chattocorp/chatto/main/proto/buf.yaml" -o proto/buf.yaml
curl -sf "https://raw.githubusercontent.com/chattocorp/chatto/main/proto/buf.lock" -o proto/buf.lock
```

- [ ] **Step 4: Write `proto/buf.gen.yaml`**

```yaml
version: v2
clean: true
plugins:
  - local: protoc-gen-es
    out: ../src/gen
    opt:
      - target=ts
      - import_extension=js
```
(`@bufbuild/protoc-gen-es` v2 emits both messages and Connect service descriptors — no separate connect plugin needed. `import_extension=js` keeps emitted relative imports compatible with the `tsc` NodeNext-style build; if the project's `tsconfig.json` `moduleResolution` is classic/`node`, use `import_extension=none` instead — confirm against `tsconfig.json` in this step.)

- [ ] **Step 5: Generate**

Run:
```bash
cd proto && bunx buf dep update && bunx buf generate && cd ..
```
Expected: `src/gen/chatto/api/v1/*_pb.ts` files are created, including `messages_pb.ts`, `member_directory_pb.ts`, `room_directory_pb.ts`, `rooms_pb.ts`, `room_timeline_pb.ts`, `message_types_pb.ts`, `users_pb.ts`. If buf reports an unresolved import, add that `.proto` to the fetch list in Step 3 and re-run.

- [ ] **Step 6: Confirm generated symbol names**

Run:
```bash
grep -rhoE "export (const|type) [A-Za-z0-9_]+" src/gen/chatto/api/v1/messages_pb.ts src/gen/chatto/api/v1/member_directory_pb.ts src/gen/chatto/api/v1/room_directory_pb.ts src/gen/chatto/api/v1/rooms_pb.ts | sort -u
```
Expected to include: `MessageService`, `UserService`, `RoomDirectoryService`, `RoomService`, and message types `Message`, `DirectoryMember`, `Room`, `RoomWithViewerState`. If any exported name differs from what later tasks import, note the actual name and use it (update the import lines in later tasks accordingly).

- [ ] **Step 7: Verify the generated code typechecks**

Run: `bunx tsc --noEmit`
Expected: PASS (generated code compiles; existing src still uses `RestClient`, untouched).

- [ ] **Step 8: Commit**

```bash
git add proto src/gen package.json bun.lock
git commit -m "feat: vendor chatto protos and generate Connect-ES clients"
```

---

## Task 2: Domain shapes, mappers, and transport (foundation, non-breaking)

All-new files plus decoupling `types.ts` from the (still-present) Zod schemas. Nothing is wired in yet, so existing code keeps working.

**Files:**
- Modify: `src/types.ts`
- Create: `src/rest/mappers.ts`, `tests/rest/mappers.test.ts`
- Create: `src/rest/transport.ts`, `tests/rest/transport.test.ts`

**Interfaces:**
- Consumes: generated types from Task 1 (`Message`, `DirectoryMember`, `Room` and their descriptors; service `GenService`s).
- Produces:
  - `types.ts`: plain interfaces `MessageData`, `MessageReaction`, `RoomData`, `UserData`, `DirectoryMemberData` (same field names/types as the current `z.infer` outputs), plus existing `CreateMessageInput`, `UpdateMessageInput`, `MessageDeleteEvent`, `ReactionEvent`, `ChattoClientOptions`.
  - `mappers.ts`: `mapMessage(m: Message): MessageData`, `mapDirectoryMember(dm: DirectoryMember): DirectoryMemberData`, `mapRoom(r: Room): RoomData`.
  - `transport.ts`: `createChattoTransport(baseUrl: string, token: string): Transport` and `createServiceClients(transport: Transport)` returning `{ message, user, roomDirectory, room }` typed clients; plus `toChattoError(err: unknown): ChattoApiError` used by the interceptor.

- [ ] **Step 1: Decouple `src/types.ts` from Zod schemas**

Replace the schema-derived domain types with plain interfaces (keep `CreateMessageInput`/`UpdateMessageInput` where they are still produced by the builders, and keep realtime types importing from `schemas/realtime`). New `src/types.ts`:
```ts
import type { z } from 'zod'
import type { CreateMessageInputSchema, UpdateMessageInputSchema } from './schemas/message'
import type { MessageDeleteEventSchema, ReactionEventSchema } from './schemas/realtime'

export interface MessageReaction {
  emoji: string
  count: number
  hasReacted: boolean
  previewUserIds: string[]
}

export interface MessageData {
  id: string
  roomId: string
  createdAt: string
  actorId: string
  body?: string
  updatedAt?: string
  inReplyTo?: string
  threadRootEventId?: string
  reactions: MessageReaction[]
}

export interface UserData {
  id: string
  login: string
  displayName: string
  deleted: boolean
  avatarUrl?: string
  presenceStatus: string
  customStatus?: { emoji: string; text: string; expiresAt?: string }
}

export interface DirectoryMemberData {
  user: UserData
  roles: string[]
  createdAt?: string
}

export interface RoomData {
  id: string
  name: string
  kind: string
  description?: string
  archived: boolean
  groupId?: string
  universal: boolean
}

export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>
export type UpdateMessageInput = z.infer<typeof UpdateMessageInputSchema>
export type MessageDeleteEvent = z.infer<typeof MessageDeleteEventSchema>
export type ReactionEvent = z.infer<typeof ReactionEventSchema>

export interface ChattoClientOptions {
  baseUrl: string
  token: string
}
```
Note: `CreateMessageInputSchema`/`UpdateMessageInputSchema` still live in `src/schemas/message.ts` and are used by the builders (`src/builders/message.ts`). Task 6 checks whether `schemas/message.ts` can be deleted entirely or must retain those two input schemas; keep them for now.

- [ ] **Step 2: Verify types still compile**

Run: `bunx tsc --noEmit`
Expected: PASS (resources/managers consume the same field names as before).

- [ ] **Step 3: Write the failing mappers test**

`tests/rest/mappers.test.ts`:
```ts
import { describe, it, expect } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { MessageSchema } from '../../src/gen/chatto/api/v1/message_types_pb'
import { DirectoryMemberSchema } from '../../src/gen/chatto/api/v1/member_directory_pb'
import { RoomSchema } from '../../src/gen/chatto/api/v1/rooms_pb'
import { mapMessage, mapDirectoryMember, mapRoom } from '../../src/rest/mappers'

describe('mapMessage', () => {
  it('converts timestamps to ISO strings and empty scalars to undefined', () => {
    const proto = create(MessageSchema, {
      id: 'evt_1',
      roomId: 'R_1',
      createdAt: timestampFromDate(new Date('2026-07-10T00:00:00.000Z')),
      actorId: 'U_1',
      body: 'hi',
      reactions: [{ emoji: '👍', count: 2, hasReacted: true, previewUserIds: ['U_2'] }],
    })
    const data = mapMessage(proto)
    expect(data).toMatchObject({
      id: 'evt_1', roomId: 'R_1', actorId: 'U_1', body: 'hi',
      createdAt: '2026-07-10T00:00:00.000Z',
      inReplyTo: undefined, threadRootEventId: undefined, updatedAt: undefined,
    })
    expect(data.reactions[0]).toEqual({ emoji: '👍', count: 2, hasReacted: true, previewUserIds: ['U_2'] })
  })
})

describe('mapDirectoryMember', () => {
  it('maps the presence enum to its proto name string', () => {
    const dm = create(DirectoryMemberSchema, {
      user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 1 },
      roles: ['admin'],
    })
    const data = mapDirectoryMember(dm)
    expect(data.user.presenceStatus).toBe('PRESENCE_STATUS_ONLINE')
    expect(data.user.displayName).toBe('Ceraia')
    expect(data.roles).toEqual(['admin'])
    expect(data.user.avatarUrl).toBeUndefined()
  })
})

describe('mapRoom', () => {
  it('maps the room kind enum to its proto name string', () => {
    const room = create(RoomSchema, { id: 'R_1', name: 'general', kind: 1, archived: false, universal: false })
    const data = mapRoom(room)
    expect(data).toMatchObject({ id: 'R_1', name: 'general', kind: 'ROOM_KIND_CHANNEL', archived: false, universal: false })
    expect(data.description).toBeUndefined()
    expect(data.groupId).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test tests/rest/mappers.test.ts`
Expected: FAIL (`mappers` module not found).

- [ ] **Step 5: Implement `src/rest/mappers.ts`**

```ts
import { timestampDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import type { Message } from '../gen/chatto/api/v1/message_types_pb'
import type { DirectoryMember } from '../gen/chatto/api/v1/member_directory_pb'
import type { Room } from '../gen/chatto/api/v1/rooms_pb'
import type { MessageData, DirectoryMemberData, RoomData } from '../types'

// google.protobuf.Timestamp (or undefined) -> RFC 3339 string (or undefined).
function tsToIso(ts: Timestamp | undefined): string | undefined {
  return ts == null ? undefined : timestampDate(ts).toISOString()
}

// Non-optional proto3 scalars arrive as "" when unset; the SDK exposes them as undefined.
function emptyToUndef(s: string): string | undefined {
  return s === '' ? undefined : s
}

// Protobuf-ES generates enum members with the common prefix stripped; the SDK's
// public contract exposes the full proto enum value name. Map explicitly.
const PRESENCE_NAMES: Record<number, string> = {
  0: 'PRESENCE_STATUS_UNSPECIFIED',
  1: 'PRESENCE_STATUS_ONLINE',
  2: 'PRESENCE_STATUS_AWAY',
  3: 'PRESENCE_STATUS_DO_NOT_DISTURB',
  4: 'PRESENCE_STATUS_OFFLINE',
}
const ROOM_KIND_NAMES: Record<number, string> = {
  0: 'ROOM_KIND_UNSPECIFIED',
  1: 'ROOM_KIND_CHANNEL',
  2: 'ROOM_KIND_DM',
}

export function mapMessage(m: Message): MessageData {
  return {
    id: m.id,
    roomId: m.roomId,
    createdAt: tsToIso(m.createdAt) ?? '',
    actorId: m.actorId,
    body: m.body, // proto `optional string` -> already string | undefined
    updatedAt: tsToIso(m.updatedAt),
    inReplyTo: emptyToUndef(m.inReplyTo),
    threadRootEventId: emptyToUndef(m.threadRootEventId),
    reactions: m.reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      hasReacted: r.hasReacted,
      previewUserIds: r.previewUserIds,
    })),
  }
}

export function mapDirectoryMember(dm: DirectoryMember): DirectoryMemberData {
  const u = dm.user!
  return {
    user: {
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      deleted: u.deleted,
      avatarUrl: u.avatarUrl, // proto `optional string`
      presenceStatus: PRESENCE_NAMES[u.presenceStatus] ?? 'PRESENCE_STATUS_UNSPECIFIED',
      customStatus: u.customStatus
        ? { emoji: u.customStatus.emoji, text: u.customStatus.text, expiresAt: tsToIso(u.customStatus.expiresAt) }
        : undefined,
    },
    roles: dm.roles,
    createdAt: tsToIso(dm.createdAt),
  }
}

export function mapRoom(r: Room): RoomData {
  return {
    id: r.id,
    name: r.name,
    kind: ROOM_KIND_NAMES[r.kind] ?? 'ROOM_KIND_UNSPECIFIED',
    description: emptyToUndef(r.description),
    archived: r.archived,
    groupId: emptyToUndef(r.groupId),
    universal: r.universal,
  }
}
```
Note: if Step 6 of Task 1 showed `CustomUserStatus.expiresAt` is a `string` rather than a `Timestamp`, replace `tsToIso(u.customStatus.expiresAt)` with `emptyToUndef(u.customStatus.expiresAt)`. Confirm against `src/gen/chatto/api/v1/users_pb.ts`.

- [ ] **Step 6: Run the mappers test to verify it passes**

Run: `bun test tests/rest/mappers.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing transport test**

`tests/rest/transport.test.ts`:
```ts
import { describe, it, expect } from 'bun:test'
import { ConnectError, Code, createRouterTransport } from '@connectrpc/connect'
import { create } from '@bufbuild/protobuf'
import { MessageService } from '../../src/gen/chatto/api/v1/messages_pb'
import { GetMessageResponseSchema } from '../../src/gen/chatto/api/v1/messages_pb'
import { createServiceClients, toChattoError } from '../../src/rest/transport'
import { ChattoApiError } from '../../src/errors'
import { createClient } from '@connectrpc/connect'

describe('toChattoError', () => {
  it('maps a ConnectError to a ChattoApiError preserving the code name', () => {
    const err = toChattoError(new ConnectError('nope', Code.Unauthenticated))
    expect(err).toBeInstanceOf(ChattoApiError)
    expect(err.code).toBe('unauthenticated')
    expect(err.message).toContain('nope')
  })
})

describe('createServiceClients', () => {
  it('exposes typed clients that call the generated services', async () => {
    // A router transport lets us stub the server side without network.
    const transport = createRouterTransport(({ service }) => {
      service(MessageService, {
        getMessage: () => create(GetMessageResponseSchema, {
          message: { id: 'evt_1', roomId: 'R_1', actorId: 'U_1', body: 'hi' },
        }),
      })
    })
    const clients = createServiceClients(transport)
    const res = await clients.message.getMessage({ roomId: 'R_1', eventId: 'evt_1' })
    expect(res.message?.id).toBe('evt_1')
    // Sanity: createClient over the same service+transport behaves identically.
    void createClient(MessageService, transport)
  })
})
```

- [ ] **Step 8: Run the transport test to verify it fails**

Run: `bun test tests/rest/transport.test.ts`
Expected: FAIL (`transport` module not found).

- [ ] **Step 9: Implement `src/rest/transport.ts`**

```ts
import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient, ConnectError } from '@connectrpc/connect'
import type { Transport, Interceptor } from '@connectrpc/connect'
import { MessageService } from '../gen/chatto/api/v1/messages_pb'
import { UserService } from '../gen/chatto/api/v1/member_directory_pb'
import { RoomDirectoryService } from '../gen/chatto/api/v1/room_directory_pb'
import { RoomService } from '../gen/chatto/api/v1/rooms_pb'
import { ChattoApiError } from '../errors'

// ConnectError.code is a numeric enum; Code[code] yields the PascalCase name.
// The SDK's historical contract used lower-case Connect status strings
// (e.g. "unauthenticated"), so normalize to that.
export function toChattoError(err: unknown): ChattoApiError {
  if (err instanceof ConnectError) {
    const codeName = ConnectError.from(err).code // numeric
    const name = codeNameOf(codeName)
    return new ChattoApiError(name, err.rawMessage, { code: name, message: err.rawMessage })
  }
  const message = err instanceof Error ? err.message : String(err)
  return new ChattoApiError('unknown', message, {})
}

function codeNameOf(code: number): string {
  // @connectrpc/connect exports `Code`; map the numeric value to the wire name.
  // Wire names are the enum key lower-cased (e.g. Code.Unauthenticated -> "unauthenticated").
  const { Code } = require('@connectrpc/connect') as typeof import('@connectrpc/connect')
  const key = Code[code] as string | undefined
  return key ? key.charAt(0).toLowerCase() + key.slice(1) : 'unknown'
}

function authInterceptor(token: string): Interceptor {
  return next => async req => {
    req.header.set('Authorization', `Bearer ${token}`)
    try {
      return await next(req)
    } catch (err) {
      throw toChattoError(err)
    }
  }
}

export function createChattoTransport(baseUrl: string, token: string): Transport {
  return createConnectTransport({
    baseUrl: `${baseUrl}/api/connect`,
    interceptors: [authInterceptor(token)],
  })
}

export function createServiceClients(transport: Transport) {
  return {
    message: createClient(MessageService, transport),
    user: createClient(UserService, transport),
    roomDirectory: createClient(RoomDirectoryService, transport),
    room: createClient(RoomService, transport),
  }
}

export type ServiceClients = ReturnType<typeof createServiceClients>
```
Note: prefer a static `import { Code } from '@connectrpc/connect'` at the top and drop the `require`; the inline `require` is shown only to keep `codeNameOf` self-contained. Confirm `Code` is exported (it is in `@connectrpc/connect`) and use the import form. Also confirm `createConnectTransport` accepts `baseUrl` ending in `/api/connect` so request URLs become `{baseUrl}/api/connect/{Service}/{Method}` (matching today).

- [ ] **Step 10: Run the transport test to verify it passes**

Run: `bun test tests/rest/transport.test.ts`
Expected: PASS. If the router transport path names the response field differently, align the assertion with the generated `GetMessageResponse` (`message`).

- [ ] **Step 11: Typecheck and commit**

Run: `bunx tsc --noEmit` (Expected: PASS)
```bash
git add src/types.ts src/rest/mappers.ts src/rest/transport.ts tests/rest/mappers.test.ts tests/rest/transport.test.ts
git commit -m "feat: add Connect transport, service clients, and proto mappers"
```

---

## Task 3: Wire typed clients onto ChattoContext (keep RestClient during transition)

**Files:**
- Modify: `src/context.ts`, `src/client.ts`
- Test: existing `tests/context.test.ts` stays green (still mocks `rest`); add nothing yet.

**Interfaces:**
- Consumes: `createServiceClients`, `ServiceClients` from Task 2; generated services.
- Produces: `ClientContext` gains `readonly clients: ServiceClients`. `ChattoContext` constructor signature changes to `(clients: ServiceClients)` (RestClient removed from context). `ChattoClient` builds the transport and clients.

- [ ] **Step 1: Update `ClientContext` and `ChattoContext`**

In `src/context.ts`, replace the `rest`-based wiring with clients. New relevant parts:
```ts
import type { ServiceClients } from './rest/transport'
// ...
export interface ClientContext {
  readonly clients: ServiceClients
  resolveUser(id: string): Promise<User>
  resolveRoom(id: string): Promise<Room>
  hydrateMessage(data: MessageData): Promise<Message>
}

export class ChattoContext implements ClientContext {
  readonly clients: ServiceClients
  readonly users: UserManager
  readonly rooms: RoomManager
  readonly messages: MessageManager
  private readonly userCache: UserCache
  private readonly roomCache: RoomCache

  constructor(clients: ServiceClients) {
    this.clients = clients
    this.users = new UserManager(this)
    this.rooms = new RoomManager(this)
    this.messages = new MessageManager(this)
    this.userCache = new UserCache(id => this.users.fetch(id))
    this.roomCache = new RoomCache(id => this.rooms.fetch(id))
  }
  // resolveUser / resolveRoom / hydrateMessage unchanged
}
```
(Managers/resources still reference `ctx.rest` at this point and will not compile — that is expected; they are migrated in Tasks 4–5. To keep the tree compiling between tasks, temporarily leave `ctx.rest` available: add `readonly rest = undefined as never` is NOT acceptable. Instead, do Tasks 3–5 as one commit boundary if `tsc` must stay green — see Step 3.)

- [ ] **Step 2: Update `src/client.ts` to build the transport**

```ts
import { createChattoTransport, createServiceClients } from './rest/transport'
// remove: import { RestClient } from './rest/client'
// ...
constructor(options: ChattoClientOptions, realtimeFactory?: ...) {
  super()
  const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime'
  const transport = createChattoTransport(options.baseUrl, options.token)
  this.realtime = realtimeFactory ? realtimeFactory(wsUrl, options.token) : new RealtimeConnection(wsUrl, options.token)
  this.ctx = new ChattoContext(createServiceClients(transport))
  this.rooms = this.ctx.rooms
  this.messages = this.ctx.messages
  this.users = this.ctx.users
  this.wireRealtime()
}
```
Remove the `private readonly rest: RestClient` field and its assignment.

- [ ] **Step 3: Sequencing note — compile boundary**

Because managers/resources still call `ctx.rest` until Tasks 4–5, `bunx tsc --noEmit` will not pass between Task 3 and Task 5. Do Tasks 3, 4, and 5 back-to-back and run the full typecheck at the end of Task 5. Commit each task's file changes, but only assert a green `tsc`/test run at Task 5's verification step. (If you prefer a green build at every commit, combine Tasks 3–5 into a single commit.)

- [ ] **Step 4: Commit**

```bash
git add src/context.ts src/client.ts
git commit -m "refactor: build Connect transport and clients on ChattoContext"
```

---

## Task 4: Migrate managers to typed clients

**Files:**
- Modify: `src/managers/messages.ts`, `src/managers/users.ts`, `src/managers/rooms.ts`
- Test: `tests/managers/messages.test.ts`, `tests/managers/users.test.ts`, `tests/managers/rooms.test.ts`

**Interfaces:**
- Consumes: `ctx.clients.{message,user,roomDirectory}`, mappers from Task 2, `ctx.hydrateMessage`.
- Produces: unchanged manager public methods (`MessageManager.send/fetch`, `UserManager.fetch/batchFetch/list`, `RoomManager.list/fetch`).

- [ ] **Step 1: Rewrite the manager test mocks (messages)**

Replace the `rest.post` mock with a `clients.message` mock. `tests/managers/messages.test.ts`:
```ts
import { describe, it, expect, mock } from 'bun:test'
import { MessageManager } from '../../src/managers/messages'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'

// Proto-shaped message (Timestamp object, camelCase). mapMessage() converts it.
const protoMsg = {
  id: 'evt_1', roomId: 'R_1',
  createdAt: { seconds: 0n, nanos: 0 }, actorId: 'U_1', body: 'hi',
  updatedAt: undefined, inReplyTo: '', threadRootEventId: '', reactions: [],
}

function makeCtx(clientImpl: any) {
  const ctx: any = {
    clients: { message: clientImpl },
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

describe('MessageManager', () => {
  it('send() calls createMessage and returns a hydrated Message', async () => {
    const createMessage = mock().mockResolvedValue({ message: protoMsg })
    const ctx = makeCtx({ createMessage })
    const sent = await new MessageManager(ctx).send('R_1', 'hi')
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'R_1', body: 'hi' }))
    expect(sent).toBeInstanceOf(Message)
    expect(sent.content).toBe('hi')
  })

  it('fetch() calls getMessage and returns a hydrated Message', async () => {
    const getMessage = mock().mockResolvedValue({ message: protoMsg })
    const ctx = makeCtx({ getMessage })
    const msg = await new MessageManager(ctx).fetch('R_1', 'evt_1')
    expect(getMessage).toHaveBeenCalledWith({ roomId: 'R_1', eventId: 'evt_1' })
    expect(msg.content).toBe('hi')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/managers/messages.test.ts`
Expected: FAIL (manager still calls `ctx.rest.post`).

- [ ] **Step 3: Rewrite `src/managers/messages.ts`**

```ts
import type { ClientContext } from '../context'
import type { Message } from '../resources/message'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { mapMessage } from '../rest/mappers'

export class MessageManager {
  constructor(private readonly ctx: ClientContext) {}

  async send(roomId: string, payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildCreate(roomId)
    const res = await this.ctx.clients.message.createMessage({
      roomId: input.roomId,
      body: input.body,
      inReplyTo: input.inReplyTo,
      threadRootEventId: input.threadRootEventId,
      alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }

  async fetch(roomId: string, eventId: string): Promise<Message> {
    const res = await this.ctx.clients.message.getMessage({ roomId, eventId })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }
}
```
Note: `res.message` is `Message | undefined` (singular message field). The `!` asserts presence for the success path; the server always returns it on 2xx. If the generated `createMessage` init object rejects an `undefined` optional field, omit undefined keys (spread only set fields) — confirm against the generated `CreateMessageRequest` init type.

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/managers/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite users test + `src/managers/users.ts`**

`tests/managers/users.test.ts` (mock `clients.user`, proto-shaped `DirectoryMember` with numeric `presenceStatus`):
```ts
import { describe, it, expect, mock } from 'bun:test'
import { UserManager } from '../../src/managers/users'
import { User } from '../../src/resources/user'

const protoMember = { user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 1, avatarUrl: undefined }, roles: [] }

function makeCtx(clientImpl: any) { return { clients: { user: clientImpl } } as any }

describe('UserManager', () => {
  it('fetch() calls getUser and returns a User', async () => {
    const getUser = mock().mockResolvedValue({ user: protoMember })
    const u = await new UserManager(makeCtx({ getUser })).fetch('U_1')
    expect(getUser).toHaveBeenCalledWith({ userId: 'U_1' })
    expect(u).toBeInstanceOf(User)
    expect(u.displayName).toBe('Ceraia')
    expect(u.presenceStatus).toBe('PRESENCE_STATUS_ONLINE')
  })

  it('batchFetch() calls batchGetUsers', async () => {
    const batchGetUsers = mock().mockResolvedValue({ users: [protoMember] })
    const users = await new UserManager(makeCtx({ batchGetUsers })).batchFetch(['U_1'])
    expect(batchGetUsers).toHaveBeenCalledWith({ userIds: ['U_1'] })
    expect(users).toHaveLength(1)
  })

  it('list() calls listUsers with search', async () => {
    const listUsers = mock().mockResolvedValue({ users: [protoMember] })
    await new UserManager(makeCtx({ listUsers })).list({ search: 'ce' })
    expect(listUsers).toHaveBeenCalledWith({ search: 'ce' })
  })
})
```
`src/managers/users.ts`:
```ts
import type { ClientContext } from '../context'
import { User } from '../resources/user'
import { mapDirectoryMember } from '../rest/mappers'

export class UserManager {
  constructor(private readonly ctx: ClientContext) {}

  async fetch(userId: string): Promise<User> {
    const res = await this.ctx.clients.user.getUser({ userId })
    return new User(mapDirectoryMember(res.user!))
  }

  async batchFetch(userIds: string[]): Promise<User[]> {
    const res = await this.ctx.clients.user.batchGetUsers({ userIds })
    return res.users.map(m => new User(mapDirectoryMember(m)))
  }

  async list(opts: { search?: string } = {}): Promise<User[]> {
    const res = await this.ctx.clients.user.listUsers({ search: opts.search })
    return res.users.map(m => new User(mapDirectoryMember(m)))
  }
}
```
Note: `getUser` uses a `oneof target { user_id; login }`. Passing `{ userId }` selects the `user_id` case. Confirm the generated init accepts `{ userId }` (oneof member field name); if it requires `{ case: 'userId', value }` style, use the generated `GetUserRequest` init shape — connect-es `createClient` methods accept the message init shape, and for a oneof the flat field form `{ userId: 'U_1' }` is accepted. Also confirm `ListUsersRequest` has a `search` field (from `member_directory.proto`); if the field name differs, align it.

Run: `bun test tests/managers/users.test.ts` — Expected: PASS.

- [ ] **Step 6: Rewrite rooms test + `src/managers/rooms.ts`**

`tests/managers/rooms.test.ts`:
```ts
import { describe, it, expect, mock } from 'bun:test'
import { RoomManager } from '../../src/managers/rooms'
import { Room } from '../../src/resources/room'

const protoRoom = { id: 'R_1', name: 'general', kind: 1, description: '', archived: false, groupId: '', universal: false }

function makeCtx(clientImpl: any) { return { clients: { roomDirectory: clientImpl } } as any }

describe('RoomManager', () => {
  it('list() calls listRooms and maps RoomWithViewerState', async () => {
    const listRooms = mock().mockResolvedValue({ rooms: [{ room: protoRoom }] })
    const rooms = await new RoomManager(makeCtx({ listRooms })).list()
    expect(listRooms).toHaveBeenCalledWith({})
    expect(rooms[0]).toBeInstanceOf(Room)
    expect(rooms[0].name).toBe('general')
    expect(rooms[0].kind).toBe('ROOM_KIND_CHANNEL')
  })

  it('fetch() calls getRoom and maps the wrapped room', async () => {
    const getRoom = mock().mockResolvedValue({ room: { room: protoRoom } })
    const room = await new RoomManager(makeCtx({ getRoom })).fetch('R_1')
    expect(getRoom).toHaveBeenCalledWith({ roomId: 'R_1' })
    expect(room.name).toBe('general')
  })
})
```
`src/managers/rooms.ts`:
```ts
import type { ClientContext } from '../context'
import { Room } from '../resources/room'
import { mapRoom } from '../rest/mappers'

export class RoomManager {
  constructor(private readonly ctx: ClientContext) {}

  async list(): Promise<Room[]> {
    const res = await this.ctx.clients.roomDirectory.listRooms({})
    return res.rooms.map(r => new Room(mapRoom(r.room!), this.ctx))
  }

  async fetch(roomId: string): Promise<Room> {
    const res = await this.ctx.clients.roomDirectory.getRoom({ roomId })
    return new Room(mapRoom(res.room!.room!), this.ctx)
  }
}
```
Run: `bun test tests/managers/rooms.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/managers tests/managers
git commit -m "refactor: managers call generated Connect clients"
```

---

## Task 5: Migrate resources to typed clients

**Files:**
- Modify: `src/resources/message.ts`, `src/resources/room.ts`
- Test: `tests/resources/message.test.ts`, `tests/resources/room.test.ts`

**Interfaces:**
- Consumes: `ctx.clients.{message,room}`, `mapMessage` from Task 2.
- Produces: unchanged resource public methods (`Message.edit/delete/react/removeReaction/reply`, `Room.send/fetchHistory`).

- [ ] **Step 1: Update `tests/resources/message.test.ts` mocks**

Model the ctx after Task 4's `makeCtx` (a `clients.message` object with `mock()`ed methods and a `hydrateMessage`). Keep the existing assertions on returned `Message` properties; change call assertions from `rest.post(...)` to the specific client method. For each method:
- `edit` → `updateMessage({ roomId, eventId, body, alsoSendToChannel })` returns `{ message: protoMsg }`.
- `delete` → `deleteMessage({ roomId, eventId })` returns `{ deleted: true }`.
- `react` → `addReaction({ roomId, messageEventId, emoji })`.
- `removeReaction` → `removeReaction({ roomId, messageEventId, emoji })`.
- `reply` → `createMessage({ roomId, body, inReplyTo, threadRootEventId, alsoSendToChannel })` returns `{ message: protoMsg }`.
Use the `protoMsg` shape from Task 4 Step 1 for methods that hydrate.

Run: `bun test tests/resources/message.test.ts` — Expected: FAIL (still calls `ctx.rest.post`).

- [ ] **Step 2: Rewrite `src/resources/message.ts`**

```ts
import type { MessageData } from '../types'
import type { ClientContext } from '../context'
import type { User } from './user'
import type { Room } from './room'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { mapMessage } from '../rest/mappers'

export class Message {
  readonly id: string
  readonly channelId: string
  readonly content: string | undefined
  readonly actorId: string
  readonly author: User
  readonly channel: Room
  readonly createdAt: string
  readonly editedAt: string | undefined
  readonly inReplyTo: string | undefined
  readonly threadRootEventId: string | undefined

  constructor(data: MessageData, private readonly ctx: ClientContext, resolved: { author: User; channel: Room }) {
    this.id = data.id
    this.channelId = data.roomId
    this.content = data.body
    this.actorId = data.actorId
    this.author = resolved.author
    this.channel = resolved.channel
    this.createdAt = data.createdAt
    this.editedAt = data.updatedAt
    this.inReplyTo = data.inReplyTo
    this.threadRootEventId = data.threadRootEventId
  }

  async edit(payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildUpdate(this.channelId, this.id)
    const res = await this.ctx.clients.message.updateMessage({
      roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }

  async delete(): Promise<void> {
    await this.ctx.clients.message.deleteMessage({ roomId: this.channelId, eventId: this.id })
  }

  async react(emoji: string): Promise<void> {
    await this.ctx.clients.message.addReaction({ roomId: this.channelId, messageEventId: this.id, emoji })
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.ctx.clients.message.removeReaction({ roomId: this.channelId, messageEventId: this.id, emoji })
  }

  async reply(payload: MessagePayload): Promise<Message> {
    const builder = resolveMessagePayload(payload).clone()
    builder.setReplyTo(this.id)
    builder.setThreadRoot(this.threadRootEventId ?? this.id)
    const input = builder.buildCreate(this.channelId)
    const res = await this.ctx.clients.message.createMessage({
      roomId: input.roomId, body: input.body, inReplyTo: input.inReplyTo,
      threadRootEventId: input.threadRootEventId, alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }
}
```
Note: confirm `UpdateMessageRequest` field name for the message id is `eventId` (from `messages.proto`, `UpdateMessageRequest`). If it differs (e.g. `event_id` → `eventId`) align the key. Confirm `AddReactionRequest`/`RemoveReactionRequest` use `messageEventId` (from `messages.proto`).

Run: `bun test tests/resources/message.test.ts` — Expected: PASS.

- [ ] **Step 3: Update `tests/resources/room.test.ts` and rewrite `src/resources/room.ts`**

`Room.send` → `clients.message.createMessage(...)` then `hydrateMessage(mapMessage(...))`. `Room.fetchHistory` → `clients.room.getRoomEvents({ roomId, ... })`, then map the timeline page. The response is `GetRoomEventsResponse` wrapping a `RoomTimelinePage` with `events` where each event may carry a posted message. Confirm the exact nesting from `src/gen/chatto/api/v1/room_timeline_pb.ts` (Task 1 Step 6): the current code reads `res.page.events[].messagePosted.message`. Rewrite:
```ts
import { mapMessage } from '../rest/mappers'
// ...
async send(payload: MessagePayload): Promise<Message> {
  const input = resolveMessagePayload(payload).buildCreate(this.id)
  const res = await this.ctx.clients.message.createMessage({
    roomId: input.roomId, body: input.body, inReplyTo: input.inReplyTo,
    threadRootEventId: input.threadRootEventId, alsoSendToChannel: input.alsoSendToChannel,
  })
  return this.ctx.hydrateMessage(mapMessage(res.message!))
}

async fetchHistory(opts: { limit?: number; before?: string } = {}): Promise<Message[]> {
  const res = await this.ctx.clients.room.getRoomEvents({
    roomId: this.id,
    limit: opts.limit,
    before: opts.before, // GetRoomEventsRequest oneof cursor { before }
  })
  const events = res.page?.events ?? []
  return Promise.all(
    events
      .filter(e => e.messagePosted?.message != null)
      .map(e => this.ctx.hydrateMessage(mapMessage(e.messagePosted!.message!))),
  )
}
```
Remove the now-unused imports of `MessageResponseSchema`/`GetRoomEventsResponseSchema` from `src/resources/room.ts`. Update the room resource test to mock `clients.message.createMessage` and `clients.room.getRoomEvents` returning proto-shaped data. Confirm from generated `room_timeline_pb.ts` the exact field names for the request (`limit`, cursor `before`/`after`) and the response path (`page.events[].messagePosted.message` vs a different event-oneof name). Align keys with the generated types.

Run: `bun test tests/resources/room.test.ts` — Expected: PASS.

- [ ] **Step 4: Full typecheck (compile boundary from Task 3 closes here)**

Run: `bunx tsc --noEmit`
Expected: PASS. Remaining references to `ctx.rest`/`RestClient` should now be gone from `src/managers` and `src/resources`. If `tsc` reports `ctx.rest` still referenced anywhere, fix that call site.

- [ ] **Step 5: Commit**

```bash
git add src/resources tests/resources
git commit -m "refactor: resources call generated Connect clients"
```

---

## Task 6: Remove dead code, fix remaining tests, full green run

**Files:**
- Delete: `src/rest/client.ts`, `tests/rest/client.test.ts`, `src/schemas/user.ts`, `src/schemas/room.ts`, `tests/schemas/user.test.ts`, `tests/schemas/room.test.ts`
- Modify or delete: `src/schemas/message.ts` (keep only `CreateMessageInputSchema`/`UpdateMessageInputSchema` if still used by the builders; delete the response schemas), `tests/schemas/message.test.ts` accordingly
- Modify: `tests/context.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces: no `RestClient`, no hand-written Connect response schemas; `tsc` and full `bun test` green.

- [ ] **Step 1: Determine whether `schemas/message.ts` is still needed**

Run:
```bash
grep -rn "CreateMessageInputSchema\|UpdateMessageInputSchema\|MessageResponseSchema\|MessageSchema\|MessageReactionSchema" src tests
```
Expected: `CreateMessageInputSchema`/`UpdateMessageInputSchema` referenced by `src/types.ts` and possibly `src/builders/message.ts`; the response schemas (`MessageResponseSchema`, etc.) no longer referenced by `src`. Keep the two input schemas, delete the response/message/reaction schemas from `src/schemas/message.ts`. If NOTHING references `schemas/message.ts` anymore, delete the file and remove its imports from `src/types.ts` (replace `CreateMessageInput`/`UpdateMessageInput` with plain interfaces matching the builder output).

- [ ] **Step 2: Delete dead files**

```bash
git rm src/rest/client.ts tests/rest/client.test.ts \
       src/schemas/user.ts src/schemas/room.ts \
       tests/schemas/user.test.ts tests/schemas/room.test.ts
```
Trim `src/schemas/message.ts` per Step 1 (or `git rm` it if fully unused) and update `tests/schemas/message.test.ts` to cover only surviving schemas (or `git rm` it if none survive).

- [ ] **Step 3: Rewrite `tests/context.test.ts` to mock clients**

```ts
import { describe, it, expect, mock } from 'bun:test'
import { ChattoContext } from '../src/context'
import { Message } from '../src/resources/message'

const protoMember = { user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 1 }, roles: [] }
const protoRoom = { id: 'R_1', name: 'general', kind: 1, archived: false, universal: false, description: '', groupId: '' }
const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

function makeClients(overrides: any = {}) {
  return {
    user: { getUser: mock().mockResolvedValue({ user: protoMember }), ...overrides.user },
    roomDirectory: { getRoom: mock().mockResolvedValue({ room: { room: protoRoom } }), ...overrides.roomDirectory },
    message: {},
    room: {},
  } as any
}

describe('ChattoContext.hydrateMessage', () => {
  it('eagerly populates author (full User) and channel (Room)', async () => {
    const ctx = new ChattoContext(makeClients())
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg).toBeInstanceOf(Message)
    expect(msg.author.displayName).toBe('Ceraia')
    expect(msg.channel.name).toBe('general')
  })

  it('caches users across hydrations (getUser called once)', async () => {
    const clients = makeClients()
    const ctx = new ChattoContext(clients)
    await ctx.hydrateMessage(msgData as any)
    await ctx.hydrateMessage(msgData as any)
    expect((clients.user.getUser as any).mock.calls).toHaveLength(1)
  })

  it('falls back to a partial author when the user fetch fails', async () => {
    const clients = makeClients({ user: { getUser: mock().mockRejectedValue(new Error('boom')) } })
    const ctx = new ChattoContext(clients)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg.author.id).toBe('U_1')
    expect(msg.author.displayName).toBe('U_1')
  })
})
```

- [ ] **Step 4: Check `tests/client.test.ts`**

Run: `grep -n "RestClient\|rest" tests/client.test.ts`. If it references `RestClient` or a `rest` field, update it to construct `ChattoClient` normally (the transport is built internally) and mock realtime via the `realtimeFactory` constructor arg as it already does. Adjust only what breaks.

- [ ] **Step 5: Full verification**

Run:
```bash
bunx tsc --noEmit
bun test
```
Expected: `tsc` PASS; `bun test` all pass except the live integration test (`tests/integration/live.test.ts`) which requires a real server — confirm it is skipped/guarded as before (do not count it as a regression if it was already conditionally skipped). If any non-live test fails, fix the call/assertion to match the generated shapes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove RestClient and hand-written Connect schemas"
```

---

## Task 7: Update publish workflow and docs

**Files:**
- Modify: `.github/workflows/publish.yml`, `README.md`

**Interfaces:** none (CI/docs only).

- [ ] **Step 1: Confirm CI needs no buf step**

Since `src/gen` is committed, the existing `publish.yml` (`install → typecheck → test → build`) already works. Verify no step references protos. No change required unless a regeneration check is desired.

- [ ] **Step 2: (Optional) add a drift check to CI**

If desired, add a job that runs `cd proto && bunx buf generate && cd .. && git diff --exit-code src/gen` to fail when committed generated code is stale. Only add if the maintainer wants it (it requires `buf` + BSR access in CI). Skip by default.

- [ ] **Step 3: Update README note**

The README says "most of this code is AI generated ... expecting things to break as Chatto is still in active development." Add a short line under "API" noting the SDK's request/response types are generated from Chatto's published protos (`chattocorp/chatto`) via `bun run generate`, so keeping up with API changes is a regeneration step.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish.yml README.md
git commit -m "docs: note generated Connect clients and regeneration workflow"
```

---

## Self-Review

**Spec coverage:**
- Vendored protos + codegen toolchain (spec §Design.1) → Task 1. ✓
- Committed generated code, no new required build step (spec Goals) → Task 1 Steps 4–8, Task 7 Step 1. ✓
- Transport + auth interceptor, `{baseUrl}/api/connect` (spec §Design.2) → Task 2 Steps 7–10. ✓
- Error mapping to `ChattoApiError` (spec §Design.3) → Task 2 `toChattoError`, tested. ✓
- Managers/resources on typed clients (spec §Design.4) → Tasks 4–5 (note: spec said "three managers"; plan correctly also covers the 7 resource call sites in `message.ts`/`room.ts`, which the deeper read revealed). ✓
- Delete hand-written Connect schemas, keep realtime schema (spec §Design.4) → Task 6. ✓
- proto3 scalar-default + Timestamp/enum shim (spec watch-item) → Task 2 `mappers.ts`, tested. ✓ (plan expands the shim to cover Timestamp→ISO and enum→name, which the proto read showed are required.)
- Realtime + login out of scope (spec Non-goals) → untouched; Global Constraints enforce. ✓
- Tests stay green via mocked clients/router transport (spec §Testing) → Tasks 4–6. ✓

**Placeholder scan:** No TBD/TODO. The "Note:" lines are verification instructions against generated symbols (unavoidable and specific), not deferred work. Each code step includes complete code.

**Type consistency:** Client accessor names are consistent everywhere (`ctx.clients.message`, `.user`, `.roomDirectory`, `.room`). Mapper names consistent (`mapMessage`/`mapDirectoryMember`/`mapRoom`). Domain shapes (`MessageData`/`DirectoryMemberData`/`RoomData`) defined in Task 2 and consumed unchanged by resources/hydration. `toChattoError`/`createChattoTransport`/`createServiceClients`/`ServiceClients` names consistent across Tasks 2–3.

**Known deliberate deferrals to implementation (resolved by Task 1 Step 6 output, not guesses):** exact generated field name for `UpdateMessageRequest` message id, the oneof init form for `GetUserRequest`, the `GetRoomEvents` request/response field nesting, and whether `CustomUserStatus.expiresAt` is a Timestamp or string. Each has an explicit "confirm against generated code" note at its use site.
