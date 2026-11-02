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

### Changed

- Failed requests throw an `ElysianDBError` instead of resolving with the error body, and non-JSON answers (such as `Invalid JSON`) no longer crash the client.
- `count()` returns a number instead of `{ count }`.
- `list()` throws when `sort` has several fields, since ElysianDB only applies one: use `query()`.
- `Content-Type: application/json` is only sent with JSON bodies, which avoids a CORS preflight on browser reads.
- Path segments keep the characters allowed in a URL path (`:`, `@`, `*`...), since ElysianDB does not decode them.
- Build output moved to `dist/cjs`, `dist/esm` and `dist/types`.
- The demo is now `examples/demo.mjs`.

### Deprecated

- `baseUrl` and `token` options: use `url` and `auth: { token }`.
- `countWithOptions()`: use `count(options)`.
- `tx.write()`: use `tx.create()`.
- `rawRequest()`: use `request()`.

### Fixed

- `db.startTransaction()`, documented in the README, did not exist: use `db.beginTransaction()` or `db.transaction()`.
- `db.transaction()` hid the error of the callback when the rollback failed.
