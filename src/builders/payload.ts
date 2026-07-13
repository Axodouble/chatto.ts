import { MessageBuilder } from './message'
import type { FileInput } from '../types'

export type MessagePayload =
  | string
  | {
      content?: string
      files?: FileInput[]
      attachmentIds?: string[]
      alsoSendToChannel?: boolean
    }
  | MessageBuilder

export function resolveMessagePayload(payload: MessagePayload): MessageBuilder {
  if (payload instanceof MessageBuilder) return payload
  if (typeof payload === 'string') return new MessageBuilder().setContent(payload)
  const builder = new MessageBuilder()
  if (payload.content != null) builder.setContent(payload.content)
  if (payload.files != null) builder.addFiles(...payload.files)
  if (payload.attachmentIds != null) {
    for (const id of payload.attachmentIds) builder.addAttachment(id)
  }
  if (payload.alsoSendToChannel != null) builder.setAlsoSendToChannel(payload.alsoSendToChannel)
  return builder
}
