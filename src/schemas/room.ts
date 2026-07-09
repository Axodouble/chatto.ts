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

export const ListRoomsResponseSchema = z.object({
  rooms: z.array(RoomWithViewerStateSchema),
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
    events: z.array(RoomTimelineEventSchema),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
    hasOlder: z.boolean().default(false),
    hasNewer: z.boolean().default(false),
  }),
})
