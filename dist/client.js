"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChattoClient = void 0;
const events_1 = require("events");
const client_1 = require("./rest/client");
const connection_1 = require("./realtime/connection");
const events_2 = require("./realtime/events");
const context_1 = require("./context");
const integrated_1 = require("./auth/integrated");
class ChattoClient extends events_1.EventEmitter {
    rooms;
    messages;
    users;
    rest;
    realtime;
    ctx;
    constructor(options, realtimeFactory) {
        super();
        const wsUrl = options.baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) + '/api/realtime';
        this.rest = new client_1.RestClient(options.baseUrl, options.token);
        this.realtime = realtimeFactory
            ? realtimeFactory(wsUrl, options.token)
            : new connection_1.RealtimeConnection(wsUrl, options.token);
        this.ctx = new context_1.ChattoContext(this.rest);
        this.rooms = this.ctx.rooms;
        this.messages = this.ctx.messages;
        this.users = this.ctx.users;
        this.wireRealtime();
    }
    static async login(options) {
        const { token } = await (0, integrated_1.loginWithPassword)(options.baseUrl, options.login, options.password);
        return new ChattoClient({ baseUrl: options.baseUrl, token });
    }
    async connect() {
        await this.realtime.connect();
        this.emit('ready');
    }
    async disconnect() {
        this.realtime.disconnect();
        this.emit('disconnect');
    }
    wireRealtime() {
        this.realtime.on('frame', (frame) => {
            const event = (0, events_2.mapFrameToEvent)(frame);
            if (event == null)
                return;
            const hydrate = async () => {
                if (event.kind === 'messageCreate') {
                    const msg = await this.messages.fetch(event.roomId, event.messageEventId);
                    this.emit('messageCreate', msg);
                }
                else if (event.kind === 'messageUpdate') {
                    const msg = await this.messages.fetch(event.roomId, event.messageEventId);
                    this.emit('messageUpdate', msg);
                }
                else if (event.kind === 'messageDelete') {
                    this.emit('messageDelete', event.event);
                }
                else if (event.kind === 'reactionAdd') {
                    this.emit('reactionAdd', event.event);
                }
                else if (event.kind === 'reactionRemove') {
                    this.emit('reactionRemove', event.event);
                }
            };
            hydrate().catch(err => {
                this.emit('error', err instanceof Error ? err : new Error(String(err)));
            });
        });
        this.realtime.on('error', (err) => this.emit('error', err));
        this.realtime.on('close', (reconnect, retryAfterMs) => {
            if (!reconnect) {
                this.emit('disconnect');
                return;
            }
            setTimeout(() => {
                this.realtime.connect().catch(err => {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                });
            }, retryAfterMs);
        });
    }
}
exports.ChattoClient = ChattoClient;
//# sourceMappingURL=client.js.map