# ElysianDB JavaScript & TypeScript 클라이언트

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · [Português](README.pt.md) · [中文](README.zh.md) · **한국어** · [日本語](README.ja.md)

> 이 문서는 번역본입니다. 기준 문서는 [영어 README](../../README.md)이며, 이 번역보다 더 최신 내용을 담고 있을 수 있습니다.

[ElysianDB](https://github.com/elysiandb/elysiandb)의 공식 클라이언트입니다. ElysianDB는 JSON을 REST API로 바꿔 주는 단일 바이너리 백엔드입니다. 이 클라이언트는 ElysianDB 0.2.3의 HTTP API 전체를 지원합니다:

- **문서**: 타입이 지정된 CRUD, 일괄 쓰기, 필터, 검색, 정렬, 페이지네이션, 프로젝션, 연관 엔티티 포함(includes), 비동기 이터레이션
- **Query API**: `and` / `or` 필터 트리, 여러 필드 기준 정렬
- **트랜잭션**: 자동 커밋 또는 롤백
- **키–값 저장소**: TTL이 있는 값, 다중 조회, 와일드카드
- **인증**: `token`, `basic`, `user`(세션) 모드
- **관리**: 엔티티 타입과 스키마, 마이그레이션, 사용자, ACL, 훅, 내보내기/가져오기, 백업/복원, 모니터링과 로그
- **견고한 요청 처리**: 타입이 지정된 오류, 타임아웃, 취소, 재시도, 요청 훅

의존성이 없고, ES 모듈, CommonJS, TypeScript 타입을 함께 제공하며, Node.js 20+, Bun, Deno, 브라우저에서 동작합니다.

## 목차

- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [연결](#연결)
- [인증](#인증)
- [문서](#문서)
- [이름, ID, 키](#이름-id-키)
- [목록 조회와 필터링](#목록-조회와-필터링)
- [Query API](#query-api)
- [트랜잭션](#트랜잭션)
- [키–값 저장소](#키값-저장소)
- [엔티티 타입, 스키마, 마이그레이션](#엔티티-타입-스키마-마이그레이션)
- [사용자와 ACL](#사용자와-acl)
- [훅](#훅)
- [관리](#관리)
- [모니터링](#모니터링)
- [오류 처리](#오류-처리)
- [타임아웃, 재시도, 취소](#타임아웃-재시도-취소)
- [요청 훅과 원시 요청](#요청-훅과-원시-요청)
- [런타임과 브라우저](#런타임과-브라우저)
- [API 레퍼런스](#api-레퍼런스)
- [0.0.x에서 마이그레이션](#00x에서-마이그레이션)
- [개발](#개발)

## 설치

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

ElysianDB 서버가 없다면 다음 명령으로 실행합니다:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## 빠른 시작

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

`entity<T>()`는 타입이 지정된 결과를 반환합니다. `create()`는 `id`가 없는 문서를 받고(ElysianDB가 생성합니다), `update()`는 필드의 일부만 받을 수 있습니다.

## 연결

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

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `auth` | 없음 | 자격 증명: `{ token }`, `{ username, password }` 또는 `{ session }`. [인증](#인증)을 참고하세요. |
| `headers` | `{}` | 모든 요청에 추가되는 헤더입니다. |
| `timeout` | 없음 | 요청 타임아웃(밀리초)입니다. |
| `retries` | `0` | 네트워크 오류나 `429`, `502`, `503`, `504` 응답 후 `GET`, `PUT`, `DELETE` 요청을 재시도하는 횟수입니다. |
| `retryDelay` | `300` | 첫 재시도 전 대기 시간(밀리초)으로, 재시도할 때마다 두 배가 됩니다. `Retry-After`를 따릅니다. |
| `fetch` | 전역 `fetch` | 사용자 정의 `fetch` 구현입니다. |
| `credentials` | 런타임 기본값 | 브라우저 요청의 `credentials` 모드입니다. 다른 출처(origin) 간에 `user` 모드 세션을 쓰려면 `"include"`로 설정합니다. |
| `onRequest` | 없음 | 각 요청 전에 호출됩니다. 요청 헤더를 바꿀 수 있습니다. |
| `onResponse` | 없음 | 성공 여부와 관계없이 각 응답 후에 호출됩니다. |

`health()`로 서버가 동작 중인지 확인합니다. 이 메서드는 예외를 던지지 않으며 자격 증명도 필요 없습니다:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## 인증

ElysianDB에는 세 가지 인증 모드(`security.authentication.mode`)가 있습니다. 모드에 맞는 자격 증명을 클라이언트에 전달합니다:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

`user` 모드에서 `login()`은 세션(`edb_session` 쿠키)을 열고, 클라이언트는 이후 요청에 이 세션을 함께 보냅니다. 관리자 사용자만 로그인할 수 있습니다. Node.js, Bun, Deno에서는 클라이언트가 세션 ID를 `db.auth.session`에 보관하므로, 이를 저장해 두었다가 나중에 다시 사용할 수 있습니다:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

브라우저에서는 세션 쿠키가 `HttpOnly`이므로 브라우저가 쿠키를 보관하고 `db.auth.session`은 `undefined`로 남습니다. 페이지와 ElysianDB의 출처가 다르다면 `server.http.cors.allowedOrigins`에 페이지 출처를 추가하고 `credentials: "include"`로 클라이언트를 생성하세요.

자격 증명은 언제든 바꿀 수 있습니다:

| 멤버 | 설명 |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` 또는 `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | 자격 증명을 전환합니다. |
| `db.auth.login(username, password)` | 세션을 엽니다(`user` 모드). 실패가 반복되면 `error.retryAfter`와 함께 `429`를 받습니다. |
| `db.auth.logout()` | 세션을 종료하고 자격 증명을 지웁니다. |
| `db.auth.me()` | 현재 세션의 사용자입니다. |
| `db.auth.clear()` | 자격 증명 전송을 중단합니다. |
| `db.auth.onChange(listener)` | 자격 증명이 바뀔 때 호출됩니다. 구독 해제 함수를 반환합니다. |

> `user` 모드에서 일부 라우트는 관리자 권한이 필요합니다: 키–값 저장소, `admin.*`, `entities.create()`, `setSchema()`, `migrate()`, `deleteAll()`. 문서 라우트는 [ACL](#사용자와-acl)에 따라 검사됩니다.

## 문서

```ts
const books = db.entity<Book>("books");
```

### 생성

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()`는 먼저 모든 문서를 검증하며, 하나라도 유효하지 않으면 아무것도 쓰지 않습니다. 이미 존재하는 `id`를 전달하면 해당 문서를 교체합니다.

`@entity` 키가 있는 중첩 객체는 별도 문서로 저장되고 링크(`{ "@entity": "authors", "id": "..." }`)로 대체됩니다. [`includes`](#목록-조회와-필터링)로 펼쳐서 가져올 수 있습니다:

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### 조회

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### 수정

수정은 부분 업데이트입니다. 요청 본문이 저장된 문서에 병합됩니다. 필드를 제거하려면 `null`로 설정합니다.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

수정으로 문서가 생성되는 일은 없습니다. 문서가 존재하지 않으면 `update()`는 `404` 오류를 던지고, `updateMany()`는 문서 중 하나라도 없으면 아무것도 쓰지 않습니다.

### 삭제

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### 개수 세기

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## 이름, ID, 키

엔티티 이름, 문서 ID, 키, 사용자 이름, 훅 ID는 URL 경로에 들어가는데, ElysianDB 0.2.3은 이를 일관되게 디코딩하지 않습니다. 그래서 퍼센트 인코딩이 필요한 키나 ID는 쓸 수는 있어도 다시 읽지 못할 수 있습니다. 클라이언트는 영문자(`A-Z`, `a-z`), 숫자, `- _ . ! ~ * ' ( ) : @ $ & + , ; =`로만 이루어진 값을 허용하며, 공백, 악센트가 있는 문자, `/`, `?`, `#`, `%` 등 그 밖의 문자가 들어 있으면 `TypeError`를 던집니다. 모든 문서를 다시 읽을 수 있도록 `create()`와 `createMany()`도 전달된 `id`를 같은 방식으로 검사합니다.

엔티티 이름은 더 엄격합니다. 영문자, 숫자, `_`, `-`, `.`만 쓸 수 있으며 `.`로 시작할 수 없습니다. ElysianDB는 엔티티 이름으로 저장소 키와 패턴을 만들기 때문에 `:`나 `*`가 들어가면 다른 엔티티에까지 영향을 줍니다. `db.entity("books:id").deleteAll()`은 모든 책을 삭제하게 됩니다. 다른 클라이언트가 다른 이름으로 만든 엔티티 타입은 `db.request()`와 `encodeURIComponent()`로 계속 접근할 수 있습니다.

일부 값은 ElysianDB가 다른 라우트로 처리하거나 `fetch`가 URL에서 제거하기 때문에 거부됩니다:

| 값 | 거부되는 위치 | 이유 |
| --- | --- | --- |
| `.`, `..` | 모든 이름, ID, 키 | `fetch`가 URL에서 제거합니다. `books.delete(".")`는 모든 책을 삭제하게 됩니다. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | 엔티티 이름 | `/api/query`는 Query API, `/api/export`는 내보내기 라우트이며, 나머지도 마찬가지입니다. |
| `count`, `schema` | `get()`, `update()`, `create()`의 문서 ID | `GET /api/books/count`는 책의 개수를 셉니다. `exists()`와 `delete()`에서는 계속 사용할 수 있습니다. |
| `mget` | `kv.get()`과 `kv.set()`의 키 | `GET /kv/mget`은 `mget()`의 라우트입니다. |
| `*`가 들어간 키 | `kv.get()`과 `kv.set()`의 키 | `*`는 `mget()`과 `delete()`의 와일드카드입니다. |

또한 ElysianDB 0.2.3은 일부 저장소 키를 대소문자 구분 없이 비교합니다. 대소문자만 다른 엔티티 이름은 사용하지 마세요. `Books`에 `deleteAll()`을 호출하면 `books`의 인덱스가 삭제됩니다.

또한 클라이언트는 HTTP 리디렉션을 따르지 않습니다. 리디렉션을 따르면 자격 증명을 포함한 요청이 다른 URL로 다시 전송되기 때문입니다. 리디렉션은 새 위치를 알려 주는 `ElysianDBError`로 실패하며, 이 오류가 발생하면 서버 URL을 확인하세요.

## 목록 조회와 필터링

`list()`는 옵션을 `GET /api/<entity>` 요청으로 변환합니다:

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

| 옵션 | 설명 |
| --- | --- |
| `filter` | 필드 조건으로, 모두 일치해야 합니다. 경로는 중첩될 수 있으며(`author.name`) 배열과 포함된 엔티티를 거쳐 갈 수 있습니다. |
| `search` | 문서(및 포함된 엔티티)의 문자열 값에서 대소문자를 구분하지 않고 검색합니다. `*`를 쓰면 값 전체에 대한 glob이 됩니다: `Zeb*`. |
| `sort` | 단일 필드: `{ createdAt: "desc" }`. 여러 필드로 정렬하려면 [`query()`](#query-api)를 사용합니다. |
| `fields` | 지정한 필드만 반환합니다. |
| `includes` | 연결된 엔티티를 펼칩니다: `["author", "author.job"]` 또는 `"all"`. |
| `limit`, `offset` | 페이지네이션으로, 필터와 검색 이후에 적용됩니다. `limit`은 양의 정수, `offset`은 음이 아닌 정수여야 합니다. 그 밖의 값은 ElysianDB가 무시하고 모든 문서를 반환합니다. |

### 필터 연산자

| 연산자 | 문자열 | 숫자와 날짜 | 배열 |
| --- | --- | --- | --- |
| `eq` | 같음, 대소문자 구분 없음, `*` glob | 같음 | 목록과 항목이 같음 |
| `neq` | 같지 않음, `*` glob | 같지 않음 | — |
| `lt`, `lte`, `gt`, `gte` | 사전순 비교 | 작음 / 큼 | — |
| `contains` | 부분 문자열을 포함 | — | 값과 같은 항목이 있음 |
| `not_contains` | 부분 문자열을 포함하지 않음 | — | 값과 같은 항목이 없음 |
| `all` | — | — | 목록의 값을 모두 포함 |
| `any` | — | — | 목록의 값을 하나 이상 포함 |
| `none` | — | — | 목록의 값을 하나도 포함하지 않음 |

값으로는 문자열, 숫자, 불리언, `Date` 객체(ISO 8601로 전송)를 쓸 수 있습니다. `eq`, `all`, `any`, `none`에 넘긴 배열은 쉼표로 구분된 목록으로 전송됩니다. 해당 필드가 없거나 값이 `null`인 문서는 절대 일치하지 않습니다.

### 페이지네이션 헬퍼

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

변경되는 데이터를 순회할 때는 페이지가 안정적으로 유지되도록 `sort`를 지정하세요.

`iterate()`와 `listAll()`은 `pageSize`보다 짧은 첫 페이지에서, `count()`로 모든 문서를 읽었는지 확인한 뒤 멈춥니다. `user` 모드에서 ElysianDB 0.2.3은 `read` 없이 `owning_read`만 부여하는 ACL을 `limit`과 `offset` 이후에 적용하므로, 끝에 도달하기 전에 페이지가 짧거나 비어 있을 수 있습니다. 이때 클라이언트는 남은 문서를 한 번의 요청으로 가져옵니다. `list()`와 `first()`는 이를 감지할 수 없으므로, 이 경우 `limit`보다 적은 문서를 반환할 수 있습니다.

## Query API

`query()`는 `POST /api/query`를 사용하며, `and` / `or` 필터 트리와 여러 필드 기준 정렬을 지원합니다:

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

`and()`와 `or()`는 선택적으로 쓰는 헬퍼이며, `{ or: [...] }`처럼 작성해도 됩니다. 한 노드에 필드 조건과 `and` / `or`를 섞을 수 있습니다. ElysianDB는 노드마다 그중 하나만 읽기 때문에 클라이언트가 이를 `and`로 변환합니다.

**`list()`와 `query()` 중 무엇을 쓸까요?**

| | `list()` | `query()` |
| --- | --- | --- |
| 필드 조건(모두 일치해야 함) | ✓ | ✓ |
| `and` / `or` 트리 | | ✓ |
| 여러 정렬 키 | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## 트랜잭션

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()`은 콜백이 resolve되면 커밋하고 그 결과를 반환합니다. 콜백이 예외를 던지면 롤백한 뒤 오류를 다시 던집니다.

- 작업은 서버의 큐에 쌓였다가 커밋 시점에 전부 적용되거나 전혀 적용되지 않습니다. 스키마 오류가 있거나, 그 시점에 더 이상 존재하지 않는 문서를 수정하려 하면 커밋 전체가 `400` 오류로 거부됩니다.
- `tx.create()`는 `id`가 포함된 문서를 반환하며, `id`가 없으면 클라이언트가 생성합니다. 덕분에 같은 트랜잭션의 다른 문서가 이 문서를 링크할 수 있습니다(`{ "@entity": "authors", id: author.id }`).
- `tx.update()`는 이미 저장된 문서에만 적용됩니다. ElysianDB 0.2.3은 수정 작업이 큐에 들어갈 때 문서가 존재하는지 확인하므로, 같은 트랜잭션에서 생성한 문서를 수정하면 `400` 오류로 실패합니다. 대신 모든 필드를 `tx.create()`에 넣으세요.
- 큐에 쌓인 작업은 커밋 전까지 이 클라이언트든 다른 클라이언트든 다시 읽을 수 없습니다.
- 같은 작업이 두 번 큐에 쌓이거나 적용되지 않도록, 작업과 커밋은 절대 재시도하지 않습니다. ElysianDB는 열린 트랜잭션을 만료시키지 않으므로, 커밋에 응답이 없으면(네트워크 오류, 타임아웃, 중단) 클라이언트가 트랜잭션을 롤백합니다. 커밋이 ElysianDB에 도달했다면 이미 적용되었을 수도 있으니, 다시 시도하기 전에 확인하세요.
- `tx.entity<T>("books")`는 한 엔티티에 대해 타입이 지정된 `create`, `update`, `delete`를 제공합니다.

트랜잭션을 직접 제어할 수도 있습니다:

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

## 키–값 저장소

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

값은 문자열입니다. 키는 [이름과 ID 규칙](#이름-id-키)을 따릅니다. `mget()`과 `delete()`에서 `*`는 와일드카드이며, 패턴은 대소문자를 구분하지 않습니다. 예를 들어 `delete("Cache:*")`는 `cache:1`도 삭제합니다. `mget()`의 키에는 `,`를 쓸 수 없습니다. `user` 모드에서 키–값 저장소를 사용하려면 관리자 권한이 필요합니다.

## 엔티티 타입, 스키마, 마이그레이션

엔티티 타입은 처음 쓰인 문서로 생성되며, 엄격한 스키마와 함께 미리 선언할 수도 있습니다:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

엔티티 타입의 스키마를 읽거나 교체합니다. 수동 스키마는 알 수 없는 필드와 누락된 필수 필드를 거부합니다:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

필드 타입은 `string`, `number`, `boolean`, `object`(중첩된 `fields` 포함), `array`입니다. 스키마를 위반하는 쓰기는 [`validationErrors`](#오류-처리)가 담긴 오류를 던집니다.

마이그레이션은 중첩 경로를 포함해 엔티티 타입의 모든 문서를 수정합니다:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## 사용자와 ACL

이 라우트는 `user` 모드에서 제공되며 관리자 세션이 필요합니다.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACL은 사용자와 엔티티 타입별로 권한을 부여합니다: `create`, `read`, `update`, `delete`, 그리고 사용자가 소유한 문서(`_elysiandb_core_username` 필드 기준)에 대한 `owning_read`, `owning_update`, `owning_delete`.

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## 훅

훅은 ElysianDB가 읽기 시점에 실행하는 JavaScript 함수입니다(`api.hooks.enabled: true`). 관리자 자격 증명이 필요합니다.

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

## 관리

`user` 모드에서는 다음 호출에 관리자 권한이 필요합니다.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

문서를 내보내고 가져옵니다(계정, ACL, 스키마, KV 키는 포함되지 않습니다):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

계정을 포함한 인스턴스 전체를 백업하고 복원합니다:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename`은 서버가 제공하지만, 항상 폴더 경로가 없는 단순한 `.tar.gz` 파일 이름입니다. 서버가 파일을 쓸 위치를 정할 수 없도록, 클라이언트는 그 밖의 이름을 모두 `elysiandb-backup.tar.gz`로 바꿉니다.

복원은 모든 데이터를 교체하고 현재 세션을 포함한 모든 세션을 종료합니다. HTTP API는 최대 4 MB의 아카이브만 받으므로, 더 큰 인스턴스에는 `elysiandb backup`과 `elysiandb restore`를 사용하세요. 아카이브에는 비밀번호 해시가 들어 있으므로 데이터 폴더와 같은 수준으로 보관하세요.

## 모니터링

Admin UI의 모니터링 엔드포인트로, 관리자 자격 증명이 필요합니다:

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

`monitoring.prometheus.token`을 설정했다면 `metrics()`에 그 토큰을 전달합니다: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## 오류 처리

요청이 실패하면 모든 메서드는 `ElysianDBError`를 던집니다:

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

| 속성 | 설명 |
| --- | --- |
| `code` | `"HTTP_ERROR"`(ElysianDB가 4xx/5xx 또는 리디렉션으로 응답한 경우), `"NETWORK_ERROR"`, `"TIMEOUT"` 또는 `"ABORTED"` |
| `status` | HTTP 상태 코드. 응답을 받지 못했으면 `0` |
| `message` | 메서드, 경로, 상태 코드, ElysianDB의 메시지 |
| `data` | 파싱된 응답 본문 |
| `validationErrors` | 거부된 쓰기, 일괄 쓰기(`index`), 가져오기에 대한 `{ field, message, index?, entity?, id? }[]` |
| `requestId` | 응답의 `X-Request-Id` |
| `retryAfter` | `429` 이후 기다려야 하는 시간(초) |
| `method`, `url` | 실패한 요청 |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | 단축 속성 |

## 타임아웃, 재시도, 취소

클라이언트에 기본값을 설정하고, 모든 메서드의 마지막 인수로 호출마다 재정의할 수 있습니다:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

호출별 옵션은 `signal`, `timeout`, `retries`, `requestId`(`X-Request-Id`로 전송), `headers`입니다.

네트워크 오류나 `429`, `502`, `503`, `504` 응답 후에는 멱등 요청(`GET`, `PUT`, `DELETE`)만 재시도합니다. `create()`, 로그인, 커밋 같은 `POST` 요청과 트랜잭션 작업은 절대 재시도하지 않습니다.

## 요청 훅과 원시 요청

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

`request()`로 어떤 라우트든 호출할 수 있으며, 상태 코드와 헤더까지 받으려면 `send()`를 사용합니다:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## 런타임과 브라우저

- Node.js 20 이상, Bun, Deno, 브라우저: 클라이언트에는 `fetch`만 있으면 됩니다. 다른 환경에서는 옵션으로 `fetch`를 전달하세요.
- ES 모듈(`import`)과 CommonJS(`require`)를 모두 TypeScript 타입과 함께 배포합니다.
- 브라우저는 해당 출처가 `server.http.cors.allowedOrigins`에 등록된 경우에만 다른 출처에서 ElysianDB를 호출할 수 있습니다.
- 관리자 자격 증명이나 인스턴스 토큰을 브라우저에 배포하지 마세요.

ElysianDB 0.2.3에서는 다른 출처의 페이지가 할 수 있는 일에 다음과 같은 제약이 있습니다:

- `X-Request-Id` 헤더가 허용되지 않으므로, `requestId` 옵션을 쓴 요청은 CORS 프리플라이트에서 실패합니다. 다른 출처를 호출하는 브라우저에서는 `requestId`를 생략하세요.
- 응답 헤더가 노출되지 않습니다. `health().version`은 `null`, `error.requestId`와 `error.retryAfter`는 `undefined`가 되고, `send()`는 `Content-Type` 같은 CORS 허용 목록(safelist) 헤더만 볼 수 있으며, `admin.backup()`은 파일 이름을 `elysiandb-backup.tar.gz`로 지정합니다.

`tx.create()`는 `crypto.randomUUID()`로 ID를 생성하며, HTTPS로 제공되지 않는 페이지에서는 `crypto.getRandomValues()`를 사용합니다.

## API 레퍼런스

| 호출 | 라우트 |
| --- | --- |
| **클라이언트** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | 모든 라우트 |
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

## 0.0.x에서 마이그레이션

대부분의 코드는 그대로 동작합니다. 변경 사항은 다음과 같습니다:

| 0.0.x | 현재 |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | 여전히 동작합니다. `createClient(url, { auth: { token } })` 사용을 권장합니다. |
| 실패한 요청이 오류 본문으로 resolve됨 | `ElysianDBError`를 던집니다. |
| `count()`가 `{ count }`를 반환함 | `count()`는 숫자를 반환합니다. |
| `countWithOptions(options)` | `count(options)`(이전 이름도 계속 동작합니다). |
| `tx.write(entity, data)` | `tx.create(entity, data)`(이전 이름도 계속 동작합니다). |
| `db.transaction()`이 `undefined`로 resolve됨 | 콜백이 반환한 값으로 resolve됩니다. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)`(이전 메서드도 계속 동작합니다). |
| `dist/index.js`에서 임포트 | 패키지에 `exports` 맵이 있으므로 `@elysiandbjs/client`에서만 임포트하세요. |

## 개발

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

통합 테스트는 인증 모드별로 하나씩 띄운 실제 ElysianDB 서버를 대상으로 실행됩니다:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

CI는 ElysianDB 0.2.3을 소스에서 빌드하고 두 테스트 스위트를 모두 실행합니다.

릴리스하려면 최신 상태의 `main`에서 `make release`(또는 `make release VERSION=minor`)를 실행합니다. 이 명령은 버전을 올리고 태그를 푸시하며, 이어서 Release 워크플로가 CI를 실행한 뒤 provenance와 함께 패키지를 npm에 배포합니다. 이 워크플로에는 `NPM_TOKEN` 시크릿이 필요합니다.

`README.md`가 기준 문서입니다. 먼저 이 문서를 수정한 다음 [`docs/i18n`](./)의 번역본을 수정하세요. 번역본은 npm에 배포되지 않습니다. `CHANGELOG.md`는 영어로만 작성합니다.

## 라이선스

MIT
