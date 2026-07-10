import type { RestClient } from './rest/client';
import type { MessageData } from './types';
import { Message } from './resources/message';
import { User } from './resources/user';
import { Room } from './resources/room';
import { UserManager } from './managers/users';
import { RoomManager } from './managers/rooms';
import { MessageManager } from './managers/messages';
export interface ClientContext {
    readonly rest: RestClient;
    resolveUser(id: string): Promise<User>;
    resolveRoom(id: string): Promise<Room>;
    hydrateMessage(data: MessageData): Promise<Message>;
}
export declare class ChattoContext implements ClientContext {
    readonly rest: RestClient;
    readonly users: UserManager;
    readonly rooms: RoomManager;
    readonly messages: MessageManager;
    private readonly userCache;
    private readonly roomCache;
    constructor(rest: RestClient);
    resolveUser(id: string): Promise<User>;
    resolveRoom(id: string): Promise<Room>;
    /**
     * Author and channel are resolved through the client's permanent per-client
     * caches (`userCache`/`roomCache`) and are point-in-time snapshots for the
     * lifetime of the client: once cached, they are never re-fetched. Volatile
     * fields on the resolved objects (e.g. `author.presenceStatus`,
     * `author.displayName`, `channel.name`) may go stale if they change
     * upstream. Call `client.users.fetch(id)` / `client.rooms.fetch(id)` for
     * live, uncached data.
     */
    hydrateMessage(data: MessageData): Promise<Message>;
}
//# sourceMappingURL=context.d.ts.map