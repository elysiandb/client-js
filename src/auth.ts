import type { HttpClient } from "./http.js";
import type { User } from "./types.js";

/**
 * Credentials sent with every request, one per ElysianDB authentication mode:
 *
 * - `{ token }` for `token` mode (`Authorization: Bearer <token>`)
 * - `{ username, password }` for `basic` mode (`Authorization: Basic ...`)
 * - `{ session }` for `user` mode, to reuse a session opened earlier with `auth.login()`
 */
export type AuthCredentials =
    | { token: string }
    | { username: string; password: string }
    | { session: string };

export type AuthMode = "none" | "token" | "basic" | "session";

export const SESSION_COOKIE = "edb_session";

/**
 * Holds the credentials of the client (`db.auth`) and runs the `user` mode session flow.
 */
export class AuthClient {
    private credentials?: AuthCredentials;
    private loggedIn = false;
    private readonly listeners = new Set<(auth: AuthClient) => void>();
    private http!: HttpClient;

    constructor(credentials?: AuthCredentials) {
        this.credentials = credentials;
    }

    /** @internal */
    attach(http: HttpClient): void {
        this.http = http;
    }

    /** The kind of credentials the client sends. */
    get mode(): AuthMode {
        const credentials = this.credentials;
        if (!credentials) return this.loggedIn ? "session" : "none";
        if ("token" in credentials) return "token";
        if ("session" in credentials) return "session";
        return "basic";
    }

    /**
     * The session ID of `user` mode, when it is known: after `login()` on Node.js, Bun and Deno, or
     * when it was given with `useSession()`. Browsers keep the session cookie themselves: it stays `undefined` there.
     */
    get session(): string | undefined {
        return this.credentials && "session" in this.credentials ? this.credentials.session : undefined;
    }

    /** Sends `Authorization: Bearer <token>` (`token` mode). */
    useToken(token: string): void {
        this.set({ token });
    }

    /** Sends `Authorization: Basic ...` (`basic` mode). */
    useBasic(username: string, password: string): void {
        this.set({ username, password });
    }

    /** Sends the session cookie of a session opened earlier (`user` mode). */
    useSession(session: string): void {
        this.set({ session });
    }

    /** Stops sending credentials. Use `logout()` to also end a `user` mode session on the server. */
    clear(): void {
        this.loggedIn = false;
        this.set(undefined);
    }

    /** Calls `listener` whenever the credentials change. Returns a function that removes the listener. */
    onChange(listener: (auth: AuthClient) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Opens a session (`user` mode) and sends it with the next requests.
     * Only admin users can log in. Repeated failures get `429` with `retryAfter` set on the error.
     */
    async login(username: string, password: string): Promise<User> {
        const response = await this.http.send<User>("POST", "/api/security/login", {
            body: { username, password },
            auth: false,
        });

        const session = readSessionCookie(response.headers);
        this.loggedIn = true;
        this.set(session ? { session } : undefined);

        return response.data;
    }

    /** Ends the current session (`user` mode) and clears the credentials of the client. */
    async logout(): Promise<void> {
        try {
            await this.http.request("POST", "/api/security/logout");
        } finally {
            this.clear();
        }
    }

    /** The user of the current session (`user` mode). */
    me(): Promise<User> {
        return this.http.request<User>("GET", "/api/security/me");
    }

    /** @internal Headers that carry the credentials. */
    headers(): Record<string, string> {
        const credentials = this.credentials;
        if (!credentials) return {};
        if ("token" in credentials) return { Authorization: `Bearer ${credentials.token}` };
        if ("session" in credentials) return { Cookie: `${SESSION_COOKIE}=${credentials.session}` };
        return { Authorization: `Basic ${base64(`${credentials.username}:${credentials.password}`)}` };
    }

    private set(credentials: AuthCredentials | undefined): void {
        this.credentials = credentials;
        for (const listener of this.listeners) listener(this);
    }
}

function readSessionCookie(headers: Headers): string | undefined {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const values = typeof getSetCookie === "function"
        ? getSetCookie.call(headers)
        : [headers.get("set-cookie") ?? ""];

    for (const value of values) {
        const match = new RegExp(`(?:^|[;,]\\s*)${SESSION_COOKIE}=([^;,\\s]+)`).exec(value);
        if (match) return match[1];
    }

    return undefined;
}

function base64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
