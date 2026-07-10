import type { ClientContext } from '../context';
import { Room } from '../resources/room';
export declare class RoomManager {
    private readonly ctx;
    constructor(ctx: ClientContext);
    list(): Promise<Room[]>;
    fetch(roomId: string): Promise<Room>;
}
//# sourceMappingURL=rooms.d.ts.map