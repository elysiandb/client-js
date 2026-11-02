import type { HttpClient } from "./http.js";
import type { User } from "./types.js";
/**
 * Credentials sent with every request, one per ElysianDB authentication mode:
 *
 * - `{ token }` for `token` mode (`Authorization: Bearer <token>`)
 * - `{ username, password }` for `basic` mode (`Authorization: Basic ...`)
 * - `{ session }` for `user` mode, to reuse a session opened earlier with `auth.login()`
 */
export type AuthCredentials = {
    token: string;
} | {
    username: string;
    password: string;
} | {
    session: string;
};
export type AuthMode = "none" | "token" | "basic" | "session";
export declare const SESSION_COOKIE = "edb_session";
/**
 * Holds the credentials of the client (`db.auth`) and runs the `user` mode session flow.
 */
export declare class AuthClient {
    private credentials?;
    private loggedIn;
    private readonly listeners;
    private http;
    constructor(credentials?: AuthCredentials);
    /** @internal */
    attach(http: HttpClient): void;
    /** The kind of credentials the client sends. */
    get mode(): AuthMode;
    /**
     * The session ID of `user` mode, when it is known: after `login()` on Node.js, Bun and Deno, or
     * when it was given with `useSession()`. Browsers keep the session cookie themselves: it stays `undefined` there.
     */
    get session(): string | undefined;
    /** Sends `Authorization: Bearer <token>` (`token` mode). */
    useToken(token: string): void;
    /** Sends `Authorization: Basic ...` (`basic` mode). */
    useBasic(username: string, password: string): void;
    /** Sends the session cookie of a session opened earlier (`user` mode). */
    useSession(session: string): void;
    /** Stops sending credentials. Use `logout()` to also end a `user` mode session on the server. */
    clear(): void;
    /** Calls `listener` whenever the credentials change. Returns a function that removes the listener. */
    onChange(listener: (auth: AuthClient) => void): () => void;
    /**
     * Opens a session (`user` mode) and sends it with the next requests.
     * Only admin users can log in. Repeated failures get `429` with `retryAfter` set on the error.
     */
    login(username: string, password: string): Promise<User>;
    /** Ends the current session (`user` mode) and clears the credentials of the client. */
    logout(): Promise<void>;
    /** The user of the current session (`user` mode). */
    me(): Promise<User>;
    /** @internal Headers that carry the credentials. */
    headers(): Record<string, string>;
    private set;
}
