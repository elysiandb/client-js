"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElysianDB = void 0;
const utils_1 = require("./utils");
const transaction_1 = require("./transaction");
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
        if (this.token)
            headers["Authorization"] = `Bearer ${this.token}`;
        const res = await fetch(url, { ...init, headers });
        const text = await res.text();
        return text ? JSON.parse(text) : undefined;
    }
    rawRequest(path, init) {
        return this.request(path, init);
    }
    async transaction(fn) {
        const tx = new transaction_1.TransactionSession(this);
        await tx.begin();
        try {
            await fn(tx);
            await tx.commit();
        }
        catch (err) {
            await tx.rollback();
            throw err;
        }
    }
    entity(name) {
        const basePath = `/api/${name}`;
        return {
            list: (options) => {
                const qs = (0, utils_1.toQueryString)(options);
                return this.request(`${basePath}${qs}`, { method: "GET" });
            },
            countWithOptions: async (options = {}) => {
                const opts = { ...options, countOnly: true };
                const qs = (0, utils_1.toQueryString)(opts);
                const res = await this.request(`${basePath}${qs}`, {
                    method: "GET",
                });
                return res.count;
            },
            count: () => {
                return this.request(`${basePath}/count`, {
                    method: "GET",
                });
            },
            get: (id) => this.request(`${basePath}/${id}`, { method: "GET" }),
            create: (data) => this.request(basePath, {
                method: "POST",
                body: JSON.stringify(data),
            }),
            update: (id, data) => this.request(`${basePath}/${id}`, {
                method: "PUT",
                body: JSON.stringify(data),
            }),
            delete: (id) => this.request(`${basePath}/${id}`, {
                method: "DELETE",
            }),
        };
    }
}
exports.ElysianDB = ElysianDB;
