export type QueryParams = Record<
    string,
    string | number | boolean | undefined | null
>;

export function toQueryString(params: any): string {
    if (!params) return "";

    const q = new URLSearchParams();

    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.offset !== undefined) q.set("offset", String(params.offset));
    if (params.search !== undefined) q.set("search", params.search);

    if (params.fields) {
        q.set("fields", params.fields.join(","));
    }

    if (params.includes) {
        q.set("includes", params.includes.join(","));
    }

    if (params.sort) {
        for (const field in params.sort) {
            q.set(`sort[${field}]`, params.sort[field]);
        }
    }

    if (params.countOnly) {
        q.set("countOnly", "true");
    }

    if (params.filter) {
        for (const field in params.filter) {
            const ops = params.filter[field];
            for (const op in ops) {
                const value = ops[op];
                q.set(`filter[${field}][${op}]`, Array.isArray(value) ? value.join(",") : String(value));
            }
        }
    }

    const s = q.toString();
    return s ? `?${s}` : "";
}

