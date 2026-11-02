import type { ValidationError } from "./types.js";

export type ElysianDBErrorCode = "HTTP_ERROR" | "NETWORK_ERROR" | "TIMEOUT" | "ABORTED";

export interface ElysianDBErrorInit {
    code: ElysianDBErrorCode;
    message: string;
    method: string;
    url: string;
    status?: number;
    data?: unknown;
    requestId?: string;
    retryAfter?: number;
    cause?: unknown;
}

/**
 * Error thrown by every client method.
 *
 * - `code` tells what failed: `HTTP_ERROR` (ElysianDB answered with a 4xx/5xx status),
 *   `NETWORK_ERROR`, `TIMEOUT` or `ABORTED`.
 * - `status` is the HTTP status, `0` when no response was received.
 * - `data` is the parsed response body, `validationErrors` the field errors of a rejected write.
 */
export class ElysianDBError extends Error {
    readonly code: ElysianDBErrorCode;
    readonly status: number;
    readonly method: string;
    readonly url: string;
    readonly data: unknown;
    readonly requestId?: string;
    /** Seconds to wait before retrying, from the `Retry-After` header of a `429` answer. */
    readonly retryAfter?: number;
    readonly validationErrors: ValidationError[];
    readonly cause?: unknown;

    constructor(init: ElysianDBErrorInit) {
        super(init.message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "ElysianDBError";
        this.code = init.code;
        this.status = init.status ?? 0;
        this.method = init.method;
        this.url = init.url;
        this.data = init.data;
        this.requestId = init.requestId;
        this.retryAfter = init.retryAfter;
        this.validationErrors = extractValidationErrors(init.data);
        this.cause = init.cause;
    }

    get isNotFound(): boolean {
        return this.status === 404;
    }

    get isUnauthorized(): boolean {
        return this.status === 401;
    }

    get isForbidden(): boolean {
        return this.status === 403;
    }

    get isConflict(): boolean {
        return this.status === 409;
    }

    get isRateLimited(): boolean {
        return this.status === 429;
    }

    get isValidationError(): boolean {
        return this.validationErrors.length > 0;
    }

    get isAbort(): boolean {
        return this.code === "ABORTED" || this.code === "TIMEOUT";
    }
}

/** Builds the error message of an HTTP error answer from its body. */
export function describeErrorBody(data: unknown): string | undefined {
    if (typeof data === "string") {
        const text = data.trim();
        return text || undefined;
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
        const error = (data as Record<string, unknown>).error;
        if (typeof error === "string" && error) return error.trim();
    }

    const validation = extractValidationErrors(data);
    if (validation.length > 0) {
        const first = validation[0];
        const more = validation.length > 1 ? ` (and ${validation.length - 1} more)` : "";
        return `validation failed: ${first.field ? `${first.field}: ` : ""}${first.message}${more}`;
    }

    return undefined;
}

function toValidationError(raw: unknown, extra: Partial<ValidationError> = {}): ValidationError | undefined {
    if (!raw || typeof raw !== "object") return undefined;

    const item = raw as Record<string, unknown>;
    const field = item.Field ?? item.field;
    const message = item.Message ?? item.message;
    if (typeof message !== "string") return undefined;

    return { field: typeof field === "string" ? field : "", message, ...extra };
}

/**
 * Normalizes the validation errors ElysianDB returns:
 * `[{Field, Message}]` for one document, `[[...], [...]]` for a list, `{rejected: [...]}` for an import.
 */
export function extractValidationErrors(data: unknown): ValidationError[] {
    const out: ValidationError[] = [];

    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            if (Array.isArray(item)) {
                for (const nested of item) {
                    const error = toValidationError(nested, { index });
                    if (error) out.push(error);
                }
            } else {
                const error = toValidationError(item);
                if (error) out.push(error);
            }
        });
    } else if (data && typeof data === "object") {
        const rejected = (data as Record<string, unknown>).rejected;
        if (Array.isArray(rejected)) {
            for (const item of rejected) {
                if (!item || typeof item !== "object") continue;
                const { entity, index, id, errors } = item as Record<string, unknown>;
                if (!Array.isArray(errors)) continue;
                for (const nested of errors) {
                    const error = toValidationError(nested, {
                        entity: typeof entity === "string" ? entity : undefined,
                        index: typeof index === "number" ? index : undefined,
                        id: typeof id === "string" ? id : undefined,
                    });
                    if (error) out.push(error);
                }
            }
        }
    }

    return out;
}
