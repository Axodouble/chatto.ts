import {
  CreateMessageInputSchema,
  UpdateMessageInputSchema,
} from '../schemas/message'
import type { CreateMessageInput, UpdateMessageInput, FileInput } from '../types'

export class MessageBuilder {
  private _content?: string
  private _replyTo?: string
  private _threadRoot?: string
  private _alsoSendToChannel?: boolean
  private _files: FileInput[] = []
  private _attachmentIds: string[] = []

  setContent(body: string): this {
    this._content = body
    return this
  }

  /** Queue a file to be uploaded and attached when the message is sent. */
  addFile(file: FileInput): this {
    this._files.push(file)
    return this
  }

  /** Queue multiple files to be uploaded and attached when the message is sent. */
  addFiles(...files: FileInput[]): this {
    this._files.push(...files)
    return this
  }

  /** Attach an already-uploaded asset by id. */
  addAttachment(assetId: string): this {
    this._attachmentIds.push(assetId)
    return this
  }

  /** Files queued for upload (consumed by the send flow). */
  getFiles(): FileInput[] {
    return this._files
  }

  /** Explicit, already-uploaded asset ids to attach. */
  getAttachmentIds(): string[] {
    return this._attachmentIds
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
    copy._files = [...this._files]
    copy._attachmentIds = [...this._attachmentIds]
    return copy
  }

  buildCreate(roomId: string): CreateMessageInput {
    return CreateMessageInputSchema.parse({
      roomId,
      body: this._content,
      inReplyTo: this._replyTo,
      threadRootEventId: this._threadRoot,
      alsoSendToChannel: this._alsoSendToChannel,
      attachmentAssetIds: this._attachmentIds.length > 0 ? this._attachmentIds : undefined,
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
