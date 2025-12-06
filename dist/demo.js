"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
async function main() {
    const entityName = "articles_" + Math.random().toString(36).substring(2, 8);
    // @ts-ignore
    const db = new client_1.ElysianDB({
        baseUrl: "http://localhost:8089",
        token: "your_secure_token_here",
    });
    const articles = db.entity(entityName);
    const created = await articles.create({
        title: "Hello from SDK",
        tags: ["sdk", "ts"],
        author: {
            "@entity": "author",
            name: "Alice",
            job: {
                "@entity": "job",
                designation: "Writer"
            }
        }
    });
    console.log("Created:", created);
    created.title = "This is my new title";
    await articles.update(created.id, created);
    const list = await db.entity(entityName).list({
        limit: 20,
        includes: ["author", "author.job"],
        fields: ["title", "author.name"],
        filter: {
            "author.name": { eq: "Alice" },
            "tags": { contains: "sdk" }
        },
        sort: { "createdAt": "desc" },
    });
    console.log("List:", list);
    const countSimple = await db.entity(entityName).count();
    console.log("Simple count:", countSimple);
    const listWithCount = await db.entity(entityName).countWithOptions({
        filter: { "author.name": { eq: "Alice" } }
    });
    console.log("Filtered count:", listWithCount);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
