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
    const created2 = await articles.create({
        title: "Second item",
        tags: ["demo", "ts"],
        author: {
            "@entity": "author",
            name: "Bob",
            job: {
                "@entity": "job",
                designation: "Editor"
            }
        }
    });
    console.log("Created2:", created2);
    created.title = "Updated title";
    await articles.update(created.id, created);
    const list = await db.entity(entityName).list({
        limit: 20,
        includes: ["author", "author.job"],
        fields: ["title", "author.name"],
        filter: {
            "author.name": { eq: "Alice" },
            "tags": { contains: "sdk" }
        },
        sort: { "createdAt": "desc" }
    });
    console.log("List:", list);
    const simpleCount = await db.entity(entityName).count();
    console.log("Simple count:", simpleCount);
    const filteredCount = await db.entity(entityName).countWithOptions({
        includes: ["author"],
        filter: { "author.name": { eq: "Alice" } }
    });
    console.log("Filtered count:", filteredCount);
    const txResult = await db.transaction(async (tx) => {
        await tx.write(entityName, {
            title: "TX article",
            tags: ["tx"],
            author: {
                "@entity": "author",
                name: "Charlie",
                job: {
                    "@entity": "job",
                    designation: "Reviewer"
                }
            }
        });
    });
    console.log("TX result:", txResult);
    const listAfterTx = await db.entity(entityName).list({
        includes: ["author"]
    });
    console.log("List after TX:", listAfterTx);
    const fetched = await articles.get(created.id);
    console.log("Fetched:", fetched);
    await articles.delete(created2.id);
    console.log("Deleted item:", created2.id);
    const finalCount = await articles.count();
    console.log("Final count:", finalCount);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
