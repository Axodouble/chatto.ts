import type { DirectoryMemberData } from '../types';
export declare class User {
    readonly id: string;
    readonly login: string;
    readonly displayName: string;
    readonly deleted: boolean;
    readonly avatarUrl: string | undefined;
    readonly presenceStatus: string;
    readonly customStatus: {
        emoji: string;
        text: string;
        expiresAt?: string;
    } | undefined;
    readonly roles: string[];
    readonly createdAt: string | undefined;
    constructor(data: DirectoryMemberData);
    get username(): string;
    static partial(id: string): User;
}
//# sourceMappingURL=user.d.ts.map