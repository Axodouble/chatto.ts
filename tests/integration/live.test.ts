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
