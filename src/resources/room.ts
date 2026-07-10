import type { RoomData } from '../types'
import type { ClientContext } from '../context'
import type { Message } from './message'
import type { MessagePayload } from '../builders/payload'
import { resolveMessagePayload } from '../builders/payload'
import { mapMessage } from '../rest/mappers'

export class Room {
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly kind: string
  readonly archived: boolean

  constructor(data: RoomData, private readonly ctx: ClientContext) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.kind = data.kind
    this.archived = data.archived
  }

  static partial(id: string, ctx: ClientContext): Room {
    return new Room({ id, name: id, kind: '', archived: false } as RoomData, ctx)
  }

  async send(payload: MessagePayload): Promise<Message> {
    const input = resolveMessagePayload(payload).buildCreate(this.id)
    const res = await this.ctx.clients.message.createMessage({
      roomId: input.roomId, body: input.body, inReplyTo: input.inReplyTo,
      threadRootEventId: input.threadRootEventId, alsoSendToChannel: input.alsoSendToChannel,
    })
    return this.ctx.hydrateMessage(mapMessage(res.message!))
  }

  async fetchHistory(opts: { limit?: number; before?: string } = {}): Promise<Message[]> {
    const res = await this.ctx.clients.room.getRoomEvents({
      roomId: this.id,
      limit: opts.limit,
      // GetRoomEventsRequest.cursor is a oneof over scalar fields (before/after);
      // the generated init shape keeps the runtime `{ case, value }` ADT shape.
      cursor: opts.before != null ? { case: 'before', value: opts.before } : undefined,
    })
    const events = res.page?.events ?? []
    const postedMessages = events
      .map(e => (e.event.case === 'messagePosted' ? e.event.value.message : undefined))
      .filter((m): m is NonNullable<typeof m> => m != null)
    return Promise.all(postedMessages.map(m => this.ctx.hydrateMessage(mapMessage(m))))
  }
}
