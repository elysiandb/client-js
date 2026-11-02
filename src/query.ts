import type { SortDirection } from "./types.js";

export type FilterOperator =
    | "eq"
    | "neq"
    | "lt"
    | "lte"
    | "gt"
    | "gte"
    | "contains"
    | "not_contains"
    | "all"
    | "any"
    | "none";

export type FilterPrimitive = string | number | boolean | Date;

/** Arrays are sent as comma-separated lists, for `eq`, `all`, `any` and `none` on array fields. */
export type FilterValue = FilterPrimitive | FilterPrimitive[];

export type FilterCondition = Partial<Record<FilterOperator, FilterValue>>;

/**
 * Conditions on fields, all of which must match. Paths can be nested (`"author.name"`) and traverse arrays.
 * A value without operator is a shorthand for `eq`: `{ status: "published" }`.
 */
export type Filter = Record<string, FilterCondition | FilterValue>;

/** A filter of the Query API: field conditions combined with `and` / `or`, to any depth. */
export interface QueryFilter {
    and?: QueryFilter[];
    or?: QueryFilter[];
    [field: string]: FilterCondition | FilterValue | QueryFilter[] | undefined;
}

export type Sort = Record<string, SortDirection>;

/** @deprecated Use `FilterOperator`. */
export type FilterOperators = FilterOperator;
/** @deprecated Use `Filter`. */
export type Filters = Filter;
/** @deprecated Use `Record<string, QueryValue>`. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Options of `entity.list()`, mapped to the query string of `GET /api/<entity>`. */
export interface ListOptions {
    /** Maximum number of documents returned. */
    limit?: number;
    /** Number of documents skipped. */
    offset?: number;
    /** Case-insensitive search in the string values of the documents. `*` makes it a glob. */
    search?: string;
    /** Returns only these fields. Nested paths are supported. */
    fields?: string[];
    /** Expands linked sub-entities (`["author", "author.job"]`), or all of them with `"all"`. */
    includes?: string[] | "all";
    /** One sort field, for example `{ createdAt: "desc" }`. Use `query()` to sort on several fields. */
    sort?: Sort;
    filter?: Filter;
}

export type CountOptions = Pick<ListOptions, "filter" | "search" | "includes">;

export interface GetOptions {
    fields?: string[];
    includes?: string[] | "all";
}

/** Options of `entity.query()` and `db.query()`, sent to `POST /api/query`. */
export interface QueryOptions {
    filter?: QueryFilter;
    /** Sort keys, applied in the order of the object keys. */
    sort?: Sort;
    limit?: number;
    offset?: number;
    fields?: string[];
}

export interface QueryRequest extends QueryOptions {
    entity: string;
}

/** Body of `POST /api/query`. */
export interface QueryPayload {
    entity: string;
    filters?: Record<string, unknown>;
    sorts?: Sort;
    limit?: number;
    offset?: number;
    fields?: string;
    countOnly?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function formatValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(formatValue).join(",");
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

function conditionOf(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : { eq: value };
}

/** Builds the query string of `GET /api/<entity>` (without the leading `?`). */
export function toSearchParams(options: ListOptions & { countOnly?: boolean } = {}): URLSearchParams {
    const params = new URLSearchParams();

    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    if (options.search !== undefined && options.search !== "") params.set("search", options.search);
    if (options.fields?.length) params.set("fields", options.fields.join(","));
    if (options.includes?.length) {
        params.set("includes", options.includes === "all" ? "all" : options.includes.join(","));
    }

    if (options.sort) {
        const keys = Object.keys(options.sort);
        if (keys.length > 1) {
            throw new TypeError(
                "ElysianDB: list() sorts on one field only, use query() to sort on several fields",
            );
        }
        for (const field of keys) params.set(`sort[${field}]`, options.sort[field]);
    }

    if (options.filter) {
        for (const field of Object.keys(options.filter)) {
            const condition = conditionOf(options.filter[field]);
            for (const op of Object.keys(condition)) {
                const value = condition[op];
                if (value !== undefined) params.set(`filter[${field}][${op}]`, formatValue(value));
            }
        }
    }

    if (options.countOnly) params.set("countOnly", "true");

    return params;
}

/** Builds the query string of `GET /api/<entity>`, with its leading `?` (empty when there is no option). */
export function toQueryString(options?: ListOptions & { countOnly?: boolean }): string {
    const qs = toSearchParams(options).toString();
    return qs ? `?${qs}` : "";
}

/**
 * Converts a filter to the tree of the Query API. A node that mixes `and` / `or` with field conditions
 * is wrapped in an `and`, since ElysianDB reads only one of them per node.
 */
export function toQueryFilter(filter: QueryFilter): Record<string, unknown> {
    const parts: Record<string, unknown>[] = [];
    const leaf: Record<string, unknown> = {};

    for (const key of Object.keys(filter)) {
        const value: unknown = filter[key];
        if ((key === "and" || key === "or") && Array.isArray(value)) {
            parts.push({ [key]: (value as QueryFilter[]).map(toQueryFilter) });
            continue;
        }

        const condition = conditionOf(value);
        const ops: Record<string, unknown> = {};
        for (const op of Object.keys(condition)) {
            const opValue = condition[op];
            if (opValue === undefined) continue;
            ops[op] = Array.isArray(opValue) || opValue instanceof Date ? formatValue(opValue) : opValue;
        }
        leaf[key] = ops;
    }

    if (Object.keys(leaf).length > 0) parts.unshift(leaf);
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0];
    return { and: parts };
}

export function toQueryPayload(request: QueryRequest, countOnly = false): QueryPayload {
    const payload: QueryPayload = { entity: request.entity };

    if (request.filter) payload.filters = toQueryFilter(request.filter);
    if (countOnly) {
        payload.countOnly = true;
        return payload;
    }

    if (request.sort) payload.sorts = request.sort;
    if (request.limit !== undefined) payload.limit = request.limit;
    if (request.offset !== undefined) payload.offset = request.offset;
    if (request.fields?.length) payload.fields = request.fields.join(",");

    return payload;
}

/** Combines filters of the Query API: every one must match. */
export function and(...filters: QueryFilter[]): { and: QueryFilter[] } {
    return { and: filters };
}

/** Combines filters of the Query API: at least one must match. */
export function or(...filters: QueryFilter[]): { or: QueryFilter[] } {
    return { or: filters };
}
