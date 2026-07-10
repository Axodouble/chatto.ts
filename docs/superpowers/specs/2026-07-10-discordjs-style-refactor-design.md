# Design: discord.js-style refactor of chatto.ts

Date: 2026-07-10

## Goal

Make the chatto.ts resource API act and feel like discord.js so users bring
their discord.js muscle memory. Concretely:

- `message.reply('text')` works with a plain string (not only a `MessageBuilder`).
- `message.author` exposes user information directly (`displayName`, `avatarUrl`,
  `login`) with **no `await`** — like discord.js's synchronous `message.author`.
- `message.channel` is present and can `.send()`.
- Field names match discord.js where it is unambiguous (`content`, `channelId`,
  `editedAt`).

Package is pre-1.0 (v0.3.2) and its own description already says
"Discord.js-like", so a breaking rename is acceptable.

## Constraints discovered during exploration

- The API `Message` payload (`proto/chatto/api/v1/message_types.proto`) carries
  only `actor_id` — **no inline author display data**. Therefore populating a
  full `message.author` synchronously requires the client to fetch the user
  during message hydration and cache it.
- A per-room fetch endpoint exists: `RoomDirectoryService.GetRoom`
  (`RoomManager.fetch(roomId)`), so eager `message.channel` hydration is feasible
  via a room cache.
- Tests use `bun test`. There is an existing standalone `./test/index.ts` live
  script (gitignored) using real credentials, plus a mocked unit suite in
  `tests/`.

## Naming map

| Today | After | Notes |
|---|---|---|
| `message.body` | `message.content` | discord.js name |
| `message.roomId` | `message.channelId` | keep the raw id available |
| `message.author` (`PartialUser`, needs `.fetch()`) | `message.author` (full `User`, eager) | `.displayName`, `.avatarUrl`, `.login`, `.username` available synchronously |
| *(none)* | `message.channel` (full `Room`, eager, has `.send()`) | primary discord.js accessor |
| `message.updatedAt` | `message.editedAt` | discord.js name |
| `User` | `User` + `.username` getter aliasing `.login` | discord.js familiarity |

Decisions:

- **Keep** the `Room` class name and `client.rooms` manager (Chatto's domain word
  is "room"); expose the room on a message as `message.channel`. Not renaming to
  `Channel`/`client.channels`.
- **Remove** `PartialUser` — `message.author` is now a full eager `User`. It was
  only used by `Message`.

## Flexible message payloads

`message.reply(...)`, `channel.send(...)`, `MessageManager.send(...)`, and
`message.edit(...)` accept:

```ts
type MessagePayload = string | { content: string; alsoSendToChannel?: boolean } | MessageBuilder
```

A helper `resolveMessagePayload(input): MessageBuilder` normalizes all three:

- `string` → `new MessageBuilder().setContent(input)`
- object → builder with the given fields
- `MessageBuilder` → returned as-is

The existing `MessageBuilder` stays for advanced/threaded use.

## Architecture: ClientContext + caches

The core structural change. Resources currently receive a bare `RestClient`.
They will instead receive a shared context so they can resolve related entities
and return fully-hydrated messages.

```ts
interface ClientContext {
  rest: RestClient
  users: UserCache
  rooms: RoomCache
  hydrateMessage(data: MessageData): Promise<Message>
}
```

- `UserCache` — thin `Map<string, User>` wrapper over `UserManager`.
  `resolve(id): Promise<User>` fetches once, then serves from cache.
- `RoomCache` — thin `Map<string, Room>` wrapper over `RoomManager`.
  `resolve(id): Promise<Room>` fetches once, then serves from cache.
- `hydrateMessage(data)` — constructs a `Message` from raw `MessageData`, then
  resolves `author` (users cache) and `channel` (rooms cache) and attaches the
  full objects before returning.

`ChattoClient` owns the single `ClientContext` instance (one set of caches per
client) and passes it into managers/resources.

### Data flow

Every path that yields a user-visible `Message` goes through `hydrateMessage`, so
`author` and `channel` are always populated:

- Realtime `messageCreate` / `messageUpdate`: client fetches the raw message,
  then `hydrateMessage` → emit populated `Message`.
- `channel.send()`, `message.reply()`, `message.edit()`, `MessageManager.fetch()`
  / `send()`: build raw message from the REST response → `hydrateMessage` →
  return populated `Message`.

Repeat authors/rooms cost zero extra requests thanks to the caches.
Because caches are permanent for the client's lifetime, the cached `author`/`channel`
are point-in-time snapshots — volatile fields (presence, display name, room name) do
not refresh; call `client.users.fetch(id)`/`client.rooms.fetch(id)` for live data.

### Error handling

If an author or room fetch fails during hydration, hydration falls back to a
minimal `User`/`Room` constructed from the id alone (e.g. `displayName`/`name`
defaulting to the id) so the message still emits, rather than throwing and
dropping the event. A hydration-path failure does not surface as a client
`error` event unless the underlying message fetch itself fails.

## Component boundaries

- `builders/message.ts` — `MessageBuilder` unchanged; add `resolveMessagePayload`
  helper (here or a small `builders/payload.ts`).
- `resources/user.ts` — `User` gains `username` getter; `PartialUser` removed.
- `resources/room.ts` — constructor takes `ClientContext`; `send()` accepts
  `MessagePayload`; returns hydrated `Message`.
- `resources/message.ts` — constructor takes `ClientContext` and optional
  pre-resolved `author`/`channel`; `content`/`channelId`/`editedAt` fields;
  `reply`/`edit` accept `MessagePayload`; returns hydrated `Message`.
- `caches/` (new) — `UserCache`, `RoomCache`.
- `managers/*` — constructed with `ClientContext`; `MessageManager.send()`
  accepts `MessagePayload` and returns hydrated messages.
- `client.ts` — builds the `ClientContext`; realtime hydration uses
  `hydrateMessage`.

## Testing

### Unit (mocked, part of `bun test`)

- Update existing `tests/resources/{message,room,user}.test.ts`,
  `tests/client.test.ts`, `tests/managers/*` for the new shapes.
- New coverage:
  - `resolveMessagePayload` for string / object / builder inputs.
  - `UserCache` / `RoomCache` fetch-once-then-cache behavior (assert the manager
    is called once for repeated ids).
  - Eager hydration: on `messageCreate`, the emitted `Message` has a populated
    `author` (with `displayName`) and `channel`, using a mocked `rest`.
  - `reply` / `send` / `edit` accepting a plain string.
  - Hydration fallback when author/room fetch rejects.

### Integration (live test account)

- New `tests/integration/live.test.ts`.
- Reads `CHATTO_BASE_URL`, `CHATTO_LOGIN`, `CHATTO_PASSWORD` from env (Bun
  auto-loads `.env`).
- `const hasCreds = Boolean(baseUrl && login && password)` →
  `describe.if(hasCreds)('live', ...)` so the suite **skips cleanly** when env is
  absent (CI and other contributors are not blocked).
- Coverage: `ChattoClient.login`, `client.users.list()`, and a real
  `messageCreate` asserting `author`/`channel` are populated eagerly, plus a
  `message.reply('...')`.
- The current `./test` credentials move into a gitignored `.env` at the repo
  root. `.env` is added to `.gitignore`. Credentials are never committed.

## Out of scope (YAGNI)

- Attachments, link previews, thread summaries, reactions listing (present in the
  proto) beyond what already exists.
- Renaming `Room`→`Channel` / `client.rooms`→`client.channels`.
- A public client-wide cache API (`client.users.cache`) — caches stay internal.
