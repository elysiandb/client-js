import { segment } from "./http.js";
/** Entity types and their schemas (`db.entities`). */
export class EntitiesClient {
    constructor(http) {
        this.http = http;
    }
    /** Names of the entity types. */
    async list(call) {
        var _a;
        const result = await this.http.request("GET", "/api/entity/types/name", call);
        return (_a = result.entities) !== null && _a !== void 0 ? _a : [];
    }
    /** Schemas of every entity type. */
    async schemas(call) {
        var _a;
        const result = await this.http.request("GET", "/api/entity/types", call);
        return ((_a = result.entities) !== null && _a !== void 0 ? _a : []).map((entry) => (typeof entry === "string" ? JSON.parse(entry) : entry));
    }
    /**
     * Declares an entity type with a manual (strict) schema, before any document is written.
     * Fails with `400` when the type already exists. Requires an admin in `user` mode.
     *
     * ```ts
     * await db.entities.create("books", { title: { type: "string", required: true }, pages: "number" });
     * ```
     */
    create(name, fields, call) {
        return this.http.request("POST", `/api/${segment(name)}/create`, { ...call, body: { fields } });
    }
}
/** User accounts (`db.users`). The routes exist in `user` mode only and require an admin session. */
export class UsersClient {
    constructor(http) {
        this.http = http;
    }
    async list(call) {
        var _a;
        const result = await this.http.request("GET", "/api/security/user", call);
        return (_a = result.users) !== null && _a !== void 0 ? _a : [];
    }
    get(username, call) {
        return this.http.request("GET", this.userPath(username), call);
    }
    /** Creates a user (`role` defaults to `user`). Fails with `409` when the username exists. */
    async create(user, call) {
        await this.http.request("POST", "/api/security/user", { ...call, body: user });
    }
    /** Deletes a user. The default `admin` user and the last admin cannot be deleted. */
    async delete(username, call) {
        await this.http.request("DELETE", this.userPath(username), call);
    }
    /** Changes the password of a user (8 characters at least) and ends their other sessions. */
    async changePassword(username, password, call) {
        await this.http.request("PUT", `${this.userPath(username)}/password`, { ...call, body: { password } });
    }
    /** Changes the role of a user. Fails with `409` when no admin would remain. */
    async changeRole(username, role, call) {
        await this.http.request("PUT", `${this.userPath(username)}/role`, { ...call, body: { role } });
    }
    userPath(username) {
        return `/api/security/user/${segment(username)}`;
    }
}
/** Access control lists (`db.acl`). The routes exist in `user` mode only and require an admin session. */
export class ACLClient {
    constructor(http) {
        this.http = http;
    }
    /** The ACL of a user on an entity type. */
    get(username, entity, call) {
        return this.http.request("GET", this.aclPath(username, entity), call);
    }
    /** The ACLs of a user on every entity type. */
    async list(username, call) {
        const result = await this.http.request("GET", `/api/acl/${segment(username)}`, call);
        return result !== null && result !== void 0 ? result : [];
    }
    /** Replaces the permissions of a user on an entity type. Permissions left out are revoked. */
    async set(username, entity, permissions, call) {
        await this.http.request("PUT", this.aclPath(username, entity), { ...call, body: { permissions } });
    }
    /** Grants or revokes some permissions, keeping the others as they are. Returns the updated ACL. */
    async update(username, entity, permissions, call) {
        const current = await this.get(username, entity, call);
        const merged = { ...current.permissions, ...permissions };
        await this.set(username, entity, merged, call);
        return { ...current, permissions: merged };
    }
    /** Restores the default permissions: everything for admins, owned documents only for users. */
    async reset(username, entity, call) {
        await this.http.request("PUT", `${this.aclPath(username, entity)}/default`, call);
    }
    aclPath(username, entity) {
        return `/api/acl/${segment(username)}/${segment(entity)}`;
    }
}
/** JavaScript hooks run on reads (`db.hooks`). Requires `api.hooks.enabled` and admin credentials. */
export class HooksClient {
    constructor(http) {
        this.http = http;
    }
    /** Hooks of an entity type. */
    async list(entity, call) {
        const result = await this.http.request("GET", `/api/hook/${segment(entity)}`, call);
        return result !== null && result !== void 0 ? result : [];
    }
    get(id, call) {
        return this.http.request("GET", `/api/hook/id/${segment(id)}`, call);
    }
    /**
     * Creates a hook on an entity type.
     *
     * ```ts
     * await db.hooks.create("books", {
     *   name: "isClassic",
     *   event: "post_read",
     *   script: "function postRead(ctx) { ctx.entity.classic = ctx.entity.year < 1970 }",
     * });
     * ```
     */
    create(entity, hook, call) {
        const body = { language: "javascript", priority: 0, enabled: true, bypass_acl: false, ...hook };
        return this.http.request("POST", `/api/hook/${segment(entity)}`, { ...call, body });
    }
    /** Updates some fields of a hook and returns the full hook. */
    update(id, hook, call) {
        return this.http.request("PUT", `/api/hook/id/${segment(id)}`, { ...call, body: hook });
    }
    async delete(entity, id, call) {
        await this.http.request("DELETE", `/api/hook/${segment(entity)}/${segment(id)}`, call);
    }
}
/**
 * Instance-wide operations (`db.admin`): persistence, configuration, export/import and backups.
 * Every route requires an admin in `user` mode.
 */
