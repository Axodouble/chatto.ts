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

// proto3 JSON omits empty repeated fields, so `rooms` is absent when the caller
// is a member of no rooms.
export const ListRoomsResponseSchema = z.object({
  rooms: z.array(RoomWithViewerStateSchema).default([]),
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
    // Omitted entirely (proto3 JSON) when a page has no events — default to [].
    events: z.array(RoomTimelineEventSchema).default([]),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
    hasOlder: z.boolean().default(false),
    hasNewer: z.boolean().default(false),
  }),
})
