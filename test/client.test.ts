import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { and, createClient, ElysianDB, ElysianDBError, or, toQueryString } from "../src/index.js";
import { toQueryFilter } from "../src/query.js";
import { client, empty, json, mockFetch, text } from "./helpers.js";

interface Book {
    id: string;
    title: string;
    year: number;
    tags?: string[];
}

describe("client setup", () => {
    it("strips trailing slashes from the URL", () => {
        assert.equal(createClient("http://localhost:8089///").url, "http://localhost:8089");
    });

    it("keeps the 0.0.x constructor working", () => {
        const db = new ElysianDB({ baseUrl: "http://localhost:8089", token: "secret" });
        assert.equal(db.url, "http://localhost:8089");
        assert.equal(db.auth.mode, "token");
    });

    it("requires a URL", () => {
        assert.throws(() => new ElysianDB({}), /server URL is required/);
    });
});

describe("authentication", () => {
    it("sends a bearer token", async () => {
        const { db, calls } = client([json([])], { auth: { token: "t0k3n" } });
        await db.entity("books").list();
        assert.equal(calls[0].headers.authorization, "Bearer t0k3n");
    });

    it("sends basic credentials encoded as UTF-8", async () => {
        const { db, calls } = client([json([])], { auth: { username: "zoé", password: "pässword" } });
        await db.entity("books").list();
        const encoded = calls[0].headers.authorization.replace("Basic ", "");
        assert.equal(Buffer.from(encoded, "base64").toString("utf8"), "zoé:pässword");
    });

    it("keeps the session cookie of login() and sends it afterwards", async () => {
        // Older runtimes drop Set-Cookie from constructed responses: set the headers directly.
        const login = json({ username: "admin", role: "admin" });
        Object.defineProperty(login, "headers", {
            value: new Headers({ "Set-Cookie": "edb_session=abc123; Path=/; HttpOnly; SameSite=Strict" }),
        });
        const { db, calls } = client([
            login,
            json({ username: "admin", role: "admin" }),
            empty(204),
        ]);
        const changes: string[] = [];
        db.auth.onChange((auth) => changes.push(auth.mode));

        const user = await db.auth.login("admin", "secret");
        assert.deepEqual(user, { username: "admin", role: "admin" });
        assert.equal(calls[0].headers.authorization, undefined);
        assert.deepEqual(JSON.parse(calls[0].body!), { username: "admin", password: "secret" });
        assert.equal(db.auth.mode, "session");
        assert.equal(db.auth.session, "abc123");

        await db.auth.me();
        assert.equal(calls[1].headers.cookie, "edb_session=abc123");

        await db.auth.logout();
        assert.equal(db.auth.mode, "none");
        assert.deepEqual(changes, ["session", "none"]);
    });

    it("switches credentials at runtime", async () => {
        const { db, calls } = client([json([]), json([])]);
        db.auth.useToken("a");
        await db.entity("x").list();
        db.auth.clear();
        await db.entity("x").list();
        assert.equal(calls[0].headers.authorization, "Bearer a");
        assert.equal(calls[1].headers.authorization, undefined);
    });

    it("never sends credentials to /health", async () => {
        const { db, calls } = client([empty(200, { "X-Elysian-Version": "0.2.3" })], { auth: { token: "t" } });
        assert.deepEqual(await db.health(), { ok: true, status: 200, version: "0.2.3" });
        assert.equal(calls[0].headers.authorization, undefined);
    });
});

