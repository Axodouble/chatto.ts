"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBuilder = void 0;
const message_1 = require("../schemas/message");
class MessageBuilder {
    _content;
    _replyTo;
    _threadRoot;
    _alsoSendToChannel;
    setContent(body) {
        this._content = body;
        return this;
    }
    setReplyTo(eventId) {
        this._replyTo = eventId;
        return this;
    }
    setThreadRoot(eventId) {
        this._threadRoot = eventId;
        return this;
    }
    setAlsoSendToChannel(value) {
        this._alsoSendToChannel = value;
        return this;
    }
    clone() {
        const copy = new MessageBuilder();
        copy._content = this._content;
        copy._replyTo = this._replyTo;
        copy._threadRoot = this._threadRoot;
        copy._alsoSendToChannel = this._alsoSendToChannel;
        return copy;
    }
    buildCreate(roomId) {
        return message_1.CreateMessageInputSchema.parse({
            roomId,
            body: this._content,
            inReplyTo: this._replyTo,
            threadRootEventId: this._threadRoot,
            alsoSendToChannel: this._alsoSendToChannel,
        });
    }
    buildUpdate(roomId, eventId) {
        return message_1.UpdateMessageInputSchema.parse({
            roomId,
            eventId,
            body: this._content,
            alsoSendToChannel: this._alsoSendToChannel,
        });
    }
}
exports.MessageBuilder = MessageBuilder;
//# sourceMappingURL=message.js.map