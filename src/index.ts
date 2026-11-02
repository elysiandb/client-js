export { ElysianDB, createClient } from "./client.js";
export type { ElysianClientOptions, ElysianDBOptions, HealthResult } from "./client.js";
export { ElysianDBError } from "./errors.js";
export type { ElysianDBErrorCode } from "./errors.js";
export { AuthClient } from "./auth.js";
export type { AuthCredentials, AuthMode } from "./auth.js";
export { EntityClient } from "./entity.js";
export type { CallOptions, IterateOptions } from "./entity.js";
export { Transaction } from "./transaction.js";
export type { TransactionEntity, TransactionSession, TransactionState } from "./transaction.js";
export { KVClient } from "./kv.js";
export type { SetOptions } from "./kv.js";
export { ACLClient, AdminClient, EntitiesClient, HooksClient, UsersClient } from "./admin.js";
export type { Backup, BackupArchive, Dump, ImportResult, RestoreResult, Stats } from "./admin.js";
export { MonitoringClient } from "./monitoring.js";
export type {
    HealthStatus,
    LogEntry,
    LogLevel,
    LogLevelInfo,
    LogPage,
    LogQuery,
    MonitoringOverview,
    Problem,
    SeriesOptions,
} from "./monitoring.js";
export { and, or, toQueryString, toSearchParams } from "./query.js";
export type {
    CountOptions,
    Filter,
    FilterCondition,
    FilterOperator,
    FilterOperators,
    FilterPrimitive,
    Filters,
    FilterValue,
    GetOptions,
    ListOptions,
    QueryFilter,
    QueryOptions,
    QueryParams,
    QueryRequest,
    Sort,
} from "./query.js";
export type {
    HttpMethod,
    HttpResponse,
    QueryValue,
    RequestContext,
    RequestOptions,
    ResponseContext,
} from "./http.js";
export type {
    ACL,
    CreateHookInput,
    CreateInput,
    CreateUserInput,
    Document,
    EntityReference,
    EntitySchema,
    Hook,
    HookEvent,
    MigrationAction,
    Permission,
    Permissions,
    Role,
    SchemaField,
    SchemaFieldsInput,
    SchemaFieldType,
    SortDirection,
    UpdateHookInput,
    UpdateInput,
    User,
    ValidationError,
} from "./types.js";
