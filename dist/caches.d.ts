import type { User } from './resources/user';
import type { Room } from './resources/room';
export declare class UserCache {
    private readonly fetcher;
    private readonly cache;
    constructor(fetcher: (id: string) => Promise<User>);
    resolve(id: string): Promise<User>;
}
export declare class RoomCache {
    private readonly fetcher;
    private readonly cache;
    constructor(fetcher: (id: string) => Promise<Room>);
    resolve(id: string): Promise<Room>;
}
//# sourceMappingURL=caches.d.ts.map