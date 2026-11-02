# ElysianDB JavaScript & TypeScript クライアント

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · [Português](README.pt.md) · [中文](README.zh.md) · [한국어](README.ko.md) · **日本語**

> このドキュメントは翻訳版です。正式なリファレンスは[英語版の README](../../README.md) であり、翻訳より内容が新しい場合があります。

[ElysianDB](https://github.com/elysiandb/elysiandb) の公式クライアントです。ElysianDB は、JSON をそのまま REST API にするシングルバイナリのバックエンドです。本クライアントは ElysianDB 0.2.3 の HTTP API をすべてカバーしています。

- **ドキュメント**：型付き CRUD、一括書き込み、フィルター、検索、ソート、ページネーション、プロジェクション、インクルード、非同期イテレーション
- **Query API**：`and` / `or` のフィルターツリーと複数フィールドでのソート
- **トランザクション**：自動でコミットまたはロールバック
- **キー・バリューストア**：TTL 付きの値、複数キーの一括取得、ワイルドカード
- **認証**：`token`、`basic`、`user`（セッション）の各モード
- **管理**：エンティティタイプとスキーマ、マイグレーション、ユーザー、ACL、フック、エクスポート/インポート、バックアップ/リストア、モニタリングとログ
- **堅牢なリクエスト**：型付きエラー、タイムアウト、キャンセル、リトライ、リクエストフック

依存パッケージはなく、ES モジュール、CommonJS、TypeScript の型定義を同梱しています。Node.js 20 以降、Bun、Deno、ブラウザで動作します。

## 目次

- [インストール](#インストール)
- [クイックスタート](#クイックスタート)
- [接続](#接続)
- [認証](#認証)
- [ドキュメント](#ドキュメント)
- [名前・ID・キー](#名前idキー)
- [一覧取得とフィルタリング](#一覧取得とフィルタリング)
- [Query API](#query-api)
- [トランザクション](#トランザクション)
- [キー・バリューストア](#キーバリューストア)
- [エンティティタイプ・スキーマ・マイグレーション](#エンティティタイプスキーママイグレーション)
- [ユーザーと ACL](#ユーザーと-acl)
- [フック](#フック)
- [管理](#管理)
- [モニタリング](#モニタリング)
- [エラーハンドリング](#エラーハンドリング)
- [タイムアウト・リトライ・キャンセル](#タイムアウトリトライキャンセル)
- [リクエストフックと生のリクエスト](#リクエストフックと生のリクエスト)
- [ランタイムとブラウザ](#ランタイムとブラウザ)
- [API リファレンス](#api-リファレンス)
- [0.0.x からの移行](#00x-からの移行)
- [開発](#開発)

## インストール

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

ElysianDB サーバーがまだない場合は、次のコマンドで起動できます。

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## クイックスタート

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

`entity<T>()` を使うと結果に型が付きます。`create()` は `id` を含まないドキュメントを受け取り（ID は ElysianDB が生成します）、`update()` は任意のフィールドの組み合わせを受け取ります。

## 接続

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

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `auth` | なし | 認証情報：`{ token }`、`{ username, password }`、または `{ session }`。[認証](#認証)を参照してください。 |
| `headers` | `{}` | すべてのリクエストに追加するヘッダー。 |
| `timeout` | なし | リクエストのタイムアウト（ミリ秒）。 |
| `retries` | `0` | ネットワークエラー、または `429`、`502`、`503`、`504` のレスポンスを受けたときに、`GET`、`PUT`、`DELETE` リクエストをリトライする回数。 |
| `retryDelay` | `300` | 最初のリトライまでの待機時間（ミリ秒）。リトライのたびに 2 倍になります。`Retry-After` があればそれに従います。 |
| `fetch` | グローバルの `fetch` | 独自の `fetch` 実装。 |
| `credentials` | ランタイムのデフォルト | ブラウザからのリクエストの `credentials` モード。オリジンをまたいで `user` モードのセッションを使う場合は `"include"` を指定します。 |
| `onRequest` | なし | 各リクエストの前に呼ばれます。リクエストのヘッダーを変更できます。 |
| `onResponse` | なし | 成功・失敗にかかわらず、各レスポンスの後に呼ばれます。 |

サーバーが起動しているかどうかは `health()` で確認できます。このメソッドは例外を投げず、認証情報も必要ありません。

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## 認証

ElysianDB には 3 つの認証モード（`security.authentication.mode`）があります。モードに対応する認証情報をクライアントに渡してください。

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

`user` モードでは、`login()` がセッション（`edb_session` Cookie）を開始し、クライアントは以降のリクエストでそのセッションを送信します。ログインできるのは管理者ユーザーのみです。Node.js、Bun、Deno では、クライアントがセッション ID を `db.auth.session` に保持するため、保存しておいて後から再利用できます。

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

ブラウザではセッション Cookie が `HttpOnly` になります。Cookie はブラウザが保持し、`db.auth.session` は `undefined` のままです。ページと ElysianDB のオリジンが異なる場合は、ページのオリジンを `server.http.cors.allowedOrigins` に追加し、`credentials: "include"` を指定してクライアントを作成してください。

認証情報はいつでも変更できます。

| メンバー | 説明 |
| --- | --- |
| `db.auth.mode` | `"none"`、`"token"`、`"basic"`、または `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | 認証情報を切り替えます。 |
| `db.auth.login(username, password)` | セッションを開始します（`user` モード）。失敗が続くと `429` が返され、`error.retryAfter` が設定されます。 |
| `db.auth.logout()` | セッションを終了し、認証情報をクリアします。 |
| `db.auth.me()` | 現在のセッションのユーザーを返します。 |
| `db.auth.clear()` | 認証情報の送信を停止します。 |
| `db.auth.onChange(listener)` | 認証情報が変わったときに呼ばれます。購読を解除する関数を返します。 |

> `user` モードでは、一部のルートで管理者権限が必要です。対象はキー・バリューストア、`admin.*`、`entities.create()`、`setSchema()`、`migrate()`、`deleteAll()` です。ドキュメントのルートは [ACL](#ユーザーと-acl) に基づいてチェックされます。

## ドキュメント

```ts
const books = db.entity<Book>("books");
```

### 作成

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` は、まずすべてのドキュメントを検証します。1 つでも無効なものがあれば、何も書き込まれません。既存の `id` を渡すと、そのドキュメントは置き換えられます。

`@entity` キーを持つネストしたオブジェクトは別のドキュメントとして保存され、リンク（`{ "@entity": "authors", "id": "..." }`）に置き換えられます。リンク先は [`includes`](#一覧取得とフィルタリング) で展開できます。

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### 読み取り

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### 更新

更新は部分更新です。リクエストボディは保存済みのドキュメントにマージされます。フィールドを削除するには、値に `null` を指定します。

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

更新によってドキュメントが作成されることはありません。ドキュメントが存在しない場合、`update()` は `404` エラーを投げます。`updateMany()` は、対象のうち 1 つでも存在しなければ何も書き込みません。

### 削除

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### 件数の取得

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## 名前・ID・キー

エンティティ名、ドキュメント ID、キー、ユーザー名、フック ID は URL のパスに含まれますが、ElysianDB 0.2.3 はこれらを一貫した方法でデコードしません。そのため、パーセントエンコーディングが必要なキーや ID は、書き込めても読み戻せないことがあります。クライアントが受け付けるのは英字（`A-Z`、`a-z`）、数字、`- _ . ! ~ * ' ( ) : @ $ & + , ; =` だけで構成された値のみで、スペース、アクセント付き文字、`/`、`?`、`#`、`%` などを含む値には `TypeError` を投げます。すべてのドキュメントを読み戻せるように、`create()` と `createMany()` も渡された `id` を同じ方法でチェックします。

エンティティ名の制限はさらに厳しく、使えるのは英字、数字、`_`、`-`、`.` だけで、先頭に `.` は使えません。ElysianDB はエンティティ名からストレージキーとパターンを組み立てるため、`:` や `*` を含むと他のエンティティにまで影響します。たとえば `db.entity("books:id").deleteAll()` はすべての本を削除してしまいます。別のクライアントがほかの名前で作成したエンティティタイプには、`db.request()` と `encodeURIComponent()` を使えば引き続きアクセスできます。

ElysianDB が別の用途にルーティングする値や、`fetch` が URL から取り除いてしまう値も拒否されます。

| 値 | 拒否される場面 | 理由 |
| --- | --- | --- |
| `.` と `..` | すべての名前、ID、キー | `fetch` が URL から取り除くため、`books.delete(".")` がすべての本を削除してしまいます。 |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | エンティティ名 | `/api/query` は Query API、`/api/export` はエクスポートというように、すでに別のルートとして使われています。 |
| `count`, `schema` | `get()`、`update()`、`create()` のドキュメント ID | `GET /api/books/count` は本の件数を返します。`exists()` と `delete()` では引き続き使えます。 |
| `mget` | `kv.get()` と `kv.set()` のキー | `GET /kv/mget` は `mget()` のルートです。 |
| `*` を含むキー | `kv.get()` と `kv.set()` のキー | `*` は `mget()` と `delete()` のワイルドカードです。 |

また、ElysianDB 0.2.3 は一部のストレージキーを大文字・小文字を区別せずに比較します。大文字・小文字だけが異なるエンティティ名は使わないでください。`Books` に対して `deleteAll()` を実行すると、`books` のインデックスが削除されてしまいます。

また、クライアントは HTTP リダイレクトにも従いません。リダイレクトに従うと、認証情報を含むリクエストが別の URL に再送されてしまうためです。リダイレクトは、移動先を示す `ElysianDBError` として失敗します。このエラーが発生した場合は、サーバーの URL を確認してください。

## 一覧取得とフィルタリング

`list()` は、オプションを `GET /api/<entity>` のパラメーターに変換します。

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

| オプション | 説明 |
| --- | --- |
| `filter` | フィールドに対する条件で、すべてに一致する必要があります。パスはネストでき（`author.name`）、配列やインクルードしたエンティティもたどれます。 |
| `search` | ドキュメント（およびインクルードしたエンティティ）の文字列値を、大文字・小文字を区別せずに検索します。`*` を含めると、値全体に対する glob になります（例：`Zeb*`）。 |
| `sort` | 1 つのフィールドでソートします（例：`{ createdAt: "desc" }`）。複数のフィールドでソートするには [`query()`](#query-api) を使います。 |
| `fields` | 指定したフィールドだけを返します。 |
| `includes` | リンクされたエンティティを展開します（例：`["author", "author.job"]`、または `"all"`）。 |
| `limit`, `offset` | ページネーション。フィルターと検索の後に適用されます。`limit` は正の整数、`offset` は 0 以上の整数である必要があります。それ以外の値は ElysianDB に無視され、すべてのドキュメントが返されてしまいます。 |

### フィルター演算子

| 演算子 | 文字列 | 数値と日付 | 配列 |
| --- | --- | --- | --- |
| `eq` | 等しい（大文字・小文字を区別しない、`*` で glob） | 等しい | リストと同じ要素を持つ |
| `neq` | 等しくない（`*` で glob） | 等しくない | — |
| `lt`, `lte`, `gt`, `gte` | 辞書順で比較 | より小さい / より大きい | — |
| `contains` | 部分文字列を含む | — | 値と等しい要素を持つ |
| `not_contains` | 部分文字列を含まない | — | 値と等しい要素を持たない |
| `all` | — | — | リストの値をすべて持つ |
| `any` | — | — | リストの値を少なくとも 1 つ持つ |
| `none` | — | — | リストの値をどれも持たない |

値には文字列、数値、真偽値、`Date` オブジェクト（ISO 8601 形式で送信）を使えます。`eq`、`all`、`any`、`none` では、配列はカンマ区切りのリストとして送信されます。対象のフィールドを持たないドキュメントや、値が `null` のドキュメントは、どの条件にも一致しません。

### ページネーション用ヘルパー

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

変更される可能性のあるデータを順に読み込む場合は、ページの内容が安定するよう `sort` を指定してください。

`iterate()` と `listAll()` は、`pageSize` より短いページに達し、かつ `count()` ですべてのドキュメントを読み込んだことを確認した時点で停止します。`user` モードの ElysianDB 0.2.3 は、`read` ではなく `owning_read` を付与する ACL を `limit` と `offset` の適用後に評価するため、最後に達する前でもページが短くなったり空になったりすることがあります。その場合、クライアントは残りのドキュメントを 1 回のリクエストでまとめて取得します。`list()` と `first()` はこの状況を検出できないため、`limit` より少ないドキュメントしか返さないことがあります。

## Query API

`query()` は `POST /api/query` を使います。これにより、`and` / `or` のフィルターツリーと、複数フィールドでのソートが利用できます。

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

`and()` と `or()` は省略可能なヘルパーで、`{ or: [...] }` と書いても同じように動作します。1 つのノードにフィールド条件と `and` / `or` を混在させることもできます。ElysianDB は 1 つのノードにつきどちらか一方しか読み取らないため、クライアントがそのノードを `and` に変換します。

**`list()` と `query()` のどちらを使うか**

| | `list()` | `query()` |
| --- | --- | --- |
| フィールド条件（すべてに一致） | ✓ | ✓ |
| `and` / `or` のツリー | | ✓ |
| 複数のソートキー | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## トランザクション

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` は、コールバックが解決されるとコミットし、その戻り値を返します。コールバックが例外を投げた場合は、ロールバックしたうえでそのエラーを再スローします。

- 操作はサーバー側のキューに積まれ、コミット時にすべて適用されるか、まったく適用されないかのどちらかになります。スキーマエラーや、その時点ですでに存在しないドキュメントの更新が含まれていると、コミット全体が `400` エラーで拒否されます。
- `tx.create()` は `id` 付きのドキュメントを返します（`id` がない場合はクライアントが生成します）。これにより、同じトランザクション内の他のドキュメントからリンクできます（`{ "@entity": "authors", id: author.id }`）。
- `tx.update()` は、すでに保存されているドキュメントにのみ使えます。ElysianDB 0.2.3 は更新をキューに積む時点でドキュメントの存在を確認するため、同じトランザクション内で作成したドキュメントを更新すると `400` エラーになります。その場合は、すべてのフィールドを `tx.create()` に含めてください。
- キューに積まれた操作は、コミットされるまで、このクライアントからも他のクライアントからも読み取れません。
- 同じ操作が二重にキューに積まれたり適用されたりしないよう、操作とコミットはリトライされません。ElysianDB は開いたままのトランザクションを期限切れにしないため、コミットに応答がない場合（ネットワークエラー、タイムアウト、中断）、クライアントはトランザクションをロールバックします。ただし、コミットが ElysianDB に届いていれば適用済みの可能性があるため、再試行する前に確認してください。
- `tx.entity<T>("books")` を使うと、1 つのエンティティに対して型付きの `create`、`update`、`delete` を利用できます。

トランザクションを自分で制御する場合は、次のように書きます。

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

## キー・バリューストア

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

値は文字列です。キーは[名前と ID のルール](#名前idキー)に従います。`mget()` と `delete()` では `*` がワイルドカードとして扱われ、パターンでは大文字・小文字が区別されません。たとえば `delete("Cache:*")` は `cache:1` も削除します。`mget()` のキーには `,` を含められません。`user` モードでは、キー・バリューストアの利用に管理者権限が必要です。

## エンティティタイプ・スキーマ・マイグレーション

エンティティタイプは、最初のドキュメントが書き込まれたときに作成されます。厳密なスキーマを付けて事前に宣言することもできます。

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

エンティティタイプのスキーマは、読み取ることも置き換えることもできます。手動で定義したスキーマは、未知のフィールドや必須フィールドの欠落を拒否します。

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

フィールドの型は `string`、`number`、`boolean`、`object`（ネストした `fields` を持つ）、`array` です。スキーマに違反する書き込みは、[`validationErrors`](#エラーハンドリング) を含むエラーを投げます。

マイグレーションは、ネストしたパスも含めて、エンティティタイプのすべてのドキュメントを更新します。

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## ユーザーと ACL

これらのルートは `user` モードでのみ利用でき、管理者のセッションが必要です。

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACL は、ユーザーとエンティティタイプの組み合わせごとに権限を付与します。権限には `create`、`read`、`update`、`delete` と、ユーザーが所有するドキュメント（`_elysiandb_core_username` フィールドで判定）に対する `owning_read`、`owning_update`、`owning_delete` があります。

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## フック

フックは、ElysianDB が読み取り時に実行する JavaScript 関数です（`api.hooks.enabled: true` が必要）。操作には管理者の認証情報が必要です。

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

`user` モードでは、これらの呼び出しに管理者権限が必要です。

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

ドキュメントをエクスポート・インポートできます（アカウント、ACL、スキーマ、KV のキーは含まれません）。

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

アカウントを含め、インスタンス全体をバックアップ・リストアできます。

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` はサーバーから返される値ですが、常にフォルダーを含まない単純な `.tar.gz` のファイル名になります。サーバーが書き込み先を指定できないよう、クライアントはそれ以外の名前を `elysiandb-backup.tar.gz` に置き換えます。

リストアはすべてのデータを置き換え、現在のセッションを含むすべてのセッションを終了します。HTTP API が受け付けるアーカイブは 4 MB までです。それより大きなインスタンスには `elysiandb backup` と `elysiandb restore` を使ってください。アーカイブにはパスワードハッシュが含まれるため、データフォルダーと同じように安全に保管してください。

## モニタリング

Admin UI が使うモニタリング用エンドポイントです。管理者の認証情報が必要です。

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

`monitoring.prometheus.token` を設定している場合は、`metrics()` にそのトークンを渡してください：`db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`。

## エラーハンドリング

リクエストが失敗すると、すべてのメソッドが `ElysianDBError` を投げます。

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

| プロパティ | 説明 |
| --- | --- |
| `code` | `"HTTP_ERROR"`（ElysianDB が 4xx/5xx またはリダイレクトを返した場合）、`"NETWORK_ERROR"`、`"TIMEOUT"`、または `"ABORTED"` |
| `status` | HTTP ステータス。レスポンスを受信できなかった場合は `0` |
| `message` | メソッド、パス、ステータス、および ElysianDB のメッセージ |
| `data` | パース済みのレスポンスボディ |
| `validationErrors` | 拒否された書き込み、一括書き込み（`index`）、インポートの `{ field, message, index?, entity?, id? }[]` |
| `requestId` | レスポンスの `X-Request-Id` |
| `retryAfter` | `429` を受けた後に待機すべき秒数 |
| `method`, `url` | 失敗したリクエスト |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | 判定用のショートカット |

## タイムアウト・リトライ・キャンセル

デフォルト値はクライアントに設定し、呼び出しごとに各メソッドの最後の引数で上書きできます。

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

呼び出しごとに指定できるオプションは `signal`、`timeout`、`retries`、`requestId`（`X-Request-Id` として送信）、`headers` です。

リトライされるのは冪等なリクエスト（`GET`、`PUT`、`DELETE`）のみで、ネットワークエラー、または `429`、`502`、`503`、`504` のレスポンスを受けた場合に限られます。`create()`、ログイン、コミットなどの `POST` リクエストや、トランザクション内の操作はリトライされません。

## リクエストフックと生のリクエスト

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

`request()` を使うと任意のルートを呼び出せます。ステータスとヘッダーも取得したい場合は `send()` を使います。

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## ランタイムとブラウザ

- Node.js 20 以降、Bun、Deno、ブラウザ：クライアントに必要なのは `fetch` だけです。それ以外の環境では、オプションで `fetch` を渡してください。
- ES モジュール（`import`）と CommonJS（`require`）の両方を、TypeScript の型定義付きで公開しています。
- ブラウザから別オリジンの ElysianDB を呼び出せるのは、そのページのオリジンが `server.http.cors.allowedOrigins` に登録されている場合だけです。
- 管理者の認証情報やインスタンスのトークンをブラウザに渡さないでください。

ElysianDB 0.2.3 では、別オリジンのページからできることに次の制限があります。

- `X-Request-Id` ヘッダーは許可されていないため、`requestId` オプションを付けたリクエストは CORS のプリフライトで失敗します。別オリジンを呼び出すブラウザでは `requestId` を指定しないでください。
- レスポンスヘッダーは公開されません。そのため `health().version` は `null`、`error.requestId` と `error.retryAfter` は `undefined` になり、`send()` から参照できるのは `Content-Type` などの CORS セーフリストに含まれるヘッダーだけです。また、`admin.backup()` のファイル名は `elysiandb-backup.tar.gz` になります。

`tx.create()` は `crypto.randomUUID()` で ID を生成します。HTTPS で配信されていないページでは `crypto.getRandomValues()` を使います。

## API リファレンス

| 呼び出し | ルート |
| --- | --- |
| **クライアント** | |
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

## 0.0.x からの移行

ほとんどのコードはそのまま動作します。変更点は次のとおりです。

| 0.0.x | 現在 |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | 引き続き動作しますが、`createClient(url, { auth: { token } })` を推奨します。 |
| 失敗したリクエストはエラーのボディで解決されていた | `ElysianDBError` を投げます。 |
| `count()` は `{ count }` を返していた | `count()` は数値を返します。 |
| `countWithOptions(options)` | `count(options)`（旧名も引き続き使えます）。 |
| `tx.write(entity, data)` | `tx.create(entity, data)`（旧名も引き続き使えます）。 |
| `db.transaction()` は `undefined` で解決されていた | コールバックが返した値で解決されます。 |
| `db.rawRequest(path, init)` | `db.request(method, path, options)`（旧メソッドも引き続き使えます）。 |
| `dist/index.js` からのインポート | パッケージに `exports` マップが定義されているため、`@elysiandbjs/client` からのみインポートしてください。 |

## 開発

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

統合テストは、認証モードごとに 1 つずつ起動した実際の ElysianDB サーバーに対して実行します。

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

CI では ElysianDB 0.2.3 をソースからビルドし、両方のテストスイートを実行します。

リリースするには、最新の `main` ブランチで `make release`（または `make release VERSION=minor`）を実行します。バージョンを上げてタグをプッシュすると、Release ワークフローが CI を実行し、provenance 付きでパッケージを npm に公開します。このワークフローには `NPM_TOKEN` シークレットが必要です。

`README.md` がリファレンスドキュメントです。まず `README.md` を更新し、その後 [`docs/i18n`](./) の翻訳を更新してください。翻訳は npm には公開されません。`CHANGELOG.md` は英語のみです。

## ライセンス

MIT
