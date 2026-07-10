import type { ClientContext } from '../context';
import type { Message } from '../resources/message';
import type { MessagePayload } from '../builders/payload';
export declare class MessageManager {
    private readonly ctx;
    constructor(ctx: ClientContext);
    send(roomId: string, payload: MessagePayload): Promise<Message>;
    fetch(roomId: string, eventId: string): Promise<Message>;
}
//# sourceMappingURL=messages.d.ts.map