import { ACLClient, AdminClient, EntitiesClient, HooksClient, UsersClient } from "./admin.js";
import { AuthClient, AuthCredentials } from "./auth.js";
import { EntityClient } from "./entity.js";
import { HttpMethod, HttpResponse, RequestContext, RequestOptions, ResponseContext } from "./http.js";
import { KVClient } from "./kv.js";
import { MonitoringClient } from "./monitoring.js";
import { QueryRequest } from "./query.js";
import { Transaction } from "./transaction.js";
import type { Document } from "./types.js";
export interface ElysianDBOptions {
    /** URL of the ElysianDB HTTP server, for example `http://localhost:8089`. */
    url?: string;
    /** @deprecated Use `url`. */
    baseUrl?: string;
    /** Credentials sent with every request. See `AuthCredentials`. */
    auth?: AuthCredentials;
    /** @deprecated Use `auth: { token }`. */
    token?: string;
    /** Headers added to every request. */
    headers?: Record<string, string>;
    /** Request timeout in milliseconds. No timeout by default. */
    timeout?: number;
    /**
     * Number of retries of idempotent requests (`GET`, `PUT`, `DELETE`) after a network error
     * or a `429`, `502`, `503` or `504` answer. Default `0`.
     */
    retries?: number;
    /** Delay before the first retry in milliseconds, doubled at each retry. Default `300`. */
    retryDelay?: number;
    /** `fetch` implementation. Defaults to the global `fetch`. */
    fetch?: typeof fetch;
    /**
     * `credentials` mode of browser requests. Set `"include"` when the page and ElysianDB have different
     * origins and you use `user` mode sessions.
     */
    credentials?: RequestCredentials;
    /** Called before each request is sent (and before each retry). Can change the headers. */
    onRequest?: (context: RequestContext) => void | Promise<void>;
    /** Called after each response is received, successful or not. */
    onResponse?: (context: ResponseContext) => void | Promise<void>;
}
/** @deprecated Use `ElysianDBOptions`. */
export type ElysianClientOptions = ElysianDBOptions;
export interface HealthResult {
    /** `true` when ElysianDB answered `200`. */
    ok: boolean;
    /** HTTP status, `0` when the server could not be reached. */
    status: number;
    /** Version of the server, from the `X-Elysian-Version` header. */
    version: string | null;
}
/**
 * Client of an ElysianDB server.
 *
 * ```ts
 * const db = createClient("http://localhost:8089", { auth: { token: "secret" } });
 * const books = db.entity<Book>("books");
 * ```
 */
export declare class ElysianDB {
    /** Credentials, and the session flow of `user` mode. */
    readonly auth: AuthClient;
    /** Key–value store. */
    readonly kv: KVClient;
    /** Entity types and their schemas. */
    readonly entities: EntitiesClient;
    /** User accounts (`user` mode). */
    readonly users: UsersClient;
    /** Access control lists (`user` mode). */
    readonly acl: ACLClient;
    /** JavaScript hooks. */
    readonly hooks: HooksClient;
    /** Persistence, configuration, export/import and backups. */
    readonly admin: AdminClient;
    /** Monitoring metrics and logs. */
    readonly monitoring: MonitoringClient;
    private readonly http;
    constructor(options: ElysianDBOptions);
    /** URL of the server, without trailing slash. */
    get url(): string;
    /** Documents of an entity type. `T` describes the documents and must have an `id: string`. */
    entity<T extends {
        id: string;
    } = Document>(name: string): EntityClient<T>;
    /**
     * Runs a query of the Query API on any entity type: `and` / `or` filters and sorts on several fields.
     *
     * ```ts
     * await db.query<Book>({ entity: "books", filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
     * ```
     */
    query<T extends {
        id: string;
    } = Document>(request: QueryRequest, options?: RequestOptions): Promise<T[]>;
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
    transaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R>;
    /** Starts a transaction that you commit or roll back yourself. */
    beginTransaction(options?: RequestOptions): Promise<Transaction>;
    /**
     * Checks that the server is up (`GET /health`, which never needs credentials).
     * Never throws: a server that cannot be reached gives `{ ok: false, status: 0 }`.
     */
    health(options?: RequestOptions): Promise<HealthResult>;
    /** Sends a request to any route and returns the parsed body. Throws an `ElysianDBError` on failure. */
    request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
    /** Like `request()`, but also returns the status and headers (`X-Elysian-Cache`, `X-Request-Id`...). */
    send<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
    /** @deprecated Use `request(method, path, options)`. */
    rawRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
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
export declare function createClient(url: string, options?: Omit<ElysianDBOptions, "url" | "baseUrl">): ElysianDB;
