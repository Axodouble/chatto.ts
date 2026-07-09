import type { MessageData } from '../types'
import type { RestClient } from '../rest/client'
import type { MessageBuilder } from '../builders/message'
import {
  MessageResponseSchema,
  DeleteMessageResponseSchema,
  AddReactionResponseSchema,
  RemoveReactionResponseSchema,
} from '../schemas/message'
import { PartialUser } from './user'

export class Message {
  readonly id: string
  readonly roomId: string
  readonly body: string | undefined
  readonly actorId: string
  readonly author: PartialUser
  readonly createdAt: string
  readonly updatedAt: string | undefined
  readonly inReplyTo: string | undefined
  readonly threadRootEventId: string | undefined

  constructor(data: MessageData, private readonly rest: RestClient) {
    this.id = data.id
    this.roomId = data.roomId
    this.body = data.body
    this.actorId = data.actorId
    this.author = new PartialUser(data.actorId, rest)
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.inReplyTo = data.inReplyTo
    this.threadRootEventId = data.threadRootEventId
  }

  async edit(builder: MessageBuilder): Promise<Message> {
    const input = builder.buildUpdate(this.roomId, this.id)
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'UpdateMessage',
      { roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }

  async delete(): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'DeleteMessage',
      { roomId: this.roomId, eventId: this.id },
      DeleteMessageResponseSchema,
    )
  }

  async react(emoji: string): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'AddReaction',
      { roomId: this.roomId, messageEventId: this.id, emoji },
      AddReactionResponseSchema,
    )
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.rest.post(
      'chatto.api.v1.MessageService',
      'RemoveReaction',
      { roomId: this.roomId, messageEventId: this.id, emoji },
      RemoveReactionResponseSchema,
    )
  }

  async reply(builder: MessageBuilder): Promise<Message> {
    builder.setReplyTo(this.id)
    builder.setThreadRoot(this.threadRootEventId ?? this.id)
    const input = builder.buildCreate(this.roomId)
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'CreateMessage',
      {
        roomId: input.roomId,
        body: input.body,
        inReplyTo: input.inReplyTo,
        threadRootEventId: input.threadRootEventId,
        alsoSendToChannel: input.alsoSendToChannel,
      },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }
}
