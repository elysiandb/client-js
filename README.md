# ElysianDB TypeScript Client SDK

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The official TypeScript and JavaScript client for ElysianDB. This SDK provides a simple, typed, framework‑agnostic interface to ElysianDB's zero‑configuration, auto‑generated REST API.

ElysianDB is a lightweight, high‑performance key‑value datastore with an embedded backend API.

ElysianDB repository:
[https://github.com/elysiandb/elysiandb](https://github.com/elysiandb/elysiandb)

Docker:
[https://hub.docker.com/r/taymour/elysiandb](https://hub.docker.com/r/taymour/elysiandb)

Documentation:
[https://elysiandb.com/](https://elysiandb.com/)

This client is compatible with:
Node.js
Bun
Deno
Browsers
React, Vue, Svelte, Angular
Next.js, Nuxt, SvelteKit

## Installation

```
npm install @elysiandbjs/client
```

or

```
yarn add @elysiandbjs/client
```

## Basic Usage

```ts
import { ElysianDB } from "@elysiandbjs/client";

interface Article {
  id: string;
  title: string;
  tags: string[];
}

async function main() {
  const db = new ElysianDB({ baseUrl: "http://localhost:8089" });

  const articles = db.entity<Article>("articles");

  const created = await articles.create({
    title: "Hello from SDK",
    tags: ["sdk", "ts"]
  });

  console.log("Created", created);

  await articles.update(created.id, { title: "Updated title" });

  const list = await articles.list({ limit: 10 });
  console.log("List", list);
}

main();
```

## Entity API

### Creating a Client

```ts
const db = new ElysianDB({
  baseUrl: "http://localhost:8089",
  token: "optional-auth-token"
});
```

### Accessing an Entity

```ts
const articles = db.entity<Article>("articles");
```

### list(options)

```ts
const items = await articles.list({ limit: 20, offset: 0 });
```

### get(id)

```ts
const item = await articles.get("123");
```

### create(data)

```ts
const item = await articles.create({ title: "New", tags: [] });
```

### update(id, data)

```ts
await articles.update("123", { title: "Updated" });
```

### delete(id)

```ts
await articles.delete("123");
```

### count()

```ts
const value = await articles.count();
```

### countWithOptions()

```ts
const value = await articles.countWithOptions({
  filter: { "author.name": { eq: "Alice" } }
});
```

## Advanced Query Options

The `list` and `countWithOptions` methods support:
limit
offset
search
fields
includes
filter operators: eq, neq, lt, lte, gt, gte, contains, not_contains, all, any, none
sort

Example:

```ts
const list = await articles.list({
  limit: 20,
  includes: ["author", "author.job"],
  fields: ["title", "author.name"],
  filter: {
    "author.name": { eq: "Alice" },
    "tags": { contains: "sdk" }
  },
  sort: { createdAt: "desc" }
});
```

## Transactions

The SDK provides transactional support with automatic commit and rollback. A transaction groups multiple operations and ensures they are applied atomically.

### How Transactions Work

A transaction begins with `tx.begin()`. All operations (`write`, `update`, `delete`) are added to the transaction. At the end:

* If the transaction callback completes without throwing an error, it is committed.
* If any error occurs inside the transaction callback, the transaction is automatically rolled back and no change is applied.

### Automatic Commit or Rollback

```ts
await db.transaction(async tx => {
  await tx.write("articles", {
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
```

In this form:

* If all operations inside the callback succeed, the SDK sends `/commit` to ElysianDB.
* If any operation throws an exception, the SDK sends `/rollback`.

### Manual Transaction Control

```ts
const tx = db.startTransaction();

await tx.begin();

try {
  await tx.write("articles", { title: "A" });
  await tx.update("articles", "123", { title: "B" });
  await tx.commit();
} catch (e) {
  await tx.rollback();
}
```

This allows fine-grained control when needed.

## Raw Requests

```ts
const stats = await db.rawRequest("/stats", { method: "GET" });
```

## Project Status

The SDK currently supports entities, filtering, sorting, includes, counting, sub‑entities, and transactions. Future versions will extend support for migrations, KV commands, and more.
