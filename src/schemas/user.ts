import { z } from 'zod'

export const PresenceStatusSchema = z.enum([
  'PRESENCE_STATUS_UNSPECIFIED',
  'PRESENCE_STATUS_ONLINE',
  'PRESENCE_STATUS_AWAY',
  'PRESENCE_STATUS_DO_NOT_DISTURB',
  'PRESENCE_STATUS_OFFLINE',
])

export const CustomUserStatusSchema = z.object({
  emoji: z.string(),
  text: z.string(),
  expiresAt: z.string().optional(),
})

export const UserSchema = z.object({
  id: z.string(),
  login: z.string(),
  displayName: z.string(),
  deleted: z.boolean().default(false),
  avatarUrl: z.string().optional(),
  presenceStatus: PresenceStatusSchema,
  customStatus: CustomUserStatusSchema.optional(),
})

export const DirectoryMemberSchema = z.object({
  user: UserSchema,
  roles: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
})

export const GetUserResponseSchema = z.object({ user: DirectoryMemberSchema })
// proto3 JSON omits empty repeated fields, so `users` is absent when there are
// no results (e.g. a search matching nobody comes back as `{ page: {} }`).
export const BatchGetUsersResponseSchema = z.object({ users: z.array(DirectoryMemberSchema).default([]) })
export const ListUsersResponseSchema = z.object({ users: z.array(DirectoryMemberSchema).default([]) })

export const UpdatePresenceResponseSchema = z.object({
  status: PresenceStatusSchema,
})

export const UpdateCustomStatusResponseSchema = z.object({
  status: CustomUserStatusSchema,
})

export const DeleteCustomStatusResponseSchema = z.object({
  status: CustomUserStatusSchema.optional(),
})
