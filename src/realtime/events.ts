import type { ServerFrame } from './frames'
import type { MessageDeleteEvent, ReactionEvent } from '../types'

export type SdkEvent =
  | { kind: 'messageCreate'; roomId: string; messageEventId: string }
  | { kind: 'messageUpdate'; roomId: string; messageEventId: string }
  | { kind: 'messageDelete'; event: MessageDeleteEvent }
  | { kind: 'reactionAdd'; event: ReactionEvent }
  | { kind: 'reactionRemove'; event: ReactionEvent }

export function mapFrameToEvent(frame: ServerFrame): SdkEvent | null {
  if (frame.event == null) return null
  const env = frame.event

  if (env.message_posted != null) {
    return { kind: 'messageCreate', roomId: env.message_posted.room_id, messageEventId: env.message_posted.message_event_id }
  }
  if (env.message_edited != null) {
    return { kind: 'messageUpdate', roomId: env.message_edited.room_id, messageEventId: env.message_edited.message_event_id }
  }
  if (env.message_retracted != null) {
    return { kind: 'messageDelete', event: { roomId: env.message_retracted.room_id, eventId: env.message_retracted.message_event_id } }
  }
  if (env.reaction_added != null) {
    return {
      kind: 'reactionAdd',
      event: { roomId: env.reaction_added.room_id, messageEventId: env.reaction_added.message_event_id, emoji: env.reaction_added.emoji, actorId: env.reaction_added.actor_id },
    }
  }
  if (env.reaction_removed != null) {
    return {
      kind: 'reactionRemove',
      event: { roomId: env.reaction_removed.room_id, messageEventId: env.reaction_removed.message_event_id, emoji: env.reaction_removed.emoji, actorId: env.reaction_removed.actor_id },
    }
  }
  return null
}