describe("entity routes", () => {
    it("serializes list options to the REST query string", async () => {
        const { db, calls } = client([json([])]);
        await db.entity<Book>("books").list({
            limit: 10,
            offset: 20,
            search: "dune*",
            fields: ["title", "author.name"],
            includes: ["author", "author.job"],
            sort: { year: "desc" },
            filter: {
                year: { gte: 1960, lt: 2000 },
                status: "published",
                tags: { any: ["sf", "classic"] },
                publishedAt: { gte: new Date("2024-01-01T00:00:00Z") },
            },
        });

        const url = calls[0].url;
        assert.equal(calls[0].method, "GET");
        assert.equal(url.pathname, "/api/books");
        assert.equal(url.searchParams.get("limit"), "10");
        assert.equal(url.searchParams.get("offset"), "20");
        assert.equal(url.searchParams.get("search"), "dune*");
        assert.equal(url.searchParams.get("fields"), "title,author.name");
        assert.equal(url.searchParams.get("includes"), "author,author.job");
        assert.equal(url.searchParams.get("sort[year]"), "desc");
        assert.equal(url.searchParams.get("filter[year][gte]"), "1960");
        assert.equal(url.searchParams.get("filter[year][lt]"), "2000");
        assert.equal(url.searchParams.get("filter[status][eq]"), "published");
        assert.equal(url.searchParams.get("filter[tags][any]"), "sf,classic");
        assert.equal(url.searchParams.get("filter[publishedAt][gte]"), "2024-01-01T00:00:00.000Z");
        assert.equal(calls[0].headers["content-type"], undefined, "GET requests have no Content-Type");
    });

    it("rejects invalid arguments with a rejected promise", async () => {
        const { db } = client([]);
        await assert.rejects(db.entity("books").list({ sort: { a: "asc", b: "desc" } }), /use query\(\)/);
        await assert.rejects(db.entity("books").get(""), /document ID is required/);
    });

    it("keeps toQueryString() compatible", () => {
        assert.equal(toQueryString(), "");
        assert.equal(toQueryString({ limit: 1, includes: "all" }), "?limit=1&includes=all");
    });

    it("encodes entity names and IDs", async () => {
        const { db, calls } = client([json({ id: "a/b" })]);
        await db.entity("my books").get("a/b", { fields: ["title"] });
        assert.equal(calls[0].url.pathname, "/api/my%20books/a%2Fb");
        assert.equal(calls[0].url.searchParams.get("fields"), "title");
    });

    it("sends JSON bodies for writes", async () => {
        const { db, calls } = client([
            json({ id: "1", title: "Dune", year: 1965 }),
            json([{ id: "2" }, { id: "3" }]),
            json({ id: "1", title: "Dune", year: 1966 }),
            json([{ id: "1" }]),
            empty(204),
            empty(204),
        ]);
        const books = db.entity<Book>("books");

        assert.equal((await books.create({ title: "Dune", year: 1965 })).id, "1");
        assert.equal((await books.createMany([{ title: "A", year: 1 }, { title: "B", year: 2 }])).length, 2);
        await books.update("1", { year: 1966, tags: null });
        await books.updateMany([{ id: "1", year: 1 }]);
        await books.delete("1");
        await books.deleteAll();

        assert.deepEqual(
            calls.map((c) => `${c.method} ${c.url.pathname}`),
            ["POST /api/books", "POST /api/books", "PUT /api/books/1", "PUT /api/books", "DELETE /api/books/1", "DELETE /api/books"],
        );
        assert.equal(calls[0].headers["content-type"], "application/json");
        assert.deepEqual(JSON.parse(calls[2].body!), { year: 1966, tags: null });
    });

    it("skips empty batch writes", async () => {
        const { db, calls } = client([]);
        assert.deepEqual(await db.entity("books").createMany([]), []);
        assert.deepEqual(await db.entity("books").updateMany([]), []);
        assert.equal(calls.length, 0);
    });

    it("counts with /count, or with countOnly when there are filters", async () => {
        const { db, calls } = client([json({ count: 3 }), json({ count: 1 })]);
        const books = db.entity("books");
        assert.equal(await books.count(), 3);
        assert.equal(await books.count({ filter: { year: { gt: 2000 } } }), 1);
        assert.equal(calls[0].url.pathname, "/api/books/count");
        assert.equal(calls[1].url.pathname, "/api/books");
        assert.equal(calls[1].url.searchParams.get("countOnly"), "true");
    });

    it("answers exists(), first() and getOrNull()", async () => {
        const { db } = client([
            json({ exists: true }),
            json([{ id: "1" }]),
            json([]),
            json({ error: "entity not found" }, 404),
        ]);
        const books = db.entity("books");
        assert.equal(await books.exists("1"), true);
        assert.deepEqual(await books.first({ filter: { title: "Dune" } }), { id: "1" });
        assert.equal(await books.first(), null);
        assert.equal(await books.getOrNull("missing"), null);
    });

    it("iterates page by page until a short page", async () => {
        const { db, calls } = client([json([{ id: "1" }, { id: "2" }]), json([{ id: "3" }])]);
        const ids: string[] = [];
        for await (const book of db.entity("books").iterate({ pageSize: 2, sort: { id: "asc" } })) ids.push(book.id);

        assert.deepEqual(ids, ["1", "2", "3"]);
        assert.deepEqual(
            calls.map((c) => c.url.searchParams.get("offset")),
            ["0", "2"],
        );
    });

    it("manages schemas and migrations", async () => {
        const { db, calls } = client([
            json({ id: "books", fields: {}, _manual: true }),
            json({ id: "books", fields: {} }),
            json({ message: "ok" }),
        ]);
        const books = db.entity("books");
        await books.setSchema({ title: { type: "string", required: true } });
        await books.getSchema();
        await books.migrate([{ set: [{ "profile.city": "Paris" }] }]);

        assert.deepEqual(JSON.parse(calls[0].body!), { fields: { title: { type: "string", required: true } } });
        assert.equal(calls[0].url.pathname, "/api/books/schema");
        assert.equal(calls[2].url.pathname, "/api/books/migrate");
        assert.deepEqual(JSON.parse(calls[2].body!), [{ set: [{ "profile.city": "Paris" }] }]);
    });
});

