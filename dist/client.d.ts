import { EventEmitter } from 'events';
import { RealtimeConnection } from './realtime/connection';
import type { RoomManager } from './managers/rooms';
import type { MessageManager } from './managers/messages';
import type { UserManager } from './managers/users';
import type { Message } from './resources/message';
import type { MessageDeleteEvent, ReactionEvent, ChattoClientOptions } from './types';
interface ClientEventMap {
    ready: [];
    messageCreate: [message: Message];
    messageUpdate: [message: Message];
    messageDelete: [event: MessageDeleteEvent];
    reactionAdd: [event: ReactionEvent];
    reactionRemove: [event: ReactionEvent];
    error: [err: Error];
    disconnect: [];
}
export declare class ChattoClient extends EventEmitter<ClientEventMap> {
    readonly rooms: RoomManager;
    readonly messages: MessageManager;
    readonly users: UserManager;
    private readonly rest;
    private readonly realtime;
    private readonly ctx;
    constructor(options: ChattoClientOptions, realtimeFactory?: (wsUrl: string, token: string) => RealtimeConnection);
    static login(options: {
        baseUrl: string;
        login: string;
        password: string;
    }): Promise<ChattoClient>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private wireRealtime;
}
export {};
//# sourceMappingURL=client.d.ts.map