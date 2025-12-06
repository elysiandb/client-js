import { TransactionSession } from "./transaction";
export interface ElysianClientOptions {
    baseUrl: string;
    token?: string;
}
export type FilterOperators = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains" | "not_contains" | "all" | "any" | "none";
export type Filters = Record<string, Partial<Record<FilterOperators, string | number | boolean | Array<string | number>>>>;
export interface ListOptions {
    limit?: number;
    offset?: number;
    search?: string;
    fields?: string[];
    includes?: string[];
    sort?: Record<string, "asc" | "desc">;
    filter?: Filters;
}
export declare class ElysianDB {
    private baseUrl;
    private token?;
    constructor(options: ElysianClientOptions);
    protected request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
    rawRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
    transaction(fn: (tx: TransactionSession) => Promise<void>): Promise<void>;
    entity<T>(name: string): {
        list: (options?: ListOptions) => Promise<T[]>;
        countWithOptions: (options?: ListOptions) => Promise<number>;
        count: () => Promise<{
            count: number;
        }>;
        get: (id: string) => Promise<T>;
        create: (data: Omit<T, "id">) => Promise<T>;
        update: (id: string, data: Partial<T>) => Promise<T>;
        delete: (id: string) => Promise<void>;
    };
}
