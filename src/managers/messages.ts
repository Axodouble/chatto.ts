import type { ClientContext } from '../context'
import type { Message } from '../resources/message'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { prepareCreateInput } from '../builders/create-input'
import { MessageResponseSchema } from '../schemas/message'

export class MessageManager {
  constructor(private readonly ctx: ClientContext) {}

  async send(roomId: string, payload: MessagePayload): Promise<Message> {
    const input = await prepareCreateInput(this.ctx, roomId, resolveMessagePayload(payload))
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

  async fetch(roomId: string, eventId: string): Promise<Message> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.MessageService',
      'GetMessage',
      { roomId, eventId },
      MessageResponseSchema,
    )
    return this.ctx.hydrateMessage(res.message)
  }
}
