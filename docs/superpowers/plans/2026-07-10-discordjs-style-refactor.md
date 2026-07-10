# discord.js-style Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chatto.ts resources behave like discord.js — `message.reply('text')`, eager `message.author` (full `User`), and `message.channel` with `.send()`.

**Architecture:** Introduce a `ClientContext` (interface consumed by resources/managers; concrete `ChattoContext` implemented by the client) that owns per-client user/room caches and a `hydrateMessage()` helper. Every path producing a user-visible `Message` flows through `hydrateMessage`, so `author` and `channel` are always eagerly populated. A `resolveMessagePayload()` helper lets `reply`/`send`/`edit` accept `string | {content} | MessageBuilder`.

**Tech Stack:** TypeScript, Bun (`bun test`), Zod, `ws`. Package is pre-1.0 (v0.3.2); breaking renames are acceptable.

## Global Constraints

- Runtime/test tooling is **Bun**: run files with `bun <file>`, tests with `bun test`. Bun auto-loads `.env` — do not add `dotenv`.
- Credentials must **never** be committed. Live tests read env vars and skip cleanly when absent.
- All API calls go through `RestClient.post(service, method, body, schema)` (Zod-validated), reached via `ctx.rest`.
- Chatto IDs are type-prefixed strings (`U`=user, `R`=room, `evt`=event).
- Follow existing file conventions: no semicolons, single quotes, 2-space indent.

## File Structure

- Create: `src/builders/payload.ts` — `MessagePayload` type + `resolveMessagePayload()`.
- Create: `src/context.ts` — `ClientContext` interface + concrete `ChattoContext`.
- Create: `src/caches.ts` — `UserCache`, `RoomCache`.
- Modify: `src/resources/user.ts` — add `username` getter + `User.partial()`; remove `PartialUser`.
- Modify: `src/resources/room.ts` — take `ClientContext`; `Room.partial()`; `send(payload)`.
- Modify: `src/resources/message.ts` — `content`/`channelId`/`channel`/`author`/`editedAt`; `reply`/`edit` take payload.
- Modify: `src/managers/{users,rooms,messages}.ts` — take `ClientContext`.
- Modify: `src/client.ts` — build `ChattoContext`, expose its managers.
- Modify: `src/index.ts` — exports.
- Create: `tests/integration/live.test.ts` — env-gated live suite.
- Modify: `.gitignore` — add `.env`.
- Create: `.env` (gitignored) — moved credentials.

---

### Task 1: Message payload helper

**Files:**
- Create: `src/builders/payload.ts`
- Test: `tests/builders/payload.test.ts`

**Interfaces:**
- Consumes: `MessageBuilder` from `src/builders/message.ts` (`setContent(string)`, `setAlsoSendToChannel(boolean)`).
- Produces: `type MessagePayload = string | { content: string; alsoSendToChannel?: boolean } | MessageBuilder` and `resolveMessagePayload(payload: MessagePayload): MessageBuilder`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/builders/payload.test.ts
import { describe, it, expect } from 'bun:test'
import { resolveMessagePayload } from '../../src/builders/payload'
import { MessageBuilder } from '../../src/builders/message'

