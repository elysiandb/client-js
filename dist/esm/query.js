function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
function formatValue(value) {
    if (Array.isArray(value))
        return value.map(formatValue).join(",");
    if (value instanceof Date)
        return value.toISOString();
    return String(value);
}
function conditionOf(value) {
    return isPlainObject(value) ? value : { eq: value };
}
/**
 * Checks `limit` and `offset`. ElysianDB reads them as unsigned integers and ignores anything else,
 * so `limit: 0` or `limit: 1.5` would return every document.
 */
function checkPagination(options) {
    const { limit, offset } = options;
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
        throw new TypeError(`ElysianDB: limit must be a positive integer, got ${limit}`);
    }
    if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
        throw new TypeError(`ElysianDB: offset must be a non-negative integer, got ${offset}`);
    }
}
/** Builds the query string of `GET /api/<entity>` (without the leading `?`). */
export function toSearchParams(options = {}) {
    var _a, _b;
    const params = new URLSearchParams();
    checkPagination(options);
    if (options.limit !== undefined)
        params.set("limit", String(options.limit));
    if (options.offset !== undefined)
        params.set("offset", String(options.offset));
    if (options.search !== undefined && options.search !== "")
        params.set("search", options.search);
    if ((_a = options.fields) === null || _a === void 0 ? void 0 : _a.length)
        params.set("fields", options.fields.join(","));
    if ((_b = options.includes) === null || _b === void 0 ? void 0 : _b.length) {
        params.set("includes", options.includes === "all" ? "all" : options.includes.join(","));
    }
    if (options.sort) {
        const keys = Object.keys(options.sort);
        if (keys.length > 1) {
            throw new TypeError("ElysianDB: list() sorts on one field only, use query() to sort on several fields");
        }
        for (const field of keys)
            params.set(`sort[${field}]`, options.sort[field]);
    }
    if (options.filter) {
        for (const field of Object.keys(options.filter)) {
            const condition = conditionOf(options.filter[field]);
            for (const op of Object.keys(condition)) {
                const value = condition[op];
                if (value !== undefined)
                    params.set(`filter[${field}][${op}]`, formatValue(value));
            }
        }
    }
    if (options.countOnly)
        params.set("countOnly", "true");
    return params;
}
/** Builds the query string of `GET /api/<entity>`, with its leading `?` (empty when there is no option). */
export function toQueryString(options) {
    const qs = toSearchParams(options).toString();
    return qs ? `?${qs}` : "";
}
/**
 * Converts a filter to the tree of the Query API. A node that mixes `and` / `or` with field conditions
 * is wrapped in an `and`, since ElysianDB reads only one of them per node.
 */
export function toQueryFilter(filter) {
    const parts = [];
    const leaf = {};
    for (const key of Object.keys(filter)) {
        const value = filter[key];
        if ((key === "and" || key === "or") && Array.isArray(value)) {
            parts.push({ [key]: value.map(toQueryFilter) });
            continue;
        }
        const condition = conditionOf(value);
        const ops = {};
        for (const op of Object.keys(condition)) {
            const opValue = condition[op];
            if (opValue === undefined)
                continue;
            ops[op] = Array.isArray(opValue) || opValue instanceof Date ? formatValue(opValue) : opValue;
        }
        leaf[key] = ops;
    }
    if (Object.keys(leaf).length > 0)
        parts.unshift(leaf);
    if (parts.length === 0)
        return {};
    if (parts.length === 1)
        return parts[0];
    return { and: parts };
}
export function toQueryPayload(request, countOnly = false) {
    var _a;
    const payload = { entity: request.entity };
    checkPagination(request);
    if (request.filter)
        payload.filters = toQueryFilter(request.filter);
    if (countOnly) {
        payload.countOnly = true;
        return payload;
    }
    if (request.sort)
        payload.sorts = request.sort;
    if (request.limit !== undefined)
        payload.limit = request.limit;
    if (request.offset !== undefined)
        payload.offset = request.offset;
    if ((_a = request.fields) === null || _a === void 0 ? void 0 : _a.length)
        payload.fields = request.fields.join(",");
    return payload;
}
/** Combines filters of the Query API: every one must match. */
export function and(...filters) {
    return { and: filters };
}
/** Combines filters of the Query API: at least one must match. */
export function or(...filters) {
    return { or: filters };
}
