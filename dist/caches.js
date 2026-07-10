"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomCache = exports.UserCache = void 0;
class UserCache {
    fetcher;
    cache = new Map();
    constructor(fetcher) {
        this.fetcher = fetcher;
    }
    resolve(id) {
        const cached = this.cache.get(id);
        if (cached != null)
            return cached;
        const promise = this.fetcher(id).catch(err => {
            this.cache.delete(id);
            throw err;
        });
        this.cache.set(id, promise);
        return promise;
    }
}
exports.UserCache = UserCache;
class RoomCache {
    fetcher;
    cache = new Map();
    constructor(fetcher) {
        this.fetcher = fetcher;
    }
    resolve(id) {
        const cached = this.cache.get(id);
        if (cached != null)
            return cached;
        const promise = this.fetcher(id).catch(err => {
            this.cache.delete(id);
            throw err;
        });
        this.cache.set(id, promise);
        return promise;
    }
}
exports.RoomCache = RoomCache;
//# sourceMappingURL=caches.js.map