describe('resolveMessagePayload', () => {
  it('wraps a plain string into a builder', () => {
    const builder = resolveMessagePayload('hello')
    expect(builder).toBeInstanceOf(MessageBuilder)
    expect(builder.buildCreate('room_1')).toMatchObject({ roomId: 'room_1', body: 'hello' })
  })

  it('maps an options object into a builder', () => {
    const builder = resolveMessagePayload({ content: 'hi', alsoSendToChannel: true })
    expect(builder.buildCreate('room_1')).toMatchObject({ body: 'hi', alsoSendToChannel: true })
  })

  it('returns the same builder instance when given a builder', () => {
    const original = new MessageBuilder().setContent('x')
    expect(resolveMessagePayload(original)).toBe(original)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/builders/payload.test.ts`
Expected: FAIL — `Cannot find module '../../src/builders/payload'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/builders/payload.ts
import { MessageBuilder } from './message'

export type MessagePayload =
  | string
  | { content: string; alsoSendToChannel?: boolean }
  | MessageBuilder

export function resolveMessagePayload(payload: MessagePayload): MessageBuilder {
  if (payload instanceof MessageBuilder) return payload
  if (typeof payload === 'string') return new MessageBuilder().setContent(payload)
  const builder = new MessageBuilder().setContent(payload.content)
  if (payload.alsoSendToChannel != null) builder.setAlsoSendToChannel(payload.alsoSendToChannel)
  return builder
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/builders/payload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/builders/payload.ts tests/builders/payload.test.ts
git commit -m "feat: add resolveMessagePayload helper for string/object/builder inputs"
```

---

### Task 2: User — `username` getter and `User.partial()`

**Files:**
- Modify: `src/resources/user.ts`
- Test: `tests/resources/user.test.ts`

**Interfaces:**
- Produces: `User.username: string` (getter aliasing `login`); static `User.partial(id: string): User` returning a `User` whose `id` is set and whose `login`/`displayName` default to `id`.
- Note: `PartialUser` is **not** removed in this task (still imported by `Message`); it is removed in Task 5.

- [ ] **Step 1: Write the failing test** (append to existing `tests/resources/user.test.ts`)

```ts
import { describe, it, expect } from 'bun:test'
import { User } from '../../src/resources/user'

describe('User discord.js ergonomics', () => {
  const memberData = {
    user: {
      id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false,
      avatarUrl: 'https://x/a.png', presenceStatus: 'PRESENCE_STATUS_ONLINE',
    },
    roles: ['admin'],
  }

  it('exposes username as an alias of login', () => {
    const user = new User(memberData as any)
    expect(user.username).toBe('ceraia')
  })

  it('User.partial builds a User from just an id', () => {
    const user = User.partial('U_42')
    expect(user.id).toBe('U_42')
    expect(user.displayName).toBe('U_42')
    expect(user.login).toBe('U_42')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/resources/user.test.ts`
Expected: FAIL — `user.username` is undefined / `User.partial is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to the `User` class in `src/resources/user.ts`

```ts
  get username(): string {
    return this.login
  }

  static partial(id: string): User {
    return new User({
      user: {
        id,
        login: id,
        displayName: id,
        deleted: false,
        avatarUrl: undefined,
        presenceStatus: 'PRESENCE_STATUS_UNSPECIFIED',
        customStatus: undefined,
      },
      roles: [],
      createdAt: undefined,
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/resources/user.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resources/user.ts tests/resources/user.test.ts
git commit -m "feat: add User.username getter and User.partial factory"
```

---

### Task 3: ClientContext interface + caches

**Files:**
- Create: `src/context.ts` (interface only in this task)
- Create: `src/caches.ts`
- Test: `tests/caches.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ClientContext {
    readonly rest: RestClient
    resolveUser(id: string): Promise<User>
    resolveRoom(id: string): Promise<Room>
    hydrateMessage(data: MessageData): Promise<Message>
  }
  ```
  and `class UserCache` / `class RoomCache`, each constructed with a fetcher `(id: string) => Promise<T>`, exposing `resolve(id): Promise<T>` that fetches once then serves from an internal `Map`.
- Consumes: type-only `User`, `Room`, `Message`, `MessageData`, `RestClient`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/caches.test.ts
import { describe, it, expect, mock } from 'bun:test'
import { UserCache, RoomCache } from '../src/caches'
import { User } from '../src/resources/user'

describe('UserCache', () => {
  it('fetches once and serves subsequent calls from cache', async () => {
    const fetcher = mock(async (id: string) => User.partial(id))
    const cache = new UserCache(fetcher)
    const a = await cache.resolve('U_1')
    const b = await cache.resolve('U_1')
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetches distinct ids separately', async () => {
    const fetcher = mock(async (id: string) => User.partial(id))
    const cache = new UserCache(fetcher)
    await cache.resolve('U_1')
    await cache.resolve('U_2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('RoomCache', () => {
  it('fetches once and serves subsequent calls from cache', async () => {
    const room = { id: 'R_1' } as any
    const fetcher = mock(async () => room)
    const cache = new RoomCache(fetcher)
    expect(await cache.resolve('R_1')).toBe(room)
    expect(await cache.resolve('R_1')).toBe(room)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/caches.test.ts`
Expected: FAIL — `Cannot find module '../src/caches'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/caches.ts
import type { User } from './resources/user'
import type { Room } from './resources/room'

export class UserCache {
  private readonly cache = new Map<string, User>()
  constructor(private readonly fetcher: (id: string) => Promise<User>) {}
  async resolve(id: string): Promise<User> {
    const cached = this.cache.get(id)
    if (cached != null) return cached
    const user = await this.fetcher(id)
    this.cache.set(id, user)
    return user
  }
}

export class RoomCache {
  private readonly cache = new Map<string, Room>()
  constructor(private readonly fetcher: (id: string) => Promise<Room>) {}
  async resolve(id: string): Promise<Room> {
    const cached = this.cache.get(id)
    if (cached != null) return cached
    const room = await this.fetcher(id)
    this.cache.set(id, room)
    return room
  }
}
```

```ts
// src/context.ts
import type { RestClient } from './rest/client'
import type { MessageData } from './types'
import type { Message } from './resources/message'
import type { User } from './resources/user'
import type { Room } from './resources/room'

export interface ClientContext {
  readonly rest: RestClient
  resolveUser(id: string): Promise<User>
  resolveRoom(id: string): Promise<Room>
  hydrateMessage(data: MessageData): Promise<Message>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/caches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/caches.ts src/context.ts tests/caches.test.ts
git commit -m "feat: add ClientContext interface and User/Room caches"
```

---

### Task 4: Room resource — ClientContext, `Room.partial()`, payload `send()`

**Files:**
- Modify: `src/resources/room.ts`
- Test: `tests/resources/room.test.ts`

**Interfaces:**
- Consumes: `ClientContext` (`ctx.rest`, `ctx.hydrateMessage`), `resolveMessagePayload`.
- Produces: `Room` constructed as `new Room(data: RoomData, ctx: ClientContext)`; static `Room.partial(id: string, ctx: ClientContext): Room`; `send(payload: MessagePayload): Promise<Message>` (returns a hydrated `Message`); `fetchHistory` unchanged in behavior but uses `ctx`.

- [ ] **Step 1: Write the failing test** (replace the `.send()` test in `tests/resources/room.test.ts`; keep property tests, updating the constructor call to pass a mock ctx)

```ts
import { describe, it, expect, mock } from 'bun:test'
import { Room } from '../../src/resources/room'
import { Message } from '../../src/resources/message'

const roomData = { id: 'R_1', name: 'general', kind: 'channel', archived: false, universal: false }

function makeCtx(postReturn: unknown) {
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    resolveUser: mock(async (id: string) => ({ id })),
    resolveRoom: mock(async (id: string) => Room.partial(id, ctx)),
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: { id: data.actorId } as any,
      channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

describe('Room', () => {
  it('exposes data properties', () => {
    const room = new Room(roomData as any, makeCtx(null))
    expect(room.id).toBe('R_1')
    expect(room.name).toBe('general')
  })

  it('Room.partial builds a Room from just an id', () => {
    const ctx = makeCtx(null)
    const room = Room.partial('R_9', ctx)
    expect(room.id).toBe('R_9')
  })

  describe('.send()', () => {
    it('accepts a plain string and returns a hydrated Message', async () => {
      const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }
      const ctx = makeCtx({ message: msgData })
      const room = new Room(roomData as any, ctx)
      const sent = await room.send('hi')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'R_1', body: 'hi' }),
        expect.anything(),
      )
      expect(ctx.hydrateMessage).toHaveBeenCalledWith(msgData)
      expect(sent).toBeInstanceOf(Message)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/resources/room.test.ts`
Expected: FAIL — `room.send('hi')` currently requires a builder / constructor signature mismatch.

- [ ] **Step 3: Write minimal implementation** — rewrite `src/resources/room.ts`

```ts
import type { RoomData } from '../types'
import type { ClientContext } from '../context'
import type { Message } from './message'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { MessageResponseSchema } from '../schemas/message'
import { GetRoomEventsResponseSchema } from '../schemas/room'

export class Room {
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly kind: string
  readonly archived: boolean

  constructor(data: RoomData, private readonly ctx: ClientContext) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.kind = data.kind
    this.archived = data.archived
  }

  static partial(id: string, ctx: ClientContext): Room {
    return new Room({ id, name: id, kind: '', archived: false } as RoomData, ctx)
  }

  async send(payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildCreate(this.id)
    const res = await this.ctx.rest.post(
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
    return this.ctx.hydrateMessage(res.message)
  }

  async fetchHistory(opts: { limit?: number; before?: string } = {}): Promise<Message[]> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.RoomService',
      'GetRoomEvents',
      {
        roomId: this.id,
        limit: opts.limit,
        cursor: opts.before != null ? { before: opts.before } : undefined,
      },
      GetRoomEventsResponseSchema,
    )
    return Promise.all(
      res.page.events
        .filter(e => e.messagePosted != null)
        .map(e => this.ctx.hydrateMessage(e.messagePosted!.message)),
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/resources/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resources/room.ts tests/resources/room.test.ts
git commit -m "refactor: Room takes ClientContext, send() accepts payload and hydrates"
```

---

### Task 5: Message resource — discord.js fields, eager author/channel, payload reply/edit

**Files:**
- Modify: `src/resources/message.ts`
- Modify: `src/resources/user.ts` (remove `PartialUser`)
- Test: `tests/resources/message.test.ts`

**Interfaces:**
- Consumes: `ClientContext`, `User`, `Room`, `resolveMessagePayload`.
- Produces: `Message` constructed as `new Message(data: MessageData, ctx: ClientContext, resolved: { author: User; channel: Room })`. Public fields: `id`, `channelId`, `content?`, `actorId`, `author: User`, `channel: Room`, `createdAt`, `editedAt?`, `inReplyTo?`, `threadRootEventId?`. Methods: `reply(payload: MessagePayload)`, `edit(payload: MessagePayload)`, `delete()`, `react(emoji)`, `removeReaction(emoji)` — all `reply`/`edit` return hydrated `Message`.
- Removes: `PartialUser` class from `src/resources/user.ts`.

- [ ] **Step 1: Write the failing test** — rewrite `tests/resources/message.test.ts`

```ts
import { describe, it, expect, mock } from 'bun:test'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'
import { MessageBuilder } from '../../src/builders/message'

const validMessageData = {
  id: 'evt_1', roomId: 'R_1', createdAt: '2026-07-09T10:00:00Z',
  actorId: 'U_1', body: 'Hello', reactions: [],
}

function makeCtx(postReturn: unknown) {
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    resolveUser: mock(async (id: string) => User.partial(id)),
    resolveRoom: mock(async (id: string) => Room.partial(id, ctx)),
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId),
      channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

function makeMessage(data: any, ctx: any) {
  return new Message(data, ctx, { author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx) })
}

describe('Message', () => {
  it('exposes discord.js-style fields', () => {
    const msg = makeMessage(validMessageData, makeCtx(null))
    expect(msg.id).toBe('evt_1')
    expect(msg.channelId).toBe('R_1')
    expect(msg.content).toBe('Hello')
  })

  it('exposes author as a full User and channel as a Room', () => {
    const msg = makeMessage(validMessageData, makeCtx(null))
    expect(msg.author).toBeInstanceOf(User)
    expect(msg.author.id).toBe('U_1')
    expect(msg.channel).toBeInstanceOf(Room)
    expect(msg.channel.id).toBe('R_1')
  })

  describe('.reply()', () => {
    it('accepts a plain string, sets inReplyTo/threadRoot, returns hydrated Message', async () => {
      const replyData = { ...validMessageData, id: 'evt_2' }
      const ctx = makeCtx({ message: replyData })
      const msg = makeMessage(validMessageData, ctx)
      const reply = await msg.reply('Got it!')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService',
        'CreateMessage',
        expect.objectContaining({ roomId: 'R_1', inReplyTo: 'evt_1', threadRootEventId: 'evt_1', body: 'Got it!' }),
        expect.anything(),
      )
      expect(reply).toBeInstanceOf(Message)
    })

    it('uses existing threadRootEventId when already a thread reply', async () => {
      const threadData = { ...validMessageData, inReplyTo: 'evt_0', threadRootEventId: 'evt_0' }
      const ctx = makeCtx({ message: { ...validMessageData, id: 'evt_2' } })
      const msg = makeMessage(threadData, ctx)
      await msg.reply(new MessageBuilder().setContent('Also replying'))
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'CreateMessage',
        expect.objectContaining({ inReplyTo: 'evt_1', threadRootEventId: 'evt_0' }),
        expect.anything(),
      )
    })
  })

  describe('.edit()', () => {
    it('accepts a plain string and calls UpdateMessage', async () => {
      const ctx = makeCtx({ message: { ...validMessageData, body: 'Updated' } })
      const msg = makeMessage(validMessageData, ctx)
      const updated = await msg.edit('Updated')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'UpdateMessage',
        expect.objectContaining({ roomId: 'R_1', eventId: 'evt_1', body: 'Updated' }),
        expect.anything(),
      )
      expect(updated).toBeInstanceOf(Message)
    })
  })

  describe('.delete() / .react()', () => {
    it('delete calls DeleteMessage', async () => {
      const ctx = makeCtx({ deleted: true })
      await makeMessage(validMessageData, ctx).delete()
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'DeleteMessage',
        { roomId: 'R_1', eventId: 'evt_1' }, expect.anything(),
      )
    })
    it('react calls AddReaction', async () => {
      const ctx = makeCtx({ added: true })
      await makeMessage(validMessageData, ctx).react('👍')
      expect(ctx.rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.MessageService', 'AddReaction',
        { roomId: 'R_1', messageEventId: 'evt_1', emoji: '👍' }, expect.anything(),
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/resources/message.test.ts`
Expected: FAIL — constructor arity / `content`/`channelId` undefined / `reply('Got it!')` type error at runtime.

- [ ] **Step 3a: Remove `PartialUser`** from `src/resources/user.ts`

Delete the entire `PartialUser` class (and its now-unused `RestClient`/`GetUserResponseSchema` imports only if no longer referenced — `GetUserResponseSchema` is used by `UserManager`, so keep the import in the manager; in `user.ts` remove the `import type { RestClient }` and `import { GetUserResponseSchema }` lines if `User` no longer uses them). After removal `user.ts` exports only `User`.

- [ ] **Step 3b: Rewrite `src/resources/message.ts`**

```ts
import type { MessageData } from '../types'
import type { ClientContext } from '../context'
import type { User } from './user'
import type { Room } from './room'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import {
  MessageResponseSchema,
  DeleteMessageResponseSchema,
  AddReactionResponseSchema,
  RemoveReactionResponseSchema,
} from '../schemas/message'

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

  constructor(
    data: MessageData,
    private readonly ctx: ClientContext,
    resolved: { author: User; channel: Room },
  ) {
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
    const res = await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'UpdateMessage',
      { roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel },
      MessageResponseSchema,
    )
    return this.ctx.hydrateMessage(res.message)
  }

  async delete(): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'DeleteMessage',
      { roomId: this.channelId, eventId: this.id },
      DeleteMessageResponseSchema,
    )
  }

  async react(emoji: string): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'AddReaction',
      { roomId: this.channelId, messageEventId: this.id, emoji },
      AddReactionResponseSchema,
    )
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'RemoveReaction',
      { roomId: this.channelId, messageEventId: this.id, emoji },
      RemoveReactionResponseSchema,
    )
  }

  async reply(payload: MessagePayload): Promise<Message> {
    const builder = resolveMessagePayload(payload)
    builder.setReplyTo(this.id)
    builder.setThreadRoot(this.threadRootEventId ?? this.id)
    const input = builder.buildCreate(this.channelId)
    const res = await this.ctx.rest.post(
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
    return this.ctx.hydrateMessage(res.message)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/resources/message.test.ts tests/resources/user.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resources/message.ts src/resources/user.ts tests/resources/message.test.ts
git commit -m "refactor: Message uses content/channel/author fields; reply/edit accept payload; remove PartialUser"
```

---

### Task 6: Managers take ClientContext

**Files:**
- Modify: `src/managers/users.ts`, `src/managers/rooms.ts`, `src/managers/messages.ts`
- Test: `tests/managers/users.test.ts`, `tests/managers/rooms.test.ts`, `tests/managers/messages.test.ts`

**Interfaces:**
- Consumes: `ClientContext` (`ctx.rest`, `ctx.hydrateMessage`).
- Produces: `UserManager(ctx)`, `RoomManager(ctx)`, `MessageManager(ctx)`. `UserManager.fetch/batchFetch/list` unchanged in behavior. `RoomManager.list/fetch` pass `ctx` into `new Room(...)`. `MessageManager.send(roomId, payload: MessagePayload)` and `fetch(roomId, eventId)` both return `ctx.hydrateMessage(res.message)`.

- [ ] **Step 1: Write the failing test** — update the three manager test files. Example for messages (`tests/managers/messages.test.ts`):

```ts
import { describe, it, expect, mock } from 'bun:test'
import { MessageManager } from '../../src/managers/messages'
import { Message } from '../../src/resources/message'
import { Room } from '../../src/resources/room'
import { User } from '../../src/resources/user'

function makeCtx(postReturn: unknown) {
  const ctx: any = {
    rest: { post: mock().mockResolvedValue(postReturn) },
    hydrateMessage: mock(async (data: any) => new Message(data, ctx, {
      author: User.partial(data.actorId), channel: Room.partial(data.roomId, ctx),
    })),
  }
  return ctx
}

const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

describe('MessageManager', () => {
  it('send() accepts a string and returns a hydrated Message', async () => {
    const ctx = makeCtx({ message: msgData })
    const sent = await new MessageManager(ctx).send('R_1', 'hi')
    expect(ctx.rest.post).toHaveBeenCalledWith(
      'chatto.api.v1.MessageService', 'CreateMessage',
      expect.objectContaining({ roomId: 'R_1', body: 'hi' }), expect.anything(),
    )
    expect(sent).toBeInstanceOf(Message)
  })

  it('fetch() returns a hydrated Message', async () => {
    const ctx = makeCtx({ message: msgData })
    const msg = await new MessageManager(ctx).fetch('R_1', 'evt_1')
    expect(ctx.rest.post).toHaveBeenCalledWith(
      'chatto.api.v1.MessageService', 'GetMessage',
      { roomId: 'R_1', eventId: 'evt_1' }, expect.anything(),
    )
    expect(msg.content).toBe('hi')
  })
})
```

For `tests/managers/users.test.ts` and `tests/managers/rooms.test.ts`: replace any `new XManager(restMock)` with `new XManager({ rest: restMock } as any)` (users) or a ctx exposing `rest` (rooms). Room assertions stay the same since `Room` construction now needs ctx — pass the same ctx object.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/managers/`
Expected: FAIL — constructor signature / `send('R_1', 'hi')` mismatch.

- [ ] **Step 3: Write minimal implementation**

`src/managers/users.ts`:
```ts
import type { ClientContext } from '../context'
import { User } from '../resources/user'
import { GetUserResponseSchema, BatchGetUsersResponseSchema, ListUsersResponseSchema } from '../schemas/user'

export class UserManager {
  constructor(private readonly ctx: ClientContext) {}

  async fetch(userId: string): Promise<User> {
    const res = await this.ctx.rest.post('chatto.api.v1.UserService', 'GetUser', { userId }, GetUserResponseSchema)
    return new User(res.user)
  }

  async batchFetch(userIds: string[]): Promise<User[]> {
    const res = await this.ctx.rest.post('chatto.api.v1.UserService', 'BatchGetUsers', { userIds }, BatchGetUsersResponseSchema)
    return res.users.map(m => new User(m))
  }

  async list(opts: { search?: string } = {}): Promise<User[]> {
    const res = await this.ctx.rest.post('chatto.api.v1.UserService', 'ListUsers', { search: opts.search }, ListUsersResponseSchema)
    return res.users.map(m => new User(m))
  }
}
```

`src/managers/rooms.ts`:
```ts
import type { ClientContext } from '../context'
import { ListRoomsResponseSchema, GetRoomResponseSchema } from '../schemas/room'
import { Room } from '../resources/room'

export class RoomManager {
  constructor(private readonly ctx: ClientContext) {}

  async list(): Promise<Room[]> {
    const res = await this.ctx.rest.post('chatto.api.v1.RoomDirectoryService', 'ListRooms', {}, ListRoomsResponseSchema)
    return res.rooms.map(r => new Room(r.room, this.ctx))
  }

  async fetch(roomId: string): Promise<Room> {
    const res = await this.ctx.rest.post('chatto.api.v1.RoomDirectoryService', 'GetRoom', { roomId }, GetRoomResponseSchema)
    return new Room(res.room.room, this.ctx)
  }
}
```

`src/managers/messages.ts`:
```ts
import type { ClientContext } from '../context'
import type { Message } from '../resources/message'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { MessageResponseSchema } from '../schemas/message'

export class MessageManager {
  constructor(private readonly ctx: ClientContext) {}

  async send(roomId: string, payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildCreate(roomId)
    const res = await this.ctx.rest.post(
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
    return this.ctx.hydrateMessage(res.message)
  }

  async fetch(roomId: string, eventId: string): Promise<Message> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'GetMessage',
      { roomId, eventId },
      MessageResponseSchema,
    )
    return this.ctx.hydrateMessage(res.message)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/managers/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/managers tests/managers
git commit -m "refactor: managers take ClientContext; MessageManager.send accepts payload and hydrates"
```

---

### Task 7: Concrete `ChattoContext` with `hydrateMessage`

**Files:**
- Modify: `src/context.ts` (add concrete class)
- Test: `tests/context.test.ts`

**Interfaces:**
- Consumes: `RestClient`, `UserManager`, `RoomManager`, `MessageManager`, `UserCache`, `RoomCache`, `User`, `Room`, `Message`, `MessageData`.
- Produces: `class ChattoContext implements ClientContext` with `constructor(rest: RestClient)`; public `users: UserManager`, `rooms: RoomManager`, `messages: MessageManager`; `resolveUser`/`resolveRoom` delegate to caches; `hydrateMessage(data)` resolves author+channel (falling back to `User.partial`/`Room.partial` on rejection) and returns `new Message(data, this, { author, channel })`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/context.test.ts
import { describe, it, expect, mock } from 'bun:test'
import { ChattoContext } from '../src/context'
import { Message } from '../src/resources/message'

const userMember = {
  user: { id: 'U_1', login: 'ceraia', displayName: 'Ceraia', deleted: false, presenceStatus: 'PRESENCE_STATUS_ONLINE' },
  roles: [],
}
const roomWrap = { room: { id: 'R_1', name: 'general', kind: 'channel', archived: false, universal: false } }
const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }

function restFor(map: Record<string, unknown>) {
  return { post: mock(async (_svc: string, method: string) => map[method]) }
}

describe('ChattoContext.hydrateMessage', () => {
  it('eagerly populates author (full User) and channel (Room)', async () => {
    const rest = restFor({ GetUser: { user: userMember }, GetRoom: { room: roomWrap } })
    const ctx = new ChattoContext(rest as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg).toBeInstanceOf(Message)
    expect(msg.author.displayName).toBe('Ceraia')
    expect(msg.channel.name).toBe('general')
  })

  it('caches users across hydrations (GetUser called once)', async () => {
    const rest = restFor({ GetUser: { user: userMember }, GetRoom: { room: roomWrap } })
    const ctx = new ChattoContext(rest as any)
    await ctx.hydrateMessage(msgData as any)
    await ctx.hydrateMessage(msgData as any)
    const getUserCalls = (rest.post as any).mock.calls.filter((c: any[]) => c[1] === 'GetUser')
    expect(getUserCalls).toHaveLength(1)
  })

  it('falls back to a partial author when the user fetch fails', async () => {
    const rest = { post: mock(async (_s: string, method: string) => {
      if (method === 'GetUser') throw new Error('boom')
      if (method === 'GetRoom') return { room: roomWrap }
      return undefined
    }) }
    const ctx = new ChattoContext(rest as any)
    const msg = await ctx.hydrateMessage(msgData as any)
    expect(msg.author.id).toBe('U_1')
    expect(msg.author.displayName).toBe('U_1') // partial fallback
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/context.test.ts`
Expected: FAIL — `ChattoContext is not a constructor`.

- [ ] **Step 3: Write minimal implementation** — append to `src/context.ts` (keep the existing interface)

```ts
import { UserManager } from './managers/users'
import { RoomManager } from './managers/rooms'
import { MessageManager } from './managers/messages'
import { UserCache, RoomCache } from './caches'
import { User } from './resources/user'
import { Room } from './resources/room'
import { Message } from './resources/message'

export class ChattoContext implements ClientContext {
  readonly rest: RestClient
  readonly users: UserManager
  readonly rooms: RoomManager
  readonly messages: MessageManager
  private readonly userCache: UserCache
  private readonly roomCache: RoomCache

  constructor(rest: RestClient) {
    this.rest = rest
    this.users = new UserManager(this)
    this.rooms = new RoomManager(this)
    this.messages = new MessageManager(this)
    this.userCache = new UserCache(id => this.users.fetch(id))
    this.roomCache = new RoomCache(id => this.rooms.fetch(id))
  }

  resolveUser(id: string): Promise<User> {
    return this.userCache.resolve(id)
  }

  resolveRoom(id: string): Promise<Room> {
    return this.roomCache.resolve(id)
  }

  async hydrateMessage(data: MessageData): Promise<Message> {
    const [author, channel] = await Promise.all([
      this.resolveUser(data.actorId).catch(() => User.partial(data.actorId)),
      this.resolveRoom(data.roomId).catch(() => Room.partial(data.roomId, this)),
    ])
    return new Message(data, this, { author, channel })
  }
}
```

Note: change the top-of-file type imports that are now used as values — `User`, `Room`, `Message` must be regular `import` (not `import type`) since they are referenced at runtime here; `RestClient`, `MessageData` remain `import type`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context.ts tests/context.test.ts
git commit -m "feat: add ChattoContext with eager, cached message hydration"
```

---

### Task 8: Wire `ChattoClient` to `ChattoContext`

**Files:**
- Modify: `src/client.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
- Consumes: `ChattoContext`.
- Produces: `ChattoClient` exposing `rooms`/`messages`/`users` from the context; realtime `messageCreate`/`messageUpdate` emit fully-hydrated `Message`s (via `this.ctx.messages.fetch`). Public constructor signature and `static login` unchanged.

- [ ] **Step 1: Write the failing test** — extend `tests/client.test.ts` with a hydration assertion; keep existing tests.

```ts
import { UserManager } from '../src/managers/users'

it('exposes users manager', () => {
  const client = makeClient(makeMockRt())
  expect(client.users).toBeInstanceOf(UserManager)
})

it('emits a hydrated Message with author and channel on messageCreate', async () => {
  const mockRt = makeMockRt()
  // rest.post is used by messages.fetch (GetMessage), then GetUser, then GetRoom
  const client = new ChattoClient(
    { baseUrl: 'https://chat.example.com', token: 'tk' },
    () => mockRt as any,
  )
  // Stub the context's rest via the messages manager path:
  const msgData = { id: 'evt_1', roomId: 'R_1', createdAt: 't', actorId: 'U_1', body: 'hi', reactions: [] }
  const userMember = { user: { id: 'U_1', login: 'l', displayName: 'Name', deleted: false, presenceStatus: 'PRESENCE_STATUS_ONLINE' }, roles: [] }
  const roomWrap = { room: { id: 'R_1', name: 'general', kind: 'channel', archived: false, universal: false } }
  ;(client as any).ctx.rest.post = mock(async (_s: string, method: string) => {
    if (method === 'GetMessage') return { message: msgData }
    if (method === 'GetUser') return { user: userMember }
    if (method === 'GetRoom') return { room: roomWrap }
  })
  const received: any[] = []
  client.on('messageCreate', m => received.push(m))
  mockRt.emit('frame', { type: 'message.posted', payload: { roomId: 'R_1', eventId: 'evt_1' } })
  await new Promise(r => setTimeout(r, 10))
  expect(received[0]?.author.displayName).toBe('Name')
  expect(received[0]?.channel.name).toBe('general')
})
```

Note: the exact `frame` shape must match what `mapFrameToEvent` expects for a `messageCreate`. Before writing the assertion, open `src/realtime/events.ts` and `src/realtime/frames.ts` and copy a real `messageCreate` frame shape (fields `roomId` + `messageEventId` come out of the mapped event). Adjust the emitted `frame` object to whatever `mapFrameToEvent` parses into `{ kind: 'messageCreate', roomId, messageEventId }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/client.test.ts`
Expected: FAIL — `client.users` undefined / `ctx` not present.

- [ ] **Step 3: Write minimal implementation** — edit `src/client.ts`

Replace the manager construction and realtime hydration. Key changes:

```ts
import { ChattoContext } from './context'
// remove direct manager imports used only for construction; keep type imports if needed
```

In the class:
```ts
export class ChattoClient extends EventEmitter<ClientEventMap> {
  readonly rooms: RoomManager
  readonly messages: MessageManager
  readonly users: UserManager
  private readonly rest: RestClient
  private readonly realtime: RealtimeConnection
  private readonly ctx: ChattoContext

  constructor(options: ChattoClientOptions, realtimeFactory?: (wsUrl: string, token: string) => RealtimeConnection) {
    super()
    const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime'
    this.rest = new RestClient(options.baseUrl, options.token)
    this.realtime = realtimeFactory ? realtimeFactory(wsUrl, options.token) : new RealtimeConnection(wsUrl, options.token)
    this.ctx = new ChattoContext(this.rest)
    this.rooms = this.ctx.rooms
    this.messages = this.ctx.messages
    this.users = this.ctx.users
    this.wireRealtime()
  }
```

`wireRealtime` hydration block stays the same (it already calls `this.messages.fetch(...)`, which now returns a fully-hydrated `Message`). Keep `RoomManager`/`MessageManager`/`UserManager` as **type** imports for the field declarations.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts tests/client.test.ts
git commit -m "refactor: ChattoClient builds ChattoContext and emits hydrated messages"
```

---

### Task 9: Update exports and run the full suite + typecheck

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Produces: public exports — `ChattoClient`, `MessageBuilder`, `loginWithPassword`, errors; type exports `Message`, `Room`, `User`, `MessagePayload`, `LoginResult`, and the existing `types.ts` re-exports. `PartialUser` export is removed.

- [ ] **Step 1: Edit `src/index.ts`**

```ts
export { ChattoClient } from './client'
export { MessageBuilder } from './builders/message'
export { loginWithPassword } from './auth/integrated'
export { ChattoApiError, ChattoParseError } from './errors'
export type { Message } from './resources/message'
export type { Room } from './resources/room'
export type { User } from './resources/user'
export type { MessagePayload } from './builders/payload'
export type { LoginResult } from './auth/integrated'
export type {
  MessageData,
  RoomData,
  CreateMessageInput,
  UpdateMessageInput,
  MessageDeleteEvent,
  ReactionEvent,
  ChattoClientOptions,
  UserData,
  DirectoryMemberData,
} from './types'
```

- [ ] **Step 2: Run the full test suite**

Run: `bun test`
Expected: PASS — all suites green (no `PartialUser` references remain).

- [ ] **Step 3: Run the typechecker**

Run: `bun run typecheck`
Expected: no errors. Fix any remaining `PartialUser`/`body`/`roomId`/`updatedAt` references the compiler surfaces (e.g. `src/example.ts` if it uses old fields — update or delete it).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "refactor: update public exports for discord.js-style API"
```

---

### Task 10: Live integration tests (env-gated) + credential hygiene

**Files:**
- Modify: `.gitignore`
- Create: `.env` (gitignored, NOT committed)
- Create: `tests/integration/live.test.ts`

**Interfaces:**
- Consumes: `ChattoClient` from `src/index`. Env: `CHATTO_BASE_URL`, `CHATTO_LOGIN`, `CHATTO_PASSWORD`, optional `CHATTO_TEST_ROOM`.

- [ ] **Step 1: Add `.env` to `.gitignore`**

Append a line `\.env` (literal `.env`) to `.gitignore`. Then verify:

Run: `git check-ignore .env`
Expected: prints `.env` (confirming it is ignored).

- [ ] **Step 2: Create the gitignored `.env`** (credentials copied from the existing gitignored `./test/index.ts` runner — never write real credentials into any tracked file, including this plan)

Read the base URL, login, and password from the existing gitignored
`./test/index.ts` (the standalone live runner already holds the test account's
credentials) and write them into a new root `.env` using these variable names.
Do not paste the real values into any committed file:

```
CHATTO_BASE_URL=<baseUrl from ./test/index.ts>
CHATTO_LOGIN=<login from ./test/index.ts>
CHATTO_PASSWORD=<password from ./test/index.ts>
# Optional: a room the test account can post to, to exercise send/reply live
# CHATTO_TEST_ROOM=R_xxx
```

Run: `git status --porcelain .env`
Expected: **no output** (file is ignored, not staged).

- [ ] **Step 3: Write the live test**

```ts
// tests/integration/live.test.ts
import { describe, it, expect } from 'bun:test'
import { ChattoClient } from '../../src/index'

const baseUrl = process.env.CHATTO_BASE_URL
const login = process.env.CHATTO_LOGIN
const password = process.env.CHATTO_PASSWORD
const testRoom = process.env.CHATTO_TEST_ROOM
const hasCreds = Boolean(baseUrl && login && password)

if (!hasCreds) {
  // eslint-disable-next-line no-console
  console.log('[live] skipping — set CHATTO_BASE_URL/LOGIN/PASSWORD in .env to run')
}

describe.if(hasCreds)('live integration', () => {
  it('logs in and lists users', async () => {
    const client = await ChattoClient.login({ baseUrl: baseUrl!, login: login!, password: password! })
    const users = await client.users.list()
    expect(Array.isArray(users)).toBe(true)
    expect(users.length).toBeGreaterThan(0)
    expect(users[0].displayName).toBeString()
  })

  it.if(Boolean(testRoom))('sends and replies, with eager author/channel populated', async () => {
    const client = await ChattoClient.login({ baseUrl: baseUrl!, login: login!, password: password! })
    const room = await client.rooms.fetch(testRoom!)
    const sent = await room.send('chatto.ts live test ✅')
    expect(sent.author.id).toBeString()
    expect(sent.author.displayName).toBeString()
    expect(sent.channel.id).toBe(testRoom!)
    const reply = await sent.reply('reply via .reply()')
    expect(reply.inReplyTo).toBe(sent.id)
  }, 20000)
})
```

- [ ] **Step 4: Run the live suite two ways**

Run (no env, from a clean shell): `env -u CHATTO_BASE_URL -u CHATTO_LOGIN -u CHATTO_PASSWORD bun test tests/integration/live.test.ts`
Expected: suite **skips** (0 tests run / skipped), exit code 0, prints the `[live] skipping` line.

Run (with `.env` present): `bun test tests/integration/live.test.ts`
Expected: login + list test PASSES against the real server. (The send/reply test runs only if `CHATTO_TEST_ROOM` is set.)

- [ ] **Step 5: Commit (test file + .gitignore only — NOT `.env`)**

```bash
git add tests/integration/live.test.ts .gitignore
git status   # confirm .env is NOT listed
git commit -m "test: add env-gated live integration suite; gitignore .env"
```

---

## Self-Review

**Spec coverage:**
- `reply('text')` / string payloads → Tasks 1, 5 (reply/edit), 4 & 6 (send). ✅
- Eager full `author` → Tasks 5 (field), 7 (hydration), 8 (realtime path). ✅
- `message.channel` with `.send()` → Tasks 4, 5, 7. ✅
- Naming map (`content`/`channelId`/`editedAt`/`username`) → Tasks 2, 5. ✅
- Keep `Room`/`client.rooms`; remove `PartialUser` → Tasks 5, 6, 8. ✅
- ClientContext + caches → Tasks 3, 7. ✅
- Error-handling fallback → Task 7 (`.catch(() => *.partial(...))`). ✅
- Unit tests for normalization, caches, hydration, string reply/send, fallback → Tasks 1, 3, 5, 6, 7. ✅
- Env-gated live tests + `.env` gitignored, creds moved, skips cleanly → Task 10. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. The one research note (Task 8, Step 1) explicitly directs reading `realtime/events.ts`/`frames.ts` to copy the exact frame shape — necessary because the mock must match the real parser; it is not a code placeholder.

**Type consistency:** `ClientContext` methods (`rest`, `resolveUser`, `resolveRoom`, `hydrateMessage`) are used identically across Tasks 3–8. `Message` constructor `(data, ctx, { author, channel })` matches in Tasks 5, 6, 7. `resolveMessagePayload` signature matches across Tasks 1, 4, 5, 6. `User.partial(id)` / `Room.partial(id, ctx)` consistent in Tasks 2, 4, 7. Field renames (`content`, `channelId`, `channel`, `author`, `editedAt`) consistent in Tasks 5, 8, 10.
