import type { HttpClient, RequestOptions } from "./http.js";
export interface SetOptions {
    /** Time to live, in seconds. The key is deleted once it expires. */
    ttl?: number;
}
type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;
/**
 * The key–value store (`db.kv`). Values are strings; objects are stored as JSON.
 * Every route requires an admin in `user` mode.
 *
 * Keys may contain `*` wildcards in `mget()` and `delete()`: `user:*` matches every key starting with `user:`.
 */
export declare class KVClient {
    private readonly http;
    constructor(http: HttpClient);
    /** The value of a key, or `null` when it does not exist or has expired. */
    get(key: string, call?: CallOptions): Promise<string | null>;
    /** The value of a key parsed as JSON, or `null` when it does not exist. */
    getJSON<T = unknown>(key: string, call?: CallOptions): Promise<T | null>;
    /** Stores a value. Strings are stored as they are, anything else as JSON. */
    set(key: string, value: unknown, options?: SetOptions, call?: CallOptions): Promise<void>;
    /**
     * The values of several keys, as an object keyed by key. Missing keys are `null`.
     * A pattern such as `session:*` adds every matching key.
     */
    mget(keys: string[], call?: CallOptions): Promise<Record<string, string | null>>;
    /** Deletes a key, or every key matching a pattern such as `cache:*`. */
    delete(key: string, call?: CallOptions): Promise<void>;
}
export {};
