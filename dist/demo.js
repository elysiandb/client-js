"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
async function main() {
    const entityName = "articles_" + Math.random().toString(36).substring(2, 8);
    // @ts-ignore
    const db = new client_1.ElysianDB({
        baseUrl: "http://localhost:8089",
    });
    const articles = db.entity(entityName);
    const created = await articles.create({
        id: "",
        title: "Hello from SDK",
        tags: ["sdk", "ts"],
    });
    console.log("Created:", created);
    created.title = "This is my new title";
    await articles.update(created.id, created);
    const list = await articles.list({ limit: 10 });
    console.log("List:", list);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
