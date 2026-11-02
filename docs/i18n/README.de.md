# ElysianDB-Client für JavaScript & TypeScript

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · [Español](README.es.md) · **Deutsch** · [Nederlands](README.nl.md) · [Português](README.pt.md) · [中文](README.zh.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

> Dies ist eine Übersetzung. Maßgeblich ist das [englische README](../../README.md), das unter Umständen aktueller ist.

Der offizielle Client für [ElysianDB](https://github.com/elysiandb/elysiandb), das Backend aus einer einzigen Binärdatei, das aus JSON eine REST-API macht. Er deckt die gesamte HTTP-API von ElysianDB 0.2.3 ab:

- **Dokumente**: typisiertes CRUD, Batch-Schreibvorgänge, Filter, Suche, Sortierung, Paginierung, Projektionen, Includes, asynchrone Iteration
- **Query API**: Filterbäume mit `and` / `or` und Sortierung nach mehreren Feldern
- **Transaktionen**: automatischer Commit oder Rollback
- **Schlüssel–Wert-Speicher**: Werte mit TTL, Multi-Get und Wildcards
- **Authentifizierung**: Modi `token`, `basic` und `user` (Session)
- **Administration**: Entitätstypen und Schemas, Migrationen, Benutzer, ACLs, Hooks, Export/Import, Backup/Restore, Monitoring und Logs
- **Robuste Anfragen**: typisierte Fehler, Timeouts, Abbruch, Wiederholungen, Request-Hooks

Er hat keine Abhängigkeiten, wird als ES-Module, CommonJS und mit TypeScript-Typen ausgeliefert und läuft unter Node.js 20+, Bun, Deno und im Browser.

## Inhalt

- [Installation](#installation)
- [Schnellstart](#schnellstart)
- [Verbindung herstellen](#verbindung-herstellen)
- [Authentifizierung](#authentifizierung)
- [Dokumente](#dokumente)
- [Namen, IDs und Schlüssel](#namen-ids-und-schlüssel)
- [Auflisten und Filtern](#auflisten-und-filtern)
- [Query API](#query-api)
- [Transaktionen](#transaktionen)
- [Schlüssel–Wert-Speicher](#schlüsselwert-speicher)
- [Entitätstypen, Schemas und Migrationen](#entitätstypen-schemas-und-migrationen)
- [Benutzer und ACLs](#benutzer-und-acls)
- [Hooks](#hooks)
- [Administration](#administration)
- [Monitoring](#monitoring)
- [Fehlerbehandlung](#fehlerbehandlung)
- [Timeouts, Wiederholungen und Abbruch](#timeouts-wiederholungen-und-abbruch)
- [Request-Hooks und direkte Anfragen](#request-hooks-und-direkte-anfragen)
- [Laufzeitumgebungen und Browser](#laufzeitumgebungen-und-browser)
- [API-Referenz](#api-referenz)
- [Migration von 0.0.x](#migration-von-00x)
- [Entwicklung](#entwicklung)

## Installation

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Falls du noch keinen ElysianDB-Server hast, starte einen:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Schnellstart

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

`entity<T>()` liefert typisierte Ergebnisse: `create()` erwartet das Dokument ohne `id` (ElysianDB erzeugt eine), `update()` akzeptiert eine beliebige Teilmenge der Felder.

## Verbindung herstellen

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

| Option | Standardwert | Beschreibung |
| --- | --- | --- |
| `auth` | keine | Zugangsdaten: `{ token }`, `{ username, password }` oder `{ session }`. Siehe [Authentifizierung](#authentifizierung). |
| `headers` | `{}` | Header, die jeder Anfrage hinzugefügt werden. |
| `timeout` | keine | Timeout pro Anfrage in Millisekunden. |
| `retries` | `0` | Wiederholungen von `GET`-, `PUT`- und `DELETE`-Anfragen nach einem Netzwerkfehler oder einer Antwort mit `429`, `502`, `503` oder `504`. |
| `retryDelay` | `300` | Wartezeit vor der ersten Wiederholung in Millisekunden, die sich bei jeder weiteren Wiederholung verdoppelt. `Retry-After` wird berücksichtigt. |
| `fetch` | globales `fetch` | Eigene `fetch`-Implementierung. |
| `credentials` | Standard der Laufzeitumgebung | `credentials`-Modus für Anfragen im Browser. Für Sessions im `user`-Modus über Origins hinweg auf `"include"` setzen. |
| `onRequest` | keine | Wird vor jeder Anfrage aufgerufen. Kann deren Header ändern. |
| `onResponse` | keine | Wird nach jeder Antwort aufgerufen, ob erfolgreich oder nicht. |

Mit `health()` prüfst du, ob der Server läuft. Die Methode wirft nie und braucht keine Zugangsdaten:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Authentifizierung

ElysianDB kennt drei Authentifizierungsmodi (`security.authentication.mode`). Übergib dem Client die passenden Zugangsdaten:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

Im `user`-Modus öffnet `login()` eine Session (Cookie `edb_session`), die der Client bei den folgenden Anfragen mitschickt. Nur Admins können sich anmelden. Unter Node.js, Bun und Deno hält der Client die Session-ID in `db.auth.session` bereit, sodass du sie speichern und später wiederverwenden kannst:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

Im Browser ist das Session-Cookie `HttpOnly`: Der Browser verwaltet es selbst, und `db.auth.session` bleibt `undefined`. Haben deine Seite und ElysianDB unterschiedliche Origins, trage den Origin der Seite in `server.http.cors.allowedOrigins` ein und erstelle den Client mit `credentials: "include"`.

Die Zugangsdaten lassen sich jederzeit ändern:

| Member | Beschreibung |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` oder `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Wechselt die Zugangsdaten. |
| `db.auth.login(username, password)` | Öffnet eine Session (`user`-Modus). Wiederholte Fehlversuche führen zu `429` mit `error.retryAfter`. |
| `db.auth.logout()` | Beendet die Session und verwirft die Zugangsdaten. |
| `db.auth.me()` | Der Benutzer der aktuellen Session. |
| `db.auth.clear()` | Sendet keine Zugangsdaten mehr. |
| `db.auth.onChange(listener)` | Wird aufgerufen, wenn sich die Zugangsdaten ändern. Gibt eine Funktion zum Abmelden des Listeners zurück. |

> Im `user`-Modus erfordern einige Routen einen Admin: der Schlüssel–Wert-Speicher, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` und `deleteAll()`. Dokumentrouten werden anhand der [ACLs](#benutzer-und-acls) geprüft.

## Dokumente

```ts
const books = db.entity<Book>("books");
```

### Erstellen

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` validiert zuerst alle Dokumente: Ist eines ungültig, wird nichts geschrieben. Wird eine bereits vorhandene `id` übergeben, ersetzt das neue Dokument das bestehende.

Verschachtelte Objekte mit einem `@entity`-Schlüssel werden als eigene Dokumente gespeichert und durch einen Verweis ersetzt (`{ "@entity": "authors", "id": "..." }`). Mit [`includes`](#auflisten-und-filtern) lassen sie sich wieder auflösen:

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Lesen

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Aktualisieren

Updates sind partiell: Der Body wird mit dem gespeicherten Dokument zusammengeführt. Setze ein Feld auf `null`, um es zu entfernen.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

Ein Update legt nie ein Dokument an: `update()` wirft einen `404`-Fehler, wenn das Dokument nicht existiert, und `updateMany()` schreibt nichts, wenn eines der Dokumente fehlt.

### Löschen

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Zählen

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Namen, IDs und Schlüssel

Entitätsnamen, Dokument-IDs, Schlüssel, Benutzernamen und Hook-IDs landen im URL-Pfad, und ElysianDB 0.2.3 dekodiert sie nicht einheitlich: Ein Schlüssel oder eine ID, die Percent-Encoding braucht, ließe sich zwar schreiben, aber nicht wieder lesen. Der Client akzeptiert daher nur Werte aus Buchstaben (`A-Z`, `a-z`), Ziffern und `- _ . ! ~ * ' ( ) : @ $ & + , ; =` und wirft bei allem anderen einen `TypeError`, etwa bei Leerzeichen, Umlauten oder Buchstaben mit Akzent, `/`, `?`, `#` oder `%`. `create()` und `createMany()` prüfen eine übergebene `id` auf dieselbe Weise, damit sich jedes Dokument wieder lesen lässt.

Für Entitätsnamen gelten strengere Regeln: Buchstaben, Ziffern, `_`, `-` und `.`, ohne `.` am Anfang. ElysianDB bildet daraus seine Speicherschlüssel und Muster, sodass `:` oder `*` andere Entitäten erreichen würden: `db.entity("books:id").deleteAll()` würde alle Bücher löschen. Entitätstypen, die ein anderer Client mit anderen Namen angelegt hat, bleiben über `db.request()` und `encodeURIComponent()` erreichbar.

Manche Werte werden abgelehnt, weil ElysianDB sie an andere Routen weiterleitet oder weil `fetch` sie aus URLs entfernt:

| Wert | Abgelehnt als | Grund |
| --- | --- | --- |
| `.` und `..` | Beliebiger Name, beliebige ID oder beliebiger Schlüssel | `fetch` entfernt sie aus URLs: `books.delete(".")` würde alle Bücher löschen. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Entitätsname | `/api/query` ist die Query API, `/api/export` der Export usw. |
| `count`, `schema` | Dokument-ID in `get()`, `update()` und `create()` | `GET /api/books/count` zählt die Bücher. `exists()` und `delete()` akzeptieren sie weiterhin. |
| `mget` | Schlüssel in `kv.get()` und `kv.set()` | `GET /kv/mget` ist die Route von `mget()`. |
| Schlüssel mit `*` | Schlüssel in `kv.get()` und `kv.set()` | `*` ist der Platzhalter von `mget()` und `delete()`. |

ElysianDB 0.2.3 vergleicht manche Speicherschlüssel außerdem ohne Beachtung der Groß- und Kleinschreibung: Verwende keine Entitätsnamen, die sich nur in der Groß- und Kleinschreibung unterscheiden, denn `deleteAll()` auf `Books` verwirft die Indizes von `books`.

Außerdem folgt der Client nie HTTP-Weiterleitungen, da eine Weiterleitung die Anfrage samt Zugangsdaten an eine andere URL erneut senden würde. Eine Weiterleitung schlägt mit einem `ElysianDBError` fehl, der das neue Ziel angibt: Prüfe in diesem Fall die URL des Servers.

## Auflisten und Filtern

`list()` bildet seine Optionen auf `GET /api/<entity>` ab:

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

| Option | Beschreibung |
| --- | --- |
| `filter` | Bedingungen auf Feldern, die alle erfüllt sein müssen. Pfade können verschachtelt sein (`author.name`) und durch Arrays und eingebundene Entitäten führen. |
| `search` | Suche ohne Beachtung der Groß-/Kleinschreibung in den String-Werten der Dokumente (und der eingebundenen Entitäten). Mit `*` ein Glob auf ganze Werte: `Zeb*`. |
| `sort` | Ein Feld: `{ createdAt: "desc" }`. Für die Sortierung nach mehreren Feldern [`query()`](#query-api) verwenden. |
| `fields` | Gibt nur diese Felder zurück. |
| `includes` | Löst verknüpfte Entitäten auf: `["author", "author.job"]` oder `"all"`. |
| `limit`, `offset` | Paginierung, angewendet nach Filtern und Suche. `limit` muss eine positive ganze Zahl sein und `offset` eine nicht negative ganze Zahl: Andere Werte würde ElysianDB ignorieren und alle Dokumente zurückgeben. |

### Filteroperatoren

| Operator | Strings | Zahlen und Datumswerte | Arrays |
| --- | --- | --- | --- |
| `eq` | Gleich, ohne Beachtung der Groß-/Kleinschreibung, `*`-Glob | Gleich | Dieselben Elemente wie die Liste |
| `neq` | Ungleich, `*`-Glob | Ungleich | — |
| `lt`, `lte`, `gt`, `gte` | Lexikografisch | Kleiner / größer als | — |
| `contains` | Enthält den Teilstring | — | Enthält ein Element, das dem Wert entspricht |
| `not_contains` | Enthält den Teilstring nicht | — | Enthält kein Element, das dem Wert entspricht |
| `all` | — | — | Enthält alle Werte der Liste |
| `any` | — | — | Enthält mindestens einen Wert der Liste |
| `none` | — | — | Enthält keinen der Werte der Liste |

Werte können Strings, Zahlen, Booleans oder `Date`-Objekte (gesendet als ISO 8601) sein. Für `eq`, `all`, `any` und `none` werden Arrays als kommagetrennte Listen gesendet. Ein Dokument ohne das Feld oder mit `null` darin trifft nie zu.

### Hilfsfunktionen für die Paginierung

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Gib ein `sort` an, wenn du über Daten iterierst, die sich ändern, damit die Seiten stabil bleiben.

`iterate()` und `listAll()` hören bei der ersten Seite auf, die kürzer als `pageSize` ist, sobald `count()` bestätigt, dass alle Dokumente gelesen wurden. Im `user`-Modus wendet ElysianDB 0.2.3 eine ACL, die `owning_read`, aber nicht `read` gewährt, erst nach `limit` und `offset` an. Eine Seite kann daher vor dem Ende zu kurz oder sogar leer sein: Der Client holt die restlichen Dokumente dann in einer einzigen Anfrage. `list()` und `first()` können das nicht erkennen und liefern in diesem Fall unter Umständen weniger Dokumente als `limit`.

## Query API

`query()` nutzt `POST /api/query` und bietet damit Filterbäume mit `and` / `or` sowie Sortierung nach mehreren Feldern:

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

`and()` und `or()` sind optionale Hilfsfunktionen: `{ or: [...] }` funktioniert genauso. Ein Knoten darf Feldbedingungen und `and` / `or` mischen; der Client macht daraus ein `and`, da ElysianDB pro Knoten nur eines davon auswertet.

**`list()` oder `query()`?**

| | `list()` | `query()` |
| --- | --- | --- |
| Feldbedingungen (alle müssen zutreffen) | ✓ | ✓ |
| Bäume mit `and` / `or` | | ✓ |
| Mehrere Sortierschlüssel | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## Transaktionen

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` führt den Commit aus, sobald der Callback erfolgreich abschließt, und gibt dessen Ergebnis zurück. Wirft der Callback einen Fehler, wird die Transaktion zurückgerollt und der Fehler erneut geworfen.

- Operationen werden auf dem Server in eine Warteschlange gestellt und beim Commit nach dem Alles-oder-nichts-Prinzip angewendet. Ein Schemafehler oder das Update eines Dokuments, das zu diesem Zeitpunkt nicht mehr existiert, lässt den gesamten Commit mit einem `400`-Fehler scheitern.
- `tx.create()` gibt das Dokument mit seiner `id` zurück, die der Client erzeugt, falls sie fehlt, damit andere Dokumente der Transaktion darauf verweisen können (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` gilt nur für bereits gespeicherte Dokumente: ElysianDB 0.2.3 prüft schon beim Einreihen des Updates, ob das Dokument existiert. Das Update eines Dokuments, das in derselben Transaktion angelegt wurde, schlägt deshalb mit einem `400`-Fehler fehl. Übergib stattdessen alle Felder direkt an `tx.create()`.
- Eingereihte Operationen lassen sich vor dem Commit nicht lesen, weder von diesem noch von einem anderen Client.
- Operationen und Commits werden nie wiederholt, damit nichts doppelt eingereiht oder angewendet wird. ElysianDB lässt offene Transaktionen nie verfallen: Bleibt ein Commit ohne Antwort (Netzwerkfehler, Timeout oder Abbruch), rollt der Client die Transaktion zurück. Hat der Commit ElysianDB erreicht, wurde er möglicherweise trotzdem angewendet. Prüfe das also, bevor du es erneut versuchst.
- `tx.entity<T>("books")` liefert typisierte `create`, `update` und `delete` für eine Entität.

So steuerst du eine Transaktion selbst:

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

## Schlüssel–Wert-Speicher

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Werte sind Strings. Für Schlüssel gelten die [Regeln für Namen und IDs](#namen-ids-und-schlüssel). `*` ist in `mget()` und `delete()` ein Platzhalter, und Muster ignorieren die Groß- und Kleinschreibung: `delete("Cache:*")` löscht auch `cache:1`. Schlüssel für `mget()` dürfen kein `,` enthalten. Im `user`-Modus erfordert der Schlüssel–Wert-Speicher einen Admin.

## Entitätstypen, Schemas und Migrationen

Entitätstypen entstehen mit dem ersten geschriebenen Dokument oder werden vorab mit einem strikten Schema deklariert:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Das Schema eines Entitätstyps lässt sich lesen oder ersetzen. Ein manuelles Schema lehnt unbekannte Felder und fehlende Pflichtfelder ab:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

Die Feldtypen sind `string`, `number`, `boolean`, `object` (mit verschachtelten `fields`) und `array`. Schreibvorgänge, die das Schema verletzen, werfen einen Fehler mit [`validationErrors`](#fehlerbehandlung).

Migrationen aktualisieren alle Dokumente eines Entitätstyps, verschachtelte Pfade eingeschlossen:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Benutzer und ACLs

Diese Routen gibt es im `user`-Modus, und sie erfordern eine Admin-Session.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

ACLs vergeben Berechtigungen pro Benutzer und Entitätstyp: `create`, `read`, `update`, `delete` sowie `owning_read`, `owning_update` und `owning_delete` für die Dokumente, die einem Benutzer gehören (laut ihrem Feld `_elysiandb_core_username`).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Hooks sind JavaScript-Funktionen, die ElysianDB bei Lesezugriffen ausführt (`api.hooks.enabled: true`). Sie erfordern Admin-Zugangsdaten.

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

Im `user`-Modus erfordern diese Aufrufe einen Admin.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Dokumente exportieren und importieren (Konten, ACLs, Schemas und KV-Schlüssel sind nicht enthalten):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Eine komplette Instanz sichern und wiederherstellen, Konten eingeschlossen:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` stammt vom Server, ist aber immer ein einfacher `.tar.gz`-Dateiname ohne Verzeichnis: Jeden anderen Namen ersetzt der Client durch `elysiandb-backup.tar.gz`, damit der Server nicht bestimmen kann, wohin du schreibst.

Ein Restore ersetzt sämtliche Daten und beendet alle Sessions, auch die aktuelle. Die HTTP-API akzeptiert Archive bis 4 MB: Für größere Instanzen `elysiandb backup` und `elysiandb restore` verwenden. Archive enthalten Passwort-Hashes: Bewahre sie so sorgfältig auf wie das Datenverzeichnis.

## Monitoring

Die Monitoring-Endpunkte der Admin UI, mit Admin-Zugangsdaten:

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

Ist `monitoring.prometheus.token` gesetzt, übergib dieses Token an `metrics()`: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Fehlerbehandlung

Jede Methode wirft einen `ElysianDBError`, wenn die Anfrage fehlschlägt:

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

| Eigenschaft | Beschreibung |
| --- | --- |
| `code` | `"HTTP_ERROR"` (ElysianDB hat mit 4xx/5xx oder einer Weiterleitung geantwortet), `"NETWORK_ERROR"`, `"TIMEOUT"` oder `"ABORTED"` |
| `status` | HTTP-Status, `0`, wenn keine Antwort empfangen wurde |
| `message` | Methode, Pfad, Status und die Meldung von ElysianDB |
| `data` | Geparster Response-Body |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` für abgelehnte Schreibvorgänge, Batch-Schreibvorgänge (`index`) und Importe |
| `requestId` | `X-Request-Id` der Antwort |
| `retryAfter` | Wartezeit in Sekunden nach einem `429` |
| `method`, `url` | Die fehlgeschlagene Anfrage |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Kurzabfragen |

## Timeouts, Wiederholungen und Abbruch

Lege Standardwerte am Client fest und überschreibe sie pro Aufruf über das letzte Argument jeder Methode:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

Die Optionen pro Aufruf sind `signal`, `timeout`, `retries`, `requestId` (gesendet als `X-Request-Id`) und `headers`.

Nur idempotente Anfragen (`GET`, `PUT`, `DELETE`) werden wiederholt, und zwar nach einem Netzwerkfehler oder einer Antwort mit `429`, `502`, `503` oder `504`. `POST`-Anfragen wie `create()`, ein Login oder ein Commit sowie die Operationen einer Transaktion werden nie wiederholt.

## Request-Hooks und direkte Anfragen

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

Mit `request()` rufst du eine beliebige Route auf, mit `send()` erhältst du zusätzlich Status und Header:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Laufzeitumgebungen und Browser

- Node.js 20 oder neuer, Bun, Deno und Browser: Der Client braucht nur `fetch`. In anderen Umgebungen `fetch` über die Optionen übergeben.
- Sowohl ES-Module (`import`) als auch CommonJS (`require`) werden veröffentlicht, jeweils mit TypeScript-Typen.
- Browser können ElysianDB von einem anderen Origin aus nur aufrufen, wenn dieser Origin in `server.http.cors.allowedOrigins` eingetragen ist.
- Liefere niemals Admin-Zugangsdaten oder das Token der Instanz an den Browser aus.

ElysianDB 0.2.3 schränkt ein, was eine Seite über Origins hinweg tun kann:

- Der Header `X-Request-Id` ist nicht erlaubt: Eine Anfrage mit der Option `requestId` scheitert am CORS-Preflight. Lass `requestId` im Browser weg, wenn du einen anderen Origin aufrufst.
- Response-Header sind nicht zugänglich: `health().version` ist `null`, `error.requestId` und `error.retryAfter` sind `undefined`, `send()` sieht nur CORS-safelisted Header wie `Content-Type`, und `admin.backup()` nennt die Datei `elysiandb-backup.tar.gz`.

`tx.create()` erzeugt IDs mit `crypto.randomUUID()` bzw. mit `crypto.getRandomValues()` auf Seiten, die nicht über HTTPS ausgeliefert werden.

## API-Referenz

| Aufruf | Route |
| --- | --- |
| **Client** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | beliebig |
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

## Migration von 0.0.x

Der meiste Code funktioniert weiterhin. Die Änderungen:

| 0.0.x | Jetzt |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Funktioniert weiterhin. Besser `createClient(url, { auth: { token } })` verwenden. |
| Fehlgeschlagene Anfragen wurden mit dem Fehler-Body aufgelöst | Sie werfen einen `ElysianDBError`. |
| `count()` gab `{ count }` zurück | `count()` gibt eine Zahl zurück. |
| `countWithOptions(options)` | `count(options)` (der alte Name funktioniert weiterhin). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (der alte Name funktioniert weiterhin). |
| `db.transaction()` wurde mit `undefined` aufgelöst | Wird mit dem Rückgabewert des Callbacks aufgelöst. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (die alte Methode funktioniert weiterhin). |
| Importe aus `dist/index.js` | Das Paket hat eine `exports`-Map: nur aus `@elysiandbjs/client` importieren. |

## Entwicklung

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

Die Integrationstests laufen gegen echte ElysianDB-Server, einen pro Authentifizierungsmodus:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

Die CI baut ElysianDB 0.2.3 aus dem Quellcode und führt beide Testsuiten aus.

Für ein Release führst du `make release` (oder `make release VERSION=minor`) auf einem aktuellen `main` aus: Der Befehl erhöht die Version und pusht den Tag, anschließend führt der Release-Workflow die CI aus und veröffentlicht das Paket mit Provenance auf npm. Der Workflow benötigt das Secret `NPM_TOKEN`.

`README.md` ist die maßgebliche Dokumentation: Ändere zuerst sie, dann die Übersetzungen in [`docs/i18n`](./), die nicht auf npm veröffentlicht werden. `CHANGELOG.md` gibt es nur auf Englisch.

## Lizenz

MIT
