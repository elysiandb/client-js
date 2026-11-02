import { describeErrorBody, ElysianDBError } from "./errors.js";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
    /** Query string parameters. `undefined` and `null` values are skipped. */
    query?: Record<string, QueryValue> | URLSearchParams;
    /** Request body. Plain objects and arrays are sent as JSON; strings, bytes, `Blob` and `FormData` as they are. */
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    /** Overrides the client `timeout` for this request, in milliseconds. */
    timeout?: number;
    /** Overrides the client `retries` for this request. */
    retries?: number;
    /** Sent as `X-Request-Id`, which ElysianDB writes in its logs. */
    requestId?: string;
    /** How to read the response body. Default `"json"` (falls back to text when the body is not JSON). */
    responseType?: "json" | "text" | "bytes";
    /** Set to `false` to send the request without credentials. */
    auth?: boolean;
}

export interface HttpResponse<T> {
    data: T;
    status: number;
    headers: Headers;
}

export interface RequestContext {
    method: HttpMethod;
    url: string;
    /** Headers about to be sent. Hooks may change them. */
    headers: Record<string, string>;
    attempt: number;
}

export interface ResponseContext {
    method: HttpMethod;
    url: string;
    status: number;
    headers: Headers;
    durationMs: number;
    attempt: number;
}

export interface HttpClientOptions {
    url: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    credentials?: RequestCredentials;
    onRequest?: (context: RequestContext) => void | Promise<void>;
    onResponse?: (context: ResponseContext) => void | Promise<void>;
    authHeaders: () => Record<string, string>;
}

const IDEMPOTENT_METHODS = new Set<HttpMethod>(["GET", "HEAD", "PUT", "DELETE"]);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_RETRY_DELAY_MS = 30_000;

const STATUS_HINTS: Record<number, string> = {
    400: "bad request",
    401: "authentication required or invalid credentials",
    403: "forbidden",
    404: "not found",
    409: "conflict",
    429: "too many requests",
    500: "internal server error",
};

export class HttpClient {
    readonly baseUrl: string;
    private readonly options: HttpClientOptions;

    constructor(options: HttpClientOptions) {
        if (!options.url) {
            throw new TypeError("ElysianDB: the server URL is required, for example createClient(\"http://localhost:8089\")");
        }

        this.baseUrl = options.url.replace(/\/+$/, "");
        this.options = options;
    }

