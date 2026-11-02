import type { SortDirection } from "./types.js";
export type FilterOperator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains" | "not_contains" | "all" | "any" | "none";
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
/** Builds the query string of `GET /api/<entity>` (without the leading `?`). */
export declare function toSearchParams(options?: ListOptions & {
    countOnly?: boolean;
}): URLSearchParams;
/** Builds the query string of `GET /api/<entity>`, with its leading `?` (empty when there is no option). */
export declare function toQueryString(options?: ListOptions & {
    countOnly?: boolean;
}): string;
/**
 * Converts a filter to the tree of the Query API. A node that mixes `and` / `or` with field conditions
 * is wrapped in an `and`, since ElysianDB reads only one of them per node.
 */
export declare function toQueryFilter(filter: QueryFilter): Record<string, unknown>;
export declare function toQueryPayload(request: QueryRequest, countOnly?: boolean): QueryPayload;
/** Combines filters of the Query API: every one must match. */
export declare function and(...filters: QueryFilter[]): {
    and: QueryFilter[];
};
/** Combines filters of the Query API: at least one must match. */
export declare function or(...filters: QueryFilter[]): {
    or: QueryFilter[];
};
