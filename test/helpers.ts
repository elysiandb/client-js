import { createClient, ElysianDB, ElysianDBOptions } from "../src/index.js";

export interface RecordedCall {
    method: string;
    url: URL;
    headers: Record<string, string>;
    body: string | undefined;
}

export type Reply = Response | ((call: RecordedCall) => Response | Promise<Response>);

/** A `fetch` that records the requests and answers with the queued replies, in order. */
export function mockFetch(...replies: Reply[]) {
    const calls: RecordedCall[] = [];
    const queue = [...replies];

    const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const headers: Record<string, string> = {};
        new Headers(init.headers).forEach((value, key) => {
            headers[key] = value;
        });

        const call: RecordedCall = {
            method: init.method ?? "GET",
            url: new URL(String(input)),
            headers,
            body: typeof init.body === "string" ? init.body : init.body === undefined ? undefined : "<binary>",
        };
        calls.push(call);

        const reply = queue.shift() ?? json({});
        return typeof reply === "function" ? reply(call) : reply;
    }) as typeof fetch;

    return { fetch: fetchImpl, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

export function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers });
}

export function empty(status = 204, headers: Record<string, string> = {}): Response {
    return new Response(null, { status, headers });
}

export function client(replies: Reply[], options: Omit<ElysianDBOptions, "url" | "fetch"> = {}): {
    db: ElysianDB;
    calls: RecordedCall[];
} {
    const { fetch, calls } = mockFetch(...replies);
    return { db: createClient("http://db.test:8089/", { ...options, fetch }), calls };
}
