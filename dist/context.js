"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChattoContext = void 0;
const message_1 = require("./resources/message");
const user_1 = require("./resources/user");
const room_1 = require("./resources/room");
const users_1 = require("./managers/users");
const rooms_1 = require("./managers/rooms");
const messages_1 = require("./managers/messages");
const caches_1 = require("./caches");
class ChattoContext {
    rest;
    users;
    rooms;
    messages;
    userCache;
    roomCache;
    constructor(rest) {
        this.rest = rest;
        this.users = new users_1.UserManager(this);
        this.rooms = new rooms_1.RoomManager(this);
        this.messages = new messages_1.MessageManager(this);
        this.userCache = new caches_1.UserCache(id => this.users.fetch(id));
        this.roomCache = new caches_1.RoomCache(id => this.rooms.fetch(id));
    }
    resolveUser(id) {
        return this.userCache.resolve(id);
    }
    resolveRoom(id) {
        return this.roomCache.resolve(id);
    }
    /**
     * Author and channel are resolved through the client's permanent per-client
     * caches (`userCache`/`roomCache`) and are point-in-time snapshots for the
     * lifetime of the client: once cached, they are never re-fetched. Volatile
     * fields on the resolved objects (e.g. `author.presenceStatus`,
     * `author.displayName`, `channel.name`) may go stale if they change
     * upstream. Call `client.users.fetch(id)` / `client.rooms.fetch(id)` for
     * live, uncached data.
     */
    async hydrateMessage(data) {
        const [author, channel] = await Promise.all([
            this.resolveUser(data.actorId).catch(() => user_1.User.partial(data.actorId)),
            this.resolveRoom(data.roomId).catch(() => room_1.Room.partial(data.roomId, this)),
        ]);
        return new message_1.Message(data, this, { author, channel });
    }
}
exports.ChattoContext = ChattoContext;
//# sourceMappingURL=context.js.map