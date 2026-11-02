# Client ElysianDB pour JavaScript et TypeScript

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · **Français** · [Español](README.es.md) · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · [Português](README.pt.md) · [中文](README.zh.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

> Ceci est une traduction. Le [README en anglais](../../README.md) fait référence et peut être plus à jour.

Le client officiel d'[ElysianDB](https://github.com/elysiandb/elysiandb), le backend en un seul binaire qui transforme du JSON en API REST. Il couvre toute l'API HTTP d'ElysianDB 0.2.3 :

- **Documents** : CRUD typé, écritures par lots, filtres, recherche, tri, pagination, projections, inclusions, itération asynchrone
- **API Query** : arbres de filtres `and` / `or` et tri sur plusieurs champs
- **Transactions** : commit ou rollback automatique
- **Stockage clé–valeur** : valeurs avec TTL, lecture multiple et jokers
- **Authentification** : modes `token`, `basic` et `user` (session)
- **Administration** : types d'entités et schémas, migrations, utilisateurs, ACL, hooks, export/import, sauvegarde/restauration, monitoring et logs
- **Requêtes robustes** : erreurs typées, timeouts, annulation, nouvelles tentatives, hooks de requête

Il n'a aucune dépendance, est publié en modules ES et en CommonJS avec ses types TypeScript, et fonctionne sous Node.js 20+, Bun, Deno et dans les navigateurs.

## Sommaire

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Connexion](#connexion)
- [Authentification](#authentification)
- [Documents](#documents)
- [Noms, identifiants et clés](#noms-identifiants-et-clés)
- [Lister et filtrer](#lister-et-filtrer)
- [API Query](#api-query)
- [Transactions](#transactions)
- [Stockage clé–valeur](#stockage-clévaleur)
- [Types d'entités, schémas et migrations](#types-dentités-schémas-et-migrations)
- [Utilisateurs et ACL](#utilisateurs-et-acl)
- [Hooks](#hooks)
- [Administration](#administration)
- [Monitoring](#monitoring)
- [Gestion des erreurs](#gestion-des-erreurs)
- [Timeouts, nouvelles tentatives et annulation](#timeouts-nouvelles-tentatives-et-annulation)
- [Hooks de requête et requêtes brutes](#hooks-de-requête-et-requêtes-brutes)
- [Environnements d'exécution et navigateurs](#environnements-dexécution-et-navigateurs)
- [Référence de l'API](#référence-de-lapi)
- [Migrer depuis 0.0.x](#migrer-depuis-00x)
- [Développement](#développement)

## Installation

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Lancez un serveur ElysianDB si vous n'en avez pas :

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Démarrage rapide

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

`entity<T>()` renvoie des résultats typés : `create()` prend le document sans `id` (ElysianDB en génère un), `update()` accepte n'importe quel sous-ensemble des champs.

## Connexion

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

| Option | Défaut | Description |
| --- | --- | --- |
| `auth` | aucun | Identifiants : `{ token }`, `{ username, password }` ou `{ session }`. Voir [Authentification](#authentification). |
| `headers` | `{}` | En-têtes ajoutés à chaque requête. |
| `timeout` | aucun | Délai d'expiration des requêtes, en millisecondes. |
| `retries` | `0` | Nombre de nouvelles tentatives des requêtes `GET`, `PUT` et `DELETE` après une erreur réseau ou une réponse `429`, `502`, `503` ou `504`. |
| `retryDelay` | `300` | Délai avant la première nouvelle tentative, en millisecondes, doublé à chaque tentative. `Retry-After` est respecté. |
| `fetch` | `fetch` global | Implémentation personnalisée de `fetch`. |
| `credentials` | valeur par défaut du runtime | Mode `credentials` des requêtes du navigateur. Indiquez `"include"` pour les sessions du mode `user` entre origines différentes. |
| `onRequest` | aucun | Appelé avant chaque requête. Peut modifier ses en-têtes. |
| `onResponse` | aucun | Appelé après chaque réponse, réussie ou non. |

Vérifiez que le serveur répond avec `health()`. Cette méthode ne lève jamais d'erreur et ne demande aucun identifiant :

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Authentification

ElysianDB propose trois modes d'authentification (`security.authentication.mode`). Passez au client les identifiants correspondants :

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

En mode `user`, `login()` ouvre une session (cookie `edb_session`) que le client envoie avec les requêtes suivantes. Seuls les administrateurs peuvent se connecter. Sous Node.js, Bun et Deno, le client conserve l'identifiant de session dans `db.auth.session` : vous pouvez donc le stocker et le réutiliser plus tard :

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

Dans les navigateurs, le cookie de session est `HttpOnly` : le navigateur le conserve et `db.auth.session` reste `undefined`. Si votre page et ElysianDB n'ont pas la même origine, ajoutez l'origine de la page à `server.http.cors.allowedOrigins` et créez le client avec `credentials: "include"`.

Les identifiants peuvent changer à tout moment :

| Membre | Description |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` ou `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Change d'identifiants. |
| `db.auth.login(username, password)` | Ouvre une session (mode `user`). Après des échecs répétés, la réponse est un `429` avec `error.retryAfter`. |
| `db.auth.logout()` | Ferme la session et efface les identifiants. |
| `db.auth.me()` | L'utilisateur de la session en cours. |
| `db.auth.clear()` | Arrête d'envoyer des identifiants. |
| `db.auth.onChange(listener)` | Appelé quand les identifiants changent. Renvoie une fonction de désabonnement. |

> En mode `user`, certaines routes exigent un administrateur : le stockage clé–valeur, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` et `deleteAll()`. Les routes des documents sont soumises aux [ACL](#utilisateurs-et-acl).

## Documents

```ts
const books = db.entity<Book>("books");
```

### Créer

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` valide d'abord tous les documents : si l'un d'eux est invalide, rien n'est écrit. Passer un `id` qui existe déjà remplace ce document.

Les objets imbriqués qui ont une clé `@entity` sont stockés comme documents séparés et remplacés par un lien (`{ "@entity": "authors", "id": "..." }`). Récupérez-les en entier avec [`includes`](#lister-et-filtrer) :

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Lire

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Mettre à jour

Les mises à jour sont partielles : le corps est fusionné avec le document stocké. Passez un champ à `null` pour le supprimer.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

Une mise à jour ne crée jamais de document : `update()` lève une erreur `404` quand le document n'existe pas, et `updateMany()` n'écrit rien si l'un d'eux est absent.

### Supprimer

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Compter

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Noms, identifiants et clés

Les noms d'entités, les identifiants de documents, les clés, les noms d'utilisateurs et les identifiants de hooks figurent dans le chemin des URL, et ElysianDB 0.2.3 ne les décode pas de façon cohérente : une clé ou un identifiant qui doit être encodé en pourcent-encodage pourrait être écrit sans pouvoir être relu. Le client n'accepte que les valeurs composées de lettres (`A-Z`, `a-z`), de chiffres et de `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, et lève une `TypeError` pour tout le reste : espaces, lettres accentuées, `/`, `?`, `#` ou `%`. `create()` et `createMany()` vérifient de la même façon l'`id` que vous passez, pour que chaque document puisse être relu.

Les noms d'entités sont plus stricts : lettres, chiffres, `_`, `-` et `.`, sans `.` au début. ElysianDB construit ses clés de stockage et ses motifs à partir de ces noms, si bien que `:` ou `*` atteindraient d'autres entités : `db.entity("books:id").deleteAll()` supprimerait tous les livres. Les types d'entités créés avec d'autres noms, par un autre client, restent accessibles avec `db.request()` et `encodeURIComponent()`.

Certaines valeurs sont refusées parce qu'ElysianDB les route ailleurs, ou parce que `fetch` les retire des URL :

| Valeur | Refusée comme | Pourquoi |
| --- | --- | --- |
| `.` et `..` | Tout nom, identifiant ou clé | `fetch` les retire des URL : `books.delete(".")` supprimerait tous les livres. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Nom d'entité | `/api/query` est l'API Query, `/api/export` l'export, et ainsi de suite. |
| `count`, `schema` | Identifiant de document dans `get()`, `update()` et `create()` | `GET /api/books/count` compte les livres. `exists()` et `delete()` les acceptent quand même. |
| `mget` | Clé dans `kv.get()` et `kv.set()` | `GET /kv/mget` est la route de `mget()`. |
| Clés avec `*` | Clé dans `kv.get()` et `kv.set()` | `*` est le joker de `mget()` et `delete()`. |

ElysianDB 0.2.3 compare aussi certaines clés de stockage sans tenir compte de la casse : n'utilisez pas de noms d'entités qui ne diffèrent que par la casse, car `deleteAll()` sur `Books` supprime les index de `books`.

Le client ne suit pas non plus les redirections HTTP, car une redirection rejouerait la requête, identifiants compris, sur une autre URL. Une redirection échoue avec une `ElysianDBError` qui indique la nouvelle adresse : si cela vous arrive, vérifiez l'URL du serveur.

## Lister et filtrer

`list()` traduit ses options en `GET /api/<entity>` :

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
| `filter` | Conditions sur les champs, qui doivent toutes être vérifiées. Les chemins peuvent être imbriqués (`author.name`) et traverser les tableaux et les entités incluses. |
| `search` | Recherche insensible à la casse dans les valeurs texte des documents (et des entités incluses). Avec `*`, un glob sur les valeurs entières : `Zeb*`. |
| `sort` | Un seul champ : `{ createdAt: "desc" }`. Utilisez [`query()`](#api-query) pour trier sur plusieurs champs. |
| `fields` | Ne renvoie que ces champs. |
| `includes` | Inclut les entités liées : `["author", "author.job"]`, ou `"all"`. |
| `limit`, `offset` | Pagination, appliquée après les filtres et la recherche. `limit` doit être un entier strictement positif et `offset` un entier positif ou nul : ElysianDB ignorerait toute autre valeur et renverrait tous les documents. |

### Opérateurs de filtre

| Opérateur | Chaînes | Nombres et dates | Tableaux |
| --- | --- | --- | --- |
| `eq` | Égal, insensible à la casse, glob `*` | Égal | Mêmes éléments que la liste |
| `neq` | Différent, glob `*` | Différent | — |
| `lt`, `lte`, `gt`, `gte` | Ordre lexicographique | Inférieur / supérieur à | — |
| `contains` | Contient la sous-chaîne | — | Contient un élément égal à la valeur |
| `not_contains` | Ne contient pas la sous-chaîne | — | Ne contient aucun élément égal à la valeur |
| `all` | — | — | Contient toutes les valeurs de la liste |
| `any` | — | — | Contient au moins une valeur de la liste |
| `none` | — | — | Ne contient aucune des valeurs de la liste |

Les valeurs peuvent être des chaînes, des nombres, des booléens ou des objets `Date` (envoyés au format ISO 8601). Pour `eq`, `all`, `any` et `none`, les tableaux sont envoyés sous forme de listes séparées par des virgules. Un document qui n'a pas le champ, ou dont le champ vaut `null`, ne correspond jamais.

### Utilitaires de pagination

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Utilisez un `sort` quand vous parcourez des données qui changent, pour que les pages restent stables.

`iterate()` et `listAll()` s'arrêtent à la première page plus courte que `pageSize`, une fois que `count()` a confirmé que tous les documents ont été lus. En mode `user`, ElysianDB 0.2.3 applique une ACL qui accorde `owning_read` mais pas `read` après `limit` et `offset` : une page peut donc être incomplète, voire vide, avant la fin. Le client récupère alors les documents restants en une seule requête. `list()` et `first()` ne peuvent pas détecter ce cas et peuvent alors renvoyer moins de documents que `limit`.

## API Query

`query()` utilise `POST /api/query`, qui ajoute les arbres de filtres `and` / `or` et le tri sur plusieurs champs :

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

`and()` et `or()` sont des utilitaires facultatifs : `{ or: [...] }` fonctionne aussi. Un nœud peut mélanger des conditions sur les champs et `and` / `or` ; le client le transforme alors en `and`, car ElysianDB ne lit qu'un seul des deux par nœud.

**`list()` ou `query()` ?**

| | `list()` | `query()` |
| --- | --- | --- |
| Conditions sur les champs (toutes doivent être vérifiées) | ✓ | ✓ |
| Arbres `and` / `or` | | ✓ |
| Plusieurs clés de tri | | ✓ |
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

`transaction()` fait un commit quand le callback se résout, et renvoie son résultat. Si le callback lève une erreur, elle fait un rollback et relance l'erreur.

- Les opérations sont mises en file d'attente sur le serveur et appliquées au commit, toutes ou aucune. Une erreur de schéma, ou la mise à jour d'un document qui n'existe plus à ce moment-là, fait échouer tout le commit avec une erreur `400`.
- `tx.create()` renvoie le document avec son `id`, généré par le client s'il est absent, pour que d'autres documents de la transaction puissent pointer dessus (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` ne s'applique qu'aux documents déjà stockés : ElysianDB 0.2.3 vérifie que le document existe au moment où la mise à jour est mise en file, donc la mise à jour d'un document créé dans la même transaction échoue avec une erreur `400`. Mettez plutôt tous les champs dans `tx.create()`.
- Les opérations en file d'attente ne peuvent pas être relues avant le commit, ni par ce client ni par un autre.
- Les opérations et les commits ne sont jamais retentés, pour que rien ne soit mis en file ni appliqué deux fois. ElysianDB ne fait jamais expirer les transactions ouvertes : quand un commit reste sans réponse (erreur réseau, timeout ou annulation), le client fait un rollback de la transaction. Le commit a pu être appliqué s'il a atteint ElysianDB : vérifiez avant de réessayer.
- `tx.entity<T>("books")` fournit des `create`, `update` et `delete` typés pour une entité.

Pour piloter une transaction vous-même :

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

## Stockage clé–valeur

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Les valeurs sont des chaînes. Les clés suivent les [règles des noms et identifiants](#noms-identifiants-et-clés). `*` est un joker dans `mget()` et `delete()`, et les motifs ignorent la casse : `delete("Cache:*")` supprime aussi `cache:1`. Les clés passées à `mget()` ne peuvent pas contenir `,`. En mode `user`, le stockage clé–valeur exige un administrateur.

## Types d'entités, schémas et migrations

Les types d'entités sont créés par le premier document écrit, ou déclarés à l'avance avec un schéma strict :

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Lisez ou remplacez le schéma d'un type d'entité. Un schéma manuel refuse les champs inconnus et les champs obligatoires manquants :

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

Les types de champs sont `string`, `number`, `boolean`, `object` (avec des `fields` imbriqués) et `array`. Les écritures qui ne respectent pas le schéma lèvent une erreur avec [`validationErrors`](#gestion-des-erreurs).

Les migrations mettent à jour tous les documents d'un type d'entité, chemins imbriqués compris :

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Utilisateurs et ACL

Ces routes existent en mode `user` et exigent une session administrateur.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

Les ACL accordent des permissions par utilisateur et par type d'entité : `create`, `read`, `update`, `delete`, ainsi que `owning_read`, `owning_update` et `owning_delete` pour les documents dont l'utilisateur est propriétaire (leur champ `_elysiandb_core_username`).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Les hooks sont des fonctions JavaScript qu'ElysianDB exécute lors des lectures (`api.hooks.enabled: true`). Ils exigent des identifiants administrateur.

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

En mode `user`, ces appels exigent un administrateur.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Exportez et importez les documents (les comptes, les ACL, les schémas et les clés KV ne sont pas inclus) :

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Sauvegardez et restaurez une instance entière, comptes compris :

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` vient du serveur, mais c'est toujours un simple nom de fichier `.tar.gz`, sans dossier : le client remplace tout autre nom par `elysiandb-backup.tar.gz`, pour que le serveur ne puisse pas choisir où vous écrivez.

Une restauration remplace toutes les données et ferme toutes les sessions, y compris la session en cours. L'API HTTP accepte les archives jusqu'à 4 Mo : utilisez `elysiandb backup` et `elysiandb restore` pour les instances plus volumineuses. Les archives contiennent des hachages de mots de passe : protégez-les comme le dossier de données.

## Monitoring

Les endpoints de monitoring de l'interface d'administration (Admin UI), avec des identifiants administrateur :

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

Avec `monitoring.prometheus.token`, passez ce token à `metrics()` : `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Gestion des erreurs

Chaque méthode lève une `ElysianDBError` quand la requête échoue :

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

| Propriété | Description |
| --- | --- |
| `code` | `"HTTP_ERROR"` (ElysianDB a répondu 4xx/5xx, ou par une redirection), `"NETWORK_ERROR"`, `"TIMEOUT"` ou `"ABORTED"` |
| `status` | Statut HTTP, `0` si aucune réponse n'a été reçue |
| `message` | Méthode, chemin, statut et message d'ElysianDB |
| `data` | Corps de la réponse, déjà parsé |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` pour les écritures refusées, les écritures par lots (`index`) et les imports |
| `requestId` | `X-Request-Id` de la réponse |
| `retryAfter` | Nombre de secondes à attendre, après un `429` |
| `method`, `url` | La requête en échec |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Raccourcis |

## Timeouts, nouvelles tentatives et annulation

Définissez des valeurs par défaut sur le client, puis remplacez-les à chaque appel avec le dernier argument de n'importe quelle méthode :

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

Les options par appel sont `signal`, `timeout`, `retries`, `requestId` (envoyé dans `X-Request-Id`) et `headers`.

Seules les requêtes idempotentes (`GET`, `PUT`, `DELETE`) sont retentées, après une erreur réseau ou une réponse `429`, `502`, `503` ou `504`. Les requêtes `POST`, comme `create()`, une connexion ou un commit, ainsi que les opérations d'une transaction, ne sont jamais retentées.

## Hooks de requête et requêtes brutes

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

Appelez n'importe quelle route avec `request()`, ou avec `send()` pour obtenir aussi le statut et les en-têtes :

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Environnements d'exécution et navigateurs

- Node.js 20 ou plus récent, Bun, Deno et les navigateurs : le client n'a besoin que de `fetch`. Dans les autres environnements, passez `fetch` dans les options.
- Les modules ES (`import`) et CommonJS (`require`) sont tous les deux publiés, avec les types TypeScript.
- Les navigateurs ne peuvent appeler ElysianDB depuis une autre origine que si cette origine figure dans `server.http.cors.allowedOrigins`.
- N'exposez jamais d'identifiants administrateur ni le token de l'instance dans le navigateur.

ElysianDB 0.2.3 limite ce qu'une page peut faire entre origines différentes :

- L'en-tête `X-Request-Id` n'est pas autorisé : une requête avec l'option `requestId` échoue au preflight CORS. N'utilisez pas `requestId` dans un navigateur qui appelle une autre origine.
- Les en-têtes de réponse ne sont pas exposés : `health().version` vaut `null`, `error.requestId` et `error.retryAfter` valent `undefined`, `send()` ne voit que les en-têtes que CORS autorise d'office, comme `Content-Type`, et `admin.backup()` nomme le fichier `elysiandb-backup.tar.gz`.

`tx.create()` génère les identifiants avec `crypto.randomUUID()`, ou avec `crypto.getRandomValues()` sur les pages qui ne sont pas servies en HTTPS.

## Référence de l'API

| Appel | Route |
| --- | --- |
| **Client** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | toutes |
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

## Migrer depuis 0.0.x

La plupart du code continue de fonctionner. Les changements :

| 0.0.x | Maintenant |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Fonctionne toujours. Préférez `createClient(url, { auth: { token } })`. |
| Les requêtes en échec se résolvaient avec le corps de l'erreur | Elles lèvent une `ElysianDBError`. |
| `count()` renvoyait `{ count }` | `count()` renvoie un nombre. |
| `countWithOptions(options)` | `count(options)` (l'ancien nom fonctionne toujours). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (l'ancien nom fonctionne toujours). |
| `db.transaction()` se résolvait avec `undefined` | Elle se résout avec la valeur renvoyée par le callback. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (l'ancienne méthode fonctionne toujours). |
| Imports depuis `dist/index.js` | Le paquet a une map `exports` : importez uniquement depuis `@elysiandbjs/client`. |

## Développement

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

Les tests d'intégration tournent sur de vrais serveurs ElysianDB, un par mode d'authentification :

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

La CI compile ElysianDB 0.2.3 depuis les sources et lance les deux suites.

Pour publier une version, lancez `make release` (ou `make release VERSION=minor`) sur une branche `main` à jour : la commande incrémente la version et pousse le tag, puis le workflow Release lance la CI et publie le paquet sur npm avec provenance. Le workflow a besoin du secret `NPM_TOKEN`.

`README.md` est la documentation de référence : modifiez-le d'abord, puis les traductions dans [`docs/i18n`](./), qui ne sont pas publiées sur npm. `CHANGELOG.md` n'existe qu'en anglais.

## Licence

MIT
