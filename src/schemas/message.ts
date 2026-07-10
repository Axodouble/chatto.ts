import { z } from 'zod'

export const CreateMessageInputSchema = z.object({
  roomId: z.string(),
  body: z.string().optional(),
  inReplyTo: z.string().optional(),
  threadRootEventId: z.string().optional(),
  alsoSendToChannel: z.boolean().optional(),
})

export const UpdateMessageInputSchema = z.object({
  roomId: z.string(),
  eventId: z.string(),
  body: z.string().optional(),
  alsoSendToChannel: z.boolean().optional(),
})
