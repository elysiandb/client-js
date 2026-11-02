import { ElysianDBError } from "./errors.js";
import { HttpClient, RequestOptions, segment } from "./http.js";
import {
    CountOptions,
    GetOptions,
    ListOptions,
    QueryOptions,
    toQueryPayload,
    toSearchParams,
} from "./query.js";
import type {
    CreateInput,
    Document,
    EntitySchema,
    MigrationAction,
    SchemaFieldsInput,
    UpdateInput,
} from "./types.js";

export interface IterateOptions extends Omit<ListOptions, "limit" | "offset"> {
    /** Number of documents fetched per request. Default `100`. */
    pageSize?: number;
}

/** Per-call options accepted by every entity method. */
export type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;

/**
 * Documents of one entity type, returned by `db.entity<T>("name")`.
 *
 * ```ts
 * const books = db.entity<Book>("books");
 * const book = await books.create({ title: "Dune", year: 1965 });
 * const recent = await books.list({ filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
 * ```
 */
export class EntityClient<T extends { id: string } = Document> {
    private readonly path: string;

    constructor(private readonly http: HttpClient, readonly name: string) {
        if (!name) throw new TypeError("ElysianDB: an entity name is required");
        this.path = `/api/${segment(name)}`;
    }

    /** Lists documents, with filters, search, sort, pagination, projection and includes (`GET /api/<entity>`). */
    async list(options: ListOptions = {}, call?: CallOptions): Promise<T[]> {
        return this.http.request<T[]>("GET", this.path, { ...call, query: toSearchParams(options) });
    }

    /** Fetches every matching document, page by page. */
    async listAll(options: IterateOptions = {}, call?: CallOptions): Promise<T[]> {
        const items: T[] = [];
        for await (const item of this.iterate(options, call)) items.push(item);
        return items;
    }

    /**
     * Iterates over every matching document, fetching them page by page.
     *
     * ```ts
     * for await (const book of books.iterate({ pageSize: 500 })) { ... }
     * ```
     */
    async *iterate(options: IterateOptions = {}, call?: CallOptions): AsyncGenerator<T, void, undefined> {
        const { pageSize = 100, ...listOptions } = options;
        if (!Number.isInteger(pageSize) || pageSize < 1) {
            throw new TypeError("ElysianDB: pageSize must be a positive integer");
        }

        for (let offset = 0; ; offset += pageSize) {
            const page = await this.list({ ...listOptions, limit: pageSize, offset }, call);
            for (const item of page) yield item;
            if (page.length < pageSize) return;
        }
    }

    /** The first matching document, or `null` when none matches. */
    async first(options: Omit<ListOptions, "limit"> = {}, call?: CallOptions): Promise<T | null> {
        const [item] = await this.list({ ...options, limit: 1 }, call);
        return item ?? null;
    }

    /** Fetches a document by ID. Throws an `ElysianDBError` with `status` 404 when it does not exist. */
    async get(id: string, options: GetOptions = {}, call?: CallOptions): Promise<T> {
        return this.http.request<T>("GET", this.documentPath(id), {
            ...call,
            query: toSearchParams({ fields: options.fields, includes: options.includes }),
        });
    }

    /** Fetches a document by ID, or returns `null` when it does not exist. */
    async getOrNull(id: string, options: GetOptions = {}, call?: CallOptions): Promise<T | null> {
        try {
            return await this.get(id, options, call);
        } catch (error) {
            if (error instanceof ElysianDBError && error.isNotFound) return null;
            throw error;
        }
    }

    /** Whether a document with this ID exists. */
    async exists(id: string, call?: CallOptions): Promise<boolean> {
        const result = await this.http.request<{ exists: boolean }>("GET", `${this.documentPath(id)}/exists`, call);
        return result.exists;
    }

    /** Counts the documents, optionally only those matching `filter`, `search` and `includes`. */
    async count(options: CountOptions = {}, call?: CallOptions): Promise<number> {
        const hasOptions = options.filter !== undefined || options.search !== undefined || options.includes !== undefined;
        const result = hasOptions
            ? await this.http.request<{ count: number }>("GET", this.path, {
                ...call,
                query: toSearchParams({ ...options, countOnly: true }),
            })
            : await this.http.request<{ count: number }>("GET", `${this.path}/count`, call);

        return result.count;
    }

