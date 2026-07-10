import { describe, it, expect, mock } from 'bun:test'
import { UserManager } from '../../src/managers/users'
import { User } from '../../src/resources/user'

const validMember = {
  user: {
    id: 'user_1',
    login: 'ceraia',
    displayName: 'Ceraia',
    deleted: false,
    presenceStatus: 'PRESENCE_STATUS_OFFLINE' as const,
  },
  roles: ['everyone'],
  createdAt: '2026-01-01T00:00:00Z',
}

function makeRestMock(returnValue: unknown) {
  return { post: mock().mockResolvedValue(returnValue) }
}

describe('UserManager', () => {
  describe('.fetch()', () => {
    it('calls GetUser and returns a User', async () => {
      const rest = makeRestMock({ user: validMember })
      const manager = new UserManager({ rest } as any)
      const user = await manager.fetch('user_1')
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.UserService',
        'GetUser',
        { userId: 'user_1' },
        expect.anything(),
      )
      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe('user_1')
      expect(user.login).toBe('ceraia')
    })
  })

  describe('.batchFetch()', () => {
    it('calls BatchGetUsers and returns User[]', async () => {
      const member2 = { ...validMember, user: { ...validMember.user, id: 'user_2', login: '46sx' } }
      const rest = makeRestMock({ users: [validMember, member2] })
      const manager = new UserManager({ rest } as any)
      const users = await manager.batchFetch(['user_1', 'user_2'])
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.UserService',
        'BatchGetUsers',
        { userIds: ['user_1', 'user_2'] },
        expect.anything(),
      )
      expect(users).toHaveLength(2)
      expect(users[0]).toBeInstanceOf(User)
      expect(users[1].login).toBe('46sx')
    })
  })

  describe('.list()', () => {
    it('calls ListUsers with no search and returns User[]', async () => {
      const rest = makeRestMock({ users: [validMember] })
      const manager = new UserManager({ rest } as any)
      const users = await manager.list()
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.UserService',
        'ListUsers',
        { search: undefined },
        expect.anything(),
      )
      expect(users).toHaveLength(1)
      expect(users[0]).toBeInstanceOf(User)
    })

    it('passes search term when provided', async () => {
      const rest = makeRestMock({ users: [validMember] })
      const manager = new UserManager({ rest } as any)
      await manager.list({ search: 'ceraia' })
      expect(rest.post).toHaveBeenCalledWith(
        'chatto.api.v1.UserService',
        'ListUsers',
        { search: 'ceraia' },
        expect.anything(),
      )
    })
  })
})
