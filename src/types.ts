import type { z } from 'zod'
import type {
  MessageSchema,
  MessageReactionSchema,
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from './schemas/message'
import type {
  AssetSchema,
  MessageAttachmentSchema,
  AssetUploadSchema,
  MessageVideoProcessingSchema,
} from './schemas/asset'
import type { RoomSchema } from './schemas/room'
import type { MessageDeleteEventSchema, ReactionEventSchema } from './schemas/realtime'
import type { UserSchema, DirectoryMemberSchema } from './schemas/user'
import { Message } from './resources/message'

export type MessageData = z.infer<typeof MessageSchema>
export type MessageReaction = z.infer<typeof MessageReactionSchema>
export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>
export type UpdateMessageInput = z.infer<typeof UpdateMessageInputSchema>
export type RoomData = z.infer<typeof RoomSchema>
export type MessageDeleteEvent = z.infer<typeof MessageDeleteEventSchema>
export type ReactionEvent = z.infer<typeof ReactionEventSchema>
export type UserData = z.infer<typeof UserSchema>
export type DirectoryMemberData = z.infer<typeof DirectoryMemberSchema>
export type AssetData = z.infer<typeof AssetSchema>
export type MessageAttachmentData = z.infer<typeof MessageAttachmentSchema>
export type AssetUploadData = z.infer<typeof AssetUploadSchema>
export type VideoProcessingData = z.infer<typeof MessageVideoProcessingSchema>

/** A file to upload: raw bytes plus metadata. */
export interface FileInput {
  data: Uint8Array | ArrayBuffer
  filename: string
  /** MIME type; defaults to `application/octet-stream` when omitted. */
  contentType?: string
}

/** Thumbnail transform options for asset reads. */
export interface ThumbnailOptions {
  width: number
  height: number
  fit?: 'contain' | 'cover'
}

export interface ChattoClientOptions {
  baseUrl: string
  token: string
}
export interface ClientEventMap {
  ready: []
  messageCreate: [message: Message]
  messageUpdate: [message: Message]
  messageDelete: [event: MessageDeleteEvent]
  reactionAdd: [event: ReactionEvent]
  reactionRemove: [event: ReactionEvent]
  error: [err: Error]
  disconnect: []
}