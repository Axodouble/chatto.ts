import { describe, it, expect } from 'bun:test'
import { ChattoClient } from '../../src/index'
import type { Message, ReactionEvent, MessageDeleteEvent } from '../../src/index'

const baseUrl = process.env.CHATTO_BASE_URL
const login = process.env.CHATTO_LOGIN
const password = process.env.CHATTO_PASSWORD
const testRoom = process.env.CHATTO_TEST_ROOM
const hasCreds = Boolean(baseUrl && login && password)

if (!hasCreds) {
  // eslint-disable-next-line no-console
  console.log('[live] skipping — set CHATTO_BASE_URL/LOGIN/PASSWORD in .env to run')
}

// Minimal emitter surface so the helper can (un)subscribe by event name.
interface EmitterLike {
  on(event: string, handler: (payload: never) => void): unknown
  off(event: string, handler: (payload: never) => void): unknown
}

// Attaches the listener BEFORE firing the trigger (so a fast server echo can't be
// missed), resolves with the trigger's result and the first event matching
// `predicate`, rejects on timeout, and always removes its listener + timer.
async function expectEvent<T, R>(
  client: ChattoClient,
  event: string,
  trigger: () => Promise<R>,
  predicate: (payload: T) => boolean,
  timeoutMs = 15000,
): Promise<{ triggered: R; event: T }> {
  const emitter = client as unknown as EmitterLike
  let cleanup = () => {}
  const received = new Promise<T>((resolve, reject) => {
    const handler = (payload: T) => {
      if (predicate(payload)) {
        cleanup()
        resolve(payload)
      }
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out after ${timeoutMs}ms waiting for '${event}' event`))
    }, timeoutMs)
    cleanup = () => {
      clearTimeout(timer)
      emitter.off(event, handler as (payload: never) => void)
    }
    emitter.on(event, handler as (payload: never) => void)
  })
  const triggered = await trigger()
  return { triggered, event: await received }
}

function expectRecentIso(value: string): void {
  expect(Number.isNaN(Date.parse(value))).toBe(false)
  const ts = Date.parse(value)
  // Within a sane window: after 2020, not absurdly in the future. Guards against
  // garbage timestamps (e.g. epoch 0 / NaN) sneaking through decode.
  expect(ts).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'))
  expect(ts).toBeLessThan(Date.parse('2100-01-01T00:00:00Z'))
}

describe.if(hasCreds)('live integration', () => {
  it('logs in and lists users', async () => {
    const client = await ChattoClient.login({ baseUrl: baseUrl!, login: login!, password: password! })
    await client.connect()
    try {
      const users = await client.users.list()
      expect(Array.isArray(users)).toBe(true)
      expect(users.length).toBeGreaterThan(0)
      expect(users[0].displayName).toBeString()
    } finally {
      await client.disconnect()
    }
  })

  it.if(Boolean(testRoom))('sends and replies, with eager author/channel populated', async () => {
    const client = await ChattoClient.login({ baseUrl: baseUrl!, login: login!, password: password! })
    const room = await client.rooms.fetch(testRoom!)
    const sent = await room.send('chatto.ts live test ✅')
    expect(sent.author.id).toBeString()
    expect(sent.author.displayName).toBeString()
    expect(sent.author.login.toLowerCase()).toBe(login!.toLowerCase())
    expect(sent.channel.id).toBe(testRoom!)
    expectRecentIso(sent.createdAt)
    const reply = await sent.reply('reply via .reply()')
    expect(reply.inReplyTo).toBe(sent.id)
  }, 20000)

  it.if(Boolean(testRoom))('round-trips every realtime event over a message lifecycle', async () => {
    const client = await ChattoClient.login({ baseUrl: baseUrl!, login: login!, password: password! })
    const errors: Error[] = []
    client.on('error', err => errors.push(err))

    await client.connect()
    try {
      const room = await client.rooms.fetch(testRoom!)
      const marker = `chatto.ts lifecycle ${Date.now()}`

      // send → messageCreate
      const { triggered: sent, event: created } = await expectEvent<Message, Message>(
        client,
        'messageCreate',
        () => room.send(marker),
        m => m.content === marker,
      )
      expect(created.id).toBe(sent.id)
      expect(created.channel.id).toBe(testRoom!)
      expectRecentIso(created.createdAt)

      // edit → messageUpdate
      const editedContent = `${marker} (edited)`
      const { event: updated } = await expectEvent<Message, Message>(
        client,
        'messageUpdate',
        () => sent.edit(editedContent),
        m => m.id === sent.id,
      )
      expect(updated.content).toBe(editedContent)

      // react → reactionAdd. The server accepts bare shortcodes ("thumbsup"),
      // not unicode ("👍") or colon-wrapped (":thumbsup:") forms.
      const emoji = 'thumbsup'
      const { event: added } = await expectEvent<ReactionEvent, void>(
        client,
        'reactionAdd',
        () => sent.react(emoji),
        e => e.messageEventId === sent.id && e.emoji === emoji,
      )
      expect(added.messageEventId).toBe(sent.id)

      // removeReaction → reactionRemove
      const { event: removed } = await expectEvent<ReactionEvent, void>(
        client,
        'reactionRemove',
        () => sent.removeReaction(emoji),
        e => e.messageEventId === sent.id && e.emoji === emoji,
      )
      expect(removed.messageEventId).toBe(sent.id)

      // delete → messageDelete
      const { event: deleted } = await expectEvent<MessageDeleteEvent, void>(
        client,
        'messageDelete',
        () => sent.delete(),
        e => e.eventId === sent.id,
      )
      expect(deleted.eventId).toBe(sent.id)

      // Any decode / hydration failure surfaces as an 'error' event — assert none fired.
      expect(errors).toEqual([])
    } finally {
      await client.disconnect()
    }
  }, 30000)
})
