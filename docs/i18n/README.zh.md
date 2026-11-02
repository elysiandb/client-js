# ElysianDB JavaScript 与 TypeScript 客户端

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · [Português](README.pt.md) · **中文** · [한국어](README.ko.md) · [日本語](README.ja.md)

> 本文是译文。请以英文版 [README](../../README.md) 为准，英文版的内容可能比本译文更新。

[ElysianDB](https://github.com/elysiandb/elysiandb) 的官方客户端。ElysianDB 是一个单二进制文件的后端，能把 JSON 直接变成 REST API。本客户端覆盖了 ElysianDB 0.2.3 的全部 HTTP API：

- **文档**：类型化 CRUD、批量写入、过滤、搜索、排序、分页、字段投影、关联展开、异步迭代
- **Query API**：`and` / `or` 过滤树，以及多字段排序
- **事务**：自动提交或回滚
- **键值存储**：支持 TTL、批量读取和通配符
- **身份验证**：`token`、`basic` 和 `user`（会话）三种模式
- **管理**：实体类型与模式、迁移、用户、ACL、钩子、导出/导入、备份/恢复、监控与日志
- **可靠的请求**：类型化错误、超时、取消、重试、请求钩子

零依赖，同时提供 ES 模块、CommonJS 和 TypeScript 类型定义，可运行于 Node.js 20+、Bun、Deno 和浏览器。

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [连接](#连接)
- [身份验证](#身份验证)
- [文档](#文档)
- [名称、ID 与键](#名称id-与键)
- [列表与过滤](#列表与过滤)
- [Query API](#query-api)
- [事务](#事务)
- [键值存储](#键值存储)
- [实体类型、模式与迁移](#实体类型模式与迁移)
- [用户与 ACL](#用户与-acl)
- [钩子](#钩子)
- [管理](#管理)
- [监控](#监控)
- [错误处理](#错误处理)
- [超时、重试与取消](#超时重试与取消)
- [请求钩子与原始请求](#请求钩子与原始请求)
- [运行时与浏览器](#运行时与浏览器)
- [API 参考](#api-参考)
- [从 0.0.x 迁移](#从-00x-迁移)
- [开发](#开发)

## 安装

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

如果还没有 ElysianDB 服务器，可以这样启动一个：

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## 快速开始

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

`entity<T>()` 返回带类型的结果：`create()` 接收不含 `id` 的文档（由 ElysianDB 生成），`update()` 接收任意字段子集。

## 连接

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

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `auth` | 无 | 凭据：`{ token }`、`{ username, password }` 或 `{ session }`。参见[身份验证](#身份验证)。 |
| `headers` | `{}` | 添加到每个请求的请求头。 |
| `timeout` | 无 | 请求超时时间，单位为毫秒。 |
| `retries` | `0` | 遇到网络错误或 `429`、`502`、`503`、`504` 响应时，`GET`、`PUT` 和 `DELETE` 请求的重试次数。 |
| `retryDelay` | `300` | 首次重试前的等待时间（毫秒），之后每次重试翻倍。会遵循 `Retry-After`。 |
| `fetch` | 全局 `fetch` | 自定义的 `fetch` 实现。 |
| `credentials` | 运行时默认值 | 浏览器请求的 `credentials` 模式。跨源使用 `user` 模式的会话时，设为 `"include"`。 |
| `onRequest` | 无 | 每个请求发出前调用，可以修改请求头。 |
| `onResponse` | 无 | 每个响应返回后调用，无论成功与否。 |

用 `health()` 检查服务器是否正常运行。它从不抛出异常，也不需要凭据：

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## 身份验证

ElysianDB 有三种身份验证模式（`security.authentication.mode`）。向客户端传入对应的凭据即可：

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

在 `user` 模式下，`login()` 会打开一个会话（`edb_session` cookie），客户端会在后续请求中携带它。只有管理员用户才能登录。在 Node.js、Bun 和 Deno 中，客户端会把会话 ID 保存在 `db.auth.session` 中，你可以把它存起来，稍后复用：

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

在浏览器中，会话 cookie 是 `HttpOnly` 的：它由浏览器保管，`db.auth.session` 始终为 `undefined`。如果页面与 ElysianDB 不同源，请把页面的源加入 `server.http.cors.allowedOrigins`，并以 `credentials: "include"` 创建客户端。

凭据可以随时更改：

| 成员 | 说明 |
| --- | --- |
| `db.auth.mode` | `"none"`、`"token"`、`"basic"` 或 `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | 切换凭据。 |
| `db.auth.login(username, password)` | 打开会话（`user` 模式）。多次失败后会返回 `429`，并附带 `error.retryAfter`。 |
| `db.auth.logout()` | 结束会话并清除凭据。 |
| `db.auth.me()` | 当前会话的用户。 |
| `db.auth.clear()` | 不再发送凭据。 |
| `db.auth.onChange(listener)` | 凭据变化时调用。返回一个取消订阅的函数。 |

> 在 `user` 模式下，部分路由需要管理员权限：键值存储、`admin.*`、`entities.create()`、`setSchema()`、`migrate()` 和 `deleteAll()`。文档相关的路由则按 [ACL](#用户与-acl) 进行权限检查。

## 文档

```ts
const books = db.entity<Book>("books");
```

### 创建

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` 会先校验所有文档：只要有一个无效，就什么都不写入。传入已存在的 `id` 会替换对应的文档。

带有 `@entity` 键的嵌套对象会作为独立文档存储，并替换为一个链接（`{ "@entity": "authors", "id": "..." }`）。可以用 [`includes`](#列表与过滤) 将其展开：

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### 读取

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### 更新

更新是部分更新：请求体会合并到已存储的文档中。把字段设为 `null` 即可删除该字段。

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

更新永远不会创建文档：文档不存在时，`update()` 会抛出 `404` 错误；只要其中有一个文档不存在，`updateMany()` 就什么都不写入。

### 删除

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### 计数

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## 名称、ID 与键

实体名称、文档 ID、键、用户名和钩子 ID 都会出现在 URL 路径中，而 ElysianDB 0.2.3 对它们的解码并不一致：需要百分号编码的值可能写得进去，却读不回来。因此客户端只接受由字母（`A-Z`、`a-z`）、数字以及 `- _ . ! ~ * ' ( ) : @ $ & + , ; =` 组成的值，其他字符一律抛出 `TypeError`，例如空格、带重音的字母、`/`、`?`、`#` 或 `%`。`create()` 和 `createMany()` 也会以同样的方式检查你传入的 `id`，确保每个文档都能读回。

有些值会被拒绝，原因是 ElysianDB 会把它们路由到别处，或者 `fetch` 会把它们从 URL 中移除：

| 值 | 在哪里被拒绝 | 原因 |
| --- | --- | --- |
| `.` 和 `..` | 任何名称、ID 或键 | `fetch` 会把它们从 URL 中移除：`books.delete(".")` 会删除所有书。 |
| `query`、`export`、`import`、`backup`、`restore`、`tx`、`entity`、`hook`、`acl`、`security` | 实体名称 | `/api/query` 是 Query API，`/api/export` 是导出接口，以此类推。 |
| `count`、`schema` | `get()`、`update()` 和 `create()` 中的文档 ID | `GET /api/books/count` 用于统计书的数量。`exists()` 和 `delete()` 仍然接受这两个值。 |
| `mget` | `kv.get()` 和 `kv.set()` 中的键 | `GET /kv/mget` 是 `mget()` 的路由。 |

客户端也从不跟随 HTTP 重定向，因为重定向会把请求连同凭据一起重放到另一个 URL 上。遇到重定向时，请求会以 `ElysianDBError` 失败，错误中会给出新的地址：如果遇到这种情况，请检查服务器的 URL。

## 列表与过滤

`list()` 会把它的选项映射为 `GET /api/<entity>` 的参数：

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

| 选项 | 说明 |
| --- | --- |
| `filter` | 字段条件，必须全部满足。路径可以嵌套（`author.name`），也可以穿过数组和被展开的实体。 |
| `search` | 在文档（以及被展开实体）的字符串值中进行不区分大小写的搜索。带 `*` 时，对整个值做 glob 匹配：`Zeb*`。 |
| `sort` | 单个字段：`{ createdAt: "desc" }`。多字段排序请使用 [`query()`](#query-api)。 |
| `fields` | 只返回这些字段。 |
| `includes` | 展开关联实体：`["author", "author.job"]`，或 `"all"`。 |
| `limit`、`offset` | 分页，在过滤和搜索之后应用。`limit` 必须是正整数，`offset` 必须是非负整数：对于其他值，ElysianDB 会直接忽略并返回所有文档。 |

### 过滤运算符

| 运算符 | 字符串 | 数字与日期 | 数组 |
| --- | --- | --- | --- |
| `eq` | 等于，不区分大小写，支持 `*` glob | 等于 | 元素与列表相同 |
| `neq` | 不等于，支持 `*` glob | 不等于 | — |
| `lt`、`lte`、`gt`、`gte` | 按字典序比较 | 小于 / 大于 | — |
| `contains` | 包含该子串 | — | 存在等于该值的元素 |
| `not_contains` | 不包含该子串 | — | 不存在等于该值的元素 |
| `all` | — | — | 包含列表中的每一个值 |
| `any` | — | — | 至少包含列表中的一个值 |
| `none` | — | — | 不包含列表中的任何值 |

值可以是字符串、数字、布尔值或 `Date` 对象（以 ISO 8601 格式发送）。对于 `eq`、`all`、`any` 和 `none`，数组会以逗号分隔的列表发送。缺少该字段或该字段为 `null` 的文档永远不会匹配。

### 分页辅助方法

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

遍历会变化的数据时，请指定 `sort`，以保证分页稳定。

`iterate()` 和 `listAll()` 遇到第一个短于 `pageSize` 的页面，并且 `count()` 确认所有文档都已读取后，才会停止。在 `user` 模式下，对于授予了 `owning_read` 但未授予 `read` 的 ACL，ElysianDB 0.2.3 会在 `limit` 和 `offset` 之后才应用它，因此在到达末尾之前，某一页可能偏短甚至为空：这时客户端会用一个请求取回剩余的文档。`list()` 和 `first()` 无法检测到这种情况，因此可能返回少于 `limit` 条的文档。

## Query API

`query()` 使用 `POST /api/query`，额外支持 `and` / `or` 过滤树和多字段排序：

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

`and()` 和 `or()` 只是可选的辅助函数，直接写 `{ or: [...] }` 也可以。一个节点可以同时包含字段条件和 `and` / `or`；由于 ElysianDB 每个节点只会读取其中一种，客户端会把它转换为一个 `and`。

**用 `list()` 还是 `query()`？**

| | `list()` | `query()` |
| --- | --- | --- |
| 字段条件（必须全部满足） | ✓ | ✓ |
| `and` / `or` 树 | | ✓ |
| 多个排序键 | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## 事务

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

回调成功完成时，`transaction()` 会提交事务并返回回调的结果。回调抛出异常时，它会回滚事务并重新抛出该错误。

- 操作会在服务器端排队，并在提交时应用，要么全部生效，要么全部不生效。如果出现模式错误，或者要更新的文档在提交时已不存在，整个提交都会以 `400` 错误被拒绝。
- `tx.create()` 返回带 `id` 的文档（未提供 `id` 时由客户端生成），这样事务中的其他文档就能链接到它（`{ "@entity": "authors", id: author.id }`）。
- `tx.update()` 只适用于已经存储的文档：ElysianDB 0.2.3 会在更新入队时检查文档是否存在，因此更新同一事务中创建的文档会以 `400` 错误失败。这种情况下，请直接在 `tx.create()` 中写入所有字段。
- 提交之前，排队中的操作无法被读取，无论是本客户端还是其他客户端。
- 操作和提交都不会重试，以免有内容被重复入队或重复应用。ElysianDB 不会让未结束的事务过期：如果提交没有收到响应（网络错误、超时或中止），客户端会回滚该事务。不过，如果提交已经到达 ElysianDB，它仍可能已被应用，所以重试之前请先确认。
- `tx.entity<T>("books")` 为单个实体提供带类型的 `create`、`update` 和 `delete`。

如果要手动控制事务：

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

## 键值存储

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

值都是字符串。键遵循[名称与 ID 的规则](#名称id-与键)：在 `mget()` 和 `delete()` 中，`*` 是通配符；`mget()` 的键不能包含 `,`。`mget()` 返回一个没有原型的对象，因此每个键（包括 `__proto__`）都是它的自有属性。在 `user` 模式下，键值存储需要管理员权限。

## 实体类型、模式与迁移

实体类型会在写入第一个文档时自动创建，也可以预先用严格模式来声明：

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

读取或替换实体类型的模式。手动定义的模式会拒绝未知字段，也会拒绝缺少必填字段的写入：

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

字段类型有 `string`、`number`、`boolean`、`object`（可带嵌套的 `fields`）和 `array`。违反模式的写入会抛出带有 [`validationErrors`](#错误处理) 的错误。

迁移会更新某个实体类型的所有文档，嵌套路径也同样适用：

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## 用户与 ACL

这些路由仅在 `user` 模式下存在，并且需要管理员会话。

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACL 按用户和实体类型授予权限：`create`、`read`、`update`、`delete`，以及针对用户自己拥有的文档（即 `_elysiandb_core_username` 字段为该用户的文档）的 `owning_read`、`owning_update`、`owning_delete`。

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## 钩子

钩子是 ElysianDB 在读取时执行的 JavaScript 函数（`api.hooks.enabled: true`）。使用钩子需要管理员凭据。

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

## 管理

在 `user` 模式下，这些调用需要管理员权限。

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

导出和导入文档（不包括账户、ACL、模式和 KV 键）：

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

备份和恢复整个实例，包括账户：

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` 由服务器返回，但它始终是一个不含目录的普通 `.tar.gz` 文件名：其他任何名称都会被客户端替换为 `elysiandb-backup.tar.gz`，这样服务器就无法决定你把文件写到哪里。

恢复会替换全部数据，并结束所有会话，包括当前会话。HTTP API 只接受最大 4 MB 的归档：更大的实例请使用 `elysiandb backup` 和 `elysiandb restore`。归档中包含密码哈希：请像对待数据目录一样妥善保管。

## 监控

Admin UI 所用的监控端点，需要管理员凭据：

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

如果设置了 `monitoring.prometheus.token`，调用 `metrics()` 时需要传入该令牌：`db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`。

## 错误处理

请求失败时，所有方法都会抛出 `ElysianDBError`：

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

| 属性 | 说明 |
| --- | --- |
| `code` | `"HTTP_ERROR"`（ElysianDB 返回了 4xx/5xx 或重定向）、`"NETWORK_ERROR"`、`"TIMEOUT"` 或 `"ABORTED"` |
| `status` | HTTP 状态码，未收到响应时为 `0` |
| `message` | 方法、路径、状态码以及 ElysianDB 返回的消息 |
| `data` | 解析后的响应体 |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]`，用于被拒绝的写入、批量写入（`index`）和导入 |
| `requestId` | 响应的 `X-Request-Id` |
| `retryAfter` | 收到 `429` 后需要等待的秒数 |
| `method`、`url` | 失败的请求 |
| `isNotFound`、`isUnauthorized`、`isForbidden`、`isConflict`、`isRateLimited`、`isValidationError`、`isAbort` | 快捷判断属性 |

## 超时、重试与取消

在客户端上设置默认值，并可通过任意方法的最后一个参数在单次调用中覆盖：

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

单次调用的选项有 `signal`、`timeout`、`retries`、`requestId`（作为 `X-Request-Id` 发送）和 `headers`。

只有幂等请求（`GET`、`PUT`、`DELETE`）会在网络错误或 `429`、`502`、`503`、`504` 响应之后重试。`POST` 请求（例如 `create()`、登录或提交）以及事务中的操作永远不会重试。

## 请求钩子与原始请求

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

用 `request()` 可以调用任意路由；如果还需要状态码和响应头，请使用 `send()`：

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## 运行时与浏览器

- Node.js 20 及以上版本、Bun、Deno 和浏览器：客户端只依赖 `fetch`。在其他环境中，请通过选项传入 `fetch`。
- 同时发布 ES 模块（`import`）和 CommonJS（`require`）两种格式，并附带 TypeScript 类型。
- 只有当某个源被列入 `server.http.cors.allowedOrigins` 时，浏览器才能从该源跨域调用 ElysianDB。
- 不要把管理员凭据或实例令牌下发到浏览器。

ElysianDB 0.2.3 对跨源页面有以下限制：

- 不允许使用 `X-Request-Id` 请求头：带 `requestId` 选项的请求无法通过 CORS 预检。在浏览器中跨源调用时，请不要设置 `requestId`。
- 响应头不会暴露给页面：`health().version` 为 `null`，`error.requestId` 和 `error.retryAfter` 为 `undefined`，`send()` 只能看到 `Content-Type` 等 CORS 安全列表中的响应头，`admin.backup()` 会把文件命名为 `elysiandb-backup.tar.gz`。

`tx.create()` 使用 `crypto.randomUUID()` 生成 ID；在未通过 HTTPS 提供的页面上，则使用 `crypto.getRandomValues()`。

## API 参考

| 调用 | 路由 |
| --- | --- |
| **客户端** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | 任意 |
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

## 从 0.0.x 迁移

大部分代码无需修改即可继续使用。变更如下：

| 0.0.x | 现在 |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | 仍然可用。推荐使用 `createClient(url, { auth: { token } })`。 |
| 请求失败时，以错误响应体 resolve | 改为抛出 `ElysianDBError`。 |
| `count()` 返回 `{ count }` | `count()` 返回一个数字。 |
| `countWithOptions(options)` | `count(options)`（旧名称仍然可用）。 |
| `tx.write(entity, data)` | `tx.create(entity, data)`（旧名称仍然可用）。 |
| `db.transaction()` resolve 为 `undefined` | 现在 resolve 为回调的返回值。 |
| `db.rawRequest(path, init)` | `db.request(method, path, options)`（旧方法仍然可用）。 |
| 从 `dist/index.js` 导入 | 包现在提供 `exports` 映射：请只从 `@elysiandbjs/client` 导入。 |

## 开发

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

集成测试在真实的 ElysianDB 服务器上运行，每种身份验证模式各一个：

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

CI 会从源码构建 ElysianDB 0.2.3，并运行这两套测试。

发布时，在最新的 `main` 分支上运行 `make release`（或 `make release VERSION=minor`）：它会升级版本号并推送标签，随后 Release 工作流会运行 CI，并把包连同来源证明（provenance）一起发布到 npm。该工作流需要 `NPM_TOKEN` 这个 secret。

`README.md` 是权威的参考文档：请先修改它，再更新 [`docs/i18n`](./) 中的译文，这些译文不会发布到 npm。`CHANGELOG.md` 只有英文版。

## 许可证

MIT
