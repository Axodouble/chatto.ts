import { describe, it, expect } from 'bun:test'
import { User } from '../../src/resources/user'

const validMember = {
  user: {
    id: 'user_1',
    login: 'ceraia',
    displayName: 'Ceraia',
    deleted: false,
    avatarUrl: 'https://example.com/avatar.png',
    presenceStatus: 'PRESENCE_STATUS_ONLINE' as const,
    customStatus: { emoji: '🎉', text: 'Celebrating' },
  },
  roles: ['everyone', 'admin'],
  createdAt: '2026-01-01T00:00:00Z',
}

describe('User', () => {
  it('exposes all data properties', () => {
    const user = new User(validMember)
    expect(user.id).toBe('user_1')
    expect(user.login).toBe('ceraia')
    expect(user.displayName).toBe('Ceraia')
    expect(user.deleted).toBe(false)
    expect(user.avatarUrl).toBe('https://example.com/avatar.png')
    expect(user.presenceStatus).toBe('PRESENCE_STATUS_ONLINE')
    expect(user.customStatus?.emoji).toBe('🎉')
    expect(user.roles).toEqual(['everyone', 'admin'])
    expect(user.createdAt).toBe('2026-01-01T00:00:00Z')
  })
})

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
