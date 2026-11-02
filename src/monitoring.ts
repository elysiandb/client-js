import type { HttpClient, RequestOptions } from "./http.js";

type CallOptions = Pick<RequestOptions, "signal" | "timeout" | "retries" | "requestId" | "headers">;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type HealthStatus = "healthy" | "warning" | "critical";

export interface Problem {
    /** For example `flush_failing`, `error_rate_high` or `default_admin_password`. */
    code: string;
    severity: "critical" | "warning" | "info";
    since: string;
    details?: Record<string, unknown>;
}

/** `GET /monitoring/overview`. Values that cannot be measured yet are `null`. */
export interface MonitoringOverview {
    generated_at: string;
    instance: {
        version: string;
        go_version: string;
        engine: string;
        started_at: string;
        uptime_seconds: number;
        http: { enabled: boolean; address: string };
        tcp: { enabled: boolean; address: string };
        auth_mode: string;
        features: Record<string, boolean>;
        data_folder: string;
    };
    status: { level: HealthStatus; problems: Problem[] };
    traffic: Record<string, number | null>;
    data: {
        kv_keys: number | null;
        kv_keys_with_ttl: number | null;
        entity_types: number;
        entities: number;
        disk_bytes: number | null;
        top_entity_types: Array<{ name: string; count: number }>;
    };
    persistence: Record<string, unknown>;
    runtime: Record<string, number | null>;
    connections: Record<string, number | null>;
    logs: { level: LogLevel; errors_1h: number; warnings_1h: number; errors_24h: number; warnings_24h: number };
}

export interface SeriesOptions {
    /** `15m` (one point per second, default), `1h` (10 seconds) or `24h` (one minute). */
    range?: "15m" | "1h" | "24h";
    /** Only points newer than this time, as a `Date` or Unix milliseconds. */
    since?: Date | number;
}

export interface LogEntry {
    seq: number;
    time: string;
    level: string;
    component?: string;
    msg: string;
    attrs?: Record<string, unknown>;
}

export interface LogQuery {
    /** Minimum level. Default `debug` (every line). */
    level?: LogLevel;
    component?: string;
    /** Text searched in the lines. */
    q?: string;
    user?: string;
    requestId?: string;
    since?: Date | number;
    until?: Date | number;
    /** Lines older than this sequence number (next page). */
    before?: number;
    /** Lines newer than this sequence number (live tail). */
    after?: number;
    limit?: number;
}

export interface LogPage {
    entries: LogEntry[];
    has_more: boolean;
    oldest_seq: number;
    latest_seq: number;
    size: number;
    capacity: number;
    buffer_since: string | null;
    components: string[];
}

export interface LogLevelInfo {
    /** Level in use. */
    level: LogLevel;
    /** Level of the configuration (`log.level`). */
    configured: LogLevel;
    /** When the level goes back to `configured`, if it was changed. */
    until: string | null;
}

/** Monitoring endpoints of the Admin UI (`db.monitoring`). They take admin credentials. */
export class MonitoringClient {
    constructor(private readonly http: HttpClient) {}

    /** Status, active problems, traffic, data, persistence, runtime and log counters. */
    overview<T = MonitoringOverview>(call?: CallOptions): Promise<T> {
        return this.http.request<T>("GET", "/monitoring/overview", call);
    }

    /** Time series of the monitoring charts. */
    series<T = Record<string, unknown>>(options: SeriesOptions = {}, call?: CallOptions): Promise<T> {
        return this.http.request<T>("GET", "/monitoring/series", {
            ...call,
            query: { range: options.range, since: toMillis(options.since) },
        });
    }

    /** Top routes, hook statistics and documents per entity type. */
    details<T = Record<string, unknown>>(call?: CallOptions): Promise<T> {
        return this.http.request<T>("GET", "/monitoring/details", call);
    }

    /** The last log lines kept in memory, newest first. Fails with `404` when `log.bufferLines` is `0`. */
    logs(query: LogQuery = {}, call?: CallOptions): Promise<LogPage> {
        return this.http.request<LogPage>("GET", "/monitoring/logs", { ...call, query: logParams(query) });
    }

    /** Every log line kept in memory that matches the query, newest first. */
    async exportLogs(query: Omit<LogQuery, "limit" | "before"> = {}, call?: CallOptions): Promise<LogEntry[]> {
        const ndjson = await this.http.request<string>("GET", "/monitoring/logs/download", {
            ...call,
            query: logParams(query),
            responseType: "text",
        });

        return ndjson
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => JSON.parse(line) as LogEntry);
    }

    /** The current log level. */
    getLogLevel(call?: CallOptions): Promise<LogLevelInfo> {
        return this.http.request<LogLevelInfo>("GET", "/monitoring/logs/level", call);
    }

    /**
     * Changes the log level for 1 to 1440 minutes, after which it goes back to `log.level`.
     * `minutes` is not needed to go back to the configured level.
     */
    setLogLevel(level: LogLevel, minutes?: number, call?: CallOptions): Promise<LogLevelInfo> {
        return this.http.request<LogLevelInfo>("PUT", "/monitoring/logs/level", {
            ...call,
            body: { level, minutes: minutes ?? 0 },
        });
    }

    /** Metrics in the Prometheus text format. Requires `monitoring.prometheus.enabled`. */
    metrics(call?: CallOptions): Promise<string> {
        return this.http.request<string>("GET", "/metrics", {
            ...call,
            responseType: "text",
            headers: { Accept: "text/plain", ...call?.headers },
        });
    }
}

function toMillis(value: Date | number | undefined): number | undefined {
    return value instanceof Date ? value.getTime() : value;
}

function logParams(query: LogQuery): Record<string, string | number | undefined> {
    return {
        level: query.level,
        component: query.component,
        q: query.q,
        user: query.user,
        request_id: query.requestId,
        since: toMillis(query.since),
        until: toMillis(query.until),
        before: query.before,
        after: query.after,
        limit: query.limit,
    };
}