    async request<T = unknown>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
        const response = await this.send<T>(method, path, options);
        return response.data;
    }

    async send<T = unknown>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        const url = this.buildUrl(path, options.query);
        const retries = Math.max(0, options.retries ?? this.options.retries ?? 0);
        const canRetry = IDEMPOTENT_METHODS.has(method);
        const timeout = options.timeout ?? this.options.timeout;
        const fetchImpl = this.options.fetch ?? globalThis.fetch;

        if (typeof fetchImpl !== "function") {
            throw new TypeError("ElysianDB: no fetch implementation found, pass one with the `fetch` option");
        }

        for (let attempt = 0; ; attempt++) {
            const { body, contentType } = encodeBody(options.body);
            const headers: Record<string, string> = {
                Accept: "application/json",
                ...this.options.headers,
                ...(options.auth === false ? {} : this.options.authHeaders()),
                ...(contentType ? { "Content-Type": contentType } : {}),
                ...(options.requestId ? { "X-Request-Id": options.requestId } : {}),
                ...options.headers,
            };

            await this.options.onRequest?.({ method, url, headers, attempt });

            const controller = new AbortController();
            let timedOut = false;
            const timer = timeout ? setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeout) : undefined;
            const onCallerAbort = () => controller.abort();
            if (options.signal?.aborted) controller.abort();
            options.signal?.addEventListener("abort", onCallerAbort);

            // ElysianDB never redirects on purpose. Following a redirect would replay the request, credentials
            // included, on another URL: `DELETE /api/books/` is redirected to `DELETE /api/books`, for example.
            const init: RequestInit = { method, headers, body, signal: controller.signal, redirect: "manual" };
            if (this.options.credentials) init.credentials = this.options.credentials;

            const started = Date.now();
            let response: Response;
            let payload: unknown;

            try {
                response = await fetchImpl(url, init);
                payload = response.ok
                    ? await readBody(response, method === "HEAD" ? "text" : options.responseType)
                    : await readBody(response, "json");
            } catch (cause) {
                if (timedOut) {
                    throw new ElysianDBError({
                        code: "TIMEOUT",
                        message: `${method} ${path} timed out after ${timeout} ms`,
                        method,
                        url,
                        cause,
                    });
                }

                if (options.signal?.aborted) {
                    throw new ElysianDBError({ code: "ABORTED", message: `${method} ${path} was aborted`, method, url, cause });
                }

                if (canRetry && attempt < retries) {
                    await sleep(this.backoff(attempt));
                    continue;
                }

                const reason = cause instanceof Error ? cause.message : String(cause);
                throw new ElysianDBError({
                    code: "NETWORK_ERROR",
                    message: `${method} ${path} could not reach ElysianDB at ${this.baseUrl}: ${reason}`,
                    method,
                    url,
                    cause,
                });
            } finally {
                if (timer) clearTimeout(timer);
                options.signal?.removeEventListener("abort", onCallerAbort);
            }

            await this.options.onResponse?.({
                method,
                url,
                status: response.status,
                headers: response.headers,
                durationMs: Date.now() - started,
                attempt,
            });

            if (response.ok) {
                return { data: payload as T, status: response.status, headers: response.headers };
            }

            // Browsers hide the status and the location of a redirect ("opaqueredirect").
            if (response.type === "opaqueredirect" || REDIRECT_STATUSES.has(response.status)) {
                const location = response.headers.get("Location");
                throw new ElysianDBError({
                    code: "HTTP_ERROR",
                    message: `${method} ${path} was redirected${response.status ? ` (${response.status})` : ""}${
                        location ? ` to ${location}` : ""
                    }: the client does not follow redirects, check the URL of the server`,
                    method,
                    url,
                    status: response.status,
                    data: payload,
                    requestId: response.headers.get("X-Request-Id") ?? undefined,
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

            const detail = describeErrorBody(payload) ?? STATUS_HINTS[response.status];
            throw new ElysianDBError({
                code: "HTTP_ERROR",
                message: `${method} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
                method,
                url,
                status: response.status,
                data: payload,
                requestId: response.headers.get("X-Request-Id") ?? undefined,
                retryAfter,
            });
        }
    }

    buildUrl(path: string, query?: RequestOptions["query"]): string {
        let qs = "";
        if (query instanceof URLSearchParams) {
            qs = query.toString();
        } else if (query) {
            const params = new URLSearchParams();
            for (const key of Object.keys(query)) {
                const value = query[key];
                if (value !== undefined && value !== null) params.set(key, String(value));
            }
            qs = params.toString();
        }

        return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    }

    private backoff(attempt: number): number {
        return Math.min((this.options.retryDelay ?? 300) * 2 ** attempt, MAX_RETRY_DELAY_MS);
    }
}

function encodeBody(body: unknown): { body?: BodyInit; contentType?: string } {
    if (body === undefined) return {};

    if (
        typeof body === "string" ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        (typeof Blob !== "undefined" && body instanceof Blob) ||
        (typeof FormData !== "undefined" && body instanceof FormData) ||
        (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)
    ) {
        return { body: body as BodyInit };
    }

    return { body: JSON.stringify(body), contentType: "application/json" };
}

async function readBody(response: Response, type: RequestOptions["responseType"] = "json"): Promise<unknown> {
    if (type === "bytes") {
        return new Uint8Array(await response.arrayBuffer());
    }

    const text = await response.text();
    if (type === "text") return text;
    if (!text) return undefined;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);

    const date = Date.parse(value);
    if (Number.isNaN(date)) return undefined;

    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function sleep(ms: number): Promise<void> {
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
export function segment(value: string, label: string): string {
    if (typeof value !== "string" || value === "") {
        throw new TypeError(`ElysianDB: invalid ${label} ${JSON.stringify(value)}: it must be a non-empty string`);
    }

    if (value === "." || value === "..") {
        throw new TypeError(`ElysianDB: invalid ${label} "${value}": fetch removes "." and ".." from URL paths`);
    }

    if (!PATH_SEGMENT.test(value)) {
        throw new TypeError(
            `ElysianDB: invalid ${label} ${JSON.stringify(value)}: ElysianDB 0.2.3 only reads back path segments ` +
                `made of letters, digits and ${PATH_SEGMENT_PUNCTUATION}`,
        );
    }

    return value;
}
