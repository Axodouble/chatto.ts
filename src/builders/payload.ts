import { MessageBuilder } from './message'

export type MessagePayload =
  | string
  | { content: string; alsoSendToChannel?: boolean }
  | MessageBuilder

export function resolveMessagePayload(payload: MessagePayload): MessageBuilder {
  if (payload instanceof MessageBuilder) return payload
  if (typeof payload === 'string') return new MessageBuilder().setContent(payload)
  const builder = new MessageBuilder().setContent(payload.content)
  if (payload.alsoSendToChannel != null) builder.setAlsoSendToChannel(payload.alsoSendToChannel)
  return builder
}
