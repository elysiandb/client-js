import { ACLClient, AdminClient, EntitiesClient, HooksClient, UsersClient } from "./admin.js";
import { AuthClient, AuthCredentials } from "./auth.js";
import { EntityClient } from "./entity.js";
import {
    HttpClient,
    HttpMethod,
    HttpResponse,
    RequestContext,
    RequestOptions,
    ResponseContext,
} from "./http.js";
import { KVClient } from "./kv.js";
import { MonitoringClient } from "./monitoring.js";
import { QueryRequest, toQueryPayload } from "./query.js";
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
export class ElysianDB {
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

    private readonly http: HttpClient;

    constructor(options: ElysianDBOptions) {
        const credentials = options.auth ?? (options.token ? { token: options.token } : undefined);
        this.auth = new AuthClient(credentials);
        this.http = new HttpClient({
            url: options.url ?? options.baseUrl ?? "",
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
    get url(): string {
        return this.http.baseUrl;
    }

    /** Documents of an entity type. `T` describes the documents and must have an `id: string`. */
    entity<T extends { id: string } = Document>(name: string): EntityClient<T> {
        return new EntityClient<T>(this.http, name);
    }

    /**
     * Runs a query of the Query API on any entity type: `and` / `or` filters and sorts on several fields.
     *
     * ```ts
     * await db.query<Book>({ entity: "books", filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
     * ```
     */
    query<T extends { id: string } = Document>(request: QueryRequest, options?: RequestOptions): Promise<T[]> {
        return this.http.request<T[]>("POST", "/api/query", { ...options, body: toQueryPayload(request) });
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
    async transaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R> {
        const tx = await this.beginTransaction();
        let result: R;

        try {
            result = await fn(tx);
        } catch (error) {
            try {
                await tx.rollback();
            } catch {
                // The error of `fn` matters more than a failed rollback.
            }
            throw error;
        }

        if (tx.state === "active") await tx.commit();
        return result;
    }

    /** Starts a transaction that you commit or roll back yourself. */
    async beginTransaction(options?: RequestOptions): Promise<Transaction> {
        const result = await this.http.request<{ transaction_id: string }>("POST", "/api/tx/begin", {
            ...options,
            retries: 0,
        });
        return new Transaction(this.http, result.transaction_id);
    }

    /**
     * Checks that the server is up (`GET /health`, which never needs credentials).
     * Never throws: a server that cannot be reached gives `{ ok: false, status: 0 }`.
     */
    async health(options?: RequestOptions): Promise<HealthResult> {
        try {
            const response = await this.http.send("GET", "/health", { ...options, auth: false });
            return { ok: true, status: response.status, version: response.headers.get("X-Elysian-Version") };
        } catch (error) {
            const status = (error as { status?: number }).status ?? 0;
            return { ok: false, status, version: null };
        }
    }

    /** Sends a request to any route and returns the parsed body. Throws an `ElysianDBError` on failure. */
    request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
        return this.http.request<T>(method, path, options);
    }

    /** Like `request()`, but also returns the status and headers (`X-Elysian-Cache`, `X-Request-Id`...). */
    send<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
        return this.http.send<T>(method, path, options);
    }

    /** @deprecated Use `request(method, path, options)`. */
    rawRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
        const method = (init.method ?? "GET").toUpperCase() as HttpMethod;
        let body: unknown = init.body ?? undefined;
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                // Not JSON: sent as it is.
            }
        }

        return this.http.request<T>(method, path, {
            body,
            headers: init.headers as Record<string, string> | undefined,
            signal: init.signal ?? undefined,
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
export function createClient(url: string, options: Omit<ElysianDBOptions, "url" | "baseUrl"> = {}): ElysianDB {
    return new ElysianDB({ ...options, url });
}
