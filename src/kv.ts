import { ElysianDBError } from "./errors.js";
import type { HttpClient, RequestOptions } from "./http.js";
import { segment } from "./http.js";

export interface SetOptions {
    /** Time to live, in seconds. The key is deleted once it expires. */
    ttl?: number;
}

type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;

interface KVEntry {
    key: string;
    value: string | null;
}

/**
 * The key–value store (`db.kv`). Values are strings; objects are stored as JSON.
 * Every route requires an admin in `user` mode.
 *
 * Keys may contain `*` wildcards in `mget()` and `delete()`: `user:*` matches every key starting with `user:`.
 */
export class KVClient {
    constructor(private readonly http: HttpClient) {}

    /** The value of a key, or `null` when it does not exist or has expired. */
    async get(key: string, call?: CallOptions): Promise<string | null> {
        assertKey(key);
        if (key.includes("*")) {
            throw new TypeError("ElysianDB: get() reads one key, use mget() to read keys matching a pattern");
        }
        assertReadable(key);

        try {
            const entry = await this.http.request<KVEntry>("GET", `/kv/${segment(key, "key")}`, call);
            return entry?.value ?? null;
        } catch (error) {
            if (error instanceof ElysianDBError && error.isNotFound) return null;
            throw error;
        }
    }

    /** The value of a key parsed as JSON, or `null` when it does not exist. */
    async getJSON<T = unknown>(key: string, call?: CallOptions): Promise<T | null> {
        const value = await this.get(key, call);
        return value === null ? null : (JSON.parse(value) as T);
    }

    /** Stores a value. Strings are stored as they are, anything else as JSON. */
    async set(key: string, value: unknown, options: SetOptions = {}, call?: CallOptions): Promise<void> {
        assertKey(key);
        assertReadable(key);
        if (options.ttl !== undefined && (!Number.isInteger(options.ttl) || options.ttl < 1)) {
            throw new TypeError("ElysianDB: ttl must be a positive number of seconds");
        }

        await this.http.request("PUT", `/kv/${segment(key, "key")}`, {
            ...call,
            query: { ttl: options.ttl },
            body: typeof value === "string" ? value : JSON.stringify(value),
            headers: { "Content-Type": "text/plain; charset=utf-8", ...call?.headers },
        });
    }

    /**
     * The values of several keys, as an object keyed by key. Missing keys are `null`.
     * A pattern such as `session:*` adds every matching key.
     * The object has no prototype, so that any key, `__proto__` included, is an own property.
     */
    async mget(keys: string[], call?: CallOptions): Promise<Record<string, string | null>> {
        const result: Record<string, string | null> = Object.create(null);
        if (keys.length === 0) return result;

        for (const key of keys) {
            assertKey(key);
            if (key.includes(",")) throw new TypeError(`ElysianDB: mget() keys cannot contain a comma ("${key}")`);
        }

        const entries = await this.http.request<KVEntry[]>("GET", "/kv/mget", {
            ...call,
            query: { keys: keys.join(",") },
        });
        for (const entry of entries ?? []) result[entry.key] = entry.value;

        return result;
    }

    /** Deletes a key, or every key matching a pattern such as `cache:*`. */
    async delete(key: string, call?: CallOptions): Promise<void> {
        assertKey(key);
        await this.http.request("DELETE", `/kv/${segment(key, "key")}`, call);
    }
}

function assertKey(key: string): void {
    if (typeof key !== "string" || key === "") throw new TypeError("ElysianDB: a key is required");
}

/** `GET /kv/mget` is the multi-get route: a key named `mget` could be written but not read back. */
function assertReadable(key: string): void {
    if (key === "mget") throw new TypeError(`ElysianDB: invalid key "mget": GET /kv/mget is a route of ElysianDB`);
}
