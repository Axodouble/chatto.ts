import type { MessageData } from '../types'
import type { ClientContext } from '../context'
import type { User } from './user'
import type { Room } from './room'
import type { MessagePayload } from '../builders/payload'
import { Attachment } from './attachment'
import { resolveMessagePayload } from '../builders/payload'
import { prepareCreateInput } from '../builders/create-input'
import {
  MessageResponseSchema,
  DeleteMessageResponseSchema,
  DeleteAttachmentResponseSchema,
  AddReactionResponseSchema,
  RemoveReactionResponseSchema,
} from '../schemas/message'

export class Message {
  readonly id: string
  readonly channelId: string
  readonly content: string | undefined
  readonly actorId: string
  readonly author: User
  readonly channel: Room
  readonly createdAt: string
  readonly editedAt: string | undefined
  readonly inReplyTo: string | undefined
  readonly threadRootEventId: string | undefined
  readonly attachments: Attachment[]

  constructor(
    data: MessageData,
    private readonly ctx: ClientContext,
    resolved: { author: User; channel: Room },
  ) {
    this.id = data.id
    this.channelId = data.roomId
    this.content = data.body
    this.actorId = data.actorId
    this.author = resolved.author
    this.channel = resolved.channel
    this.createdAt = data.createdAt
    this.editedAt = data.updatedAt
    this.inReplyTo = data.inReplyTo
    this.threadRootEventId = data.threadRootEventId
    this.attachments = (data.attachments ?? []).map(a => new Attachment(a))
  }

  async edit(payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildUpdate(this.channelId, this.id)
    const res = await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'UpdateMessage',
      { roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel },
      MessageResponseSchema,
    )
    return this.ctx.hydrateMessage(res.message)
  }

  async delete(): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'DeleteMessage',
      { roomId: this.channelId, eventId: this.id },
      DeleteMessageResponseSchema,
    )
  }

  async react(emoji: string): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'AddReaction',
      { roomId: this.channelId, messageEventId: this.id, emoji },
      AddReactionResponseSchema,
    )
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'RemoveReaction',
      { roomId: this.channelId, messageEventId: this.id, emoji },
      RemoveReactionResponseSchema,
    )
  }

  async reply(payload: MessagePayload): Promise<Message> {
    const builder = resolveMessagePayload(payload).clone()
    builder.setReplyTo(this.id)
    builder.setThreadRoot(this.threadRootEventId ?? this.id)
    const input = await prepareCreateInput(this.ctx, this.channelId, builder)
    const res = await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'CreateMessage',
      {
        roomId: input.roomId,
        body: input.body,
        attachmentAssetIds: input.attachmentAssetIds,
        inReplyTo: input.inReplyTo,
        threadRootEventId: input.threadRootEventId,
        alsoSendToChannel: input.alsoSendToChannel,
      },
      MessageResponseSchema,
    )
    return this.ctx.hydrateMessage(res.message)
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'DeleteAttachment',
      { roomId: this.channelId, eventId: this.id, attachmentId },
      DeleteAttachmentResponseSchema,
    )
  }
}
