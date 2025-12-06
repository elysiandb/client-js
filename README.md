# ElysianDB TypeScript Client SDK

The official TypeScript and JavaScript client for ElysianDB. This SDK provides a simple, typed, and framework-agnostic interface to the ElysianDB HTTP API.

## Overview

ElysianDB is a lightweight, high-performance key value datastore with an automatic REST API. The TypeScript client allows developers to interact with any ElysianDB instance using a clean and structured API.

This client is compatible with:

Node.js
Bun
Deno
Browsers
React, Vue, Svelte, Angular
Next.js, Nuxt, SvelteKit

## Installation

```
npm install @elysiandb/client
```

or

```
yarn add @elysiandb/client
```

## Basic Usage

```ts
import { ElysianDB } from "@elysiandb/client";

interface Article {
  id: string;
  title: string;
  tags: string[];
}

async function main() {
  const db = new ElysianDB({ baseUrl: "http://localhost:8089" });

  const articles = db.entity<Article>("articles");

  const created = await articles.create({
    id: "" as any,
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

## API Reference

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

### Methods

#### list(options)

Returns an array of entities.

```ts
const items = await articles.list({ limit: 20, offset: 0 });
```

#### get(id)

Fetches a single entity.

```ts
const item = await articles.get("123");
```

#### create(data)

Creates a new entity.

```ts
const item = await articles.create({ id: "" as any, title: "New", tags: [] });
```

#### update(id, data)

Updates an entity.

```ts
await articles.update("123", { title: "Updated" });
```

#### delete(id)

Deletes an entity.

```ts
await articles.delete("123");
```

#### count()

Returns the count of documents.

```ts
const result = await articles.count();
```

## Raw Requests

```ts
const stats = await db.rawRequest("/stats", { method: "GET" });
```

## Project Status

This is the initial version of the TypeScript client. Future versions will add support for advanced features such as filters, sorting, includes, migrations, KV commands, and transactions.
