import type { RestClient } from '../rest/client'
import type { MessageBuilder } from '../builders/message'
import { MessageResponseSchema } from '../schemas/message'
import { Message } from '../resources/message'

export class MessageManager {
  constructor(private readonly rest: RestClient) {}

  async send(roomId: string, builder: MessageBuilder): Promise<Message> {
    const input = builder.buildCreate(roomId)
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

  async fetch(roomId: string, eventId: string): Promise<Message> {
    const res = await this.rest.post(
      'chatto.api.v1.MessageService',
      'GetMessage',
      { roomId, eventId },
      MessageResponseSchema,
    )
    return new Message(res.message, this.rest)
  }
}
