import type { HttpClient, RequestOptions } from "./http.js";
import type { ACL, CreateHookInput, CreateUserInput, EntitySchema, Hook, Permissions, Role, SchemaFieldsInput, UpdateHookInput, User } from "./types.js";
type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;
/** Entity types and their schemas (`db.entities`). */
export declare class EntitiesClient {
    private readonly http;
    constructor(http: HttpClient);
    /** Names of the entity types. */
    list(call?: CallOptions): Promise<string[]>;
    /** Schemas of every entity type. */
    schemas(call?: CallOptions): Promise<EntitySchema[]>;
    /**
     * Declares an entity type with a manual (strict) schema, before any document is written.
     * Fails with `400` when the type already exists. Requires an admin in `user` mode.
     *
     * ```ts
     * await db.entities.create("books", { title: { type: "string", required: true }, pages: "number" });
     * ```
     */
    create(name: string, fields: SchemaFieldsInput, call?: CallOptions): Promise<EntitySchema>;
}
/** User accounts (`db.users`). The routes exist in `user` mode only and require an admin session. */
export declare class UsersClient {
    private readonly http;
    constructor(http: HttpClient);
    list(call?: CallOptions): Promise<User[]>;
    get(username: string, call?: CallOptions): Promise<User>;
    /** Creates a user (`role` defaults to `user`). Fails with `409` when the username exists. */
    create(user: CreateUserInput, call?: CallOptions): Promise<void>;
    /** Deletes a user. The default `admin` user and the last admin cannot be deleted. */
    delete(username: string, call?: CallOptions): Promise<void>;
    /** Changes the password of a user (8 characters at least) and ends their other sessions. */
    changePassword(username: string, password: string, call?: CallOptions): Promise<void>;
    /** Changes the role of a user. Fails with `409` when no admin would remain. */
    changeRole(username: string, role: Role, call?: CallOptions): Promise<void>;
    private userPath;
}
/** Access control lists (`db.acl`). The routes exist in `user` mode only and require an admin session. */
export declare class ACLClient {
    private readonly http;
    constructor(http: HttpClient);
    /** The ACL of a user on an entity type. */
    get(username: string, entity: string, call?: CallOptions): Promise<ACL>;
    /** The ACLs of a user on every entity type. */
    list(username: string, call?: CallOptions): Promise<ACL[]>;
    /** Replaces the permissions of a user on an entity type. Permissions left out are revoked. */
    set(username: string, entity: string, permissions: Partial<Permissions>, call?: CallOptions): Promise<void>;
    /** Grants or revokes some permissions, keeping the others as they are. Returns the updated ACL. */
    update(username: string, entity: string, permissions: Partial<Permissions>, call?: CallOptions): Promise<ACL>;
    /** Restores the default permissions: everything for admins, owned documents only for users. */
    reset(username: string, entity: string, call?: CallOptions): Promise<void>;
    private aclPath;
}
/** JavaScript hooks run on reads (`db.hooks`). Requires `api.hooks.enabled` and admin credentials. */
export declare class HooksClient {
    private readonly http;
    constructor(http: HttpClient);
    /** Hooks of an entity type. */
    list(entity: string, call?: CallOptions): Promise<Hook[]>;
    get(id: string, call?: CallOptions): Promise<Hook>;
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
    create(entity: string, hook: CreateHookInput, call?: CallOptions): Promise<Hook>;
    /** Updates some fields of a hook and returns the full hook. */
    update(id: string, hook: UpdateHookInput, call?: CallOptions): Promise<Hook>;
    delete(entity: string, id: string, call?: CallOptions): Promise<void>;
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
    /** File name suggested by ElysianDB, such as `elysiandb-backup-20261101T091400Z.tar.gz`. */
    filename: string;
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
export declare class AdminClient {
    private readonly http;
    constructor(http: HttpClient);
    /** Runtime metrics. Requires `stats.enabled`. */
    stats(call?: CallOptions): Promise<Stats>;
    /** The configuration of the instance, secrets redacted. */
    config<T = Record<string, unknown>>(call?: CallOptions): Promise<T>;
    /** Flushes the data to disk now. */
    save(call?: CallOptions): Promise<void>;
    /** Deletes every KV key. Documents and REST API indexes are kept. */
    reset(call?: CallOptions): Promise<void>;
    /** The documents of every entity type. Accounts, ACLs, schemas and KV keys are left out: use `backup()` for them. */
    export(call?: CallOptions): Promise<Dump>;
    /**
     * Replaces the documents of each entity type present in the dump. Nothing is written when one document
     * does not match a manual schema (`400`, with `validationErrors` on the error).
     */
    import(dump: Dump, call?: CallOptions): Promise<ImportResult>;
    /**
     * Downloads a full backup archive: users, ACLs, hooks, schemas, documents and KV keys.
     * Store it like the data folder, since it holds the password hashes.
     *
     * ```ts
     * const { data, filename } = await db.admin.backup();
     * await fs.promises.writeFile(filename, data);
     * ```
     */
    backup(call?: CallOptions): Promise<Backup>;
    /**
     * Replaces all the data with a backup archive. Every session ends, including the current one.
     * The HTTP API accepts archives up to 4 MB: use `elysiandb restore` for larger ones.
     */
    restore(archive: BackupArchive, call?: CallOptions): Promise<RestoreResult>;
}
export {};
