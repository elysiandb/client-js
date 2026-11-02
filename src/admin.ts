import { entitySegment } from "./entity.js";
import type { HttpClient, RequestOptions } from "./http.js";
import { segment } from "./http.js";
import type {
    ACL,
    CreateHookInput,
    CreateUserInput,
    EntitySchema,
    Hook,
    Permissions,
    Role,
    SchemaFieldsInput,
    UpdateHookInput,
    User,
} from "./types.js";

type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;

/** Entity types and their schemas (`db.entities`). */
export class EntitiesClient {
    constructor(private readonly http: HttpClient) {}

    /** Names of the entity types. */
    async list(call?: CallOptions): Promise<string[]> {
        const result = await this.http.request<{ entities: string[] | null }>("GET", "/api/entity/types/name", call);
        return result.entities ?? [];
    }

    /** Schemas of every entity type. */
    async schemas(call?: CallOptions): Promise<EntitySchema[]> {
        const result = await this.http.request<{ entities: Array<string | EntitySchema> | null }>(
            "GET",
            "/api/entity/types",
            call,
        );

        return (result.entities ?? []).map((entry) => (typeof entry === "string" ? JSON.parse(entry) : entry));
    }

    /**
     * Declares an entity type with a manual (strict) schema, before any document is written.
     * Fails with `400` when the type already exists. Requires an admin in `user` mode.
     *
     * ```ts
     * await db.entities.create("books", { title: { type: "string", required: true }, pages: "number" });
     * ```
     */
    async create(name: string, fields: SchemaFieldsInput, call?: CallOptions): Promise<EntitySchema> {
        return this.http.request<EntitySchema>("POST", `/api/${entitySegment(name)}/create`, { ...call, body: { fields } });
    }
}

/** User accounts (`db.users`). The routes exist in `user` mode only and require an admin session. */
export class UsersClient {
    constructor(private readonly http: HttpClient) {}

    async list(call?: CallOptions): Promise<User[]> {
        const result = await this.http.request<{ users: User[] | null }>("GET", "/api/security/user", call);
        return result.users ?? [];
    }

    async get(username: string, call?: CallOptions): Promise<User> {
        return this.http.request<User>("GET", this.userPath(username), call);
    }

    /** Creates a user (`role` defaults to `user`). Fails with `409` when the username exists. */
    async create(user: CreateUserInput, call?: CallOptions): Promise<void> {
        // A username that cannot be used in a URL path could be created but not managed afterwards.
        segment(user?.username, "username");
        await this.http.request("POST", "/api/security/user", { ...call, body: user });
    }

    /** Deletes a user. The default `admin` user and the last admin cannot be deleted. */
    async delete(username: string, call?: CallOptions): Promise<void> {
        await this.http.request("DELETE", this.userPath(username), call);
    }

    /** Changes the password of a user (8 characters at least) and ends their other sessions. */
    async changePassword(username: string, password: string, call?: CallOptions): Promise<void> {
        await this.http.request("PUT", `${this.userPath(username)}/password`, { ...call, body: { password } });
    }

    /** Changes the role of a user. Fails with `409` when no admin would remain. */
    async changeRole(username: string, role: Role, call?: CallOptions): Promise<void> {
        await this.http.request("PUT", `${this.userPath(username)}/role`, { ...call, body: { role } });
    }

    private userPath(username: string): string {
        return `/api/security/user/${segment(username, "username")}`;
    }
}

/** Access control lists (`db.acl`). The routes exist in `user` mode only and require an admin session. */
export class ACLClient {
    constructor(private readonly http: HttpClient) {}

    /** The ACL of a user on an entity type. */
    async get(username: string, entity: string, call?: CallOptions): Promise<ACL> {
        return this.http.request<ACL>("GET", this.aclPath(username, entity), call);
    }

    /** The ACLs of a user on every entity type. */
    async list(username: string, call?: CallOptions): Promise<ACL[]> {
        const result = await this.http.request<ACL[] | null>("GET", `/api/acl/${segment(username, "username")}`, call);
        return result ?? [];
    }

    /** Replaces the permissions of a user on an entity type. Permissions left out are revoked. */
    async set(username: string, entity: string, permissions: Partial<Permissions>, call?: CallOptions): Promise<void> {
        await this.http.request("PUT", this.aclPath(username, entity), { ...call, body: { permissions } });
    }

    /** Grants or revokes some permissions, keeping the others as they are. Returns the updated ACL. */
    async update(username: string, entity: string, permissions: Partial<Permissions>, call?: CallOptions): Promise<ACL> {
        const current = await this.get(username, entity, call);
        const merged = { ...current.permissions, ...permissions };
        await this.set(username, entity, merged, call);
        return { ...current, permissions: merged };
    }

    /** Restores the default permissions: everything for admins, owned documents only for users. */
    async reset(username: string, entity: string, call?: CallOptions): Promise<void> {
        await this.http.request("PUT", `${this.aclPath(username, entity)}/default`, call);
    }

    private aclPath(username: string, entity: string): string {
        return `/api/acl/${segment(username, "username")}/${entitySegment(entity)}`;
    }
}

/** JavaScript hooks run on reads (`db.hooks`). Requires `api.hooks.enabled` and admin credentials. */
export class HooksClient {
    constructor(private readonly http: HttpClient) {}

    /** Hooks of an entity type. */
    async list(entity: string, call?: CallOptions): Promise<Hook[]> {
        const result = await this.http.request<Hook[] | null>("GET", `/api/hook/${entitySegment(entity)}`, call);
        return result ?? [];
    }

