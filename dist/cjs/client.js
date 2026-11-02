"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElysianDB = void 0;
exports.createClient = createClient;
const admin_js_1 = require("./admin.js");
const auth_js_1 = require("./auth.js");
const entity_js_1 = require("./entity.js");
const http_js_1 = require("./http.js");
const kv_js_1 = require("./kv.js");
const monitoring_js_1 = require("./monitoring.js");
const query_js_1 = require("./query.js");
const transaction_js_1 = require("./transaction.js");
/**
 * Client of an ElysianDB server.
 *
 * ```ts
 * const db = createClient("http://localhost:8089", { auth: { token: "secret" } });
 * const books = db.entity<Book>("books");
 * ```
 */
class ElysianDB {
    constructor(options) {
        var _a, _b, _c;
        const credentials = (_a = options.auth) !== null && _a !== void 0 ? _a : (options.token ? { token: options.token } : undefined);
        this.auth = new auth_js_1.AuthClient(credentials);
        this.http = new http_js_1.HttpClient({
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
        this.kv = new kv_js_1.KVClient(this.http);
        this.entities = new admin_js_1.EntitiesClient(this.http);
        this.users = new admin_js_1.UsersClient(this.http);
        this.acl = new admin_js_1.ACLClient(this.http);
        this.hooks = new admin_js_1.HooksClient(this.http);
        this.admin = new admin_js_1.AdminClient(this.http);
        this.monitoring = new monitoring_js_1.MonitoringClient(this.http);
    }
    /** URL of the server, without trailing slash. */
    get url() {
        return this.http.baseUrl;
    }
    /** Documents of an entity type. `T` describes the documents and must have an `id: string`. */
    entity(name) {
        return new entity_js_1.EntityClient(this.http, name);
    }
    /**
     * Runs a query of the Query API on any entity type: `and` / `or` filters and sorts on several fields.
     *
     * ```ts
     * await db.query<Book>({ entity: "books", filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
     * ```
     */
    async query(request, options) {
        return this.http.request("POST", "/api/query", { ...options, body: (0, query_js_1.toQueryPayload)(request) });
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
        return new transaction_js_1.Transaction(this.http, result.transaction_id);
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
exports.ElysianDB = ElysianDB;
/**
 * Creates a client.
 *
 * ```ts
 * const db = createClient("http://localhost:8089");
 * const db = createClient("http://localhost:8089", { auth: { token: "secret" } });
 * const db = createClient("http://localhost:8089", { auth: { username: "admin", password: "secret" } });
 * ```
 */
function createClient(url, options = {}) {
    return new ElysianDB({ ...options, url });
}
