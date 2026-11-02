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

    it("keeps the punctuation that ElysianDB reads back in paths", async () => {
        const { db, calls } = client([json({ id: "x" }), json({ id: "x" })]);
        await db.entity("my-books_v2.0").get("a:b@c$d&e+f,g;h=i!j~k*l'm(n)o", { fields: ["title"] });
        await db.entity("books").get("..a.b..");
        assert.equal(calls[0].url.pathname, "/api/my-books_v2.0/a:b@c$d&e+f,g;h=i!j~k*l'm(n)o");
        assert.equal(calls[0].url.searchParams.get("fields"), "title");
        assert.equal(calls[1].url.pathname, "/api/books/..a.b..");
    });

    it("rejects . and .., which fetch removes from URLs", async () => {
        const { db, calls } = client([]);
        const books = db.entity("books");
        for (const id of [".", ".."]) {
            await assert.rejects(books.delete(id), /invalid document ID "\.{1,2}": fetch removes/);
            await assert.rejects(books.get(id), TypeError);
            await assert.rejects(books.getOrNull(id), TypeError);
            await assert.rejects(books.update(id, {}), TypeError);
            await assert.rejects(books.exists(id), TypeError);
            assert.throws(() => db.entity(id), /invalid entity name/);
            await assert.rejects(db.kv.delete(id), /invalid key/);
            await assert.rejects(db.kv.get(id), /invalid key/);
            await assert.rejects(db.kv.set(id, "v"), /invalid key/);
            await assert.rejects(db.users.get(id), /invalid username/);
            await assert.rejects(db.users.delete(id), /invalid username/);
            await assert.rejects(db.acl.get("bob", id), /invalid entity name/);
            await assert.rejects(db.hooks.get(id), /invalid hook ID/);
            await assert.rejects(db.hooks.delete("books", id), /invalid hook ID/);
            await assert.rejects(db.entities.create(id, {}), /invalid entity name/);
        }
        assert.equal(calls.length, 0);
    });

    it("rejects empty and non-string path values, which would hit another route", async () => {
        const { db, calls } = client([]);
        await assert.rejects(db.users.get(""), /invalid username "": it must be a non-empty string/);
        await assert.rejects(db.acl.list(""), /invalid username ""/);
        await assert.rejects(db.hooks.update(undefined as unknown as string, {}), /invalid hook ID undefined/);
        await assert.rejects(db.hooks.delete("books", 42 as unknown as string), /invalid hook ID 42/);
        await assert.rejects(db.entity("books").get(""), /a document ID is required \(entity "books"\)/);
        await assert.rejects(db.kv.get(""), /a key is required/);
        assert.throws(() => db.entity(""), /an entity name is required/);
        assert.equal(calls.length, 0);
    });

    it("rejects values that ElysianDB 0.2.3 cannot read back from a path", async () => {
        const { db, calls } = client([]);
        const books = db.entity("books");
        for (const value of ["a b", "é", "a%20b", "a/b", "a?b", "a#b", "a\"b", "a\nb", "a<b", "a[b]"]) {
            await assert.rejects(books.get(value), /only reads back path segments made of letters, digits and/);
            await assert.rejects(books.delete(value), /invalid document ID/);
            await assert.rejects(books.create({ id: value }), /invalid document ID/);
            await assert.rejects(books.createMany([{ id: "ok" }, { id: value }]), /invalid document ID/);
            await assert.rejects(db.kv.set(value, "v"), /invalid key/);
            await assert.rejects(db.users.create({ username: value, password: "long-enough" }), /invalid username/);
            await assert.rejects(db.users.changePassword(value, "long-enough"), /invalid username/);
            await assert.rejects(db.hooks.list(value), /invalid entity name/);
            assert.throws(() => db.entity(value), /invalid entity name/);
        }
        assert.equal(calls.length, 0);
    });

    it("rejects entity names that are routes of ElysianDB", async () => {
        const { db, calls } = client([json({ transaction_id: "tx1" })]);
        for (const name of ["query", "export", "import", "backup", "restore", "tx", "entity", "hook", "acl", "security"]) {
            assert.throws(() => db.entity(name), new RegExp(`invalid entity name "${name}": /api/${name} is a route`));
            await assert.rejects(db.entities.create(name, {}), /is a route of ElysianDB/);
        }
        const tx = await db.beginTransaction();
        await assert.rejects(tx.create("query", {}), /invalid entity name "query"/);
        await assert.rejects(tx.delete("export", "1"), /invalid entity name "export"/);
        assert.equal(calls.length, 1);

        // Names that only contain a reserved word are fine.
        assert.equal(db.entity("queries").name, "queries");
        assert.equal(db.entity("Query").name, "Query");
    });

    it("rejects the IDs count and schema where ElysianDB routes them elsewhere", async () => {
        const { db, calls } = client([json({ exists: true }), empty(200), json([{ id: "count" }])]);
        const books = db.entity("books");
        for (const id of ["count", "schema"]) {
            await assert.rejects(books.get(id), new RegExp(`invalid document ID "${id}": /api/<entity>/${id} is a route`));
            await assert.rejects(books.getOrNull(id), TypeError);
            await assert.rejects(books.update(id, {}), TypeError);
            await assert.rejects(books.create({ id }), TypeError);
            await assert.rejects(books.createMany([{ id }]), TypeError);
        }
        assert.equal(calls.length, 0);

        // These routes do not collide: documents created elsewhere can still be checked and removed.
        assert.equal(await books.exists("count"), true);
        await books.delete("schema");
        await books.updateMany([{ id: "count" }]);
        assert.deepEqual(
            calls.map((c) => `${c.method} ${c.url.pathname}`),
            ["GET /api/books/count/exists", "DELETE /api/books/schema", "PUT /api/books"],
        );
    });

    it("validates limit and offset", async () => {
        const { db, calls } = client([]);
        const books = db.entity("books");
        for (const limit of [0, -1, 1.5, NaN, Infinity, "10" as unknown as number]) {
            await assert.rejects(books.list({ limit }), /limit must be a positive integer/);
            await assert.rejects(books.query({ limit }), /limit must be a positive integer/);
        }
        for (const offset of [-1, 0.5, NaN]) {
            await assert.rejects(books.list({ offset }), /offset must be a non-negative integer/);
            await assert.rejects(db.query({ entity: "books", offset }), /offset must be a non-negative integer/);
        }
        assert.equal(calls.length, 0);
        assert.equal(toQueryString({ limit: 1, offset: 0 }), "?limit=1&offset=0");
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

    it("iterates page by page until a short page, checked with count()", async () => {
        const { db, calls } = client([json([{ id: "1" }, { id: "2" }]), json([{ id: "3" }]), json({ count: 3 })]);
        const ids: string[] = [];
        for await (const book of db.entity("books").iterate({ pageSize: 2, sort: { id: "asc" } })) ids.push(book.id);

        assert.deepEqual(ids, ["1", "2", "3"]);
        assert.deepEqual(
            calls.map((c) => `${c.url.pathname}?${c.url.searchParams}`),
            [
                "/api/books?limit=2&offset=0&sort%5Bid%5D=asc",
                "/api/books?limit=2&offset=2&sort%5Bid%5D=asc",
                "/api/books/count?",
            ],
        );
    });

    it("keeps iterating when ACLs make a page short before the end", async () => {
        // In user mode, ElysianDB 0.2.3 applies an `owning_read` ACL after limit and offset.
        const { db, calls } = client([json([]), json({ count: 2 }), json([{ id: "d4" }, { id: "d5" }])]);
        const all = await db.entity("notes").listAll({ pageSize: 2, filter: { n: { gte: 0 } }, search: "x" });

        assert.deepEqual(all.map((note) => note.id), ["d4", "d5"]);
        assert.equal(calls[1].url.pathname, "/api/notes");
        assert.equal(calls[1].url.searchParams.get("countOnly"), "true");
        assert.equal(calls[1].url.searchParams.get("filter[n][gte]"), "0");
        assert.equal(calls[1].url.searchParams.get("search"), "x");
        assert.equal(calls[1].url.searchParams.get("limit"), null);
        assert.equal(calls[2].url.searchParams.get("offset"), "2");
        assert.equal(calls[2].url.searchParams.get("limit"), null, "the rest is fetched in one request");
    });

    it("stops on an empty first page when there is nothing to read", async () => {
        const { db, calls } = client([json([]), json({ count: 0 })]);
        assert.deepEqual(await db.entity("books").listAll(), []);
        assert.equal(calls.length, 2);
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

describe("redirects", () => {
    it("never follows redirects, which would replay the request elsewhere", async () => {
        const { fetch, calls } = mockFetch(empty(308, { Location: "/api/books" }));
        let redirect: RequestRedirect | undefined;
        const db = createClient("http://db.test", {
            fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
                redirect = init?.redirect;
                return fetch(input, init);
            }) as typeof fetch,
            retries: 3,
            retryDelay: 1,
            auth: { token: "secret" },
        });

        await assert.rejects(db.request("DELETE", "/api/books/"), (error: ElysianDBError) => {
            assert.equal(error.code, "HTTP_ERROR");
            assert.equal(error.status, 308);
            assert.equal(
                error.message,
                "DELETE /api/books/ was redirected (308) to /api/books: the client does not follow redirects, check the URL of the server",
            );
            return true;
        });
        assert.equal(redirect, "manual");
        assert.equal(calls.length, 1, "a redirect is never retried");
    });

    it("reports the opaque redirects of browsers", async () => {
        const opaque = empty(200);
        Object.defineProperty(opaque, "type", { value: "opaqueredirect" });
        Object.defineProperty(opaque, "status", { value: 0 });
        Object.defineProperty(opaque, "ok", { value: false });
        const { db } = client([opaque]);
        await assert.rejects(db.entity("books").list(), (error: ElysianDBError) => {
            assert.equal(error.status, 0);
            assert.match(error.message, /^GET \/api\/books was redirected: the client does not follow redirects/);
            return true;
        });
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

    it("never retries the operations of a transaction", async () => {
        const { fetch, calls } = mockFetch(
            json({ transaction_id: "tx4" }),
            json({}, 503),
            json({}, 503),
            new Response(null, { status: 200 }),
        );
        const db = createClient("http://db.test", { fetch, retries: 3, retryDelay: 1 });
        const tx = await db.beginTransaction();
        await assert.rejects(tx.update("books", "b1", { year: 1 }), (error: ElysianDBError) => error.status === 503);
        await assert.rejects(tx.delete("books", "b1"), (error: ElysianDBError) => error.status === 503);
        assert.deepEqual(
            calls.map((c) => `${c.method} ${c.url.pathname}`),
            ["POST /api/tx/begin", "PUT /api/tx/tx4/entity/books/b1", "DELETE /api/tx/tx4/entity/books/b1"],
        );
    });

    it("rolls back when a commit gets no answer, so that the transaction is not left open", async () => {
        let attempt = 0;
        const { fetch, calls } = mockFetch(
            json({ transaction_id: "tx5" }),
            () => {
                attempt++;
                throw new TypeError("socket hang up");
            },
            empty(200),
        );
        const db = createClient("http://db.test", { fetch, retries: 3, retryDelay: 1 });
        const tx = await db.beginTransaction();
        await assert.rejects(tx.commit({ requestId: "r1" }), (error: ElysianDBError) => error.code === "NETWORK_ERROR");
        assert.equal(attempt, 1, "a commit is never retried");
        assert.equal(tx.state, "committed");
        assert.equal(calls[2].url.pathname, "/api/tx/tx5/rollback");
        assert.equal(calls[2].headers["x-request-id"], "r1");
    });

    it("keeps the error of a commit when the rollback fails too", async () => {
        const { fetch, calls } = mockFetch(
            json({ transaction_id: "tx6" }),
            () => {
                throw new TypeError("connection refused");
            },
            () => {
                throw new TypeError("connection refused");
            },
        );
        const db = createClient("http://db.test", { fetch });
        const tx = await db.beginTransaction();
        await assert.rejects(tx.commit(), /POST \/api\/tx\/tx6\/commit could not reach ElysianDB/);
        assert.equal(calls.length, 3);
    });

    it("does not roll back a commit that ElysianDB rejected", async () => {
        const { db, calls } = client([json({ transaction_id: "tx7" }), json({ error: "validation error" }, 400)]);
        const tx = await db.beginTransaction();
        await assert.rejects(tx.commit(), /failed with status 400: validation error/);
        assert.equal(calls.length, 2);
    });

    it("rolls back a commit that timed out or was aborted", async () => {
        const hangingCommit = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const path = new URL(String(input)).pathname;
            if (path === "/api/tx/begin") return json({ transaction_id: "tx8" });
            if (path.endsWith("/rollback")) return empty(200);
            return new Promise((_resolve, reject) => {
                if (init.signal!.aborted) reject(new Error("aborted"));
                init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
            });
        }) as typeof fetch;
        const paths: string[] = [];
        const db = createClient("http://db.test", {
            fetch: hangingCommit,
            onResponse: ({ url }) => {
                paths.push(new URL(url).pathname);
            },
        });

        const tx = await db.beginTransaction();
        await assert.rejects(tx.commit({ timeout: 10 }), (error: ElysianDBError) => error.code === "TIMEOUT");
        assert.deepEqual(paths, ["/api/tx/begin", "/api/tx/tx8/rollback"]);

        const controller = new AbortController();
        const other = await db.beginTransaction();
        const commit = other.commit({ signal: controller.signal });
        controller.abort();
        await assert.rejects(commit, (error: ElysianDBError) => error.code === "ABORTED");
        assert.deepEqual(paths.slice(2), ["/api/tx/begin", "/api/tx/tx8/rollback"], "the rollback ignores the aborted signal");
    });

    it("rejects IDs that could not be read back", async () => {
        const { db, calls } = client([json({ transaction_id: "tx9" })]);
        const tx = await db.beginTransaction();
        await assert.rejects(tx.create("books", { id: "count" }), /invalid document ID "count"/);
        await assert.rejects(tx.create("books", { id: "a b" }), /invalid document ID "a b"/);
        await assert.rejects(tx.update("books", ".", {}), /invalid document ID "\."/);
        assert.equal(calls.length, 1);
    });

    it("generates UUIDs without randomUUID()", async () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
        const { getRandomValues } = globalThis.crypto;
        Object.defineProperty(globalThis, "crypto", {
            value: { getRandomValues: getRandomValues.bind(globalThis.crypto) },
            configurable: true,
        });
        try {
            const { db } = client([json({ transaction_id: "tx10" }), empty(200)]);
            const tx = await db.beginTransaction();
            const document = await tx.create("books", {});
            assert.match(document.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        } finally {
            Object.defineProperty(globalThis, "crypto", original!);
        }
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
        assert.deepEqual({ ...(await db.kv.mget(["a", "b"])) }, { a: "1", b: null });
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

    it("rejects the key mget, which is the route of mget()", async () => {
        const { db, calls } = client([empty(204)]);
        await assert.rejects(db.kv.get("mget"), /invalid key "mget"/);
        await assert.rejects(db.kv.set("mget", "v"), /invalid key "mget"/);
        await db.kv.delete("mget");
        assert.equal(calls.length, 1);
    });

    it("returns every key of mget(), __proto__ included", async () => {
        const { db } = client([json([{ key: "__proto__", value: "p" }, { key: "constructor", value: null }])]);
        const values = await db.kv.mget(["__proto__", "constructor", "toString"]);
        assert.deepEqual(Object.keys(values), ["__proto__", "constructor"]);
        assert.equal(values["__proto__"], "p");
        assert.equal(values.constructor, null);
        assert.equal(values.toString, undefined);
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

    it("only keeps plain .tar.gz backup file names", async () => {
        const names: Array<[string | null, string]> = [
            ['attachment; filename="../../.ssh/authorized_keys"', "elysiandb-backup.tar.gz"],
            ['attachment; filename="/etc/cron.d/x.tar.gz"', "x.tar.gz"],
            ['attachment; filename="..\\..\\backup.tar.gz"', "backup.tar.gz"],
            ['attachment; filename=".."', "elysiandb-backup.tar.gz"],
            ['attachment; filename=".hidden.tar.gz"', "elysiandb-backup.tar.gz"],
            ['attachment; filename="package.json"', "elysiandb-backup.tar.gz"],
            ['attachment; filename="a b.tar.gz"', "elysiandb-backup.tar.gz"],
            ["attachment; filename*=UTF-8''x.tar.gz", "elysiandb-backup.tar.gz"],
            ["attachment; filename=elysiandb-backup-1.tar.gz", "elysiandb-backup-1.tar.gz"],
            [null, "elysiandb-backup.tar.gz"],
        ];
        for (const [disposition, expected] of names) {
            const headers: Record<string, string> = disposition ? { "Content-Disposition": disposition } : {};
            const { db } = client([new Response(new Uint8Array([31, 139]), { status: 200, headers })]);
            assert.equal((await db.admin.backup()).filename, expected, String(disposition));
        }
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
