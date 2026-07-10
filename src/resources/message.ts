import type { MessageData } from '../types'
import type { ClientContext } from '../context'
import type { User } from './user'
import type { Room } from './room'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { mapMessage } from '../rest/mappers'

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
  }

  async edit(payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildUpdate(this.channelId, this.id)
    const res = await this.ctx.clients.message.updateMessage({
      roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }

  async delete(): Promise<void> {
    await this.ctx.clients.message.deleteMessage({ roomId: this.channelId, eventId: this.id })
  }

  async react(emoji: string): Promise<void> {
    await this.ctx.clients.message.addReaction({ roomId: this.channelId, messageEventId: this.id, emoji })
  }

  async removeReaction(emoji: string): Promise<void> {
    await this.ctx.clients.message.removeReaction({ roomId: this.channelId, messageEventId: this.id, emoji })
  }

  async reply(payload: MessagePayload): Promise<Message> {
    const builder = resolveMessagePayload(payload).clone()
    builder.setReplyTo(this.id)
    builder.setThreadRoot(this.threadRootEventId ?? this.id)
    const input = builder.buildCreate(this.channelId)
    const res = await this.ctx.clients.message.createMessage({
      roomId: input.roomId, body: input.body, inReplyTo: input.inReplyTo,
      threadRootEventId: input.threadRootEventId, alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }
}
