# ElysianDB JavaScript & TypeScript client

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENCE)

The official client for [ElysianDB](https://github.com/elysiandb/elysiandb), the single-binary backend that turns JSON into a REST API. It covers the whole HTTP API of ElysianDB 0.2.3:

- **Documents**: typed CRUD, batch writes, filters, search, sort, pagination, projections, includes, async iteration
- **Query API**: `and` / `or` filter trees and sorts on several fields
- **Transactions**: commit or roll back automatically
- **Key–value store**: values with TTL, multi-get and wildcards
- **Authentication**: `token`, `basic` and `user` (session) modes
- **Administration**: entity types and schemas, migrations, users, ACLs, hooks, export/import, backup/restore, monitoring and logs
- **Robust requests**: typed errors, timeouts, cancellation, retries, request hooks

It has no dependencies, ships ES modules, CommonJS and TypeScript types, and runs on Node.js 20+, Bun, Deno and browsers.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Connecting](#connecting)
- [Authentication](#authentication)
- [Documents](#documents)
- [Names, IDs and keys](#names-ids-and-keys)
- [Listing and filtering](#listing-and-filtering)
- [Query API](#query-api)
- [Transactions](#transactions)
- [Key–value store](#keyvalue-store)
- [Entity types, schemas and migrations](#entity-types-schemas-and-migrations)
- [Users and ACLs](#users-and-acls)
- [Hooks](#hooks)
- [Administration](#administration)
- [Monitoring](#monitoring)
- [Error handling](#error-handling)
- [Timeouts, retries and cancellation](#timeouts-retries-and-cancellation)
- [Request hooks and raw requests](#request-hooks-and-raw-requests)
- [Runtimes and browsers](#runtimes-and-browsers)
- [API reference](#api-reference)
- [Migrating from 0.0.x](#migrating-from-00x)
- [Development](#development)

## Installation

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Start an ElysianDB server if you do not have one:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Quick start

```ts
import { createClient } from "@elysiandbjs/client";

interface Book {
  id: string;
  title: string;
  year: number;
  tags: string[];
}

const db = createClient("http://localhost:8089");
const books = db.entity<Book>("books");

const dune = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });

await books.update(dune.id, { year: 1966 });

const recent = await books.list({
  filter: { year: { gte: 1960 }, tags: { contains: "sf" } },
  sort: { year: "desc" },
  limit: 20,
});

const total = await books.count();
```

`entity<T>()` gives typed results: `create()` takes the document without `id` (ElysianDB generates one), `update()` takes any subset of the fields.

## Connecting

```ts
import { createClient, ElysianDB } from "@elysiandbjs/client";

const db = createClient("http://localhost:8089", {
  auth: { token: "my-secret-token" },
  timeout: 10_000,
  retries: 2,
});

// Same thing with the constructor
const db2 = new ElysianDB({ url: "http://localhost:8089", auth: { token: "my-secret-token" } });
```

| Option | Default | Description |
| --- | --- | --- |
| `auth` | none | Credentials: `{ token }`, `{ username, password }` or `{ session }`. See [Authentication](#authentication). |
| `headers` | `{}` | Headers added to every request. |
| `timeout` | none | Request timeout in milliseconds. |
| `retries` | `0` | Retries of `GET`, `PUT` and `DELETE` requests after a network error or a `429`, `502`, `503` or `504` answer. |
| `retryDelay` | `300` | Delay before the first retry in milliseconds, doubled at each retry. `Retry-After` is honored. |
| `fetch` | global `fetch` | Custom `fetch` implementation. |
| `credentials` | runtime default | `credentials` mode of browser requests. Set `"include"` for `user` mode sessions across origins. |
| `onRequest` | none | Called before each request. Can change its headers. |
| `onResponse` | none | Called after each response, successful or not. |

Check that the server is up with `health()`. It never throws and needs no credentials:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Authentication

ElysianDB has three authentication modes (`security.authentication.mode`). Pass the matching credentials to the client:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

In `user` mode, `login()` opens a session (`edb_session` cookie) that the client sends with the next requests. Only admin users can log in. On Node.js, Bun and Deno the client keeps the session ID in `db.auth.session`, so you can store it and reuse it later:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

In browsers, the session cookie is `HttpOnly`: the browser keeps it and `db.auth.session` stays `undefined`. If your page and ElysianDB have different origins, list the page origin in `server.http.cors.allowedOrigins` and create the client with `credentials: "include"`.

Credentials can change at any time:

| Member | Description |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` or `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Switches credentials. |
| `db.auth.login(username, password)` | Opens a session (`user` mode). Repeated failures get `429` with `error.retryAfter`. |
| `db.auth.logout()` | Ends the session and clears the credentials. |
| `db.auth.me()` | The user of the current session. |
| `db.auth.clear()` | Stops sending credentials. |
| `db.auth.onChange(listener)` | Called when the credentials change. Returns an unsubscribe function. |

> In `user` mode, some routes need an admin: the key–value store, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` and `deleteAll()`. Document routes are checked against [ACLs](#users-and-acls).

## Documents

```ts
const books = db.entity<Book>("books");
```

### Create

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` validates every document first: if one is invalid, nothing is written. Passing an `id` that already exists replaces that document.

Nested objects with an `@entity` key are stored as separate documents and replaced with a link (`{ "@entity": "authors", "id": "..." }`). Expand them with [`includes`](#listing-and-filtering):

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Read

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Update

Updates are partial: the body is merged into the stored document. Set a field to `null` to unset it.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

An update never creates a document: `update()` throws a `404` error when the document does not exist, and `updateMany()` writes nothing if one of them is missing.

### Delete

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Count

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Names, IDs and keys

Entity names, document IDs, keys, usernames and hook IDs go in URL paths, and ElysianDB 0.2.3 does not decode them consistently: a value that needs percent-encoding could be written but not read back. The client only accepts values made of letters (`A-Z`, `a-z`), digits and `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, and throws a `TypeError` for anything else, such as spaces, accented letters, `/`, `?`, `#` or `%`. `create()` and `createMany()` check the `id` you pass the same way, so that every document can be read back.

Some values are rejected because ElysianDB routes them elsewhere, or because `fetch` removes them from URLs:

| Value | Rejected as | Why |
| --- | --- | --- |
| `.` and `..` | Any name, ID or key | `fetch` removes them from URLs: `books.delete(".")` would delete every book. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Entity name | `/api/query` is the Query API, `/api/export` the export, and so on. |
| `count`, `schema` | Document ID in `get()`, `update()` and `create()` | `GET /api/books/count` counts the books. `exists()` and `delete()` still accept them. |
| `mget` | Key in `kv.get()` and `kv.set()` | `GET /kv/mget` is the route of `mget()`. |

The client never follows HTTP redirects either, since a redirect would replay the request, credentials included, on another URL. A redirect fails with an `ElysianDBError` that gives the new location: check the URL of the server if you get one.

## Listing and filtering

`list()` maps its options to `GET /api/<entity>`:

```ts
const page = await books.list({
  filter: {
    year: { gte: 1960, lt: 2000 },
    tags: { any: ["sf", "fantasy"] },
    "author.name": { eq: "Frank*" },
    status: "published", // shorthand for { eq: "published" }
  },
  search: "dune",
  sort: { year: "desc" },
  fields: ["title", "year", "author"],
  includes: ["author"],
  limit: 20,
  offset: 40,
});
```

| Option | Description |
| --- | --- |
| `filter` | Conditions on fields, all of which must match. Paths can be nested (`author.name`) and traverse arrays and included entities. |
| `search` | Case-insensitive search in the string values of the documents (and of included entities). With `*`, a glob on whole values: `Zeb*`. |
| `sort` | One field: `{ createdAt: "desc" }`. Use [`query()`](#query-api) to sort on several fields. |
| `fields` | Returns only these fields. |
| `includes` | Expands linked entities: `["author", "author.job"]`, or `"all"`. |
| `limit`, `offset` | Pagination, applied after filters and search. `limit` must be a positive integer and `offset` a non-negative integer: ElysianDB would ignore other values and return every document. |

### Filter operators

| Operator | Strings | Numbers and dates | Arrays |
| --- | --- | --- | --- |
| `eq` | Equals, case-insensitive, `*` glob | Equals | Same items as the list |
| `neq` | Not equals, `*` glob | Not equals | — |
| `lt`, `lte`, `gt`, `gte` | Lexicographic | Less / greater than | — |
| `contains` | Contains the substring | — | Has an item equal to the value |
| `not_contains` | Does not contain the substring | — | Has no item equal to the value |
| `all` | — | — | Has every value of the list |
| `any` | — | — | Has at least one value of the list |
| `none` | — | — | Has none of the values of the list |

Values can be strings, numbers, booleans or `Date` objects (sent as ISO 8601). Arrays are sent as comma-separated lists, for `eq`, `all`, `any` and `none`. A document without the field, or with `null`, never matches.

### Pagination helpers

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Use a `sort` when you iterate over data that changes, so that pages stay stable.

`iterate()` and `listAll()` stop at the first page shorter than `pageSize`, once `count()` confirms that every document was read. In `user` mode, ElysianDB 0.2.3 applies an ACL that grants `owning_read` but not `read` after `limit` and `offset`, so a page can be short, or empty, before the end: the client then fetches the remaining documents in one request. `list()` and `first()` cannot detect it, so they may return fewer documents than `limit` in that case.

## Query API

`query()` uses `POST /api/query`, which adds `and` / `or` filter trees and sorts on several fields:

```ts
import { and, or } from "@elysiandbjs/client";

const results = await books.query({
  filter: and(
    { status: "published" },
    or({ title: { eq: "*dune*" } }, { year: { lt: 1970 } }),
  ),
  sort: { year: "desc", title: "asc" }, // applied in this order
  fields: ["title", "year"],
  limit: 10,
});

const n = await books.queryCount(or({ year: { lt: 1950 } }, { tags: { contains: "classic" } }));

// on any entity
await db.query<Book>({ entity: "books", filter: { year: { gte: 2000 } } });
```

`and()` and `or()` are optional helpers: `{ or: [...] }` works too. A node can mix field conditions and `and` / `or`; the client turns it into an `and`, since ElysianDB reads only one of them per node.

**`list()` or `query()`?**

| | `list()` | `query()` |
| --- | --- | --- |
| Field conditions (all must match) | ✓ | ✓ |
| `and` / `or` trees | | ✓ |
| Several sort keys | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## Transactions

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` commits when the callback resolves and returns its result. When the callback throws, it rolls back and rethrows the error.

- Operations are queued on the server and applied on commit, all or none. A schema error, or an update of a document that no longer exists at that point, rejects the whole commit with a `400` error.
- `tx.create()` returns the document with its `id`, generated by the client when missing, so that other documents of the transaction can link to it (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` only applies to documents that are already stored: ElysianDB 0.2.3 checks that the document exists when the update is queued, so updating a document created in the same transaction fails with a `400` error. Put every field in `tx.create()` instead.
- Queued operations cannot be read back, by this client or any other, before the commit.
- Operations and commits are never retried, so that nothing is queued or applied twice. ElysianDB never expires open transactions: when a commit gets no answer (network error, timeout or abort), the client rolls the transaction back. The commit may still have been applied if it reached ElysianDB, so check before you try again.
- `tx.entity<T>("books")` gives typed `create`, `update` and `delete` for one entity.

To drive a transaction yourself:

```ts
const tx = await db.beginTransaction();
try {
  await tx.create("books", { title: "Dune" });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

## Key–value store

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Values are strings. Keys follow the [rules of names and IDs](#names-ids-and-keys): `*` is a wildcard in `mget()` and `delete()`, and `mget()` keys cannot contain `,`. `mget()` returns an object without prototype, so that every key, `__proto__` included, is an own property. In `user` mode, the key–value store needs an admin.

## Entity types, schemas and migrations

Entity types are created by the first document written, or declared up front with a strict schema:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Read or replace the schema of an entity type. A manual schema rejects unknown fields and missing required fields:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

Field types are `string`, `number`, `boolean`, `object` (with nested `fields`) and `array`. Writes that break the schema throw an error with [`validationErrors`](#error-handling).

Migrations update every document of an entity type, nested paths included:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Users and ACLs

These routes exist in `user` mode and need an admin session.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACLs grant permissions per user and entity type: `create`, `read`, `update`, `delete`, and `owning_read`, `owning_update`, `owning_delete` for the documents a user owns (their `_elysiandb_core_username` field).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Hooks are JavaScript functions that ElysianDB runs on reads (`api.hooks.enabled: true`). They need admin credentials.

```ts
const hook = await db.hooks.create("books", {
  name: "isClassic",
  event: "post_read", // or "pre_read", to filter on computed fields
  script: "function postRead(ctx) { ctx.entity.classic = ctx.entity.year < 1970 }",
  priority: 10,       // optional: higher runs first (default 0)
});

await db.hooks.list("books");
await db.hooks.get(hook.id);
await db.hooks.update(hook.id, { enabled: false });
await db.hooks.delete("books", hook.id);
```

## Administration

These calls need an admin in `user` mode.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Export and import documents (accounts, ACLs, schemas and KV keys are not included):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Back up and restore a whole instance, accounts included:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` comes from the server, but it is always a plain `.tar.gz` file name without folder: the client replaces any other name with `elysiandb-backup.tar.gz`, so that the server cannot choose where you write.

A restore replaces all the data and ends every session, the current one included. The HTTP API accepts archives up to 4 MB: use `elysiandb backup` and `elysiandb restore` for larger instances. Archives hold password hashes: store them like the data folder.

## Monitoring

The monitoring endpoints of the Admin UI, with admin credentials:

```ts
const overview = await db.monitoring.overview();
overview.status; // { level: "healthy" | "warning" | "critical", problems: [...] }

await db.monitoring.series({ range: "1h" });  // "15m", "1h" or "24h"
await db.monitoring.details();                 // top routes, hooks, documents per entity type

const page = await db.monitoring.logs({ level: "warn", component: "http", limit: 100 });
const older = await db.monitoring.logs({ before: page.entries.at(-1)?.seq });
const errors = await db.monitoring.exportLogs({ level: "error", since: new Date(Date.now() - 3_600_000) });

await db.monitoring.setLogLevel("debug", 15);  // for 15 minutes
await db.monitoring.getLogLevel();             // { level, configured, until }

await db.monitoring.metrics();                 // Prometheus text format (monitoring.prometheus.enabled)
```

With `monitoring.prometheus.token`, pass that token for `metrics()`: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Error handling

Every method throws an `ElysianDBError` when the request fails:

```ts
import { ElysianDBError } from "@elysiandbjs/client";

try {
  await books.create({ year: 1965 });
} catch (error) {
  if (error instanceof ElysianDBError) {
    error.status;           // 400
    error.message;          // "POST /api/books failed with status 400: validation failed: title: required field missing"
    error.validationErrors; // [{ field: "title", message: "required field missing" }]
    error.requestId;        // value of X-Request-Id, also written in the ElysianDB logs
  }
}
```

| Property | Description |
| --- | --- |
| `code` | `"HTTP_ERROR"` (ElysianDB answered 4xx/5xx, or a redirect), `"NETWORK_ERROR"`, `"TIMEOUT"` or `"ABORTED"` |
| `status` | HTTP status, `0` when no answer was received |
| `message` | Method, path, status and the message of ElysianDB |
| `data` | Parsed response body |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` for rejected writes, batch writes (`index`) and imports |
| `requestId` | `X-Request-Id` of the answer |
| `retryAfter` | Seconds to wait, after a `429` |
| `method`, `url` | The failed request |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Shortcuts |

## Timeouts, retries and cancellation

Set defaults on the client, and override them per call with the last argument of any method:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

Per-call options are `signal`, `timeout`, `retries`, `requestId` (sent as `X-Request-Id`) and `headers`.

Only idempotent requests (`GET`, `PUT`, `DELETE`) are retried, after a network error or a `429`, `502`, `503` or `504` answer. `POST` requests, such as `create()`, a login or a commit, and the operations of a transaction are never retried.

## Request hooks and raw requests

```ts
const db = createClient(url, {
  onRequest: ({ method, url, headers }) => {
    headers["X-Trace-Id"] = crypto.randomUUID();
  },
  onResponse: ({ method, url, status, durationMs, headers }) => {
    console.log(method, url, status, `${durationMs} ms`, headers.get("X-Elysian-Cache"));
  },
});
```

Call any route with `request()`, or `send()` to also get the status and headers:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Runtimes and browsers

- Node.js 20 or later, Bun, Deno and browsers: the client only needs `fetch`. Pass `fetch` in the options for other environments.
- ES modules (`import`) and CommonJS (`require`) are both published, with TypeScript types.
- Browsers can call ElysianDB from another origin only when that origin is listed in `server.http.cors.allowedOrigins`.
- Do not ship admin credentials or the instance token to browsers.

ElysianDB 0.2.3 limits what a page can do across origins:

- The `X-Request-Id` header is not allowed: a request with the `requestId` option fails its CORS preflight. Leave `requestId` out in browsers that call another origin.
- Response headers are not exposed: `health().version` is `null`, `error.requestId` and `error.retryAfter` are `undefined`, `send()` only sees CORS-safelisted headers such as `Content-Type`, and `admin.backup()` names the file `elysiandb-backup.tar.gz`.

`tx.create()` generates IDs with `crypto.randomUUID()`, or `crypto.getRandomValues()` on pages that are not served over HTTPS.

## API reference

| Call | Route |
| --- | --- |
| **Client** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | any |
| **`db.entity<T>(name)`** | |
| `list(options)` / `listAll(options)` / `iterate(options)` / `first(options)` | `GET /api/<entity>` |
| `get(id, options)` / `getOrNull(id, options)` | `GET /api/<entity>/<id>` |
| `exists(id)` | `GET /api/<entity>/<id>/exists` |
| `count(options)` | `GET /api/<entity>/count` |
| `create(doc)` / `createMany(docs)` | `POST /api/<entity>` |
| `update(id, patch)` | `PUT /api/<entity>/<id>` |
| `updateMany(patches)` | `PUT /api/<entity>` |
| `delete(id)` | `DELETE /api/<entity>/<id>` |
| `deleteAll()` | `DELETE /api/<entity>` |
| `query(options)` / `queryCount(filter)` | `POST /api/query` |
| `getSchema()` / `setSchema(fields)` | `GET` / `PUT /api/<entity>/schema` |
| `migrate(actions)` | `POST /api/<entity>/migrate` |
| **`db.entities`** | |
| `list()` / `schemas()` | `GET /api/entity/types/name`, `GET /api/entity/types` |
| `create(name, fields)` | `POST /api/<entity>/create` |
| **`db.kv`** | |
| `get(key)` / `getJSON(key)` / `set(key, value, { ttl })` / `delete(key)` | `GET` / `PUT` / `DELETE /kv/<key>` |
| `mget(keys)` | `GET /kv/mget` |
| **`db.auth`** | |
| `login()` / `logout()` / `me()` | `/api/security/login`, `/logout`, `/me` |
| **`db.users`** | |
| `list()` / `get()` / `create()` / `delete()` / `changePassword()` / `changeRole()` | `/api/security/user...` |
| **`db.acl`** | |
| `get()` / `list()` / `set()` / `update()` / `reset()` | `/api/acl/...` |
| **`db.hooks`** | |
| `list()` / `get()` / `create()` / `update()` / `delete()` | `/api/hook/...` |
| **`db.admin`** | |
| `stats()` / `config()` / `save()` / `reset()` | `/stats`, `/config`, `/save`, `/reset` |
| `export()` / `import(dump)` | `/api/export`, `/api/import` |
| `backup()` / `restore(archive)` | `/api/backup`, `/api/restore` |
| **`db.monitoring`** | |
| `overview()` / `series()` / `details()` | `/monitoring/...` |
| `logs()` / `exportLogs()` / `getLogLevel()` / `setLogLevel()` | `/monitoring/logs...` |
| `metrics()` | `/metrics` |

## Migrating from 0.0.x

Most code keeps working. The changes:

| 0.0.x | Now |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Still works. Prefer `createClient(url, { auth: { token } })`. |
| Failed requests resolved with the error body | They throw an `ElysianDBError`. |
| `count()` returned `{ count }` | `count()` returns a number. |
| `countWithOptions(options)` | `count(options)` (the old name still works). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (the old name still works). |
| `db.transaction()` resolved with `undefined` | It resolves with the value returned by the callback. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (the old method still works). |
| Imports from `dist/index.js` | The package has an `exports` map: import from `@elysiandbjs/client` only. |

## Development

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

The integration tests run against real ElysianDB servers, one per authentication mode:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

The CI builds ElysianDB 0.2.3 from source and runs both suites.

To release, run `make release` (or `make release VERSION=minor`) on an up-to-date `main`: it bumps the version and pushes the tag, and the Release workflow runs the CI and publishes the package to npm with provenance. The workflow needs the `NPM_TOKEN` secret.

## License

MIT
