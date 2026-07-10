import type { CreateMessageInput, UpdateMessageInput } from '../types';
export declare class MessageBuilder {
    private _content?;
    private _replyTo?;
    private _threadRoot?;
    private _alsoSendToChannel?;
    setContent(body: string): this;
    setReplyTo(eventId: string): this;
    setThreadRoot(eventId: string): this;
    setAlsoSendToChannel(value: boolean): this;
    clone(): MessageBuilder;
    buildCreate(roomId: string): CreateMessageInput;
    buildUpdate(roomId: string, eventId: string): UpdateMessageInput;
}
//# sourceMappingURL=message.d.ts.map