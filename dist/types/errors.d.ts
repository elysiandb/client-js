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
export declare class ElysianDBError extends Error {
    readonly code: ElysianDBErrorCode;
    readonly status: number;
    readonly method: string;
    readonly url: string;
    readonly data: unknown;
    readonly requestId?: string;
    /** Seconds to wait before retrying, from the `Retry-After` header (`429`, and since ElysianDB 0.3.0 `503` and `507`). */
    readonly retryAfter?: number;
    readonly validationErrors: ValidationError[];
    readonly cause?: unknown;
    constructor(init: ElysianDBErrorInit);
    get isNotFound(): boolean;
    get isUnauthorized(): boolean;
    get isForbidden(): boolean;
    get isConflict(): boolean;
    get isRateLimited(): boolean;
    /** `503`: the server is busy, starting, or cannot write to its disk. See `retryAfter`. */
    get isUnavailable(): boolean;
    /** `507`: the disk of the server is full, writes are refused until space is freed (ElysianDB 0.3.0 and later). */
    get isStorageFull(): boolean;
    get isValidationError(): boolean;
    get isAbort(): boolean;
}
/** Builds the error message of an HTTP error answer from its body. */
export declare function describeErrorBody(data: unknown): string | undefined;
/**
 * Normalizes the validation errors ElysianDB returns:
 * `[{Field, Message}]` for one document, `[[...], [...]]` for a list, `{rejected: [...]}` for an import.
 */
export declare function extractValidationErrors(data: unknown): ValidationError[];
