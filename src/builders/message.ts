import {
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from '../schemas/message'
import type { CreateMessageInput, UpdateMessageInput } from '../types'

export class MessageBuilder {
  private _content?: string
  private _replyTo?: string
  private _threadRoot?: string
  private _alsoSendToChannel?: boolean

  setContent(body: string): this {
    this._content = body
    return this
  }

  setReplyTo(eventId: string): this {
    this._replyTo = eventId
    return this
  }

  setThreadRoot(eventId: string): this {
    this._threadRoot = eventId
    return this
  }

  setAlsoSendToChannel(value: boolean): this {
    this._alsoSendToChannel = value
    return this
  }

  clone(): MessageBuilder {
    const copy = new MessageBuilder()
    copy._content = this._content
    copy._replyTo = this._replyTo
    copy._threadRoot = this._threadRoot
    copy._alsoSendToChannel = this._alsoSendToChannel
    return copy
  }

  buildCreate(roomId: string): CreateMessageInput {
    return CreateMessageInputSchema.parse({
      roomId,
      body: this._content,
      inReplyTo: this._replyTo,
      threadRootEventId: this._threadRoot,
      alsoSendToChannel: this._alsoSendToChannel,
    })
  }

  buildUpdate(roomId: string, eventId: string): UpdateMessageInput {
    return UpdateMessageInputSchema.parse({
      roomId,
      eventId,
      body: this._content,
      alsoSendToChannel: this._alsoSendToChannel,
    })
  }
}
