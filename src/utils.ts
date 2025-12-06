export type QueryParams = Record<
    string,
    string | number | boolean | undefined | null
>;

export function toQueryString(params?: QueryParams): string {
    if (!params) return "";

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        searchParams.append(key, String(value));
    }

    const qs = searchParams.toString();
    return qs ? `?${qs}` : "";
}
