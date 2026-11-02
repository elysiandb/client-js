export const SESSION_COOKIE = "edb_session";
/**
 * Holds the credentials of the client (`db.auth`) and runs the `user` mode session flow.
 */
export class AuthClient {
    constructor(credentials) {
        this.loggedIn = false;
        this.listeners = new Set();
        this.credentials = credentials;
    }
    /** @internal */
    attach(http) {
        this.http = http;
    }
    /** The kind of credentials the client sends. */
    get mode() {
        const credentials = this.credentials;
        if (!credentials)
            return this.loggedIn ? "session" : "none";
        if ("token" in credentials)
            return "token";
        if ("session" in credentials)
            return "session";
        return "basic";
    }
    /**
     * The session ID of `user` mode, when it is known: after `login()` on Node.js, Bun and Deno, or
     * when it was given with `useSession()`. Browsers keep the session cookie themselves: it stays `undefined` there.
     */
    get session() {
        return this.credentials && "session" in this.credentials ? this.credentials.session : undefined;
    }
    /** Sends `Authorization: Bearer <token>` (`token` mode). */
    useToken(token) {
        this.set({ token });
    }
    /** Sends `Authorization: Basic ...` (`basic` mode). */
    useBasic(username, password) {
        this.set({ username, password });
    }
    /** Sends the session cookie of a session opened earlier (`user` mode). */
    useSession(session) {
        this.set({ session });
    }
    /** Stops sending credentials. Use `logout()` to also end a `user` mode session on the server. */
    clear() {
        this.loggedIn = false;
        this.set(undefined);
    }
    /** Calls `listener` whenever the credentials change. Returns a function that removes the listener. */
    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /**
     * Opens a session (`user` mode) and sends it with the next requests.
     * Only admin users can log in. Repeated failures get `429` with `retryAfter` set on the error.
     */
    async login(username, password) {
        const response = await this.http.send("POST", "/api/security/login", {
            body: { username, password },
            auth: false,
        });
        const session = readSessionCookie(response.headers);
        this.loggedIn = true;
        this.set(session ? { session } : undefined);
        return response.data;
    }
    /** Ends the current session (`user` mode) and clears the credentials of the client. */
    async logout() {
        try {
            await this.http.request("POST", "/api/security/logout");
        }
        finally {
            this.clear();
        }
    }
    /** The user of the current session (`user` mode). */
    me() {
        return this.http.request("GET", "/api/security/me");
    }
    /** @internal Headers that carry the credentials. */
    headers() {
        const credentials = this.credentials;
        if (!credentials)
            return {};
        if ("token" in credentials)
            return { Authorization: `Bearer ${credentials.token}` };
        if ("session" in credentials)
            return { Cookie: `${SESSION_COOKIE}=${credentials.session}` };
        return { Authorization: `Basic ${base64(`${credentials.username}:${credentials.password}`)}` };
    }
    set(credentials) {
        this.credentials = credentials;
        for (const listener of this.listeners)
            listener(this);
    }
}
function readSessionCookie(headers) {
    var _a;
    const getSetCookie = headers.getSetCookie;
    const values = typeof getSetCookie === "function"
        ? getSetCookie.call(headers)
        : [(_a = headers.get("set-cookie")) !== null && _a !== void 0 ? _a : ""];
    for (const value of values) {
        const match = new RegExp(`(?:^|[;,]\\s*)${SESSION_COOKIE}=([^;,\\s]+)`).exec(value);
        if (match)
            return match[1];
    }
    return undefined;
}
function base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
