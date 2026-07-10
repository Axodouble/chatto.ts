"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = void 0;
const payload_1 = require("../builders/payload");
const message_1 = require("../schemas/message");
const room_1 = require("../schemas/room");
class Room {
    ctx;
    id;
    name;
    description;
    kind;
    archived;
    constructor(data, ctx) {
        this.ctx = ctx;
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.kind = data.kind;
        this.archived = data.archived;
    }
    static partial(id, ctx) {
        return new Room({ id, name: id, kind: '', archived: false }, ctx);
    }
    async send(payload) {
        const input = (0, payload_1.resolveMessagePayload)(payload).buildCreate(this.id);
        const res = await this.ctx.rest.post('chatto.api.v1.MessageService', 'CreateMessage', {
            roomId: input.roomId,
            body: input.body,
            inReplyTo: input.inReplyTo,
            threadRootEventId: input.threadRootEventId,
            alsoSendToChannel: input.alsoSendToChannel,
        }, message_1.MessageResponseSchema);
        return this.ctx.hydrateMessage(res.message);
    }
    async fetchHistory(opts = {}) {
        const res = await this.ctx.rest.post('chatto.api.v1.RoomService', 'GetRoomEvents', {
            roomId: this.id,
            limit: opts.limit,
            cursor: opts.before != null ? { before: opts.before } : undefined,
        }, room_1.GetRoomEventsResponseSchema);
        return Promise.all(res.page.events
            .filter(e => e.messagePosted != null)
            .map(e => this.ctx.hydrateMessage(e.messagePosted.message)));
    }
}
exports.Room = Room;
//# sourceMappingURL=room.js.map