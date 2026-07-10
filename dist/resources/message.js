"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const payload_1 = require("../builders/payload");
const message_1 = require("../schemas/message");
class Message {
    ctx;
    id;
    channelId;
    content;
    actorId;
    author;
    channel;
    createdAt;
    editedAt;
    inReplyTo;
    threadRootEventId;
    constructor(data, ctx, resolved) {
        this.ctx = ctx;
        this.id = data.id;
        this.channelId = data.roomId;
        this.content = data.body;
        this.actorId = data.actorId;
        this.author = resolved.author;
        this.channel = resolved.channel;
        this.createdAt = data.createdAt;
        this.editedAt = data.updatedAt;
        this.inReplyTo = data.inReplyTo;
        this.threadRootEventId = data.threadRootEventId;
    }
    async edit(payload) {
        const input = (0, payload_1.resolveMessagePayload)(payload).buildUpdate(this.channelId, this.id);
        const res = await this.ctx.rest.post('chatto.api.v1.MessageService', 'UpdateMessage', { roomId: input.roomId, eventId: input.eventId, body: input.body, alsoSendToChannel: input.alsoSendToChannel }, message_1.MessageResponseSchema);
        return this.ctx.hydrateMessage(res.message);
    }
    async delete() {
        await this.ctx.rest.post('chatto.api.v1.MessageService', 'DeleteMessage', { roomId: this.channelId, eventId: this.id }, message_1.DeleteMessageResponseSchema);
    }
    async react(emoji) {
        await this.ctx.rest.post('chatto.api.v1.MessageService', 'AddReaction', { roomId: this.channelId, messageEventId: this.id, emoji }, message_1.AddReactionResponseSchema);
    }
    async removeReaction(emoji) {
        await this.ctx.rest.post('chatto.api.v1.MessageService', 'RemoveReaction', { roomId: this.channelId, messageEventId: this.id, emoji }, message_1.RemoveReactionResponseSchema);
    }
    async reply(payload) {
        const builder = (0, payload_1.resolveMessagePayload)(payload).clone();
        builder.setReplyTo(this.id);
        builder.setThreadRoot(this.threadRootEventId ?? this.id);
        const input = builder.buildCreate(this.channelId);
        const res = await this.ctx.rest.post('chatto.api.v1.MessageService', 'CreateMessage', {
            roomId: input.roomId,
            body: input.body,
            inReplyTo: input.inReplyTo,
            threadRootEventId: input.threadRootEventId,
            alsoSendToChannel: input.alsoSendToChannel,
        }, message_1.MessageResponseSchema);
        return this.ctx.hydrateMessage(res.message);
    }
}
exports.Message = Message;
//# sourceMappingURL=message.js.map