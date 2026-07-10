"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMessagePayload = resolveMessagePayload;
const message_1 = require("./message");
function resolveMessagePayload(payload) {
    if (payload instanceof message_1.MessageBuilder)
        return payload;
    if (typeof payload === 'string')
        return new message_1.MessageBuilder().setContent(payload);
    const builder = new message_1.MessageBuilder().setContent(payload.content);
    if (payload.alsoSendToChannel != null)
        builder.setAlsoSendToChannel(payload.alsoSendToChannel);
    return builder;
}
//# sourceMappingURL=payload.js.map