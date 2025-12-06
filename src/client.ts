import { toQueryString } from "./utils";
import {TransactionSession} from "./transaction";

export interface ElysianClientOptions {
    baseUrl: string;
    token?: string;
}

export type FilterOperators =
    | "eq"
    | "neq"
    | "lt"
    | "lte"
    | "gt"
    | "gte"
    | "contains"
    | "not_contains"
    | "all"
    | "any"
    | "none";

export type Filters = Record<
    string,
    Partial<Record<FilterOperators, string | number | boolean | Array<string | number>>>
>;

export interface ListOptions {
    limit?: number;
    offset?: number;
    search?: string;
    fields?: string[];
    includes?: string[];
    sort?: Record<string, "asc" | "desc">;
    filter?: Filters;
}

export class ElysianDB {
    private baseUrl: string;
    private token?: string;

    constructor(options: ElysianClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.token = options.token;
    }

    protected async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(init.headers as Record<string, string> | undefined),
        };
        if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
        const res = await fetch(url, { ...init, headers });
        const text = await res.text();
        return text ? JSON.parse(text) : undefined as T;
    }

    rawRequest<T = unknown>(path: string, init?: RequestInit) {
        return this.request<T>(path, init);
    }

    async transaction(fn: (tx: TransactionSession) => Promise<void>) {
        const tx = new TransactionSession(this);
        await tx.begin();
        try {
            await fn(tx);
            await tx.commit();
        } catch (err) {
            await tx.rollback();
            throw err;
        }
    }

    entity<T>(name: string) {
        const basePath = `/api/${name}`;

        return {
            list: (options?: ListOptions) => {
                const qs = toQueryString(options);
                return this.request<T[]>(`${basePath}${qs}`, { method: "GET" });
            },

            countWithOptions: async (options: ListOptions = {}) => {
                const opts = { ...options, countOnly: true as any };
                const qs = toQueryString(opts);
                const res = await this.request<{ count: number }>(`${basePath}${qs}`, {
                    method: "GET",
                });

                return res.count;
            },

            count: () => {
                return this.request<{ count: number }>(`${basePath}/count`, {
                    method: "GET",
                });
            },

            get: (id: string) =>
                this.request<T>(`${basePath}/${id}`, { method: "GET" }),

            create: (data: Omit<T, "id">) =>
                this.request<T>(basePath, {
                    method: "POST",
                    body: JSON.stringify(data),
                }),

            update: (id: string, data: Partial<T>) =>
                this.request<T>(`${basePath}/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                }),

            delete: (id: string) =>
                this.request<void>(`${basePath}/${id}`, {
                    method: "DELETE",
                }),
        };
    }

}