describe("Query API", () => {
    it("builds the payload of POST /api/query", async () => {
        const { db, calls } = client([json([]), json({ count: 4 })]);
        await db.query({
            entity: "books",
            filter: or({ title: { eq: "*dune*" } }, and({ year: { gte: 1960 } }, { tags: { contains: "sf" } })),
            sort: { year: "desc", title: "asc" },
            fields: ["title", "year"],
            limit: 5,
            offset: 10,
        });
        assert.equal(await db.entity("books").queryCount({ status: "published" }), 4);

        assert.deepEqual(JSON.parse(calls[0].body!), {
            entity: "books",
            filters: {
                or: [
                    { title: { eq: "*dune*" } },
                    { and: [{ year: { gte: 1960 } }, { tags: { contains: "sf" } }] },
                ],
            },
            sorts: { year: "desc", title: "asc" },
            limit: 5,
            offset: 10,
            fields: "title,year",
        });
        assert.deepEqual(JSON.parse(calls[1].body!), {
            entity: "books",
            filters: { status: { eq: "published" } },
            countOnly: true,
        });
    });

    it("wraps nodes that mix and / or with field conditions", () => {
        assert.deepEqual(toQueryFilter({ status: "published", or: [{ a: 1 }, { b: true }] }), {
            and: [{ status: { eq: "published" } }, { or: [{ a: { eq: 1 } }, { b: { eq: true } }] }],
        });
        assert.deepEqual(toQueryFilter({ tags: { all: ["a", "b"] } }), { tags: { all: "a,b" } });
    });
});

describe("errors", () => {
    it("throws an ElysianDBError with the message of the server", async () => {
        const { db } = client([json({ error: "entity not found" }, 404, { "X-Request-Id": "req-1" })]);
        await assert.rejects(db.entity("books").get("nope"), (error: unknown) => {
            assert.ok(error instanceof ElysianDBError);
            assert.equal(error.code, "HTTP_ERROR");
            assert.equal(error.status, 404);
            assert.equal(error.isNotFound, true);
            assert.equal(error.requestId, "req-1");
            assert.equal(error.message, "GET /api/books/nope failed with status 404: entity not found");
            assert.deepEqual(error.data, { error: "entity not found" });
            return true;
        });
    });

    it("exposes validation errors", async () => {
        const { db } = client([json([[], [{ Field: "title", Message: "required field missing" }]], 400)]);
        await assert.rejects(db.entity("books").createMany([{ title: "a" }, {}] as never), (error: ElysianDBError) => {
            assert.equal(error.isValidationError, true);
            assert.deepEqual(error.validationErrors, [{ field: "title", message: "required field missing", index: 1 }]);
            assert.match(error.message, /validation failed: title: required field missing/);
            return true;
        });
    });

    it("handles plain text and empty error bodies", async () => {
        const { db } = client([text("Invalid JSON", 400), empty(401)]);
        await assert.rejects(db.entity("b").create({}), /failed with status 400: Invalid JSON/);
        await assert.rejects(db.entity("b").list(), (error: ElysianDBError) => {
            assert.equal(error.isUnauthorized, true);
            assert.match(error.message, /authentication required/);
            return true;
        });
    });

    it("reports network errors, timeouts and aborts", async () => {
        const failing = createClient("http://db.test", {
            fetch: (async () => {
                throw new TypeError("fetch failed");
            }) as typeof fetch,
        });
        await assert.rejects(failing.entity("b").list(), (error: ElysianDBError) => error.code === "NETWORK_ERROR" && error.status === 0);

        const hanging = (async (_input: unknown, init: RequestInit) =>
            new Promise((_resolve, reject) => {
                if (init.signal!.aborted) reject(new Error("aborted"));
                init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
            })) as unknown as typeof fetch;

        const slow = createClient("http://db.test", { fetch: hanging, timeout: 20 });
        await assert.rejects(slow.entity("b").list(), (error: ElysianDBError) => error.code === "TIMEOUT" && error.isAbort);

        const controller = new AbortController();
        const pending = createClient("http://db.test", { fetch: hanging }).entity("b").list({}, { signal: controller.signal });
        controller.abort();
        await assert.rejects(pending, (error: ElysianDBError) => error.code === "ABORTED");
    });
});

