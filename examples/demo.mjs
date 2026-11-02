// Tour of the client against a local ElysianDB without authentication.
//
//   docker run --rm -p 8089:8089 taymour/elysiandb:latest
//   npm run demo
//
// Set ELYSIANDB_URL and ELYSIANDB_TOKEN to use another server.
import { createClient, ElysianDBError } from "../dist/esm/index.js";

const db = createClient(process.env.ELYSIANDB_URL ?? "http://localhost:8089", {
    auth: process.env.ELYSIANDB_TOKEN ? { token: process.env.ELYSIANDB_TOKEN } : undefined,
    timeout: 5000,
    retries: 2,
});

const suffix = Math.random().toString(36).slice(2, 8);
const BOOKS = `demo_books_${suffix}`;
const AUTHORS = `demo_authors_${suffix}`;

const health = await db.health();
if (!health.ok) {
    console.error(`ElysianDB is not reachable at ${db.url}`);
    process.exit(1);
}
console.log(`Connected to ElysianDB ${health.version} at ${db.url}`);

const books = db.entity(BOOKS);

// Create documents, with a linked sub-entity.
const dune = await books.create({
    title: "Dune",
    year: 1965,
    tags: ["sf", "classic"],
    author: { "@entity": AUTHORS, id: "frank-herbert", name: "Frank Herbert" },
});
await books.createMany([
    { title: "Neuromancer", year: 1984, tags: ["sf", "cyberpunk"] },
    { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
console.log("Created", dune);

// List with filters, sort, projection and includes.
const sf = await books.list({
    filter: { tags: { contains: "sf" } },
    sort: { year: "desc" },
    fields: ["title", "year", "author"],
    includes: ["author"],
});
console.log("Science fiction:", sf);

// Query API: or / and filters, several sort keys.
const selection = await books.query({
    filter: { or: [{ year: { lt: 1950 } }, { title: { eq: "neuro*" } }] },
    sort: { year: "asc", title: "asc" },
});
console.log("Query API:", selection.map((book) => book.title));

// Partial update: fields absent from the body are kept.
await books.update(dune.id, { year: 1966 });
console.log("Count:", await books.count(), "| before 1970:", await books.count({ filter: { year: { lt: 1970 } } }));

// Transaction: committed when the callback resolves, rolled back when it throws.
await db.transaction(async (tx) => {
    const author = await tx.create(AUTHORS, { name: "Ursula K. Le Guin" });
    await tx.create(BOOKS, { title: "The Dispossessed", year: 1974, tags: ["sf"], author: { "@entity": AUTHORS, id: author.id } });
});

// Iterate over every document, page by page.
for await (const book of books.iterate({ pageSize: 2, sort: { year: "asc" } })) {
    console.log(`- ${book.year} ${book.title}`);
}

// Key-value store with a TTL.
await db.kv.set(`demo:${suffix}`, { visits: 1 }, { ttl: 60 });
console.log("KV:", await db.kv.getJSON(`demo:${suffix}`));

// Errors are ElysianDBError instances.
try {
    await books.get("does-not-exist");
} catch (error) {
    if (error instanceof ElysianDBError && error.isNotFound) console.log("Not found, as expected:", error.message);
    else throw error;
}

await books.deleteAll();
await db.entity(AUTHORS).deleteAll();
await db.kv.delete(`demo:${suffix}`);
console.log("Done");
