/**
 * End-to-end tests against running ElysianDB servers. They run with `npm run test:integration` and use:
 *
 * - ELYSIANDB_URL             server without authentication, with schema, hooks, stats and Prometheus enabled
 * - ELYSIANDB_TOKEN_URL       server in `token` mode, with ELYSIANDB_TOKEN
 * - ELYSIANDB_BASIC_URL       server in `basic` mode
 * - ELYSIANDB_USER_URL        server in `user` mode
 * - ELYSIANDB_ADMIN_PASSWORD  password of the `admin` user of the `basic` and `user` servers
 *
 * Servers that are not configured are skipped. The backup test restores the `basic` server.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient, ElysianDB, ElysianDBError } from "../src/index.js";

const enabled = process.env.ELYSIANDB_INTEGRATION === "1";
const env = (name: string) => (enabled ? process.env[name] : undefined);

const URL_NONE = enabled ? process.env.ELYSIANDB_URL ?? "http://127.0.0.1:8089" : undefined;
const URL_TOKEN = env("ELYSIANDB_TOKEN_URL");
const URL_BASIC = env("ELYSIANDB_BASIC_URL");
const URL_USER = env("ELYSIANDB_USER_URL");
const TOKEN = process.env.ELYSIANDB_TOKEN ?? "";
const ADMIN_PASSWORD = process.env.ELYSIANDB_ADMIN_PASSWORD ?? "admin";

const suffix = Math.random().toString(36).slice(2, 8);
const name = (base: string) => `${base}_${suffix}`;

interface Author {
    id: string;
    name: string;
}

interface Book {
    id: string;
    title: string;
    year: number;
    tags: string[];
    status?: string | null;
    author?: { "@entity": string; id: string; name?: string };
}

async function rejectsWith(promise: Promise<unknown>, status: number): Promise<ElysianDBError> {
    try {
        await promise;
    } catch (error) {
        assert.ok(error instanceof ElysianDBError, `expected an ElysianDBError, got ${error}`);
        assert.equal(error.status, status, error.message);
        return error;
    }
    assert.fail(`expected a ${status} error`);
}

describe("integration: no authentication", { skip: !URL_NONE }, () => {
    let db: ElysianDB;
    const BOOKS = name("books");
    const AUTHORS = name("authors");

    before(() => {
        db = createClient(URL_NONE!);
    });

    after(async () => {
        await db.entity(BOOKS).deleteAll().catch(() => undefined);
        await db.entity(AUTHORS).deleteAll().catch(() => undefined);
    });

    it("checks health and reads the server version", async () => {
        const health = await db.health();
        assert.equal(health.ok, true);
        assert.match(health.version ?? "", /^\d+\.\d+\.\d+/);
    });

    it("creates, reads, updates and deletes documents", async () => {
        const books = db.entity<Book>(BOOKS);

        const dune = await books.create({
            title: "Dune",
            year: 1965,
            tags: ["sf", "classic"],
            status: "draft",
            author: { "@entity": AUTHORS, id: "frank", name: "Frank Herbert" },
        });
        assert.ok(dune.id);

        const created = await books.createMany([
            { title: "Neuromancer", year: 1984, tags: ["sf", "cyberpunk"], status: "published" },
            { title: "The Hobbit", year: 1937, tags: ["fantasy"], status: "published" },
        ]);
        assert.equal(created.length, 2);

        assert.equal(await books.count(), 3);
        assert.equal(await books.exists(dune.id), true);
        assert.equal(await books.exists("missing"), false);

        const withAuthor = await books.get(dune.id, { includes: ["author"] });
        assert.equal(withAuthor.author?.name, "Frank Herbert");
        assert.equal((await db.entity<Author>(AUTHORS).get("frank")).name, "Frank Herbert");

        const updated = await books.update(dune.id, { status: null, year: 1966 });
        assert.equal(updated.year, 1966);
        assert.equal(updated.title, "Dune", "an update merges the stored document");
        assert.equal(updated.status, null);

        const batch = await books.updateMany(created.map((book) => ({ id: book.id, status: "archived" })));
        assert.deepEqual(batch.map((book) => book.status), ["archived", "archived"]);

        const missing = await rejectsWith(books.update("missing", { year: 1 }), 404);
        assert.equal(missing.isNotFound, true);
        assert.equal(await books.getOrNull("missing"), null);

        await books.delete(created[1].id);
        assert.equal(await books.count(), 2);
    });

    it("lists with filters, search, sort, projection and pagination", async () => {
        const books = db.entity<Book>(BOOKS);

        const sf = await books.list({ filter: { tags: { contains: "sf" } }, sort: { year: "desc" } });
        assert.deepEqual(sf.map((book) => book.title), ["Neuromancer", "Dune"]);

        const old = await books.list({ filter: { year: { lt: 1970 } }, fields: ["title"] });
        assert.deepEqual(old.map((book) => Object.keys(book).sort()), [["title"]]);

        assert.deepEqual((await books.list({ search: "neuro" })).map((book) => book.title), ["Neuromancer"]);
        assert.equal(await books.count({ filter: { title: "dune" } }), 1);
        assert.equal((await books.first({ sort: { year: "asc" } }))?.title, "Dune");
        assert.deepEqual(
            (await books.list({ filter: { "author.name": { eq: "Frank*" } }, includes: "all" })).map((book) => book.title),
            ["Dune"],
        );

        const all = await books.listAll({ pageSize: 1, sort: { year: "asc" } });
        assert.deepEqual(all.map((book) => book.title), ["Dune", "Neuromancer"]);
    });

    it("runs Query API queries with and / or and several sorts", async () => {
        const books = db.entity<Book>(BOOKS);
        await books.create({ title: "Hyperion", year: 1989, tags: ["sf"], status: "published" });

        const result = await books.query({
            filter: { tags: { contains: "sf" }, or: [{ year: { lt: 1970 } }, { title: { eq: "hyp*" } }] },
            sort: { year: "desc", title: "asc" },
            fields: ["title", "year"],
        });
        assert.deepEqual(result.map((book) => book.title), ["Hyperion", "Dune"]);
        assert.equal(await books.queryCount({ year: { gte: 1980 } }), 2);

        const viaDb = await db.query<Book>({ entity: BOOKS, filter: { title: "dune" }, limit: 1 });
        assert.equal(viaDb[0].title, "Dune");
    });

    it("applies transactions atomically", async () => {
        const authors = db.entity<Author>(AUTHORS);
        const books = db.entity<Book>(BOOKS);
        const before = await books.count();

        const authorId = await db.transaction(async (tx) => {
            const author = await tx.entity<Author>(AUTHORS).create({ name: "Ursula K. Le Guin" });
            await tx.create<Book>(BOOKS, {
                title: "The Dispossessed",
                year: 1974,
                tags: ["sf"],
                author: { "@entity": AUTHORS, id: author.id },
            });
            return author.id;
        });
        assert.equal((await authors.get(authorId)).name, "Ursula K. Le Guin");
        assert.equal(await books.count(), before + 1);

        await assert.rejects(
            db.transaction(async (tx) => {
                await tx.create(BOOKS, { title: "Never written", year: 2000, tags: [] });
                throw new Error("cancelled");
            }),
            /cancelled/,
        );
        assert.equal(await books.count(), before + 1, "a rolled back transaction writes nothing");

        const tx = await db.beginTransaction();
        await rejectsWith(tx.update(BOOKS, "missing", { year: 1 }), 400);
        const target = await books.create({ title: "Deleted then updated", year: 2002, tags: [] });
        await tx.create(BOOKS, { title: "Also never written", year: 2001, tags: [] });
        await tx.delete(BOOKS, target.id);
        await tx.update(BOOKS, target.id, { year: 2003 });
        await rejectsWith(tx.commit(), 400);
        assert.equal(tx.state, "committed");
        assert.equal(await books.count(), before + 2, "a failed commit writes nothing");
        assert.equal(await books.exists(target.id), true);
        await books.delete(target.id);
    });

    it("manages entity types, schemas and migrations", async () => {
        const MOVIES = name("movies");
        const movies = db.entity(MOVIES);

        const schema = await db.entities.create(MOVIES, { title: { type: "string", required: true }, minutes: "number" });
        assert.equal(schema._manual, true);
        assert.ok((await db.entities.list()).includes(MOVIES));
        assert.ok((await db.entities.schemas()).some((entry) => entry.id === MOVIES));

        await movies.create({ title: "Alien", minutes: 117 });
        const invalid = await rejectsWith(movies.create({ minutes: 1 }), 400);
        assert.equal(invalid.isValidationError, true);
        assert.equal(invalid.validationErrors[0].field, "title");

        await movies.setSchema({ title: { type: "string", required: true }, minutes: "number", genre: "string" });
        assert.ok("genre" in (await movies.getSchema()).fields);

        await movies.migrate([{ set: [{ genre: "sf" }] }]);
        assert.equal((await movies.first())?.genre, "sf");

        await movies.deleteAll();
        assert.equal(await movies.count(), 0);
    });

    it("stores keys and values", async () => {
        const prefix = name("kv");
        await db.kv.set(`${prefix}:a`, "1");
        await db.kv.set(`${prefix}:b`, { nested: true });
        await db.kv.set(`${prefix}:ttl`, "soon gone", { ttl: 1 });

        assert.equal(await db.kv.get(`${prefix}:a`), "1");
        assert.deepEqual(await db.kv.getJSON(`${prefix}:b`), { nested: true });
        assert.equal(await db.kv.get(`${prefix}:missing`), null);

        const all = await db.kv.mget([`${prefix}:*`, `${prefix}:missing`]);
        assert.equal(all[`${prefix}:a`], "1");
        assert.equal(all[`${prefix}:missing`], null);

        await new Promise((resolve) => setTimeout(resolve, 2100));
        assert.equal(await db.kv.get(`${prefix}:ttl`), null);

        await db.kv.delete(`${prefix}:*`);
        assert.equal(await db.kv.get(`${prefix}:a`), null);
    });

    it("runs hooks", async () => {
        const books = db.entity<Book & { classic?: boolean }>(BOOKS);
        const hook = await db.hooks.create(BOOKS, {
            name: "classic",
            event: "post_read",
            script: "function postRead(ctx) { ctx.entity.classic = ctx.entity.year < 1970 }",
        });
        assert.ok(hook.id);
        assert.equal((await db.hooks.list(BOOKS)).length, 1);

        assert.equal((await books.first({ filter: { title: "dune" } }))?.classic, true);

        const disabled = await db.hooks.update(hook.id, { enabled: false });
        assert.equal(disabled.enabled, false);
        assert.equal((await db.hooks.get(hook.id)).name, "classic");
        assert.equal((await books.first({ filter: { title: "dune" } }))?.classic, undefined);

        await db.hooks.delete(BOOKS, hook.id);
        await rejectsWith(db.hooks.get(hook.id), 404);
    });

    it("exports and imports documents", async () => {
        const TAGS = name("tags");
        await db.entity(TAGS).createMany([{ id: "a", label: "A" }, { id: "b", label: "B" }]);

        const dump = await db.admin.export();
        assert.equal(dump[TAGS].length, 2);

        const result = await db.admin.import({ [TAGS]: [{ id: "c", label: "C" }] });
        assert.equal(result.status, "import completed");
        assert.deepEqual((await db.entity(TAGS).list()).map((tag) => tag.id), ["c"]);
        await db.entity(TAGS).deleteAll();
    });

    it("reads stats, configuration and monitoring data", async () => {
        const stats = await db.admin.stats();
        assert.equal(typeof stats.keys_count, "number");
        assert.equal(typeof stats.version, "string");

        const config = await db.admin.config<{ Server?: unknown; server?: unknown }>();
        assert.ok(config);
        await db.admin.save();

        const overview = await db.monitoring.overview();
        assert.ok(["healthy", "warning", "critical"].includes(overview.status.level));
        assert.ok(Array.isArray(overview.status.problems));
        assert.match(overview.instance.version, /^\d+\.\d+\.\d+/);
        assert.ok(await db.monitoring.series({ range: "15m" }));
        assert.ok(await db.monitoring.details());

        const page = await db.monitoring.logs({ limit: 5 });
        assert.ok(Array.isArray(page.entries));
        assert.ok(Array.isArray(await db.monitoring.exportLogs({ level: "error" })));

        const level = await db.monitoring.setLogLevel("debug", 1);
        assert.equal(level.level, "debug");
        assert.equal((await db.monitoring.setLogLevel(level.configured)).level, level.configured);
        assert.equal((await db.monitoring.getLogLevel()).level, level.configured);

        assert.match(await db.monitoring.metrics(), /elysiandb_/);
    });

    it("exposes response headers with send()", async () => {
        await db.entity(BOOKS).list({ limit: 1 });
        const response = await db.send("GET", `/api/${BOOKS}`, { query: { limit: 1 }, requestId: "client-js-test" });
        assert.equal(response.headers.get("X-Request-Id"), "client-js-test");
        assert.ok(["HIT", "MISS"].includes(response.headers.get("X-Elysian-Cache") ?? ""));
    });
});

describe("integration: token mode", { skip: !URL_TOKEN }, () => {
    it("rejects requests without the token and accepts it", async () => {
        const anonymous = createClient(URL_TOKEN!);
        const error = await rejectsWith(anonymous.entity("things").list(), 401);
        assert.equal(error.isUnauthorized, true);
        assert.equal((await anonymous.health()).ok, true);

        const db = createClient(URL_TOKEN!, { auth: { token: TOKEN } });
        const THINGS = name("things");
        const thing = await db.entity(THINGS).create({ label: "ok" });
        assert.equal((await db.entity(THINGS).get(thing.id)).label, "ok");
        await db.entity(THINGS).deleteAll();
    });
});

describe("integration: basic mode", { skip: !URL_BASIC }, () => {
    it("authenticates with a username and a password", async () => {
        await rejectsWith(createClient(URL_BASIC!, { auth: { username: "admin", password: "wrong-password" } }).entity("x").list(), 401);

        const db = createClient(URL_BASIC!, { auth: { username: "admin", password: ADMIN_PASSWORD } });
        assert.ok(Array.isArray(await db.entity(name("things")).list()));
    });

    it("backs up and restores the instance", async () => {
        const db = createClient(URL_BASIC!, { auth: { username: "admin", password: ADMIN_PASSWORD } });
        const NOTES = name("notes");
        const notes = db.entity(NOTES);
        await notes.create({ id: "kept", text: "in the backup" });
        await db.kv.set(name("backup-key"), "value");

        const backup = await db.admin.backup();
        assert.match(backup.filename, /^elysiandb-backup-.*\.tar\.gz$/);
        assert.equal(backup.data[0], 0x1f, "the archive is gzip");

        await notes.create({ id: "lost", text: "after the backup" });
        await db.kv.delete(name("backup-key"));

        const result = await db.admin.restore(backup.data);
        assert.equal(result.status, "restore completed");
        assert.equal(result.entities[NOTES], 1);
        assert.deepEqual((await notes.list()).map((note) => note.id), ["kept"]);
        assert.equal(await db.kv.get(name("backup-key")), "value");
    });
});

describe("integration: user mode", { skip: !URL_USER }, () => {
    let db: ElysianDB;
    const ALICE = name("alice");
    const NOTES = name("notes");

    before(async () => {
        db = createClient(URL_USER!);
        await rejectsWith(db.entity(NOTES).list(), 401);
        const user = await db.auth.login("admin", ADMIN_PASSWORD);
        assert.deepEqual(user, { username: "admin", role: "admin" });
    });

    after(async () => {
        await db.users.delete(ALICE).catch(() => undefined);
        await db.entity(NOTES).deleteAll().catch(() => undefined);
    });

    it("opens a session", async () => {
        assert.equal(db.auth.mode, "session");
        assert.ok(db.auth.session);
        assert.deepEqual(await db.auth.me(), { username: "admin", role: "admin" });

        const note = await db.entity(NOTES).create({ text: "owned by admin" });
        assert.equal(note._elysiandb_core_username, "admin");
    });

    it("reuses a session in another client", async () => {
        const other = createClient(URL_USER!, { auth: { session: db.auth.session! } });
        assert.equal((await other.auth.me()).username, "admin");
    });

    it("manages users", async () => {
        await db.users.create({ username: ALICE, password: "alice-password", role: "user" });
        await rejectsWith(db.users.create({ username: ALICE, password: "alice-password" }), 409);
        assert.deepEqual(await db.users.get(ALICE), { username: ALICE, role: "user" });
        assert.ok((await db.users.list()).some((user) => user.username === ALICE));

        await db.users.changeRole(ALICE, "admin");
        assert.equal((await db.users.get(ALICE)).role, "admin");
        await db.users.changeRole(ALICE, "user");
        await db.users.changePassword(ALICE, "another-password");
        await rejectsWith(db.users.changePassword(ALICE, "short"), 400);
    });

    it("manages ACLs", async () => {
        const acl = await db.acl.get(ALICE, NOTES);
        assert.equal(acl.permissions.read, false);
        assert.equal(acl.permissions.owning_read, true);

        const updated = await db.acl.update(ALICE, NOTES, { read: true });
        assert.equal(updated.permissions.read, true);
        assert.equal((await db.acl.get(ALICE, NOTES)).permissions.owning_read, true, "update() keeps other permissions");
        assert.ok((await db.acl.list(ALICE)).some((entry) => entry.entity === NOTES));

        await db.acl.reset(ALICE, NOTES);
        assert.equal((await db.acl.get(ALICE, NOTES)).permissions.read, false);

        await db.users.delete(ALICE);
        await rejectsWith(db.users.get(ALICE), 404);
    });

    it("logs out", async () => {
        const session = db.auth.session!;
        await db.auth.logout();
        assert.equal(db.auth.mode, "none");
        await rejectsWith(createClient(URL_USER!, { auth: { session } }).auth.me(), 401);
        await db.auth.login("admin", ADMIN_PASSWORD);
    });
});