describe("retries", () => {
    it("retries idempotent requests on 503 and network errors", async () => {
        let attempts = 0;
        const { fetch } = mockFetch(
            () => {
                attempts++;
                throw new TypeError("socket hang up");
            },
            () => {
                attempts++;
                return json({ error: "unavailable" }, 503);
            },
            () => {
                attempts++;
                return json([{ id: "1" }]);
            },
        );
        const db = createClient("http://db.test", { fetch, retries: 2, retryDelay: 1 });
        assert.deepEqual(await db.entity("b").list(), [{ id: "1" }]);
        assert.equal(attempts, 3);
    });

    it("honors Retry-After", async () => {
        const { fetch, calls } = mockFetch(json({}, 429, { "Retry-After": "0" }), json({ count: 2 }));
        const db = createClient("http://db.test", { fetch, retries: 1, retryDelay: 10_000 });
        assert.equal(await db.entity("b").count(), 2);
        assert.equal(calls.length, 2);
    });

    it("never retries POST requests", async () => {
        const { fetch, calls } = mockFetch(json({}, 503), json({ id: "1" }));
        const db = createClient("http://db.test", { fetch, retries: 3, retryDelay: 1 });
        await assert.rejects(db.entity("b").create({}), (error: ElysianDBError) => error.status === 503);
        assert.equal(calls.length, 1);
    });
});

describe("request hooks", () => {
    it("lets onRequest change headers and reports responses", async () => {
        const statuses: number[] = [];
        const { fetch, calls } = mockFetch(json([]));
        const db = createClient("http://db.test", {
            fetch,
            headers: { "X-App": "demo" },
            onRequest: (context) => {
                context.headers["X-Trace"] = "42";
            },
            onResponse: (context) => {
                statuses.push(context.status);
            },
        });

        await db.entity("b").list({}, { requestId: "my-request" });
        assert.equal(calls[0].headers["x-app"], "demo");
        assert.equal(calls[0].headers["x-trace"], "42");
        assert.equal(calls[0].headers["x-request-id"], "my-request");
        assert.deepEqual(statuses, [200]);
    });

    it("returns headers with send()", async () => {
        const { db } = client([json([], 200, { "X-Elysian-Cache": "HIT" })]);
        const response = await db.send("GET", "/api/books");
        assert.equal(response.headers.get("X-Elysian-Cache"), "HIT");
    });
});

describe("transactions", () => {
    it("commits and returns the result of the callback", async () => {
        const { db, calls } = client([json({ transaction_id: "tx1" }), empty(200), empty(200), empty(200), empty(200)]);
        const result = await db.transaction(async (tx) => {
            const author = await tx.create("authors", { name: "Frank" });
            await tx.entity<Book>("books").create({ title: "Dune", year: 1965 });
            await tx.update("books", "b1", { year: 1966 });
            assert.ok(author.id, "an ID is generated for created documents");
            return author.id;
        });

        assert.equal(typeof result, "string");
        assert.deepEqual(
            calls.map((c) => `${c.method} ${c.url.pathname}`),
            [
                "POST /api/tx/begin",
                "POST /api/tx/tx1/entity/authors",
                "POST /api/tx/tx1/entity/books",
                "PUT /api/tx/tx1/entity/books/b1",
                "POST /api/tx/tx1/commit",
            ],
        );
        assert.equal(JSON.parse(calls[1].body!).id, result);
    });

    it("rolls back and rethrows the error of the callback", async () => {
        const { db, calls } = client([json({ transaction_id: "tx2" }), json({ error: "boom" }, 500)]);
        const failure = new Error("business rule");
        await assert.rejects(
            db.transaction(async () => {
                throw failure;
            }),
            (error) => error === failure,
        );
        assert.equal(calls[1].url.pathname, "/api/tx/tx2/rollback");
    });

    it("refuses operations once the transaction is finished", async () => {
        const { db } = client([json({ transaction_id: "tx3" }), empty(200)]);
        const tx = await db.beginTransaction();
        await tx.commit();
        assert.equal(tx.state, "committed");
        await assert.rejects(tx.create("books", {}), /already committed/);
        await tx.rollback();
    });
});

