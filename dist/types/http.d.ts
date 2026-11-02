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
export declare class HttpClient {
    readonly baseUrl: string;
    private readonly options;
    constructor(options: HttpClientOptions);
    request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
    send<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
    buildUrl(path: string, query?: RequestOptions["query"]): string;
    private backoff;
}
/**
 * Encodes one path segment (entity name, ID, key...). Characters allowed in a path (`:`, `@`, `*`, `,`...)
 * are kept as they are, since ElysianDB stores path segments without decoding them.
 */
export declare function segment(value: string): string;
