"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElysianDBError = void 0;
exports.describeErrorBody = describeErrorBody;
exports.extractValidationErrors = extractValidationErrors;
/**
 * Error thrown by every client method.
 *
 * - `code` tells what failed: `HTTP_ERROR` (ElysianDB answered with a 4xx/5xx status),
 *   `NETWORK_ERROR`, `TIMEOUT` or `ABORTED`.
 * - `status` is the HTTP status, `0` when no response was received.
 * - `data` is the parsed response body, `validationErrors` the field errors of a rejected write.
 */
class ElysianDBError extends Error {
    constructor(init) {
        var _a;
        super(init.message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "ElysianDBError";
        this.code = init.code;
        this.status = (_a = init.status) !== null && _a !== void 0 ? _a : 0;
        this.method = init.method;
        this.url = init.url;
        this.data = init.data;
        this.requestId = init.requestId;
        this.retryAfter = init.retryAfter;
        this.validationErrors = extractValidationErrors(init.data);
        this.cause = init.cause;
    }
    get isNotFound() {
        return this.status === 404;
    }
    get isUnauthorized() {
        return this.status === 401;
    }
    get isForbidden() {
        return this.status === 403;
    }
    get isConflict() {
        return this.status === 409;
    }
    get isRateLimited() {
        return this.status === 429;
    }
    get isValidationError() {
        return this.validationErrors.length > 0;
    }
    get isAbort() {
        return this.code === "ABORTED" || this.code === "TIMEOUT";
    }
}
exports.ElysianDBError = ElysianDBError;
/** Builds the error message of an HTTP error answer from its body. */
function describeErrorBody(data) {
    if (typeof data === "string") {
        const text = data.trim();
        return text || undefined;
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const error = data.error;
        if (typeof error === "string" && error)
            return error.trim();
    }
    const validation = extractValidationErrors(data);
    if (validation.length > 0) {
        const first = validation[0];
        const more = validation.length > 1 ? ` (and ${validation.length - 1} more)` : "";
        return `validation failed: ${first.field ? `${first.field}: ` : ""}${first.message}${more}`;
    }
    return undefined;
}
function toValidationError(raw, extra = {}) {
    var _a, _b;
    if (!raw || typeof raw !== "object")
        return undefined;
    const item = raw;
    const field = (_a = item.Field) !== null && _a !== void 0 ? _a : item.field;
    const message = (_b = item.Message) !== null && _b !== void 0 ? _b : item.message;
    if (typeof message !== "string")
        return undefined;
    return { field: typeof field === "string" ? field : "", message, ...extra };
}
/**
 * Normalizes the validation errors ElysianDB returns:
 * `[{Field, Message}]` for one document, `[[...], [...]]` for a list, `{rejected: [...]}` for an import.
 */
function extractValidationErrors(data) {
    const out = [];
    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            if (Array.isArray(item)) {
                for (const nested of item) {
                    const error = toValidationError(nested, { index });
                    if (error)
                        out.push(error);
                }
            }
            else {
                const error = toValidationError(item);
                if (error)
                    out.push(error);
            }
        });
    }
    else if (data && typeof data === "object") {
        const rejected = data.rejected;
        if (Array.isArray(rejected)) {
            for (const item of rejected) {
                if (!item || typeof item !== "object")
                    continue;
                const { entity, index, id, errors } = item;
                if (!Array.isArray(errors))
                    continue;
                for (const nested of errors) {
                    const error = toValidationError(nested, {
                        entity: typeof entity === "string" ? entity : undefined,
                        index: typeof index === "number" ? index : undefined,
                        id: typeof id === "string" ? id : undefined,
                    });
                    if (error)
                        out.push(error);
                }
            }
        }
    }
    return out;
}
