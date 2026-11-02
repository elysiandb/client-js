"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KVClient = void 0;
const errors_js_1 = require("./errors.js");
const http_js_1 = require("./http.js");
/**
 * The key–value store (`db.kv`). Values are strings; objects are stored as JSON.
 * Every route requires an admin in `user` mode.
 *
 * Keys may contain `*` wildcards in `mget()` and `delete()`: `user:*` matches every key starting with `user:`.
 */
class KVClient {
    constructor(http) {
        this.http = http;
    }
    /** The value of a key, or `null` when it does not exist or has expired. */
    async get(key, call) {
        var _a;
        assertKey(key);
        if (key.includes("*")) {
            throw new TypeError("ElysianDB: get() reads one key, use mget() to read keys matching a pattern");
        }
        assertReadable(key);
        try {
            const entry = await this.http.request("GET", `/kv/${(0, http_js_1.segment)(key, "key")}`, call);
            return (_a = entry === null || entry === void 0 ? void 0 : entry.value) !== null && _a !== void 0 ? _a : null;
        }
        catch (error) {
            if (error instanceof errors_js_1.ElysianDBError && error.isNotFound)
                return null;
            throw error;
        }
    }
    /** The value of a key parsed as JSON, or `null` when it does not exist. */
    async getJSON(key, call) {
        const value = await this.get(key, call);
        return value === null ? null : JSON.parse(value);
    }
    /** Stores a value. Strings are stored as they are, anything else as JSON. */
    async set(key, value, options = {}, call) {
        assertKey(key);
        assertReadable(key);
        if (options.ttl !== undefined && (!Number.isInteger(options.ttl) || options.ttl < 1)) {
            throw new TypeError("ElysianDB: ttl must be a positive number of seconds");
        }
        await this.http.request("PUT", `/kv/${(0, http_js_1.segment)(key, "key")}`, {
            ...call,
            query: { ttl: options.ttl },
            body: typeof value === "string" ? value : JSON.stringify(value),
            headers: { "Content-Type": "text/plain; charset=utf-8", ...call === null || call === void 0 ? void 0 : call.headers },
        });
    }
    /**
     * The values of several keys, as an object keyed by key. Missing keys are `null`.
     * A pattern such as `session:*` adds every matching key.
     * The object has no prototype, so that any key, `__proto__` included, is an own property.
     */
    async mget(keys, call) {
        const result = Object.create(null);
        if (keys.length === 0)
            return result;
        for (const key of keys) {
            assertKey(key);
            if (key.includes(","))
                throw new TypeError(`ElysianDB: mget() keys cannot contain a comma ("${key}")`);
        }
        const entries = await this.http.request("GET", "/kv/mget", {
            ...call,
            query: { keys: keys.join(",") },
        });
        for (const entry of entries !== null && entries !== void 0 ? entries : [])
            result[entry.key] = entry.value;
        return result;
    }
    /** Deletes a key, or every key matching a pattern such as `cache:*`. */
    async delete(key, call) {
        assertKey(key);
        await this.http.request("DELETE", `/kv/${(0, http_js_1.segment)(key, "key")}`, call);
    }
}
exports.KVClient = KVClient;
function assertKey(key) {
    if (typeof key !== "string" || key === "")
        throw new TypeError("ElysianDB: a key is required");
}
/** `GET /kv/mget` is the multi-get route: a key named `mget` could be written but not read back. */
function assertReadable(key) {
    if (key === "mget")
        throw new TypeError(`ElysianDB: invalid key "mget": GET /kv/mget is a route of ElysianDB`);
}
