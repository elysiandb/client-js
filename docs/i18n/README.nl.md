# ElysianDB-client voor JavaScript & TypeScript

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md) · **Nederlands** · [Português](README.pt.md) · [中文](README.zh.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

> Dit is een vertaling. De [Engelse README](../../README.md) is de referentie en kan recenter zijn.

De officiële client voor [ElysianDB](https://github.com/elysiandb/elysiandb), de backend in één binary die JSON omzet in een REST API. Hij dekt de volledige HTTP API van ElysianDB 0.2.3:

- **Documenten**: getypeerde CRUD, batch-writes, filters, zoeken, sorteren, paginering, projecties, includes, asynchrone iteratie
- **Query API**: filterbomen met `and` / `or` en sortering op meerdere velden
- **Transacties**: automatische commit of rollback
- **Sleutel–waardeopslag**: waarden met TTL, multi-get en wildcards
- **Authenticatie**: de modi `token`, `basic` en `user` (sessie)
- **Beheer**: entiteitstypen en schema's, migraties, gebruikers, ACL's, hooks, export/import, backup/restore, monitoring en logs
- **Robuuste requests**: getypeerde fouten, time-outs, annulering, herhaalpogingen, request-hooks

De client heeft geen dependencies, levert ES-modules, CommonJS en TypeScript-types mee, en draait op Node.js 20+, Bun, Deno en in browsers.

## Inhoud

- [Installatie](#installatie)
- [Snel aan de slag](#snel-aan-de-slag)
- [Verbinding maken](#verbinding-maken)
- [Authenticatie](#authenticatie)
- [Documenten](#documenten)
- [Namen, ID's en sleutels](#namen-ids-en-sleutels)
- [Opvragen en filteren](#opvragen-en-filteren)
- [Query API](#query-api)
- [Transacties](#transacties)
- [Sleutel–waardeopslag](#sleutelwaardeopslag)
- [Entiteitstypen, schema's en migraties](#entiteitstypen-schemas-en-migraties)
- [Gebruikers en ACL's](#gebruikers-en-acls)
- [Hooks](#hooks)
- [Beheer](#beheer)
- [Monitoring](#monitoring)
- [Foutafhandeling](#foutafhandeling)
- [Time-outs, herhaalpogingen en annulering](#time-outs-herhaalpogingen-en-annulering)
- [Request-hooks en ruwe requests](#request-hooks-en-ruwe-requests)
- [Runtimes en browsers](#runtimes-en-browsers)
- [API-referentie](#api-referentie)
- [Migreren vanaf 0.0.x](#migreren-vanaf-00x)
- [Ontwikkeling](#ontwikkeling)

## Installatie

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Start een ElysianDB-server als je er nog geen hebt:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Snel aan de slag

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

`entity<T>()` levert getypeerde resultaten op: `create()` neemt het document zonder `id` aan (ElysianDB genereert er een), `update()` accepteert elke willekeurige deelverzameling van de velden.

## Verbinding maken

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

| Optie | Standaard | Beschrijving |
| --- | --- | --- |
| `auth` | geen | Inloggegevens: `{ token }`, `{ username, password }` of `{ session }`. Zie [Authenticatie](#authenticatie). |
| `headers` | `{}` | Headers die aan elke request worden toegevoegd. |
| `timeout` | geen | Time-out per request in milliseconden. |
| `retries` | `0` | Aantal herhaalpogingen voor `GET`-, `PUT`- en `DELETE`-requests na een netwerkfout of een antwoord met status `429`, `502`, `503` of `504`. |
| `retryDelay` | `300` | Wachttijd vóór de eerste herhaalpoging in milliseconden, verdubbeld bij elke volgende poging. `Retry-After` wordt gerespecteerd. |
| `fetch` | globale `fetch` | Eigen `fetch`-implementatie. |
| `credentials` | standaard van de runtime | `credentials`-modus van browserrequests. Zet hem op `"include"` voor sessies in `user`-modus over verschillende origins heen. |
| `onRequest` | geen | Wordt vóór elke request aangeroepen. Kan de headers ervan aanpassen. |
| `onResponse` | geen | Wordt na elk antwoord aangeroepen, of het nu geslaagd is of niet. |

Controleer met `health()` of de server draait. Deze methode gooit nooit een fout en heeft geen inloggegevens nodig:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Authenticatie

ElysianDB kent drie authenticatiemodi (`security.authentication.mode`). Geef de bijbehorende inloggegevens mee aan de client:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

In `user`-modus opent `login()` een sessie (cookie `edb_session`) die de client bij de volgende requests meestuurt. Alleen admins kunnen inloggen. Op Node.js, Bun en Deno bewaart de client het sessie-ID in `db.auth.session`, zodat je het kunt opslaan en later opnieuw kunt gebruiken:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

In browsers is de sessiecookie `HttpOnly`: de browser bewaart hem en `db.auth.session` blijft `undefined`. Hebben je pagina en ElysianDB een verschillende origin, zet dan de origin van de pagina in `server.http.cors.allowedOrigins` en maak de client aan met `credentials: "include"`.

Je kunt de inloggegevens op elk moment wijzigen:

| Onderdeel | Beschrijving |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` of `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Schakelt over op andere inloggegevens. |
| `db.auth.login(username, password)` | Opent een sessie (`user`-modus). Na herhaaldelijk mislukte pogingen volgt een `429` met `error.retryAfter`. |
| `db.auth.logout()` | Beëindigt de sessie en wist de inloggegevens. |
| `db.auth.me()` | De gebruiker van de huidige sessie. |
| `db.auth.clear()` | Stopt met het meesturen van inloggegevens. |
| `db.auth.onChange(listener)` | Wordt aangeroepen wanneer de inloggegevens veranderen. Geeft een functie terug waarmee je je weer afmeldt. |

> In `user`-modus vereisen sommige routes een admin: de sleutel–waardeopslag, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` en `deleteAll()`. Routes voor documenten worden getoetst aan de [ACL's](#gebruikers-en-acls).

## Documenten

```ts
const books = db.entity<Book>("books");
```

### Aanmaken

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` valideert eerst alle documenten: is er één ongeldig, dan wordt er niets weggeschreven. Geef je een `id` mee dat al bestaat, dan wordt dat document vervangen.

Geneste objecten met een sleutel `@entity` worden als aparte documenten opgeslagen en vervangen door een link (`{ "@entity": "authors", "id": "..." }`). Met [`includes`](#opvragen-en-filteren) klap je ze weer uit:

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Lezen

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Bijwerken

Updates zijn gedeeltelijk: de body wordt samengevoegd met het opgeslagen document. Zet een veld op `null` om het te verwijderen.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

Een update maakt nooit een document aan: `update()` gooit een `404`-fout als het document niet bestaat, en `updateMany()` schrijft niets weg als een van de documenten ontbreekt.

### Verwijderen

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Tellen

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Namen, ID's en sleutels

Entiteitsnamen, document-ID's, sleutels, gebruikersnamen en hook-ID's komen in URL-paden terecht, en ElysianDB 0.2.3 decodeert ze niet consequent: een waarde die percent-encoding nodig heeft, kan wel worden weggeschreven maar niet meer worden teruggelezen. De client accepteert alleen waarden die bestaan uit letters (`A-Z`, `a-z`), cijfers en `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, en gooit een `TypeError` voor al het andere, zoals spaties, letters met accenten, `/`, `?`, `#` of `%`. `create()` en `createMany()` controleren het `id` dat je meegeeft op dezelfde manier, zodat elk document ook weer teruggelezen kan worden.

Sommige waarden worden geweigerd omdat ElysianDB ze naar een andere route stuurt, of omdat `fetch` ze uit URL's verwijdert:

| Waarde | Geweigerd als | Waarom |
| --- | --- | --- |
| `.` en `..` | Elke naam, elk ID en elke sleutel | `fetch` verwijdert ze uit URL's: `books.delete(".")` zou alle boeken verwijderen. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Entiteitsnaam | `/api/query` is de Query API, `/api/export` de export, enzovoort. |
| `count`, `schema` | Document-ID in `get()`, `update()` en `create()` | `GET /api/books/count` telt de boeken. `exists()` en `delete()` accepteren ze wel. |
| `mget` | Sleutel in `kv.get()` en `kv.set()` | `GET /kv/mget` is de route van `mget()`. |

De client volgt ook nooit HTTP-redirects, omdat een redirect de request, inclusief inloggegevens, opnieuw naar een andere URL zou sturen. Een redirect mislukt met een `ElysianDBError` waarin de nieuwe locatie staat: krijg je er een, controleer dan de URL van de server.

## Opvragen en filteren

`list()` vertaalt zijn opties naar `GET /api/<entity>`:

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

| Optie | Beschrijving |
| --- | --- |
| `filter` | Voorwaarden op velden, waaraan allemaal voldaan moet worden. Paden kunnen genest zijn (`author.name`) en door arrays en meegeladen entiteiten heen lopen. |
| `search` | Hoofdletterongevoelige zoekopdracht in de stringwaarden van de documenten (en van meegeladen entiteiten). Met `*` wordt het een glob op volledige waarden: `Zeb*`. |
| `sort` | Eén veld: `{ createdAt: "desc" }`. Gebruik [`query()`](#query-api) om op meerdere velden te sorteren. |
| `fields` | Geeft alleen deze velden terug. |
| `includes` | Klapt gekoppelde entiteiten uit: `["author", "author.job"]`, of `"all"`. |
| `limit`, `offset` | Paginering, toegepast na filters en zoekopdracht. `limit` moet een positief geheel getal zijn en `offset` een niet-negatief geheel getal: andere waarden negeert ElysianDB, waarna je alle documenten terugkrijgt. |

### Filteroperatoren

| Operator | Strings | Getallen en datums | Arrays |
| --- | --- | --- | --- |
| `eq` | Gelijk aan, hoofdletterongevoelig, `*`-glob | Gelijk aan | Dezelfde items als de lijst |
| `neq` | Niet gelijk aan, `*`-glob | Niet gelijk aan | — |
| `lt`, `lte`, `gt`, `gte` | Lexicografisch | Kleiner / groter dan | — |
| `contains` | Bevat de substring | — | Heeft een item dat gelijk is aan de waarde |
| `not_contains` | Bevat de substring niet | — | Heeft geen item dat gelijk is aan de waarde |
| `all` | — | — | Bevat alle waarden uit de lijst |
| `any` | — | — | Bevat minstens één waarde uit de lijst |
| `none` | — | — | Bevat geen enkele waarde uit de lijst |

Waarden kunnen strings, getallen, booleans of `Date`-objecten zijn (verstuurd als ISO 8601). Arrays worden voor `eq`, `all`, `any` en `none` als kommagescheiden lijsten verstuurd. Een document zonder het veld, of met `null`, voldoet nooit.

### Hulpfuncties voor paginering

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Gebruik een `sort` als je over data itereert die verandert, zodat de pagina's stabiel blijven.

`iterate()` en `listAll()` stoppen bij de eerste pagina die korter is dan `pageSize`, zodra `count()` bevestigt dat alle documenten gelezen zijn. In `user`-modus past ElysianDB 0.2.3 een ACL die wel `owning_read` maar geen `read` toekent pas toe na `limit` en `offset`, waardoor een pagina vóór het einde te kort of zelfs leeg kan zijn: de client haalt de resterende documenten dan in één request op. `list()` en `first()` kunnen dat niet detecteren en geven in dat geval mogelijk minder documenten terug dan `limit`.

## Query API

`query()` gebruikt `POST /api/query`, dat filterbomen met `and` / `or` en sortering op meerdere velden mogelijk maakt:

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

`and()` en `or()` zijn optionele hulpfuncties: `{ or: [...] }` werkt ook. Een knooppunt kan veldvoorwaarden en `and` / `or` combineren; de client zet het dan om in een `and`, omdat ElysianDB per knooppunt maar één van beide leest.

**`list()` of `query()`?**

| | `list()` | `query()` |
| --- | --- | --- |
| Veldvoorwaarden (allemaal vereist) | ✓ | ✓ |
| Bomen met `and` / `or` | | ✓ |
| Meerdere sorteersleutels | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## Transacties

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` voert een commit uit zodra de callback resolvet en geeft het resultaat ervan terug. Gooit de callback een fout, dan volgt een rollback en wordt de fout opnieuw gegooid.

- Bewerkingen worden op de server in een wachtrij gezet en bij de commit toegepast: alles of niets. Een schemafout, of een update van een document dat op dat moment niet meer bestaat, laat de hele commit mislukken met een `400`-fout.
- `tx.create()` geeft het document terug met zijn `id`, dat de client genereert als het ontbreekt, zodat andere documenten in de transactie ernaar kunnen linken (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` werkt alleen op documenten die al zijn opgeslagen: ElysianDB 0.2.3 controleert of het document bestaat op het moment dat de update in de wachtrij komt, dus een update van een document dat in dezelfde transactie is aangemaakt mislukt met een `400`-fout. Zet in dat geval alle velden direct in `tx.create()`.
- Bewerkingen in de wachtrij kunnen vóór de commit niet worden teruggelezen, niet door deze client en ook niet door een andere.
- Bewerkingen en commits worden nooit opnieuw geprobeerd, zodat niets dubbel in de wachtrij komt of dubbel wordt toegepast. ElysianDB laat open transacties nooit verlopen: krijgt een commit geen antwoord (netwerkfout, time-out of afbreking), dan draait de client de transactie terug. Heeft de commit ElysianDB wel bereikt, dan kan hij toch zijn toegepast: controleer dat dus voordat je het opnieuw probeert.
- `tx.entity<T>("books")` biedt getypeerde `create`, `update` en `delete` voor één entiteit.

Een transactie zelf aansturen:

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

## Sleutel–waardeopslag

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Waarden zijn strings. Sleutels volgen de [regels voor namen en ID's](#namen-ids-en-sleutels): `*` is een wildcard in `mget()` en `delete()`, en sleutels voor `mget()` mogen geen `,` bevatten. `mget()` geeft een object zonder prototype terug, zodat elke sleutel, ook `__proto__`, een eigen property is. In `user`-modus vereist de sleutel–waardeopslag een admin.

## Entiteitstypen, schema's en migraties

Entiteitstypen ontstaan bij het eerste document dat wordt weggeschreven, of worden vooraf gedeclareerd met een strikt schema:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Lees of vervang het schema van een entiteitstype. Een handmatig schema weigert onbekende velden en ontbrekende verplichte velden:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

De veldtypen zijn `string`, `number`, `boolean`, `object` (met geneste `fields`) en `array`. Schrijfacties die het schema schenden, gooien een fout met [`validationErrors`](#foutafhandeling).

Migraties werken alle documenten van een entiteitstype bij, geneste paden inbegrepen:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Gebruikers en ACL's

Deze routes bestaan in `user`-modus en vereisen een admin-sessie.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACL's kennen rechten toe per gebruiker en entiteitstype: `create`, `read`, `update`, `delete`, en `owning_read`, `owning_update`, `owning_delete` voor de documenten die een gebruiker bezit (hun veld `_elysiandb_core_username`).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Hooks zijn JavaScript-functies die ElysianDB bij leesacties uitvoert (`api.hooks.enabled: true`). Ze vereisen admin-inloggegevens.

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

## Beheer

In `user`-modus vereisen deze aanroepen een admin.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Documenten exporteren en importeren (accounts, ACL's, schema's en KV-sleutels worden niet meegenomen):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Een volledige instantie back-uppen en herstellen, inclusief accounts:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` komt van de server, maar is altijd een gewone bestandsnaam op `.tar.gz` zonder map: de client vervangt elke andere naam door `elysiandb-backup.tar.gz`, zodat de server niet kan bepalen waar je naartoe schrijft.

Een restore vervangt alle data en beëindigt alle sessies, ook de huidige. De HTTP API accepteert archieven tot 4 MB: gebruik `elysiandb backup` en `elysiandb restore` voor grotere instanties. Archieven bevatten wachtwoordhashes: bewaar ze net zo zorgvuldig als de datamap.

## Monitoring

De monitoring-endpoints van de Admin UI, met admin-inloggegevens:

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

Is `monitoring.prometheus.token` ingesteld, geef dat token dan mee aan `metrics()`: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Foutafhandeling

Elke methode gooit een `ElysianDBError` als de request mislukt:

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

| Eigenschap | Beschrijving |
| --- | --- |
| `code` | `"HTTP_ERROR"` (ElysianDB antwoordde met 4xx/5xx of met een redirect), `"NETWORK_ERROR"`, `"TIMEOUT"` of `"ABORTED"` |
| `status` | HTTP-status, `0` als er geen antwoord is ontvangen |
| `message` | Methode, pad, status en de foutmelding van ElysianDB |
| `data` | Geparste response-body |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` voor geweigerde schrijfacties, batch-writes (`index`) en imports |
| `requestId` | `X-Request-Id` van het antwoord |
| `retryAfter` | Aantal seconden wachten, na een `429` |
| `method`, `url` | De mislukte request |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Snelle controles |

## Time-outs, herhaalpogingen en annulering

Stel standaardwaarden in op de client en overschrijf ze per aanroep via het laatste argument van elke methode:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

De opties per aanroep zijn `signal`, `timeout`, `retries`, `requestId` (verstuurd als `X-Request-Id`) en `headers`.

Alleen idempotente requests (`GET`, `PUT`, `DELETE`) worden opnieuw geprobeerd, na een netwerkfout of een antwoord met status `429`, `502`, `503` of `504`. `POST`-requests, zoals `create()`, een login of een commit, en de bewerkingen van een transactie worden nooit opnieuw geprobeerd.

## Request-hooks en ruwe requests

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

Roep elke willekeurige route aan met `request()`, of met `send()` als je ook de status en de headers wilt hebben:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Runtimes en browsers

- Node.js 20 of hoger, Bun, Deno en browsers: de client heeft alleen `fetch` nodig. Geef voor andere omgevingen `fetch` mee in de opties.
- Zowel ES-modules (`import`) als CommonJS (`require`) worden gepubliceerd, met TypeScript-types.
- Browsers kunnen ElysianDB alleen vanaf een andere origin aanroepen als die origin in `server.http.cors.allowedOrigins` staat.
- Lever nooit admin-inloggegevens of het token van de instantie uit aan browsers.

ElysianDB 0.2.3 beperkt wat een pagina over origins heen kan doen:

- De header `X-Request-Id` is niet toegestaan: een request met de optie `requestId` zakt voor de CORS-preflight. Laat `requestId` weg in browsers die een andere origin aanroepen.
- Response-headers worden niet vrijgegeven: `health().version` is `null`, `error.requestId` en `error.retryAfter` zijn `undefined`, `send()` ziet alleen de headers die CORS standaard toestaat, zoals `Content-Type`, en `admin.backup()` noemt het bestand `elysiandb-backup.tar.gz`.

`tx.create()` genereert ID's met `crypto.randomUUID()`, of met `crypto.getRandomValues()` op pagina's die niet via HTTPS worden geserveerd.

## API-referentie

| Aanroep | Route |
| --- | --- |
| **Client** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | elke |
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

## Migreren vanaf 0.0.x

De meeste code blijft gewoon werken. Wat er verandert:

| 0.0.x | Nu |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Werkt nog steeds. Gebruik bij voorkeur `createClient(url, { auth: { token } })`. |
| Mislukte requests resolveden met de foutbody | Ze gooien een `ElysianDBError`. |
| `count()` gaf `{ count }` terug | `count()` geeft een getal terug. |
| `countWithOptions(options)` | `count(options)` (de oude naam werkt nog). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (de oude naam werkt nog). |
| `db.transaction()` resolvede met `undefined` | Resolvet met de waarde die de callback teruggeeft. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (de oude methode werkt nog). |
| Imports uit `dist/index.js` | Het pakket heeft een `exports`-map: importeer alleen uit `@elysiandbjs/client`. |

## Ontwikkeling

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

De integratietests draaien tegen echte ElysianDB-servers, één per authenticatiemodus:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

De CI bouwt ElysianDB 0.2.3 vanuit de broncode en draait beide testsuites.

Voor een release voer je `make release` (of `make release VERSION=minor`) uit op een bijgewerkte `main`: dat verhoogt het versienummer en pusht de tag, waarna de Release-workflow de CI draait en het pakket met provenance naar npm publiceert. De workflow heeft de secret `NPM_TOKEN` nodig.

`README.md` is de referentiedocumentatie: pas die eerst aan en daarna de vertalingen in [`docs/i18n`](./), die niet naar npm worden gepubliceerd. `CHANGELOG.md` is alleen in het Engels beschikbaar.

## Licentie

MIT