    async get(id: string, call?: CallOptions): Promise<Hook> {
        return this.http.request<Hook>("GET", `/api/hook/id/${segment(id, "hook ID")}`, call);
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
    async create(entity: string, hook: CreateHookInput, call?: CallOptions): Promise<Hook> {
        const body = { language: "javascript", priority: 0, enabled: true, bypass_acl: false, ...hook };
        return this.http.request<Hook>("POST", `/api/hook/${entitySegment(entity)}`, { ...call, body });
    }

    /** Updates some fields of a hook and returns the full hook. */
    async update(id: string, hook: UpdateHookInput, call?: CallOptions): Promise<Hook> {
        return this.http.request<Hook>("PUT", `/api/hook/id/${segment(id, "hook ID")}`, { ...call, body: hook });
    }

    async delete(entity: string, id: string, call?: CallOptions): Promise<void> {
        await this.http.request("DELETE", `/api/hook/${entitySegment(entity)}/${segment(id, "hook ID")}`, call);
    }
}

/** Runtime metrics of `GET /stats`, parsed as numbers. */
export interface Stats {
    keys_count: number;
    expiration_keys_count: number;
    uptime_seconds: number;
    total_requests: number;
    hits: number;
    misses: number;
    entities_count: number;
    version: string;
}

/** A dump of `export()` / `import()`: the documents of each entity type. */
export type Dump = Record<string, Array<Record<string, unknown>>>;

export interface ImportResult {
    status: string;
    /** Entities of the dump that were not imported (accounts and ACLs). */
    ignored?: string[];
    message?: string;
}

export interface Backup {
    /** The `tar.gz` archive. */
    data: Uint8Array;
    /**
     * File name suggested by ElysianDB, such as `elysiandb-backup-20261101T091400Z.tar.gz`. It is always a
     * `.tar.gz` file name made of letters, digits, `.`, `_` and `-`, without folder, so that a server cannot
     * point it outside your folder or at a file that is not an archive: `elysiandb-backup.tar.gz` replaces
     * any other name.
     */
    filename: string;
}

const DEFAULT_BACKUP_FILENAME = "elysiandb-backup.tar.gz";

/** The base name of the file of a `Content-Disposition` header, if it is a plain `.tar.gz` file name. */
function backupFilename(disposition: string | null): string {
    const match = /filename="?([^";]+)"?/i.exec(disposition ?? "");
    const name = match ? match[1].trim().split(/[\\/]/).pop()! : "";
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.tar\.gz$/.test(name) ? name : DEFAULT_BACKUP_FILENAME;
}

export interface RestoreResult {
    status: string;
    /** Number of documents restored per entity type. */
    entities: Record<string, number>;
    schemas: number;
    kv_keys: number;
    kv_keys_expired: number;
}

export type BackupArchive = Uint8Array | ArrayBuffer | Blob;

/**
 * Instance-wide operations (`db.admin`): persistence, configuration, export/import and backups.
 * Every route requires an admin in `user` mode.
 */
export class AdminClient {
    constructor(private readonly http: HttpClient) {}

    /** Runtime metrics. Requires `stats.enabled`. */
    async stats(call?: CallOptions): Promise<Stats> {
        const raw = await this.http.request<Record<string, string>>("GET", "/stats", call);
        const stats: Record<string, string | number> = {};
        for (const key of Object.keys(raw)) {
            const value = raw[key];
            stats[key] = key !== "version" && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
        }
        return stats as unknown as Stats;
    }

    /** The configuration of the instance, secrets redacted. */
    config<T = Record<string, unknown>>(call?: CallOptions): Promise<T> {
        return this.http.request<T>("GET", "/config", call);
    }

    /** Flushes the data to disk now. */
    async save(call?: CallOptions): Promise<void> {
        await this.http.request("POST", "/save", call);
    }

    /** Deletes every KV key. Documents and REST API indexes are kept. */
    async reset(call?: CallOptions): Promise<void> {
        await this.http.request("POST", "/reset", call);
    }

    /** The documents of every entity type. Accounts, ACLs, schemas and KV keys are left out: use `backup()` for them. */
    export(call?: CallOptions): Promise<Dump> {
        return this.http.request<Dump>("GET", "/api/export", call);
    }

    /**
     * Replaces the documents of each entity type present in the dump. Nothing is written when one document
     * does not match a manual schema (`400`, with `validationErrors` on the error).
     */
    import(dump: Dump, call?: CallOptions): Promise<ImportResult> {
        return this.http.request<ImportResult>("POST", "/api/import", { ...call, body: dump });
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
    async backup(call?: CallOptions): Promise<Backup> {
        const response = await this.http.send<Uint8Array>("GET", "/api/backup", { ...call, responseType: "bytes" });
        return { data: response.data, filename: backupFilename(response.headers.get("Content-Disposition")) };
    }

    /**
     * Replaces all the data with a backup archive. Every session ends, including the current one.
     * The HTTP API accepts archives up to 4 MB: use `elysiandb restore` for larger ones.
     */
    restore(archive: BackupArchive, call?: CallOptions): Promise<RestoreResult> {
        return this.http.request<RestoreResult>("POST", "/api/restore", {
            retries: 0,
            ...call,
            body: archive,
            headers: { "Content-Type": "application/gzip", ...call?.headers },
        });
    }
}
