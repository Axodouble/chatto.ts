import type { ClientContext } from '../context'
import { User } from '../resources/user'
import { GetUserResponseSchema, BatchGetUsersResponseSchema, ListUsersResponseSchema } from '../schemas/user'

export class UserManager {
  constructor(private readonly ctx: ClientContext) {}

  async fetch(userId: string): Promise<User> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.UserService',
      'GetUser',
      { userId },
      GetUserResponseSchema,
    )
    return new User(res.user)
  }

  async batchFetch(userIds: string[]): Promise<User[]> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.UserService',
      'BatchGetUsers',
      { userIds },
      BatchGetUsersResponseSchema,
    )
    return res.users.map(m => new User(m))
  }

  async list(opts: { search?: string } = {}): Promise<User[]> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.UserService',
      'ListUsers',
      { search: opts.search },
      ListUsersResponseSchema,
    )
    return res.users.map(m => new User(m))
  }
}
