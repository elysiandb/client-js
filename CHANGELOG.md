# Changelog

## Unreleased

A rewrite of the client that covers the whole HTTP API of ElysianDB 0.2.3. See "Migrating from 0.0.x" in the README.

### Added

- `createClient(url, options)`, alongside `new ElysianDB(options)`.
- Authentication for the three modes of ElysianDB: `auth: { token }`, `auth: { username, password }`, and `user` mode sessions with `db.auth.login()`, `logout()`, `me()`, `useSession()` and `onChange()`.
- `ElysianDBError` for every failure, with `code`, `status`, `data`, `validationErrors`, `requestId`, `retryAfter` and shortcuts such as `isNotFound`.
- Client options `timeout`, `retries`, `retryDelay`, `headers`, `fetch`, `credentials`, `onRequest` and `onResponse`; per-call `signal`, `timeout`, `retries`, `requestId` and `headers`.
- Entities: `get()` options (`fields`, `includes`), `getOrNull()`, `exists()`, `first()`, `listAll()`, `iterate()`, `createMany()`, `updateMany()`, `deleteAll()`, `count(options)`, `query()`, `queryCount()`, `getSchema()`, `setSchema()` and `migrate()`.
- Filter shorthand (`{ status: "published" }`), `Date` values, `includes: "all"`.
- Query API with `db.query()`, `and()` and `or()`.
- Transactions: `db.beginTransaction()`, `tx.create()`, `tx.entity<T>()`, `tx.state`; `db.transaction()` returns the value of its callback, and created documents get their `id` before the commit.
- `db.kv`: `get()`, `getJSON()`, `set()` with TTL, `mget()` and `delete()`, with wildcards.
- `db.entities`: `list()`, `schemas()` and `create()`.
- `db.users`, `db.acl` and `db.hooks`.
- `db.admin`: `stats()`, `config()`, `save()`, `reset()`, `export()`, `import()`, `backup()` and `restore()`.
- `db.monitoring`: `overview()`, `series()`, `details()`, `logs()`, `exportLogs()`, `getLogLevel()`, `setLogLevel()` and `metrics()`.
- `db.health()`, `db.request()` and `db.send()`.
- ES module build and `exports` map, next to CommonJS.
- Unit tests, integration tests against ElysianDB 0.2.3 in every authentication mode, and a CI workflow.
- Releases are published from CI with npm provenance.

### Changed

- Node.js 20 or later is required.
- Failed requests throw an `ElysianDBError` instead of resolving with the error body, and non-JSON answers (such as `Invalid JSON`) no longer crash the client.
- `count()` returns a number instead of `{ count }`.
- `list()` throws when `sort` has several fields, since ElysianDB only applies one: use `query()`.
- `Content-Type: application/json` is only sent with JSON bodies, which avoids a CORS preflight on browser reads.
- Entity names, document IDs, keys, usernames and hook IDs are checked before any request, and a `TypeError` is thrown for values that ElysianDB 0.2.3 would route elsewhere or could not read back: `.` and `..`, characters other than letters, digits and `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, the entity names `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl` and `security`, the IDs `count` and `schema` in `get()`, `update()` and `create()`, and the key `mget` in `kv.get()` and `kv.set()`. See "Names, IDs and keys" in the README.
- Redirects are never followed: they fail with an `ElysianDBError` that gives the new location.
- `limit` must be a positive integer and `offset` a non-negative integer, in `list()` and `query()`.
- `iterate()` and `listAll()` call `count()` once they reach a short page, to check that every document was read.
- `kv.mget()` returns an object without prototype.
- `admin.backup()` only keeps plain `.tar.gz` file names suggested by the server, and uses `elysiandb-backup.tar.gz` otherwise.
- The operations of a transaction are never retried, and a commit that gets no answer is rolled back.
- `tx.create()` generates IDs with `crypto.getRandomValues()` when `crypto.randomUUID()` is missing, as on pages not served over HTTPS.
- Build output moved to `dist/cjs`, `dist/esm` and `dist/types`.
- The demo is now `examples/demo.mjs`.

### Deprecated

- `baseUrl` and `token` options: use `url` and `auth: { token }`.
- `countWithOptions()`: use `count(options)`.
- `tx.write()`: use `tx.create()`.
- `rawRequest()`: use `request()`.

### Fixed

- `entity.delete(".")` deleted every document of the entity: `fetch` turned it into `DELETE /api/<entity>/`, which ElysianDB redirects to `DELETE /api/<entity>`. `get(".")` returned every document.
- IDs and keys with spaces, accented letters or other encoded characters could be written but not read back.
- `get("count")` and `get("schema")` returned the count and the schema of the entity, and `db.entity("query")` ran Query API requests.
- `list({ limit: 0 })` and `list({ limit: 1.5 })` returned every document.
- `iterate()` and `listAll()` could stop before the end in `user` mode, when an ACL grants `owning_read` but not `read`.
- A commit that got no answer could leave its transaction open forever on the server, and a retried transaction operation could be queued twice.
- `kv.mget()` dropped a key named `__proto__`.
- A server could make the README backup example write outside the current folder, through the file name of `admin.backup()`.
- `db.startTransaction()`, documented in the README, did not exist: use `db.beginTransaction()` or `db.transaction()`.
- `db.transaction()` hid the error of the callback when the rollback failed.