describe("key-value store", () => {
    it("reads, writes and deletes keys", async () => {
        const { db, calls } = client([
            json({ key: "user:1", value: "{\"name\":\"Ada\"}" }),
            json({ key: "nope", value: null }, 404),
            empty(204),
            empty(204),
            json([{ key: "a", value: "1" }, { key: "b", value: null }]),
            empty(204),
        ]);

        assert.deepEqual(await db.kv.getJSON("user:1"), { name: "Ada" });
        assert.equal(await db.kv.get("nope"), null);
        await db.kv.set("greeting", "hello", { ttl: 60 });
        await db.kv.set("config", { dark: true });
        assert.deepEqual(await db.kv.mget(["a", "b"]), { a: "1", b: null });
        await db.kv.delete("cache:*");

        assert.equal(calls[0].url.pathname, "/kv/user:1");
        assert.equal(calls[2].method, "PUT");
        assert.equal(calls[2].url.searchParams.get("ttl"), "60");
        assert.equal(calls[2].body, "hello");
        assert.equal(calls[3].body, "{\"dark\":true}");
        assert.equal(calls[4].url.searchParams.get("keys"), "a,b");
        assert.equal(calls[5].url.pathname, "/kv/cache:*");
    });

    it("rejects patterns in get()", async () => {
        const { db } = client([]);
        await assert.rejects(db.kv.get("user:*"), /use mget\(\)/);
    });
});

describe("admin", () => {
    it("parses stats as numbers", async () => {
        const { db } = client([json({ keys_count: "12", hits: "3", version: "0.2.3" })]);
        assert.deepEqual(await db.admin.stats(), { keys_count: 12, hits: 3, version: "0.2.3" });
    });

    it("downloads backups with their file name", async () => {
        const { db } = client([
            new Response(new Uint8Array([31, 139, 8]), {
                status: 200,
                headers: {
                    "Content-Type": "application/gzip",
                    "Content-Disposition": "attachment; filename=\"elysiandb-backup-20261101T091400Z.tar.gz\"",
                },
            }),
        ]);
        const backup = await db.admin.backup();
        assert.equal(backup.filename, "elysiandb-backup-20261101T091400Z.tar.gz");
        assert.deepEqual([...backup.data], [31, 139, 8]);
    });

    it("decodes entity schemas", async () => {
        const { db } = client([json({ entities: ["{\"id\":\"books\",\"fields\":{}}"] }), json({ entities: null })]);
        assert.deepEqual(await db.entities.schemas(), [{ id: "books", fields: {} }]);
        assert.deepEqual(await db.entities.list(), []);
    });

    it("merges ACL permissions on update()", async () => {
        const { db, calls } = client([
            json({ id: "x", username: "bob", entity: "books", permissions: { read: false, create: true } }),
            json({ status: "ACL updated successfully" }),
        ]);
        const acl = await db.acl.update("bob", "books", { read: true });
        assert.deepEqual(acl.permissions, { read: true, create: true });
        assert.deepEqual(JSON.parse(calls[1].body!), { permissions: { read: true, create: true } });
    });

    it("fills hook defaults", async () => {
        const { db, calls } = client([json({ id: "h1" })]);
        await db.hooks.create("books", { name: "n", event: "post_read", script: "function postRead(ctx) {}" });
        assert.deepEqual(JSON.parse(calls[0].body!), {
            language: "javascript",
            priority: 0,
            enabled: true,
            bypass_acl: false,
            name: "n",
            event: "post_read",
            script: "function postRead(ctx) {}",
        });
    });

    it("reads monitoring logs", async () => {
        const { db, calls } = client([
            json({ entries: [], has_more: false }),
            text("{\"seq\":2,\"msg\":\"b\"}\n{\"seq\":1,\"msg\":\"a\"}\n"),
        ]);
        await db.monitoring.logs({ level: "warn", requestId: "r1", since: new Date(1000), limit: 50 });
        const entries = await db.monitoring.exportLogs();

        const params = calls[0].url.searchParams;
        assert.equal(params.get("level"), "warn");
        assert.equal(params.get("request_id"), "r1");
        assert.equal(params.get("since"), "1000");
        assert.equal(params.get("limit"), "50");
        assert.deepEqual(entries.map((e) => e.seq), [2, 1]);
    });
});
