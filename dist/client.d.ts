import { QueryParams } from "./utils";
export interface ElysianClientOptions {
    baseUrl: string;
    token?: string;
}
export interface ListOptions extends QueryParams {
    limit?: number;
    offset?: number;
    search?: string;
}
export declare class ElysianDB {
    private baseUrl;
    private token?;
    constructor(options: ElysianClientOptions);
    private request;
    entity<T>(name: string): {
        list: (options?: ListOptions) => Promise<T[]>;
        get: (id: string) => Promise<T>;
        create: (data: T) => Promise<T>;
        update: (id: string, data: Partial<T>) => Promise<T>;
        delete: (id: string) => Promise<void>;
        count: () => Promise<{
            count: number;
        }>;
    };
    rawRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}
