import type { ClientContext } from '../context';
import { User } from '../resources/user';
export declare class UserManager {
    private readonly ctx;
    constructor(ctx: ClientContext);
    fetch(userId: string): Promise<User>;
    batchFetch(userIds: string[]): Promise<User[]>;
    list(opts?: {
        search?: string;
    }): Promise<User[]>;
}
//# sourceMappingURL=users.d.ts.map