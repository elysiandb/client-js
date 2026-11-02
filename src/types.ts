/** A stored document. Every document has a string `id`. */
export interface Document {
    id: string;
    [field: string]: any;
}

/** Payload accepted by `create()`: the document without `id`, which ElysianDB generates when it is missing. */
export type CreateInput<T> = Omit<T, "id"> & { id?: string };

/**
 * Payload accepted by `update()`: a partial document merged into the stored one.
 * Send `null` to unset a field.
 */
export type UpdateInput<T> = { [K in Exclude<keyof T, "id">]?: T[K] | null };

/** A link to a document of another entity, as stored by ElysianDB for nested `@entity` objects. */
export interface EntityReference {
    "@entity": string;
    id: string;
}

export type SortDirection = "asc" | "desc";

/** A field validation error returned by ElysianDB. `index` is set for list writes and imports. */
export interface ValidationError {
    field: string;
    message: string;
    index?: number;
    entity?: string;
    id?: string;
}

export type SchemaFieldType = "string" | "number" | "boolean" | "object" | "array";

export interface SchemaField {
    name?: string;
    type: SchemaFieldType;
    required?: boolean;
    fields?: Record<string, SchemaField>;
}

/** Field definitions for `entities.create()` and `setSchema()`: the full form or the `"string"` shorthand. */
export type SchemaFieldsInput = Record<string, SchemaFieldType | SchemaField>;

export interface EntitySchema {
    id: string;
    fields: Record<string, SchemaField>;
    _manual?: boolean;
}

/** One step of a migration: `{ set: [{ "profile.city": "Paris" }] }`. */
export interface MigrationAction {
    set: Array<Record<string, unknown>>;
}

export type Role = "admin" | "user";

export interface User {
    username: string;
    role: Role;
}

export interface CreateUserInput {
    username: string;
    password: string;
    role?: Role;
}

export type Permission =
    | "create"
    | "read"
    | "update"
    | "delete"
    | "owning_read"
    | "owning_update"
    | "owning_delete"
    | "owning_write";

export type Permissions = Record<Permission, boolean>;

export interface ACL {
    id: string;
    username: string;
    entity: string;
    permissions: Permissions;
}

export type HookEvent = "pre_read" | "post_read";

export interface Hook {
    id: string;
    name: string;
    entity: string;
    event: HookEvent;
    language: "javascript";
    script: string;
    priority: number;
    enabled: boolean;
    bypass_acl: boolean;
}

export type CreateHookInput = Pick<Hook, "name" | "event"> &
    Partial<Pick<Hook, "id" | "language" | "script" | "priority" | "enabled" | "bypass_acl">>;

export type UpdateHookInput = Partial<Omit<Hook, "id">>;
