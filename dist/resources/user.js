"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
class User {
    id;
    login;
    displayName;
    deleted;
    avatarUrl;
    presenceStatus;
    customStatus;
    roles;
    createdAt;
    constructor(data) {
        this.id = data.user.id;
        this.login = data.user.login;
        this.displayName = data.user.displayName;
        this.deleted = data.user.deleted;
        this.avatarUrl = data.user.avatarUrl;
        this.presenceStatus = data.user.presenceStatus;
        this.customStatus = data.user.customStatus;
        this.roles = data.roles;
        this.createdAt = data.createdAt;
    }
    get username() {
        return this.login;
    }
    static partial(id) {
        return new User({
            user: {
                id,
                login: id,
                displayName: id,
                deleted: false,
                avatarUrl: undefined,
                presenceStatus: 'PRESENCE_STATUS_UNSPECIFIED',
                customStatus: undefined,
            },
            roles: [],
            createdAt: undefined,
        });
    }
}
exports.User = User;
//# sourceMappingURL=user.js.map