export class AdminClient {
    constructor(http) {
        this.http = http;
    }
    /** Runtime metrics. Requires `stats.enabled`. */
    async stats(call) {
        const raw = await this.http.request("GET", "/stats", call);
        const stats = {};
        for (const key of Object.keys(raw)) {
            const value = raw[key];
            stats[key] = key !== "version" && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
        }
        return stats;
    }
    /** The configuration of the instance, secrets redacted. */
    config(call) {
        return this.http.request("GET", "/config", call);
    }
    /** Flushes the data to disk now. */
    async save(call) {
        await this.http.request("POST", "/save", call);
    }
    /** Deletes every KV key. Documents and REST API indexes are kept. */
    async reset(call) {
        await this.http.request("POST", "/reset", call);
    }
    /** The documents of every entity type. Accounts, ACLs, schemas and KV keys are left out: use `backup()` for them. */
    export(call) {
        return this.http.request("GET", "/api/export", call);
    }
    /**
     * Replaces the documents of each entity type present in the dump. Nothing is written when one document
     * does not match a manual schema (`400`, with `validationErrors` on the error).
     */
    import(dump, call) {
        return this.http.request("POST", "/api/import", { ...call, body: dump });
    }
    /**
     * Downloads a full backup archive: users, ACLs, hooks, schemas, documents and KV keys.
     * Store it like the data folder, since it holds the password hashes.
     *
     * ```ts
     * const { data, filename } = await db.admin.backup();
     * await fs.promises.writeFile(filename, data);
     * ```
     */
    async backup(call) {
        var _a;
        const response = await this.http.send("GET", "/api/backup", { ...call, responseType: "bytes" });
        const disposition = (_a = response.headers.get("Content-Disposition")) !== null && _a !== void 0 ? _a : "";
        const match = /filename="?([^";]+)"?/.exec(disposition);
        return { data: response.data, filename: match ? match[1] : "elysiandb-backup.tar.gz" };
    }
    /**
     * Replaces all the data with a backup archive. Every session ends, including the current one.
     * The HTTP API accepts archives up to 4 MB: use `elysiandb restore` for larger ones.
     */
    restore(archive, call) {
        return this.http.request("POST", "/api/restore", {
            retries: 0,
            ...call,
            body: archive,
            headers: { "Content-Type": "application/gzip", ...call === null || call === void 0 ? void 0 : call.headers },
        });
    }
}
