import { EventEmitter } from 'events';
import { RealtimeConnection } from './realtime/connection';
import { RoomManager } from './managers/rooms';
import { MessageManager } from './managers/messages';
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
    private readonly rest;
    private readonly realtime;
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