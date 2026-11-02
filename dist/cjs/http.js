"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
exports.segment = segment;
const errors_js_1 = require("./errors.js");
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
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
            const init = { method, headers, body, signal: controller.signal };
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
            const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
            if (canRetry && attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
                const delay = retryAfter !== undefined ? retryAfter * 1000 : this.backoff(attempt);
                if (delay <= MAX_RETRY_DELAY_MS) {
                    await sleep(delay);
                    continue;
                }
            }
            const detail = (_o = (0, errors_js_1.describeErrorBody)(payload)) !== null && _o !== void 0 ? _o : STATUS_HINTS[response.status];
            throw new errors_js_1.ElysianDBError({
                code: "HTTP_ERROR",
                message: `${method} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
                method,
                url,
                status: response.status,
                data: payload,
                requestId: (_p = response.headers.get("X-Request-Id")) !== null && _p !== void 0 ? _p : undefined,
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
/**
 * Encodes one path segment (entity name, ID, key...). Characters allowed in a path (`:`, `@`, `*`, `,`...)
 * are kept as they are, since ElysianDB stores path segments without decoding them.
 */
function segment(value) {
    return encodeURIComponent(value).replace(/%(3A|40|24|26|2B|2C|3B|3D)/gi, (escaped) => decodeURIComponent(escaped));
}
