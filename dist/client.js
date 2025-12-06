"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElysianDB = void 0;
const utils_1 = require("./utils");
class ElysianDB {
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.token = options.token;
    }
    async request(path, init = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            "Content-Type": "application/json",
            ...init.headers,
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
            throw new Error(`ElysianDB error ${res.status} ${res.statusText} – ${text}`);
        }
        const text = await res.text();
        if (!text) {
            return undefined;
        }
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    entity(name) {
        const basePath = `/api/${name}`;
        return {
            list: (options) => {
                const qs = (0, utils_1.toQueryString)(options);
                return this.request(`${basePath}${qs}`, { method: "GET" });
            },
            get: (id) => {
                return this.request(`${basePath}/${id}`, { method: "GET" });
            },
            create: (data) => {
                return this.request(basePath, {
                    method: "POST",
                    body: JSON.stringify(data),
                });
            },
            update: (id, data) => {
                return this.request(`${basePath}/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                });
            },
            delete: (id) => {
                return this.request(`${basePath}/${id}`, {
                    method: "DELETE",
                });
            },
            count: () => {
                return this.request(`${basePath}/count`, {
                    method: "GET",
                });
            },
        };
    }
    rawRequest(path, init) {
        return this.request(path, init);
    }
}
exports.ElysianDB = ElysianDB;
