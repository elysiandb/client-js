"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
exports.segment = segment;
const errors_js_1 = require("./errors.js");
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_RETRY_DELAY_MS = 30000;
const STATUS_HINTS = {
    400: "bad request",
    401: "authentication required or invalid credentials",
    403: "forbidden",
    404: "not found",
    409: "conflict",
    429: "too many requests",
    500: "internal server error",
};
class HttpClient {
    constructor(options) {
        if (!options.url) {
            throw new TypeError("ElysianDB: the server URL is required, for example createClient(\"http://localhost:8089\")");
        }
        this.baseUrl = options.url.replace(/\/+$/, "");
        this.options = options;
    }
    async request(method, path, options = {}) {
        const response = await this.send(method, path, options);
        return response.data;
    }
    async send(method, path, options = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const url = this.buildUrl(path, options.query);
        const retries = Math.max(0, (_b = (_a = options.retries) !== null && _a !== void 0 ? _a : this.options.retries) !== null && _b !== void 0 ? _b : 0);
        const canRetry = IDEMPOTENT_METHODS.has(method);
        const timeout = (_c = options.timeout) !== null && _c !== void 0 ? _c : this.options.timeout;
        const fetchImpl = (_d = this.options.fetch) !== null && _d !== void 0 ? _d : globalThis.fetch;
        if (typeof fetchImpl !== "function") {
            throw new TypeError("ElysianDB: no fetch implementation found, pass one with the `fetch` option");
        }
        for (let attempt = 0;; attempt++) {
            const { body, contentType } = encodeBody(options.body);
            const headers = {
                Accept: "application/json",
                ...this.options.headers,
                ...(options.auth === false ? {} : this.options.authHeaders()),
                ...(contentType ? { "Content-Type": contentType } : {}),
                ...(options.requestId ? { "X-Request-Id": options.requestId } : {}),
                ...options.headers,
            };
            await ((_f = (_e = this.options).onRequest) === null || _f === void 0 ? void 0 : _f.call(_e, { method, url, headers, attempt }));
            const controller = new AbortController();
            let timedOut = false;
            const timer = timeout ? setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeout) : undefined;
            const onCallerAbort = () => controller.abort();
            if ((_g = options.signal) === null || _g === void 0 ? void 0 : _g.aborted)
                controller.abort();
            (_h = options.signal) === null || _h === void 0 ? void 0 : _h.addEventListener("abort", onCallerAbort);
            // ElysianDB never redirects on purpose. Following a redirect would replay the request, credentials
            // included, on another URL: `DELETE /api/books/` is redirected to `DELETE /api/books`, for example.
            const init = { method, headers, body, signal: controller.signal, redirect: "manual" };
            if (this.options.credentials)
                init.credentials = this.options.credentials;
            const started = Date.now();
            let response;
            let payload;
            try {
                response = await fetchImpl(url, init);
                payload = response.ok
                    ? await readBody(response, method === "HEAD" ? "text" : options.responseType)
                    : await readBody(response, "json");
            }
            catch (cause) {
                if (timedOut) {
                    throw new errors_js_1.ElysianDBError({
                        code: "TIMEOUT",
                        message: `${method} ${path} timed out after ${timeout} ms`,
                        method,
                        url,
                        cause,
                    });
                }
                if ((_j = options.signal) === null || _j === void 0 ? void 0 : _j.aborted) {
                    throw new errors_js_1.ElysianDBError({ code: "ABORTED", message: `${method} ${path} was aborted`, method, url, cause });
                }
                if (canRetry && attempt < retries) {
                    await sleep(this.backoff(attempt));
                    continue;
                }
                const reason = cause instanceof Error ? cause.message : String(cause);
                throw new errors_js_1.ElysianDBError({
                    code: "NETWORK_ERROR",
                    message: `${method} ${path} could not reach ElysianDB at ${this.baseUrl}: ${reason}`,
                    method,
                    url,
                    cause,
                });
            }
            finally {
                if (timer)
                    clearTimeout(timer);
                (_k = options.signal) === null || _k === void 0 ? void 0 : _k.removeEventListener("abort", onCallerAbort);
            }
            await ((_m = (_l = this.options).onResponse) === null || _m === void 0 ? void 0 : _m.call(_l, {
                method,
                url,
                status: response.status,
                headers: response.headers,
                durationMs: Date.now() - started,
                attempt,
            }));
            if (response.ok) {
                return { data: payload, status: response.status, headers: response.headers };
            }
            // Browsers hide the status and the location of a redirect ("opaqueredirect").
            if (response.type === "opaqueredirect" || REDIRECT_STATUSES.has(response.status)) {
                const location = response.headers.get("Location");
                throw new errors_js_1.ElysianDBError({
                    code: "HTTP_ERROR",
                    message: `${method} ${path} was redirected${response.status ? ` (${response.status})` : ""}${location ? ` to ${location}` : ""}: the client does not follow redirects, check the URL of the server`,
                    method,
                    url,
                    status: response.status,
                    data: payload,
                    requestId: (_o = response.headers.get("X-Request-Id")) !== null && _o !== void 0 ? _o : undefined,
                });
            }
            const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
            if (canRetry && attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
                const delay = retryAfter !== undefined ? retryAfter * 1000 : this.backoff(attempt);
                if (delay <= MAX_RETRY_DELAY_MS) {
                    await sleep(delay);
                    continue;
                }
            }
            const detail = (_p = (0, errors_js_1.describeErrorBody)(payload)) !== null && _p !== void 0 ? _p : STATUS_HINTS[response.status];
            throw new errors_js_1.ElysianDBError({
                code: "HTTP_ERROR",
                message: `${method} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
                method,
                url,
                status: response.status,
                data: payload,
                requestId: (_q = response.headers.get("X-Request-Id")) !== null && _q !== void 0 ? _q : undefined,
                retryAfter,
            });
        }
    }
    buildUrl(path, query) {
        let qs = "";
        if (query instanceof URLSearchParams) {
            qs = query.toString();
        }
        else if (query) {
            const params = new URLSearchParams();
            for (const key of Object.keys(query)) {
                const value = query[key];
                if (value !== undefined && value !== null)
                    params.set(key, String(value));
            }
            qs = params.toString();
        }
        return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    }
    backoff(attempt) {
        var _a;
        return Math.min(((_a = this.options.retryDelay) !== null && _a !== void 0 ? _a : 300) * 2 ** attempt, MAX_RETRY_DELAY_MS);
    }
}
exports.HttpClient = HttpClient;
function encodeBody(body) {
    if (body === undefined)
        return {};
    if (typeof body === "string" ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        (typeof Blob !== "undefined" && body instanceof Blob) ||
        (typeof FormData !== "undefined" && body instanceof FormData) ||
        (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)) {
        return { body: body };
    }
    return { body: JSON.stringify(body), contentType: "application/json" };
}
async function readBody(response, type = "json") {
    if (type === "bytes") {
        return new Uint8Array(await response.arrayBuffer());
    }
    const text = await response.text();
    if (type === "text")
        return text;
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function parseRetryAfter(value) {
    if (!value)
        return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds))
        return Math.max(0, seconds);
    const date = Date.parse(value);
    if (Number.isNaN(date))
        return undefined;
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Characters of a path segment that ElysianDB 0.2.3 reads back as they were written. */
const PATH_SEGMENT = /^[A-Za-z0-9\-_.!~*'():@$&+,;=]+$/;
/** Punctuation of `PATH_SEGMENT`, for error messages. */
const PATH_SEGMENT_PUNCTUATION = "- _ . ! ~ * ' ( ) : @ $ & + , ; =";
/**
 * Checks one path segment (entity name, ID, key...) and returns it unchanged.
 *
 * - `.` and `..` are rejected: `fetch` removes them from URLs, so `DELETE /api/books/.` would become
 *   `DELETE /api/books/`, which deletes the whole entity.
 * - Characters that need percent-encoding are rejected: ElysianDB 0.2.3 decodes some path parameters and not
 *   others, so the value could be written but not read back (`PUT /kv/a%20b` stores the key `a%20b`).
 */
function segment(value, label) {
    if (typeof value !== "string" || value === "") {
        throw new TypeError(`ElysianDB: invalid ${label} ${JSON.stringify(value)}: it must be a non-empty string`);
    }
    if (value === "." || value === "..") {
        throw new TypeError(`ElysianDB: invalid ${label} "${value}": fetch removes "." and ".." from URL paths`);
    }
    if (!PATH_SEGMENT.test(value)) {
        throw new TypeError(`ElysianDB: invalid ${label} ${JSON.stringify(value)}: ElysianDB 0.2.3 only reads back path segments ` +
            `made of letters, digits and ${PATH_SEGMENT_PUNCTUATION}`);
    }
    return value;
}
