import type { RoomData } from '../types';
import type { ClientContext } from '../context';
import type { Message } from './message';
import type { MessagePayload } from '../builders/payload';
export declare class Room {
    private readonly ctx;
    readonly id: string;
    readonly name: string;
    readonly description: string | undefined;
    readonly kind: string;
    readonly archived: boolean;
    constructor(data: RoomData, ctx: ClientContext);
    static partial(id: string, ctx: ClientContext): Room;
    send(payload: MessagePayload): Promise<Message>;
    fetchHistory(opts?: {
        limit?: number;
        before?: string;
    }): Promise<Message[]>;
}
//# sourceMappingURL=room.d.ts.map