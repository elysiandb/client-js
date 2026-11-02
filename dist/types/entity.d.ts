import { HttpClient, RequestOptions } from "./http.js";
import { CountOptions, GetOptions, ListOptions, QueryOptions } from "./query.js";
import type { CreateInput, Document, EntitySchema, MigrationAction, SchemaFieldsInput, UpdateInput } from "./types.js";
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
export declare class EntityClient<T extends {
    id: string;
} = Document> {
    private readonly http;
    readonly name: string;
    private readonly path;
    constructor(http: HttpClient, name: string);
    /** Lists documents, with filters, search, sort, pagination, projection and includes (`GET /api/<entity>`). */
    list(options?: ListOptions, call?: CallOptions): Promise<T[]>;
    /** Fetches every matching document, page by page. */
    listAll(options?: IterateOptions, call?: CallOptions): Promise<T[]>;
    /**
     * Iterates over every matching document, fetching them page by page.
     *
     * ```ts
     * for await (const book of books.iterate({ pageSize: 500 })) { ... }
     * ```
     */
    iterate(options?: IterateOptions, call?: CallOptions): AsyncGenerator<T, void, undefined>;
    /** The first matching document, or `null` when none matches. */
    first(options?: Omit<ListOptions, "limit">, call?: CallOptions): Promise<T | null>;
    /** Fetches a document by ID. Throws an `ElysianDBError` with `status` 404 when it does not exist. */
    get(id: string, options?: GetOptions, call?: CallOptions): Promise<T>;
    /** Fetches a document by ID, or returns `null` when it does not exist. */
    getOrNull(id: string, options?: GetOptions, call?: CallOptions): Promise<T | null>;
    /** Whether a document with this ID exists. */
    exists(id: string, call?: CallOptions): Promise<boolean>;
    /** Counts the documents, optionally only those matching `filter`, `search` and `includes`. */
    count(options?: CountOptions, call?: CallOptions): Promise<number>;
    /** @deprecated Use `count(options)`. */
    countWithOptions(options?: CountOptions, call?: CallOptions): Promise<number>;
    /**
     * Creates a document and returns it with its `id` (generated when missing).
     * Nested objects with an `@entity` key are stored as linked sub-entities.
     * Sending the `id` of an existing document replaces it.
     */
    create(data: CreateInput<T>, call?: CallOptions): Promise<T>;
    /** Creates several documents at once. Nothing is written if one of them is invalid. */
    createMany(data: CreateInput<T>[], call?: CallOptions): Promise<T[]>;
    /**
     * Merges `data` into a stored document and returns the result. Fields set to `null` are unset.
     * Throws an `ElysianDBError` with `status` 404 when the document does not exist.
     */
    update(id: string, data: UpdateInput<T>, call?: CallOptions): Promise<T>;
    /**
     * Updates several documents at once: each item holds the `id` of the document and the fields to merge.
     * Nothing is written if one of the documents does not exist.
     */
    updateMany(data: Array<UpdateInput<T> & {
        id: string;
    }>, call?: CallOptions): Promise<T[]>;
    /** Deletes a document by ID. */
    delete(id: string, call?: CallOptions): Promise<void>;
    /** Deletes every document of the entity, and its inferred schema. Requires an admin in `user` mode. */
    deleteAll(call?: CallOptions): Promise<void>;
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
    query(options?: QueryOptions, call?: CallOptions): Promise<T[]>;
    /** Counts the documents matching a Query API filter. */
    queryCount(filter?: QueryOptions["filter"], call?: CallOptions): Promise<number>;
    /** The schema of the entity, manual or inferred. */
    getSchema(call?: CallOptions): Promise<EntitySchema>;
    /**
     * Replaces the schema of the entity with a manual (strict) one. The entity type must exist.
     * Requires an admin in `user` mode.
     */
    setSchema(fields: SchemaFieldsInput, call?: CallOptions): Promise<EntitySchema>;
    /**
     * Updates every document of the entity. Requires an admin in `user` mode.
     *
     * ```ts
     * await users.migrate([{ set: [{ active: true, "profile.lang": "fr" }] }]);
     * ```
     */
    migrate(actions: MigrationAction[], call?: CallOptions): Promise<void>;
    private documentPath;
}
/** @internal Checks an entity name and returns it unchanged, ready for a URL path. */
export declare function entitySegment(name: string): string;
/** @internal Refuses to create a document that could not be read back by its ID. */
export declare function checkNewId(data: {
    id?: unknown;
}): void;
