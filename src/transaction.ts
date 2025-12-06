import {ElysianDB} from "./client";

export class TransactionSession {
    private txId: string | null = null;

    constructor(private db: ElysianDB) {}

    async begin(): Promise<void> {
        const r = await this.db.rawRequest<{ transaction_id: string }>("/api/tx/begin", {
            method: "POST"
        });
        this.txId = r.transaction_id;
    }

    private ensureTx() {
        if (!this.txId) {
            throw new Error("Transaction not started");
        }
    }

    async write(entity: string, data: any) {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/entity/${entity}`, {
            method: "POST",
            body: JSON.stringify(data)
        });
    }

    async update(entity: string, id: string, data: any) {
        this.ensureTx();
        return this.db.rawRequest(`/api/tx/${this.txId}/entity/${entity}/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
    }

    async delete(entity: string, id: string) {
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