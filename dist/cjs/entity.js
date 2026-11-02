"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityClient = void 0;
exports.entitySegment = entitySegment;
exports.checkNewId = checkNewId;
const errors_js_1 = require("./errors.js");
const http_js_1 = require("./http.js");
const query_js_1 = require("./query.js");
/**
 * Documents of one entity type, returned by `db.entity<T>("name")`.
 *
 * ```ts
 * const books = db.entity<Book>("books");
 * const book = await books.create({ title: "Dune", year: 1965 });
 * const recent = await books.list({ filter: { year: { gte: 2000 } }, sort: { year: "desc" } });
 * ```
 */
class EntityClient {
    constructor(http, name) {
        this.http = http;
        this.name = name;
        if (!name)
            throw new TypeError("ElysianDB: an entity name is required");
        this.path = `/api/${entitySegment(name)}`;
    }
    /** Lists documents, with filters, search, sort, pagination, projection and includes (`GET /api/<entity>`). */
    async list(options = {}, call) {
        return this.http.request("GET", this.path, { ...call, query: (0, query_js_1.toSearchParams)(options) });
    }
    /** Fetches every matching document, page by page. */
    async listAll(options = {}, call) {
        const items = [];
        for await (const item of this.iterate(options, call))
            items.push(item);
        return items;
    }
    /**
     * Iterates over every matching document, fetching them page by page.
     *
     * ```ts
     * for await (const book of books.iterate({ pageSize: 500 })) { ... }
     * ```
     */
    async *iterate(options = {}, call) {
        const { pageSize = 100, ...listOptions } = options;
        if (!Number.isInteger(pageSize) || pageSize < 1) {
            throw new TypeError("ElysianDB: pageSize must be a positive integer");
        }
        let received = 0;
        for (let offset = 0;; offset += pageSize) {
            const page = await this.list({ ...listOptions, limit: pageSize, offset }, call);
            for (const item of page)
                yield item;
            received += page.length;
            if (page.length === pageSize)
                continue;
            // A short page is the last one, except in `user` mode when an ACL grants `owning_read` but not `read`:
            // ElysianDB 0.2.3 applies it after `limit` and `offset`, so pages can be short, or even empty, before
            // the end. `count()` applies the same ACL to every document.
            const { filter, search, includes } = listOptions;
            if (received >= (await this.count({ filter, search, includes }, call)))
                return;
            // Fetch the rest in one request, since pagination cannot be trusted here.
            const rest = await this.list({ ...listOptions, offset: offset + pageSize }, call);
            for (const item of rest)
                yield item;
            return;
        }
    }
    /** The first matching document, or `null` when none matches. */
    async first(options = {}, call) {
        const [item] = await this.list({ ...options, limit: 1 }, call);
        return item !== null && item !== void 0 ? item : null;
    }
    /** Fetches a document by ID. Throws an `ElysianDBError` with `status` 404 when it does not exist. */
    async get(id, options = {}, call) {
        return this.http.request("GET", this.documentPath(readableId(id)), {
            ...call,
            query: (0, query_js_1.toSearchParams)({ fields: options.fields, includes: options.includes }),
        });
    }
    /** Fetches a document by ID, or returns `null` when it does not exist. */
    async getOrNull(id, options = {}, call) {
        try {
            return await this.get(id, options, call);
        }
        catch (error) {
            if (error instanceof errors_js_1.ElysianDBError && error.isNotFound)
                return null;
            throw error;
        }
    }
    /** Whether a document with this ID exists. */
    async exists(id, call) {
        const result = await this.http.request("GET", `${this.documentPath(id)}/exists`, call);
        return result.exists;
    }
    /** Counts the documents, optionally only those matching `filter`, `search` and `includes`. */
    async count(options = {}, call) {
        const hasOptions = options.filter !== undefined || options.search !== undefined || options.includes !== undefined;
        const result = hasOptions
            ? await this.http.request("GET", this.path, {
                ...call,
                query: (0, query_js_1.toSearchParams)({ ...options, countOnly: true }),
            })
            : await this.http.request("GET", `${this.path}/count`, call);
        return result.count;
    }
    /** @deprecated Use `count(options)`. */
    countWithOptions(options = {}, call) {
        return this.count(options, call);
    }
    /**
     * Creates a document and returns it with its `id` (generated when missing).
     * Nested objects with an `@entity` key are stored as linked sub-entities.
     * Sending the `id` of an existing document replaces it.
     */
    async create(data, call) {
        checkNewId(data);
        return this.http.request("POST", this.path, { ...call, body: data });
    }
    /** Creates several documents at once. Nothing is written if one of them is invalid. */
    async createMany(data, call) {
        if (data.length === 0)
            return [];
        data.forEach(checkNewId);
        return this.http.request("POST", this.path, { ...call, body: data });
    }
    /**
     * Merges `data` into a stored document and returns the result. Fields set to `null` are unset.
     * Throws an `ElysianDBError` with `status` 404 when the document does not exist.
     */
    async update(id, data, call) {
        return this.http.request("PUT", this.documentPath(readableId(id)), { ...call, body: data });
    }
    /**
     * Updates several documents at once: each item holds the `id` of the document and the fields to merge.
     * Nothing is written if one of the documents does not exist.
     */
    async updateMany(data, call) {
        if (data.length === 0)
            return [];
        return this.http.request("PUT", this.path, { ...call, body: data });
    }
    /** Deletes a document by ID. */
    async delete(id, call) {
        await this.http.request("DELETE", this.documentPath(id), call);
    }
    /** Deletes every document of the entity, and its inferred schema. Requires an admin in `user` mode. */
    async deleteAll(call) {
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
    async query(options = {}, call) {
        return this.http.request("POST", "/api/query", {
            ...call,
            body: (0, query_js_1.toQueryPayload)({ ...options, entity: this.name }),
        });
    }
    /** Counts the documents matching a Query API filter. */
    async queryCount(filter, call) {
        const result = await this.http.request("POST", "/api/query", {
            ...call,
            body: (0, query_js_1.toQueryPayload)({ entity: this.name, filter }, true),
        });
        return result.count;
    }
    /** The schema of the entity, manual or inferred. */
    async getSchema(call) {
        return this.http.request("GET", `${this.path}/schema`, call);
    }
    /**
     * Replaces the schema of the entity with a manual (strict) one. The entity type must exist.
     * Requires an admin in `user` mode.
     */
    async setSchema(fields, call) {
        return this.http.request("PUT", `${this.path}/schema`, { ...call, body: { fields } });
    }
    /**
     * Updates every document of the entity. Requires an admin in `user` mode.
     *
     * ```ts
     * await users.migrate([{ set: [{ active: true, "profile.lang": "fr" }] }]);
     * ```
     */
    async migrate(actions, call) {
        await this.http.request("POST", `${this.path}/migrate`, { ...call, body: actions });
    }
    documentPath(id) {
        if (!id)
            throw new TypeError(`ElysianDB: a document ID is required (entity "${this.name}")`);
        return `${this.path}/${(0, http_js_1.segment)(id, "document ID")}`;
    }
}
exports.EntityClient = EntityClient;
/** Entity names that ElysianDB 0.2.3 routes elsewhere: `/api/query` is the Query API, `/api/export` the export... */
const RESERVED_ENTITY_NAMES = new Set([
    "acl",
    "backup",
    "entity",
    "export",
    "hook",
    "import",
    "query",
    "restore",
    "security",
    "tx",
]);
/** Document IDs that ElysianDB 0.2.3 routes elsewhere: `GET /api/<entity>/count` counts the documents. */
const RESERVED_IDS = new Set(["count", "schema"]);
/** @internal Checks an entity name and returns it unchanged, ready for a URL path. */
function entitySegment(name) {
    (0, http_js_1.segment)(name, "entity name");
    if (RESERVED_ENTITY_NAMES.has(name)) {
        throw new TypeError(`ElysianDB: invalid entity name "${name}": /api/${name} is a route of ElysianDB`);
    }
    return name;
}
/** Checks the ID of a document read or updated by ID, and returns it unchanged. */
function readableId(id) {
    if (RESERVED_IDS.has(id)) {
        throw new TypeError(`ElysianDB: invalid document ID "${id}": /api/<entity>/${id} is a route of ElysianDB`);
    }
    return id;
}
/** @internal Refuses to create a document that could not be read back by its ID. */
function checkNewId(data) {
    const id = data === null || data === void 0 ? void 0 : data.id;
    if (typeof id === "string" && id !== "")
        readableId((0, http_js_1.segment)(id, "document ID"));
}
