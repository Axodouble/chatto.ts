"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageManager = void 0;
const payload_1 = require("../builders/payload");
const message_1 = require("../schemas/message");
class MessageManager {
    ctx;
    constructor(ctx) {
        this.ctx = ctx;
    }
    async send(roomId, payload) {
        const input = (0, payload_1.resolveMessagePayload)(payload).buildCreate(roomId);
        const res = await this.ctx.rest.post('chatto.api.v1.MessageService', 'CreateMessage', {
            roomId: input.roomId,
            body: input.body,
            inReplyTo: input.inReplyTo,
            threadRootEventId: input.threadRootEventId,
            alsoSendToChannel: input.alsoSendToChannel,
        }, message_1.MessageResponseSchema);
        return this.ctx.hydrateMessage(res.message);
    }
    async fetch(roomId, eventId) {
        const res = await this.ctx.rest.post('chatto.api.v1.MessageService', 'GetMessage', { roomId, eventId }, message_1.MessageResponseSchema);
        return this.ctx.hydrateMessage(res.message);
    }
}
exports.MessageManager = MessageManager;
//# sourceMappingURL=messages.js.map