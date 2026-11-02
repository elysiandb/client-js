"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringClient = void 0;
/** Monitoring endpoints of the Admin UI (`db.monitoring`). They take admin credentials. */
class MonitoringClient {
    constructor(http) {
        this.http = http;
    }
    /** Status, active problems, traffic, data, persistence, runtime and log counters. */
    overview(call) {
        return this.http.request("GET", "/monitoring/overview", call);
    }
    /** Time series of the monitoring charts. */
    series(options = {}, call) {
        return this.http.request("GET", "/monitoring/series", {
            ...call,
            query: { range: options.range, since: toMillis(options.since) },
        });
    }
    /** Top routes, hook statistics and documents per entity type. */
    details(call) {
        return this.http.request("GET", "/monitoring/details", call);
    }
    /** The last log lines kept in memory, newest first. Fails with `404` when `log.bufferLines` is `0`. */
    logs(query = {}, call) {
        return this.http.request("GET", "/monitoring/logs", { ...call, query: logParams(query) });
    }
    /** Every log line kept in memory that matches the query, newest first. */
    async exportLogs(query = {}, call) {
        const ndjson = await this.http.request("GET", "/monitoring/logs/download", {
            ...call,
            query: logParams(query),
            responseType: "text",
        });
        return ndjson
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => JSON.parse(line));
    }
    /** The current log level. */
    getLogLevel(call) {
        return this.http.request("GET", "/monitoring/logs/level", call);
    }
    /**
     * Changes the log level for 1 to 1440 minutes, after which it goes back to `log.level`.
     * `minutes` is not needed to go back to the configured level.
     */
    setLogLevel(level, minutes, call) {
        return this.http.request("PUT", "/monitoring/logs/level", {
            ...call,
            body: { level, minutes: minutes !== null && minutes !== void 0 ? minutes : 0 },
        });
    }
    /** Metrics in the Prometheus text format. Requires `monitoring.prometheus.enabled`. */
    metrics(call) {
        return this.http.request("GET", "/metrics", {
            ...call,
            responseType: "text",
            headers: { Accept: "text/plain", ...call === null || call === void 0 ? void 0 : call.headers },
        });
    }
}
exports.MonitoringClient = MonitoringClient;
function toMillis(value) {
    return value instanceof Date ? value.getTime() : value;
}
function logParams(query) {
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
