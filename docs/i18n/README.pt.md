# Cliente JavaScript e TypeScript do ElysianDB

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · **Português** · [中文](README.zh.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

> Esta é uma tradução. O [README em inglês](../../README.md) é a referência e pode estar mais atualizado.

O cliente oficial do [ElysianDB](https://github.com/elysiandb/elysiandb), o backend distribuído como um único binário que transforma JSON em API REST. Ele cobre toda a API HTTP do ElysianDB 0.2.3:

- **Documentos**: CRUD tipado, gravações em lote, filtros, pesquisa, ordenação, paginação, projeções, includes, iteração assíncrona
- **Query API**: árvores de filtros `and` / `or` e ordenação por vários campos
- **Transações**: commit ou rollback automático
- **Armazenamento chave–valor**: valores com TTL, leitura de várias chaves e wildcards
- **Autenticação**: modos `token`, `basic` e `user` (sessão)
- **Administração**: tipos de entidade e esquemas, migrações, usuários, ACLs, hooks, exportação/importação, backup/restauração, monitoramento e logs
- **Requisições robustas**: erros tipados, timeouts, cancelamento, novas tentativas, hooks de requisição

Não tem dependências, é distribuído como módulos ES, CommonJS e tipos TypeScript, e funciona no Node.js 20+, Bun, Deno e nos navegadores.

## Índice

- [Instalação](#instalação)
- [Início rápido](#início-rápido)
- [Conexão](#conexão)
- [Autenticação](#autenticação)
- [Documentos](#documentos)
- [Nomes, IDs e chaves](#nomes-ids-e-chaves)
- [Listagem e filtros](#listagem-e-filtros)
- [Query API](#query-api)
- [Transações](#transações)
- [Armazenamento chave–valor](#armazenamento-chavevalor)
- [Tipos de entidade, esquemas e migrações](#tipos-de-entidade-esquemas-e-migrações)
- [Usuários e ACLs](#usuários-e-acls)
- [Hooks](#hooks)
- [Administração](#administração)
- [Monitoramento](#monitoramento)
- [Tratamento de erros](#tratamento-de-erros)
- [Timeouts, novas tentativas e cancelamento](#timeouts-novas-tentativas-e-cancelamento)
- [Hooks de requisição e requisições diretas](#hooks-de-requisição-e-requisições-diretas)
- [Ambientes de execução e navegadores](#ambientes-de-execução-e-navegadores)
- [Referência da API](#referência-da-api)
- [Migração a partir da 0.0.x](#migração-a-partir-da-00x)
- [Desenvolvimento](#desenvolvimento)

## Instalação

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Se ainda não tiver um servidor ElysianDB, inicie um:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Início rápido

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

`entity<T>()` fornece resultados tipados: `create()` recebe o documento sem `id` (o ElysianDB gera um) e `update()` recebe qualquer subconjunto dos campos.

## Conexão

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

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `auth` | nenhum | Credenciais: `{ token }`, `{ username, password }` ou `{ session }`. Consulte [Autenticação](#autenticação). |
| `headers` | `{}` | Cabeçalhos adicionados a todas as requisições. |
| `timeout` | nenhum | Timeout das requisições, em milissegundos. |
| `retries` | `0` | Novas tentativas das requisições `GET`, `PUT` e `DELETE` após um erro de rede ou uma resposta `429`, `502`, `503` ou `504`. |
| `retryDelay` | `300` | Espera antes da primeira nova tentativa, em milissegundos, dobrada a cada tentativa. O `Retry-After` é respeitado. |
| `fetch` | `fetch` global | Implementação personalizada de `fetch`. |
| `credentials` | padrão do ambiente | Modo `credentials` das requisições feitas no navegador. Use `"include"` para sessões do modo `user` entre origens diferentes. |
| `onRequest` | nenhum | Chamado antes de cada requisição. Pode alterar os cabeçalhos dela. |
| `onResponse` | nenhum | Chamado após cada resposta, bem-sucedida ou não. |

Verifique se o servidor está disponível com `health()`. Esse método nunca lança erro e não precisa de credenciais:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Autenticação

O ElysianDB tem três modos de autenticação (`security.authentication.mode`). Passe ao cliente as credenciais correspondentes:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

No modo `user`, `login()` abre uma sessão (cookie `edb_session`) que o cliente envia nas requisições seguintes. Só usuários admin podem fazer login. No Node.js, Bun e Deno, o cliente guarda o ID da sessão em `db.auth.session`, o que permite armazená-lo e reutilizá-lo mais tarde:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

Nos navegadores, o cookie de sessão é `HttpOnly`: ele fica com o navegador e `db.auth.session` continua `undefined`. Se a página e o ElysianDB tiverem origens diferentes, inclua a origem da página em `server.http.cors.allowedOrigins` e crie o cliente com `credentials: "include"`.

As credenciais podem mudar a qualquer momento:

| Membro | Descrição |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` ou `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Troca as credenciais. |
| `db.auth.login(username, password)` | Abre uma sessão (modo `user`). Falhas repetidas recebem `429` com `error.retryAfter`. |
| `db.auth.logout()` | Encerra a sessão e limpa as credenciais. |
| `db.auth.me()` | O usuário da sessão atual. |
| `db.auth.clear()` | Deixa de enviar credenciais. |
| `db.auth.onChange(listener)` | Chamado quando as credenciais mudam. Retorna uma função que remove o listener. |

> No modo `user`, algumas rotas exigem um admin: o armazenamento chave–valor, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` e `deleteAll()`. As rotas de documentos são verificadas de acordo com as [ACLs](#usuários-e-acls).

## Documentos

```ts
const books = db.entity<Book>("books");
```

### Criar

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` valida primeiro todos os documentos: se algum for inválido, nada é gravado. Passar um `id` que já existe substitui esse documento.

Objetos aninhados com uma chave `@entity` são armazenados como documentos separados e substituídos por um link (`{ "@entity": "authors", "id": "..." }`). Expanda-os com [`includes`](#listagem-e-filtros):

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Ler

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Atualizar

As atualizações são parciais: o corpo é combinado com o documento armazenado. Defina um campo como `null` para removê-lo.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

Uma atualização nunca cria um documento: `update()` lança um erro `404` quando o documento não existe, e `updateMany()` não grava nada se algum deles não existir.

### Apagar

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Contar

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Nomes, IDs e chaves

Nomes de entidade, IDs de documento, chaves, nomes de usuário e IDs de hook vão nos caminhos das URLs, e o ElysianDB 0.2.3 não os decodifica de forma consistente: uma chave ou um ID que precise de percent-encoding poderia ser gravado, mas não lido de volta. O cliente só aceita valores compostos de letras (`A-Z`, `a-z`), dígitos e `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, e lança um `TypeError` para qualquer outro caractere, como espaços, letras acentuadas, `/`, `?`, `#` ou `%`. `create()` e `createMany()` verificam da mesma forma o `id` recebido, para que todos os documentos possam ser lidos de volta.

Os nomes de entidade são mais restritos: letras, dígitos, `_`, `-` e `.`, sem um `.` no início. O ElysianDB monta suas chaves de armazenamento e seus padrões a partir deles, então `:` ou `*` alcançariam outras entidades: `db.entity("books:id").deleteAll()` apagaria todos os livros. Tipos de entidade criados com outros nomes, por outro cliente, continuam acessíveis com `db.request()` e `encodeURIComponent()`.

Alguns valores são rejeitados porque o ElysianDB os encaminha para outras rotas, ou porque o `fetch` os remove das URLs:

| Valor | Rejeitado como | Motivo |
| --- | --- | --- |
| `.` e `..` | Qualquer nome, ID ou chave | O `fetch` os remove das URLs: `books.delete(".")` apagaria todos os livros. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Nome de entidade | `/api/query` é a Query API, `/api/export` a exportação, e assim por diante. |
| `count`, `schema` | ID de documento em `get()`, `update()` e `create()` | `GET /api/books/count` conta os livros. `exists()` e `delete()` ainda os aceitam. |
| `mget` | Chave em `kv.get()` e `kv.set()` | `GET /kv/mget` é a rota de `mget()`. |
| Chaves com `*` | Chave em `kv.get()` e `kv.set()` | `*` é o wildcard de `mget()` e `delete()`. |

O ElysianDB 0.2.3 também compara algumas chaves de armazenamento sem diferenciar maiúsculas de minúsculas: não use nomes de entidade que se diferenciem apenas por maiúsculas e minúsculas, já que `deleteAll()` em `Books` descarta os índices de `books`.

O cliente também nunca segue redirecionamentos HTTP, já que um redirecionamento repetiria a requisição, incluindo as credenciais, em outra URL. Um redirecionamento falha com um `ElysianDBError` que indica a nova localização: se isso acontecer, verifique a URL do servidor.

## Listagem e filtros

`list()` traduz as suas opções para `GET /api/<entity>`:

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

| Opção | Descrição |
| --- | --- |
| `filter` | Condições sobre os campos, que devem ser todas satisfeitas. Os caminhos podem ser aninhados (`author.name`) e atravessar arrays e entidades incluídas. |
| `search` | Pesquisa sem distinção entre maiúsculas e minúsculas nos valores string dos documentos (e das entidades incluídas). Com `*`, um glob sobre o valor inteiro: `Zeb*`. |
| `sort` | Um único campo: `{ createdAt: "desc" }`. Use [`query()`](#query-api) para ordenar por vários campos. |
| `fields` | Retorna apenas esses campos. |
| `includes` | Expande as entidades vinculadas: `["author", "author.job"]`, ou `"all"`. |
| `limit`, `offset` | Paginação, aplicada depois dos filtros e da pesquisa. `limit` deve ser um inteiro positivo e `offset` um inteiro não negativo: o ElysianDB ignoraria outros valores e retornaria todos os documentos. |

### Operadores de filtro

| Operador | Strings | Números e datas | Arrays |
| --- | --- | --- | --- |
| `eq` | Igual, sem distinção entre maiúsculas e minúsculas, glob `*` | Igual | Mesmos itens que a lista |
| `neq` | Diferente, glob `*` | Diferente | — |
| `lt`, `lte`, `gt`, `gte` | Ordem lexicográfica | Menor / maior que | — |
| `contains` | Contém a substring | — | Tem um item igual ao valor |
| `not_contains` | Não contém a substring | — | Não tem nenhum item igual ao valor |
| `all` | — | — | Tem todos os valores da lista |
| `any` | — | — | Tem pelo menos um valor da lista |
| `none` | — | — | Não tem nenhum dos valores da lista |

Os valores podem ser strings, números, booleanos ou objetos `Date` (enviados em ISO 8601). Os arrays são enviados como listas separadas por vírgulas, para `eq`, `all`, `any` e `none`. Um documento sem o campo, ou com `null`, nunca corresponde.

### Auxiliares de paginação

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Use um `sort` ao iterar sobre dados que mudam, para que as páginas se mantenham estáveis.

`iterate()` e `listAll()` param na primeira página menor que `pageSize`, depois de `count()` confirmar que todos os documentos foram lidos. No modo `user`, o ElysianDB 0.2.3 aplica uma ACL que concede `owning_read` mas não `read` depois de `limit` e `offset`, de modo que uma página pode vir incompleta, ou vazia, antes do fim: nesse caso, o cliente busca os documentos restantes com uma única requisição. `list()` e `first()` não conseguem detectar essa situação e podem, portanto, retornar menos documentos do que `limit`.

## Query API

`query()` usa `POST /api/query`, que acrescenta árvores de filtros `and` / `or` e ordenação por vários campos:

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

`and()` e `or()` são auxiliares opcionais: `{ or: [...] }` também funciona. Um nó pode misturar condições de campo e `and` / `or`; o cliente converte esse nó em um `and`, já que o ElysianDB só lê uma das duas coisas por nó.

**`list()` ou `query()`?**

| | `list()` | `query()` |
| --- | --- | --- |
| Condições de campo (todas devem ser satisfeitas) | ✓ | ✓ |
| Árvores `and` / `or` | | ✓ |
| Várias chaves de ordenação | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## Transações

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` faz o commit quando o callback é resolvido e retorna o resultado dele. Quando o callback lança um erro, faz o rollback e relança o erro.

- As operações ficam na fila do servidor e são aplicadas no commit, todas ou nenhuma. Um erro de esquema, ou a atualização de um documento que já não existe nesse momento, rejeita o commit inteiro com um erro `400`.
- `tx.create()` retorna o documento com o seu `id`, gerado pelo cliente quando ausente, para que outros documentos da transação possam apontar para ele (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` só se aplica a documentos já armazenados: o ElysianDB 0.2.3 verifica se o documento existe no momento em que a atualização entra na fila, por isso atualizar um documento criado na mesma transação falha com um erro `400`. Em vez disso, coloque todos os campos no `tx.create()`.
- As operações na fila não podem ser lidas antes do commit, nem por este cliente nem por nenhum outro.
- Operações e commits nunca são repetidos, para que nada seja enfileirado ou aplicado duas vezes. O ElysianDB nunca expira transações abertas: quando um commit fica sem resposta (erro de rede, timeout ou cancelamento), o cliente faz o rollback da transação. O commit pode ter sido aplicado mesmo assim, se chegou ao ElysianDB, por isso verifique antes de tentar de novo.
- `tx.entity<T>("books")` fornece `create`, `update` e `delete` tipados para uma entidade.

Para controlar uma transação manualmente:

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

## Armazenamento chave–valor

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Os valores são strings. As chaves seguem as [regras de nomes e IDs](#nomes-ids-e-chaves). `*` é um wildcard em `mget()` e `delete()`, e os padrões não diferenciam maiúsculas de minúsculas: `delete("Cache:*")` também apaga `cache:1`. As chaves de `mget()` não podem conter `,`. No modo `user`, o armazenamento chave–valor exige um admin.

## Tipos de entidade, esquemas e migrações

Os tipos de entidade são criados pelo primeiro documento gravado, ou declarados antecipadamente com um esquema estrito:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Leia ou substitua o esquema de um tipo de entidade. Um esquema manual rejeita campos desconhecidos e campos obrigatórios ausentes:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

Os tipos de campo são `string`, `number`, `boolean`, `object` (com `fields` aninhados) e `array`. As gravações que violam o esquema lançam um erro com [`validationErrors`](#tratamento-de-erros).

As migrações atualizam todos os documentos de um tipo de entidade, incluindo caminhos aninhados:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Usuários e ACLs

Estas rotas existem no modo `user` e exigem uma sessão de admin.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

As ACLs concedem permissões por usuário e por tipo de entidade: `create`, `read`, `update`, `delete`, e `owning_read`, `owning_update`, `owning_delete` para os documentos que pertencem ao usuário (campo `_elysiandb_core_username`).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Hooks são funções JavaScript que o ElysianDB executa nas leituras (`api.hooks.enabled: true`). Exigem credenciais de admin.

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

## Administração

Estas chamadas exigem um admin no modo `user`.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Exportar e importar documentos (contas, ACLs, esquemas e chaves KV não são incluídos):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Fazer backup e restaurar uma instância inteira, incluindo as contas:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` vem do servidor, mas é sempre um nome de arquivo `.tar.gz` simples, sem pasta: o cliente substitui qualquer outro nome por `elysiandb-backup.tar.gz`, para que o servidor não possa escolher onde o arquivo é gravado.

Uma restauração substitui todos os dados e encerra todas as sessões, incluindo a atual. A API HTTP aceita arquivos de até 4 MB: use `elysiandb backup` e `elysiandb restore` para instâncias maiores. Os arquivos de backup contêm hashes de senhas: guarde-os com o mesmo cuidado que a pasta de dados.

## Monitoramento

Os endpoints de monitoramento da Admin UI, com credenciais de admin:

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

Com `monitoring.prometheus.token`, passe esse token para `metrics()`: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Tratamento de erros

Todos os métodos lançam um `ElysianDBError` quando a requisição falha:

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

| Propriedade | Descrição |
| --- | --- |
| `code` | `"HTTP_ERROR"` (o ElysianDB respondeu 4xx/5xx, ou com um redirecionamento), `"NETWORK_ERROR"`, `"TIMEOUT"` ou `"ABORTED"` |
| `status` | Status HTTP, `0` quando nenhuma resposta foi recebida |
| `message` | Método, caminho, status e a mensagem do ElysianDB |
| `data` | Corpo da resposta, já desserializado |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` para gravações rejeitadas, gravações em lote (`index`) e importações |
| `requestId` | `X-Request-Id` da resposta |
| `retryAfter` | Segundos a esperar, após um `429` |
| `method`, `url` | A requisição que falhou |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Atalhos |

## Timeouts, novas tentativas e cancelamento

Defina valores padrão no cliente e sobrescreva-os por chamada com o último argumento de qualquer método:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

As opções por chamada são `signal`, `timeout`, `retries`, `requestId` (enviado como `X-Request-Id`) e `headers`.

Só as requisições idempotentes (`GET`, `PUT`, `DELETE`) são repetidas, após um erro de rede ou uma resposta `429`, `502`, `503` ou `504`. As requisições `POST`, como `create()`, um login ou um commit, e as operações de uma transação nunca são repetidas.

## Hooks de requisição e requisições diretas

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

Chame qualquer rota com `request()`, ou com `send()` para obter também o status e os cabeçalhos:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Ambientes de execução e navegadores

- Node.js 20 ou superior, Bun, Deno e navegadores: o cliente só precisa de `fetch`. Para outros ambientes, passe `fetch` nas opções.
- São publicados tanto módulos ES (`import`) quanto CommonJS (`require`), com tipos TypeScript.
- Um navegador só pode chamar o ElysianDB a partir de outra origem quando essa origem está listada em `server.http.cors.allowedOrigins`.
- Não coloque credenciais de admin nem o token da instância em código executado no navegador.

O ElysianDB 0.2.3 limita o que uma página pode fazer entre origens diferentes:

- O cabeçalho `X-Request-Id` não é permitido: uma requisição com a opção `requestId` falha no preflight CORS. Não use `requestId` em navegadores que chamam outra origem.
- Os cabeçalhos de resposta não são expostos: `health().version` é `null`, `error.requestId` e `error.retryAfter` são `undefined`, `send()` só vê os cabeçalhos da safelist CORS, como `Content-Type`, e `admin.backup()` dá ao arquivo o nome `elysiandb-backup.tar.gz`.

`tx.create()` gera os IDs com `crypto.randomUUID()`, ou com `crypto.getRandomValues()` em páginas que não são servidas por HTTPS.

## Referência da API

| Chamada | Rota |
| --- | --- |
| **Cliente** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | qualquer uma |
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

## Migração a partir da 0.0.x

A maior parte do código não precisa de alterações. O que muda:

| 0.0.x | Agora |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Ainda funciona. Prefira `createClient(url, { auth: { token } })`. |
| As requisições com falha resolviam com o corpo do erro | Lançam um `ElysianDBError`. |
| `count()` retornava `{ count }` | `count()` retorna um número. |
| `countWithOptions(options)` | `count(options)` (o nome antigo ainda funciona). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (o nome antigo ainda funciona). |
| `db.transaction()` resolvia com `undefined` | Resolve com o valor retornado pelo callback. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (o método antigo ainda funciona). |
| Imports de `dist/index.js` | O pacote tem um mapa `exports`: importe apenas de `@elysiandbjs/client`. |

## Desenvolvimento

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

Os testes de integração são executados em servidores ElysianDB reais, um por modo de autenticação:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

A CI compila o ElysianDB 0.2.3 a partir do código-fonte e executa os dois conjuntos de testes.

Para publicar uma versão, execute `make release` (ou `make release VERSION=minor`) com a branch `main` atualizada: o comando incrementa a versão e faz push da tag, e o workflow Release executa a CI e publica o pacote no npm com proveniência. O workflow precisa do secret `NPM_TOKEN`.

`README.md` é a documentação de referência: altere-o primeiro e depois as traduções em [`docs/i18n`](./), que não são publicadas no npm. `CHANGELOG.md` existe apenas em inglês.

## Licença

MIT