    /** @deprecated Use `count(options)`. */
    countWithOptions(options: CountOptions = {}, call?: CallOptions): Promise<number> {
        return this.count(options, call);
    }

    /**
     * Creates a document and returns it with its `id` (generated when missing).
     * Nested objects with an `@entity` key are stored as linked sub-entities.
     * Sending the `id` of an existing document replaces it.
     */
    async create(data: CreateInput<T>, call?: CallOptions): Promise<T> {
        return this.http.request<T>("POST", this.path, { ...call, body: data });
    }

    /** Creates several documents at once. Nothing is written if one of them is invalid. */
    async createMany(data: CreateInput<T>[], call?: CallOptions): Promise<T[]> {
        if (data.length === 0) return [];
        return this.http.request<T[]>("POST", this.path, { ...call, body: data });
    }

    /**
     * Merges `data` into a stored document and returns the result. Fields set to `null` are unset.
     * Throws an `ElysianDBError` with `status` 404 when the document does not exist.
     */
    async update(id: string, data: UpdateInput<T>, call?: CallOptions): Promise<T> {
        return this.http.request<T>("PUT", this.documentPath(id), { ...call, body: data });
    }

    /**
     * Updates several documents at once: each item holds the `id` of the document and the fields to merge.
     * Nothing is written if one of the documents does not exist.
     */
    async updateMany(data: Array<UpdateInput<T> & { id: string }>, call?: CallOptions): Promise<T[]> {
        if (data.length === 0) return [];
        return this.http.request<T[]>("PUT", this.path, { ...call, body: data });
    }

    /** Deletes a document by ID. */
    async delete(id: string, call?: CallOptions): Promise<void> {
        await this.http.request("DELETE", this.documentPath(id), call);
    }

    /** Deletes every document of the entity, and its inferred schema. Requires an admin in `user` mode. */
    async deleteAll(call?: CallOptions): Promise<void> {
        await this.http.request("DELETE", this.path, call);
    }

    /**
     * Runs a query of the Query API (`POST /api/query`) on this entity: `and` / `or` filters
     * and sorts on several fields.
     *
     * ```ts
     * await books.query({
     *   filter: { or: [{ title: { eq: "*dune*" } }, { year: { lt: 1970 } }] },
     *   sort: { year: "desc", title: "asc" },
     * });
     * ```
     */
    async query(options: QueryOptions = {}, call?: CallOptions): Promise<T[]> {
        return this.http.request<T[]>("POST", "/api/query", {
            ...call,
            body: toQueryPayload({ ...options, entity: this.name }),
        });
    }

    /** Counts the documents matching a Query API filter. */
    async queryCount(filter?: QueryOptions["filter"], call?: CallOptions): Promise<number> {
        const result = await this.http.request<{ count: number }>("POST", "/api/query", {
            ...call,
            body: toQueryPayload({ entity: this.name, filter }, true),
        });

        return result.count;
    }

    /** The schema of the entity, manual or inferred. */
    async getSchema(call?: CallOptions): Promise<EntitySchema> {
        return this.http.request<EntitySchema>("GET", `${this.path}/schema`, call);
    }

    /**
     * Replaces the schema of the entity with a manual (strict) one. The entity type must exist.
     * Requires an admin in `user` mode.
     */
    async setSchema(fields: SchemaFieldsInput, call?: CallOptions): Promise<EntitySchema> {
        return this.http.request<EntitySchema>("PUT", `${this.path}/schema`, { ...call, body: { fields } });
    }

    /**
     * Updates every document of the entity. Requires an admin in `user` mode.
     *
     * ```ts
     * await users.migrate([{ set: [{ active: true, "profile.lang": "fr" }] }]);
     * ```
     */
    async migrate(actions: MigrationAction[], call?: CallOptions): Promise<void> {
        await this.http.request("POST", `${this.path}/migrate`, { ...call, body: actions });
    }

    private documentPath(id: string): string {
        if (!id) throw new TypeError(`ElysianDB: a document ID is required (entity "${this.name}")`);
        return `${this.path}/${segment(id)}`;
    }
}
