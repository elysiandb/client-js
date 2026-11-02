import { ACLClient, AdminClient, EntitiesClient, HooksClient, UsersClient } from "./admin.js";
import { AuthClient } from "./auth.js";
import { EntityClient } from "./entity.js";
import { HttpClient, } from "./http.js";
import { KVClient } from "./kv.js";
import { MonitoringClient } from "./monitoring.js";
import { toQueryPayload } from "./query.js";
import { Transaction } from "./transaction.js";
/**
 * Client of an ElysianDB server.
 *
 * ```ts
 * const db = createClient("http://localhost:8089", { auth: { token: "secret" } });
 * const books = db.entity<Book>("books");
 * ```
 */
export class ElysianDB {
    constructor(options) {
        var _a, _b, _c;
        const credentials = (_a = options.auth) !== null && _a !== void 0 ? _a : (options.token ? { token: options.token } : undefined);
        this.auth = new AuthClient(credentials);
        this.http = new HttpClient({
            url: (_c = (_b = options.url) !== null && _b !== void 0 ? _b : options.baseUrl) !== null && _c !== void 0 ? _c : "",
            headers: options.headers,
            fetch: options.fetch,
            timeout: options.timeout,
            retries: options.retries,
            retryDelay: options.retryDelay,
            credentials: options.credentials,
            onRequest: options.onRequest,
            onResponse: options.onResponse,
            authHeaders: () => this.auth.headers(),
        });
        this.auth.attach(this.http);
        this.kv = new KVClient(this.http);
        this.entities = new EntitiesClient(this.http);
        this.users = new UsersClient(this.http);
        this.acl = new ACLClient(this.http);
        this.hooks = new HooksClient(this.http);
        this.admin = new AdminClient(this.http);
        this.monitoring = new MonitoringClient(this.http);
    }
    /** URL of the server, without trailing slash. */
    get url() {
        return this.http.baseUrl;
    }
    /** Documents of an entity type. `T` describes the documents and must have an `id: string`. */
    entity(name) {
        return new EntityClient(this.http, name);
    }
    /**
     * Runs a query of the Query API on any entity type: `and` / `or` filters and sorts on several fields.
     *
     * ```ts
     * await db.query<Book>({ entity: "books", filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
     * ```
     */
    query(request, options) {
        return this.http.request("POST", "/api/query", { ...options, body: toQueryPayload(request) });
    }
    /**
     * Runs `fn` in a transaction: commits when it resolves, rolls back when it throws, and returns its result.
     *
     * ```ts
     * await db.transaction(async (tx) => {
     *   const author = await tx.create("authors", { name: "Frank Herbert" });
     *   await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
     * });
     * ```
     */
    async transaction(fn) {
        const tx = await this.beginTransaction();
        let result;
        try {
            result = await fn(tx);
        }
        catch (error) {
            try {
                await tx.rollback();
            }
            catch {
                // The error of `fn` matters more than a failed rollback.
            }
            throw error;
        }
        if (tx.state === "active")
            await tx.commit();
        return result;
    }
    /** Starts a transaction that you commit or roll back yourself. */
    async beginTransaction(options) {
        const result = await this.http.request("POST", "/api/tx/begin", {
            ...options,
            retries: 0,
        });
        return new Transaction(this.http, result.transaction_id);
    }
    /**
     * Checks that the server is up (`GET /health`, which never needs credentials).
     * Never throws: a server that cannot be reached gives `{ ok: false, status: 0 }`.
     */
    async health(options) {
        var _a;
        try {
            const response = await this.http.send("GET", "/health", { ...options, auth: false });
            return { ok: true, status: response.status, version: response.headers.get("X-Elysian-Version") };
        }
        catch (error) {
            const status = (_a = error.status) !== null && _a !== void 0 ? _a : 0;
            return { ok: false, status, version: null };
        }
    }
    /** Sends a request to any route and returns the parsed body. Throws an `ElysianDBError` on failure. */
    request(method, path, options) {
        return this.http.request(method, path, options);
    }
    /** Like `request()`, but also returns the status and headers (`X-Elysian-Cache`, `X-Request-Id`...). */
    send(method, path, options) {
        return this.http.send(method, path, options);
    }
    /** @deprecated Use `request(method, path, options)`. */
    rawRequest(path, init = {}) {
        var _a, _b, _c;
        const method = ((_a = init.method) !== null && _a !== void 0 ? _a : "GET").toUpperCase();
        let body = (_b = init.body) !== null && _b !== void 0 ? _b : undefined;
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            }
            catch {
                // Not JSON: sent as it is.
            }
        }
        return this.http.request(method, path, {
            body,
            headers: init.headers,
            signal: (_c = init.signal) !== null && _c !== void 0 ? _c : undefined,
        });
    }
}
/**
 * Creates a client.
 *
 * ```ts
 * const db = createClient("http://localhost:8089");
 * const db = createClient("http://localhost:8089", { auth: { token: "secret" } });
 * const db = createClient("http://localhost:8089", { auth: { username: "admin", password: "secret" } });
 * ```
 */
export function createClient(url, options = {}) {
    return new ElysianDB({ ...options, url });
}
