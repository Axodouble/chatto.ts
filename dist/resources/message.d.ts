import type { MessageData } from '../types';
import type { ClientContext } from '../context';
import type { User } from './user';
import type { Room } from './room';
import type { MessagePayload } from '../builders/payload';
export declare class Message {
    private readonly ctx;
    readonly id: string;
    readonly channelId: string;
    readonly content: string | undefined;
    readonly actorId: string;
    readonly author: User;
    readonly channel: Room;
    readonly createdAt: string;
    readonly editedAt: string | undefined;
    readonly inReplyTo: string | undefined;
    readonly threadRootEventId: string | undefined;
    constructor(data: MessageData, ctx: ClientContext, resolved: {
        author: User;
        channel: Room;
    });
    edit(payload: MessagePayload): Promise<Message>;
    delete(): Promise<void>;
    react(emoji: string): Promise<void>;
    removeReaction(emoji: string): Promise<void>;
    reply(payload: MessagePayload): Promise<Message>;
}
//# sourceMappingURL=message.d.ts.map