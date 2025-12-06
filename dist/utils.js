"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toQueryString = toQueryString;
function toQueryString(params) {
    if (!params)
        return "";
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null)
            continue;
        searchParams.append(key, String(value));
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : "";
}
