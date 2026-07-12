import type { ClientContext } from '../context'
import type { Message } from '../resources/message'
import { GetRoomEventsResponseSchema } from '../schemas/room'

export class ThreadManager {
  constructor(private readonly ctx: ClientContext) {}

  async fetchHistory(roomId: string, threadRootEventId: string): Promise<Message[]> {
    const messagesById = new Map<string, Message>()
    const seenCursors = new Set<string>()
    let before: string | undefined

    // Walk older pages via `startCursor` until the server reports no more,
    // de-duping by message id (first occurrence wins) and bailing out if a
    // cursor ever repeats so a misbehaving server can't loop forever.
    for (;;) {
      const res = await this.ctx.rest.post(
        'chatto.api.v1.ThreadService',
        'GetThreadEvents',
        { roomId, threadRootEventId, limit: 100, before },
        GetRoomEventsResponseSchema,
      )

      const messages = await Promise.all(
        res.page.events
          .filter(e => e.messagePosted != null)
          .map(e => this.ctx.hydrateMessage(e.messagePosted!.message)),
      )
      for (const message of messages) {
        if (!messagesById.has(message.id)) messagesById.set(message.id, message)
      }

      const cursor = res.page.startCursor
      if (!res.page.hasOlder || cursor == null || cursor.trim() === '' || seenCursors.has(cursor)) {
        return [...messagesById.values()]
      }
      seenCursors.add(cursor)
      before = cursor
    }
  }
}
