import { ElysianDB } from "./client";
export declare class TransactionSession {
    private db;
    private txId;
    constructor(db: ElysianDB);
    begin(): Promise<void>;
    private ensureTx;
    write(entity: string, data: any): Promise<unknown>;
    update(entity: string, id: string, data: any): Promise<unknown>;
    delete(entity: string, id: string): Promise<unknown>;
    commit(): Promise<unknown>;
    rollback(): Promise<unknown>;
}
