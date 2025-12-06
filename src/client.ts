import { QueryParams, toQueryString } from "./utils";

export interface ElysianClientOptions {
    baseUrl: string;
    token?: string;
}

export interface ListOptions extends QueryParams {
    limit?: number;
    offset?: number;
    search?: string;
}

export class ElysianDB {
    private baseUrl: string;
    private token?: string;

    constructor(options: ElysianClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.token = options.token;
    }

    private async request<T = unknown>(
        path: string,
        init: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(init.headers as Record<string, string> | undefined),
        };

        if (this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }

        const res = await fetch(url, {
            ...init,
            headers,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
                `ElysianDB error ${res.status} ${res.statusText} – ${text}`
            );
        }

        const text = await res.text();

        if (!text) {
            return undefined as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            return text as unknown as T;
        }
    }

    entity<T>(name: string) {
        const basePath = `/api/${name}`;

        return {
            list: (options?: ListOptions) => {
                const qs = toQueryString(options);
                return this.request<T[]>(`${basePath}${qs}`, { method: "GET" });
            },

            get: (id: string) => {
                return this.request<T>(`${basePath}/${id}`, { method: "GET" });
            },

            create: (data: T) => {
                return this.request<T>(basePath, {
                    method: "POST",
                    body: JSON.stringify(data),
                });
            },

            update: (id: string, data: Partial<T>) => {
                return this.request<T>(`${basePath}/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                });
            },

            delete: (id: string) => {
                return this.request<void>(`${basePath}/${id}`, {
                    method: "DELETE",
                });
            },

            count: () => {
                return this.request<{ count: number }>(`${basePath}/count`, {
                    method: "GET",
                });
            },
        };
    }

    rawRequest<T = unknown>(path: string, init?: RequestInit) {
        return this.request<T>(path, init);
    }
}
