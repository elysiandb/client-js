"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionSession = void 0;
class TransactionSession {
    constructor(db) {
        this.db = db;
        this.txId = null;
    }
    async begin() {
        const r = await this.db.rawRequest("/api/tx/begin", {
            method: "POST"
        });
        this.txId = r.transaction_id;
    }
    ensureTx() {
        if (!this.txId) {
            throw new Error("Transaction not started");
        }
    }
    async write(entity, data) {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/entity/${entity}`, {
            method: "POST",
            body: JSON.stringify(data)
        });
    }
    async update(entity, id, data) {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/entity/${entity}/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
    }
    async delete(entity, id) {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/entity/${entity}/${id}`, {
            method: "DELETE"
        });
    }
    async commit() {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/commit`, { method: "POST" });
    }
    async rollback() {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/rollback`, { method: "POST" });
    }
}
exports.TransactionSession = TransactionSession;
