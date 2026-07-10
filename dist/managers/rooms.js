"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const room_1 = require("../schemas/room");
const room_2 = require("../resources/room");
class RoomManager {
    ctx;
    constructor(ctx) {
        this.ctx = ctx;
    }
    async list() {
        const res = await this.ctx.rest.post('chatto.api.v1.RoomDirectoryService', 'ListRooms', {}, room_1.ListRoomsResponseSchema);
        return res.rooms.map(r => new room_2.Room(r.room, this.ctx));
    }
    async fetch(roomId) {
        const res = await this.ctx.rest.post('chatto.api.v1.RoomDirectoryService', 'GetRoom', { roomId }, room_1.GetRoomResponseSchema);
        return new room_2.Room(res.room.room, this.ctx);
    }
}
exports.RoomManager = RoomManager;
//# sourceMappingURL=rooms.js.map