import { MessageBuilder } from './message';
export type MessagePayload = string | {
    content: string;
    alsoSendToChannel?: boolean;
} | MessageBuilder;
export declare function resolveMessagePayload(payload: MessagePayload): MessageBuilder;
//# sourceMappingURL=payload.d.ts.map