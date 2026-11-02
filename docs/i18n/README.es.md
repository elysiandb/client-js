# Cliente JavaScript y TypeScript de ElysianDB

[![npm version](https://img.shields.io/npm/v/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![npm downloads](https://img.shields.io/npm/dm/@elysiandbjs/client)](https://www.npmjs.com/package/@elysiandbjs/client)
[![CI](https://github.com/elysiandb/client-js/actions/workflows/ci.yml/badge.svg)](https://github.com/elysiandb/client-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENCE)

[English](../../README.md) · [Français](README.fr.md) · **Español** · [Deutsch](README.de.md) · [Nederlands](README.nl.md) · [Português](README.pt.md) · [中文](README.zh.md) · [한국어](README.ko.md) · [日本語](README.ja.md)

> Esta es una traducción. La referencia es el [README en inglés](../../README.md), que puede estar más actualizado.

El cliente oficial de [ElysianDB](https://github.com/elysiandb/elysiandb), el backend de un solo binario que convierte JSON en una API REST. Cubre toda la API HTTP de ElysianDB 0.2.3:

- **Documentos**: CRUD tipado, escrituras por lotes, filtros, búsqueda, ordenación, paginación, proyecciones, inclusión de entidades enlazadas, iteración asíncrona
- **Query API**: árboles de filtros `and` / `or` y ordenación por varios campos
- **Transacciones**: commit o rollback automáticos
- **Almacén clave–valor**: valores con TTL, lectura múltiple y comodines
- **Autenticación**: modos `token`, `basic` y `user` (sesión)
- **Administración**: tipos de entidad y esquemas, migraciones, usuarios, ACL, hooks, exportación/importación, copia de seguridad/restauración, monitorización y logs
- **Peticiones robustas**: errores tipados, tiempos de espera, cancelación, reintentos, hooks de petición

No tiene dependencias, se distribuye como módulos ES, CommonJS y tipos TypeScript, y funciona en Node.js 20+, Bun, Deno y navegadores.

## Contenido

- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Conexión](#conexión)
- [Autenticación](#autenticación)
- [Documentos](#documentos)
- [Nombres, IDs y claves](#nombres-ids-y-claves)
- [Listado y filtrado](#listado-y-filtrado)
- [Query API](#query-api)
- [Transacciones](#transacciones)
- [Almacén clave–valor](#almacén-clavevalor)
- [Tipos de entidad, esquemas y migraciones](#tipos-de-entidad-esquemas-y-migraciones)
- [Usuarios y ACL](#usuarios-y-acl)
- [Hooks](#hooks)
- [Administración](#administración)
- [Monitorización](#monitorización)
- [Gestión de errores](#gestión-de-errores)
- [Tiempos de espera, reintentos y cancelación](#tiempos-de-espera-reintentos-y-cancelación)
- [Hooks de petición y peticiones directas](#hooks-de-petición-y-peticiones-directas)
- [Entornos de ejecución y navegadores](#entornos-de-ejecución-y-navegadores)
- [Referencia de la API](#referencia-de-la-api)
- [Migrar desde 0.0.x](#migrar-desde-00x)
- [Desarrollo](#desarrollo)

## Instalación

```bash
npm install @elysiandbjs/client
```

```bash
yarn add @elysiandbjs/client
pnpm add @elysiandbjs/client
bun add @elysiandbjs/client
```

Si no tienes un servidor ElysianDB, arranca uno:

```bash
docker run --rm -p 8089:8089 taymour/elysiandb:latest
```

## Inicio rápido

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

`entity<T>()` devuelve resultados tipados: `create()` recibe el documento sin `id` (ElysianDB lo genera) y `update()` acepta cualquier subconjunto de los campos.

## Conexión

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

| Opción | Por defecto | Descripción |
| --- | --- | --- |
| `auth` | ninguno | Credenciales: `{ token }`, `{ username, password }` o `{ session }`. Consulta [Autenticación](#autenticación). |
| `headers` | `{}` | Cabeceras que se añaden a cada petición. |
| `timeout` | ninguno | Tiempo de espera de la petición, en milisegundos. |
| `retries` | `0` | Reintentos de las peticiones `GET`, `PUT` y `DELETE` tras un error de red o una respuesta `429`, `502`, `503` o `504`. |
| `retryDelay` | `300` | Espera antes del primer reintento, en milisegundos; se duplica en cada reintento. Se respeta `Retry-After`. |
| `fetch` | `fetch` global | Implementación propia de `fetch`. |
| `credentials` | el del entorno | Modo `credentials` de las peticiones del navegador. Usa `"include"` para las sesiones del modo `user` entre orígenes distintos. |
| `onRequest` | ninguno | Se llama antes de cada petición. Puede modificar sus cabeceras. |
| `onResponse` | ninguno | Se llama después de cada respuesta, tenga éxito o no. |

Comprueba que el servidor está en marcha con `health()`. Nunca lanza excepciones y no necesita credenciales:

```ts
const { ok, version } = await db.health(); // { ok: true, status: 200, version: "0.2.3" }
```

## Autenticación

ElysianDB tiene tres modos de autenticación (`security.authentication.mode`). Pasa al cliente las credenciales que correspondan:

```ts
// token mode
const db = createClient(url, { auth: { token: "my-secret-token" } });

// basic mode
const db = createClient(url, { auth: { username: "admin", password: "a-long-password" } });

// user mode: open a session
const db = createClient(url);
const user = await db.auth.login("admin", "a-long-password"); // { username: "admin", role: "admin" }
```

En modo `user`, `login()` abre una sesión (cookie `edb_session`) que el cliente envía en las peticiones siguientes. Solo los usuarios admin pueden iniciar sesión. En Node.js, Bun y Deno, el cliente guarda el ID de sesión en `db.auth.session`, así que puedes almacenarlo y reutilizarlo más tarde:

```ts
const sessionId = db.auth.session;
const later = createClient(url, { auth: { session: sessionId } });
await later.auth.me(); // { username: "admin", role: "admin" }
```

En los navegadores, la cookie de sesión es `HttpOnly`: la conserva el navegador y `db.auth.session` se queda en `undefined`. Si tu página y ElysianDB tienen orígenes distintos, añade el origen de la página a `server.http.cors.allowedOrigins` y crea el cliente con `credentials: "include"`.

Las credenciales se pueden cambiar en cualquier momento:

| Miembro | Descripción |
| --- | --- |
| `db.auth.mode` | `"none"`, `"token"`, `"basic"` o `"session"` |
| `db.auth.useToken(token)` / `useBasic(username, password)` / `useSession(id)` | Cambia las credenciales. |
| `db.auth.login(username, password)` | Abre una sesión (modo `user`). Tras varios fallos seguidos, la respuesta es un `429` con `error.retryAfter`. |
| `db.auth.logout()` | Cierra la sesión y borra las credenciales. |
| `db.auth.me()` | El usuario de la sesión actual. |
| `db.auth.clear()` | Deja de enviar credenciales. |
| `db.auth.onChange(listener)` | Se llama cuando cambian las credenciales. Devuelve una función para cancelar la suscripción. |

> En modo `user`, algunas rutas requieren un admin: el almacén clave–valor, `admin.*`, `entities.create()`, `setSchema()`, `migrate()` y `deleteAll()`. Las rutas de documentos se comprueban con las [ACL](#usuarios-y-acl).

## Documentos

```ts
const books = db.entity<Book>("books");
```

### Crear

```ts
const book = await books.create({ title: "Dune", year: 1965, tags: ["sf"] });
book.id; // generated by ElysianDB

const many = await books.createMany([
  { title: "Neuromancer", year: 1984, tags: ["sf"] },
  { title: "The Hobbit", year: 1937, tags: ["fantasy"] },
]);
```

`createMany()` valida primero todos los documentos: si uno no es válido, no se escribe nada. Si pasas un `id` que ya existe, ese documento se reemplaza.

Los objetos anidados con una clave `@entity` se guardan como documentos independientes y se sustituyen por un enlace (`{ "@entity": "authors", "id": "..." }`). Se expanden con [`includes`](#listado-y-filtrado):

```ts
await books.create({
  title: "Dune",
  year: 1965,
  tags: ["sf"],
  author: { "@entity": "authors", id: "frank-herbert", name: "Frank Herbert" },
});
```

### Leer

```ts
const book = await books.get(id);                          // throws an ElysianDBError (404) when missing
const maybe = await books.getOrNull(id);                   // null when missing
const exists = await books.exists(id);                     // boolean
const withAuthor = await books.get(id, { includes: ["author"], fields: ["title", "author.name"] });
const first = await books.first({ filter: { title: "Dune" } }); // first match, or null
```

### Actualizar

Las actualizaciones son parciales: el cuerpo se fusiona con el documento almacenado. Pon un campo a `null` para eliminarlo.

```ts
const updated = await books.update(id, { year: 1966, subtitle: null });

await books.updateMany([
  { id: "a", year: 1966 },
  { id: "b", tags: ["classic"] },
]);
```

Una actualización nunca crea un documento: `update()` lanza un error `404` si el documento no existe, y `updateMany()` no escribe nada si falta alguno de ellos.

### Eliminar

```ts
await books.delete(id);
await books.deleteAll(); // every document of the entity, and its inferred schema
```

### Contar

```ts
await books.count();                                    // every document
await books.count({ filter: { year: { lt: 1970 } } });  // matching documents
```

## Nombres, IDs y claves

Los nombres de entidad, los IDs de documento, las claves, los nombres de usuario y los IDs de hook van en las rutas de las URL, y ElysianDB 0.2.3 no los decodifica de forma coherente: una clave o un ID que necesite codificación porcentual podría escribirse sin poder volver a leerse. El cliente solo acepta valores formados por letras (`A-Z`, `a-z`), dígitos y `- _ . ! ~ * ' ( ) : @ $ & + , ; =`, y lanza un `TypeError` con cualquier otra cosa, como espacios, letras acentuadas, `/`, `?`, `#` o `%`. `create()` y `createMany()` comprueban del mismo modo el `id` que pasas, para que todos los documentos se puedan volver a leer.

Los nombres de entidad son más estrictos: letras, dígitos, `_`, `-` y `.`, sin un `.` al principio. ElysianDB construye a partir de ellos sus claves de almacenamiento y sus patrones, así que `:` o `*` alcanzarían otras entidades: `db.entity("books:id").deleteAll()` borraría todos los libros. Los tipos de entidad creados con otros nombres, por otro cliente, siguen siendo accesibles con `db.request()` y `encodeURIComponent()`.

Algunos valores se rechazan porque ElysianDB los enruta a otro sitio, o porque `fetch` los elimina de las URL:

| Valor | Se rechaza como | Motivo |
| --- | --- | --- |
| `.` y `..` | Cualquier nombre, ID o clave | `fetch` los elimina de las URL: `books.delete(".")` borraría todos los libros. |
| `query`, `export`, `import`, `backup`, `restore`, `tx`, `entity`, `hook`, `acl`, `security` | Nombre de entidad | `/api/query` es la Query API, `/api/export` la exportación, y así sucesivamente. |
| `count`, `schema` | ID de documento en `get()`, `update()` y `create()` | `GET /api/books/count` cuenta los libros. `exists()` y `delete()` sí los aceptan. |
| `mget` | Clave en `kv.get()` y `kv.set()` | `GET /kv/mget` es la ruta de `mget()`. |
| Claves con `*` | Clave en `kv.get()` y `kv.set()` | `*` es el comodín de `mget()` y `delete()`. |

ElysianDB 0.2.3 también compara algunas claves de almacenamiento sin distinguir mayúsculas de minúsculas: no uses nombres de entidad que solo se diferencien en mayúsculas y minúsculas, ya que `deleteAll()` sobre `Books` borra los índices de `books`.

El cliente tampoco sigue nunca las redirecciones HTTP, ya que una redirección repetiría la petición, credenciales incluidas, contra otra URL. Una redirección falla con un `ElysianDBError` que indica la nueva ubicación: si te ocurre, revisa la URL del servidor.

## Listado y filtrado

`list()` traduce sus opciones a `GET /api/<entity>`:

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

| Opción | Descripción |
| --- | --- |
| `filter` | Condiciones sobre los campos, que deben cumplirse todas. Las rutas pueden ser anidadas (`author.name`) y recorrer arrays y entidades incluidas. |
| `search` | Búsqueda sin distinguir mayúsculas y minúsculas en los valores de texto de los documentos (y de las entidades incluidas). Con `*`, un glob sobre valores completos: `Zeb*`. |
| `sort` | Un solo campo: `{ createdAt: "desc" }`. Usa [`query()`](#query-api) para ordenar por varios campos. |
| `fields` | Devuelve solo estos campos. |
| `includes` | Expande las entidades enlazadas: `["author", "author.job"]`, o `"all"`. |
| `limit`, `offset` | Paginación, aplicada después de los filtros y la búsqueda. `limit` debe ser un entero positivo y `offset` un entero no negativo: ElysianDB ignoraría cualquier otro valor y devolvería todos los documentos. |

### Operadores de filtro

| Operador | Cadenas | Números y fechas | Arrays |
| --- | --- | --- | --- |
| `eq` | Igual, sin distinguir mayúsculas, glob `*` | Igual | Mismos elementos que la lista |
| `neq` | Distinto, glob `*` | Distinto | — |
| `lt`, `lte`, `gt`, `gte` | Orden lexicográfico | Menor / mayor que | — |
| `contains` | Contiene la subcadena | — | Tiene un elemento igual al valor |
| `not_contains` | No contiene la subcadena | — | No tiene ningún elemento igual al valor |
| `all` | — | — | Tiene todos los valores de la lista |
| `any` | — | — | Tiene al menos un valor de la lista |
| `none` | — | — | No tiene ninguno de los valores de la lista |

Los valores pueden ser cadenas, números, booleanos u objetos `Date` (se envían en ISO 8601). Los arrays se envían como listas separadas por comas, para `eq`, `all`, `any` y `none`. Un documento sin el campo, o con `null`, nunca coincide.

### Utilidades de paginación

```ts
// every matching document, fetched 100 at a time
const all = await books.listAll({ filter: { tags: { contains: "sf" } } });

// or one at a time, without loading everything in memory
for await (const book of books.iterate({ pageSize: 500, sort: { year: "asc" } })) {
  console.log(book.title);
}
```

Usa un `sort` cuando recorras datos que cambian, para que las páginas se mantengan estables.

`iterate()` y `listAll()` se detienen en la primera página más corta que `pageSize`, una vez que `count()` confirma que se han leído todos los documentos. En modo `user`, ElysianDB 0.2.3 aplica una ACL que concede `owning_read` pero no `read` después de `limit` y `offset`, así que una página puede salir corta, o vacía, antes del final: en ese caso el cliente obtiene los documentos restantes en una sola petición. `list()` y `first()` no pueden detectarlo, así que en ese caso pueden devolver menos documentos que `limit`.

## Query API

`query()` usa `POST /api/query`, que añade árboles de filtros `and` / `or` y la ordenación por varios campos:

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

`and()` y `or()` son utilidades opcionales: `{ or: [...] }` también funciona. Un nodo puede mezclar condiciones sobre campos y `and` / `or`; el cliente lo convierte en un `and`, porque ElysianDB solo lee uno de ellos por nodo.

**¿`list()` o `query()`?**

| | `list()` | `query()` |
| --- | --- | --- |
| Condiciones sobre campos (deben cumplirse todas) | ✓ | ✓ |
| Árboles `and` / `or` | | ✓ |
| Varias claves de ordenación | | ✓ |
| `search` | ✓ | |
| `includes` | ✓ | |

## Transacciones

```ts
const authorId = await db.transaction(async (tx) => {
  const author = await tx.create("authors", { name: "Frank Herbert" });
  await tx.create("books", { title: "Dune", author: { "@entity": "authors", id: author.id } });
  await tx.update("books", "some-id", { status: "archived" });
  await tx.delete("books", "another-id");
  return author.id;
});
```

`transaction()` hace commit cuando el callback se resuelve y devuelve su resultado. Si el callback lanza una excepción, hace rollback y vuelve a lanzar el error.

- Las operaciones se encolan en el servidor y se aplican en el commit, todas o ninguna. Un error de esquema, o la actualización de un documento que ya no existe en ese momento, rechaza el commit entero con un error `400`.
- `tx.create()` devuelve el documento con su `id`, que genera el cliente si falta, para que otros documentos de la transacción puedan enlazarlo (`{ "@entity": "authors", id: author.id }`).
- `tx.update()` solo se aplica a documentos ya almacenados: ElysianDB 0.2.3 comprueba que el documento existe al encolar la actualización, así que actualizar un documento creado en la misma transacción falla con un error `400`. En ese caso, pon todos los campos en `tx.create()`.
- Las operaciones encoladas no se pueden leer antes del commit, ni desde este cliente ni desde ningún otro.
- Las operaciones y los commits nunca se reintentan, para que nada se encole ni se aplique dos veces. ElysianDB nunca hace expirar las transacciones abiertas: si un commit no recibe respuesta (error de red, tiempo de espera agotado o cancelación), el cliente hace rollback de la transacción. Aun así, el commit puede haberse aplicado si llegó a ElysianDB, así que compruébalo antes de volver a intentarlo.
- `tx.entity<T>("books")` ofrece `create`, `update` y `delete` tipados para una sola entidad.

Para gestionar una transacción a mano:

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

## Almacén clave–valor

```ts
await db.kv.set("greeting", "hello");
await db.kv.set("session:42", { userId: 42 }, { ttl: 3600 }); // objects are stored as JSON, ttl in seconds

await db.kv.get("greeting");                // "hello", or null when missing
await db.kv.getJSON<{ userId: number }>("session:42");

await db.kv.mget(["greeting", "session:*"]); // { greeting: "hello", "session:42": "{\"userId\":42}" }
await db.kv.delete("session:*");             // `*` deletes every matching key
```

Los valores son cadenas. Las claves siguen las [reglas de nombres e IDs](#nombres-ids-y-claves). `*` es un comodín en `mget()` y `delete()`, y los patrones no distinguen mayúsculas de minúsculas: `delete("Cache:*")` también borra `cache:1`. Las claves de `mget()` no pueden contener `,`. En modo `user`, el almacén clave–valor requiere un admin.

## Tipos de entidad, esquemas y migraciones

Los tipos de entidad se crean con el primer documento que se escribe, o se declaran de antemano con un esquema estricto:

```ts
await db.entities.create("movies", {
  title: { type: "string", required: true },
  minutes: "number", // shorthand
});

await db.entities.list();    // ["books", "movies"]
await db.entities.schemas(); // [{ id: "movies", fields: {...}, _manual: true }, ...]
```

Lee o reemplaza el esquema de un tipo de entidad. Un esquema manual rechaza los campos desconocidos y la ausencia de campos obligatorios:

```ts
const movies = db.entity("movies");
await movies.getSchema();
await movies.setSchema({ title: { type: "string", required: true }, genre: "string" });
```

Los tipos de campo son `string`, `number`, `boolean`, `object` (con `fields` anidados) y `array`. Las escrituras que no respetan el esquema lanzan un error con [`validationErrors`](#gestión-de-errores).

Las migraciones actualizan todos los documentos de un tipo de entidad, rutas anidadas incluidas:

```ts
await db.entity("users").migrate([
  { set: [{ active: true, "profile.lang": "fr" }] },
]);
```

## Usuarios y ACL

Estas rutas existen en modo `user` y requieren una sesión de admin.

```ts
await db.users.create({ username: "alice", password: "at-least-8-chars", role: "user" });
await db.users.list();                         // [{ username: "admin", role: "admin" }, ...]
await db.users.get("alice");
await db.users.changePassword("alice", "another-password");
await db.users.changeRole("alice", "admin");
await db.users.delete("alice");
```

Las ACL conceden permisos por usuario y tipo de entidad: `create`, `read`, `update`, `delete`, y `owning_read`, `owning_update`, `owning_delete` para los documentos de los que el usuario es propietario (su campo `_elysiandb_core_username`).

```ts
await db.acl.get("alice", "books");                      // { username, entity, permissions: {...} }
await db.acl.list("alice");                               // every entity type
await db.acl.update("alice", "books", { read: true });   // grants read, keeps the other permissions
await db.acl.set("alice", "books", { read: true, create: true }); // replaces: the others are revoked
await db.acl.reset("alice", "books");                    // back to the defaults
```

## Hooks

Los hooks son funciones JavaScript que ElysianDB ejecuta en las lecturas (`api.hooks.enabled: true`). Requieren credenciales de admin.

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

## Administración

Estas llamadas requieren un admin en modo `user`.

```ts
await db.admin.stats();   // { keys_count: 1203, uptime_seconds: 3605, version: "0.2.3", ... } (requires stats.enabled)
await db.admin.config();  // configuration, secrets redacted
await db.admin.save();    // flush to disk now
await db.admin.reset();   // delete every KV key (documents are kept)
```

Exporta e importa documentos (no se incluyen las cuentas, las ACL, los esquemas ni las claves KV):

```ts
const dump = await db.admin.export();      // { books: [...], authors: [...] }
const result = await db.admin.import(dump); // replaces the documents of each entity in the dump
```

Haz una copia de seguridad de una instancia completa y restáurala, cuentas incluidas:

```ts
import { writeFile, readFile } from "node:fs/promises";

const { data, filename } = await db.admin.backup(); // "elysiandb-backup-20261101T091400Z.tar.gz"
await writeFile(filename, data);

const summary = await db.admin.restore(await readFile(filename)); // { status, entities, schemas, kv_keys, ... }
```

`filename` lo envía el servidor, pero siempre es un simple nombre de archivo `.tar.gz` sin carpeta: el cliente sustituye cualquier otro nombre por `elysiandb-backup.tar.gz`, para que el servidor no pueda decidir dónde escribes.

Una restauración reemplaza todos los datos y cierra todas las sesiones, incluida la actual. La API HTTP acepta archivos de hasta 4 MB: para instancias más grandes, usa `elysiandb backup` y `elysiandb restore`. Los archivos contienen los hashes de las contraseñas: guárdalos con el mismo cuidado que la carpeta de datos.

## Monitorización

Los endpoints de monitorización de la Admin UI, con credenciales de admin:

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

Con `monitoring.prometheus.token`, pasa ese token a `metrics()`: `db.monitoring.metrics({ headers: { Authorization: "Bearer <token>" } })`.

## Gestión de errores

Todos los métodos lanzan un `ElysianDBError` cuando la petición falla:

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

| Propiedad | Descripción |
| --- | --- |
| `code` | `"HTTP_ERROR"` (ElysianDB respondió con un 4xx/5xx o con una redirección), `"NETWORK_ERROR"`, `"TIMEOUT"` o `"ABORTED"` |
| `status` | Código de estado HTTP; `0` si no se recibió respuesta |
| `message` | Método, ruta, código de estado y mensaje de ElysianDB |
| `data` | Cuerpo de la respuesta ya parseado |
| `validationErrors` | `{ field, message, index?, entity?, id? }[]` para las escrituras rechazadas, las escrituras por lotes (`index`) y las importaciones |
| `requestId` | `X-Request-Id` de la respuesta |
| `retryAfter` | Segundos que hay que esperar tras un `429` |
| `method`, `url` | La petición que falló |
| `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isRateLimited`, `isValidationError`, `isAbort` | Atajos |

## Tiempos de espera, reintentos y cancelación

Define los valores por defecto en el cliente y sobrescríbelos en cada llamada con el último argumento de cualquier método:

```ts
const db = createClient(url, { timeout: 5000, retries: 3 });

const controller = new AbortController();
const list = books.list({ limit: 10 }, { signal: controller.signal, timeout: 1000, retries: 0 });
controller.abort(); // the call rejects with code "ABORTED"
```

Las opciones por llamada son `signal`, `timeout`, `retries`, `requestId` (se envía como `X-Request-Id`) y `headers`.

Solo se reintentan las peticiones idempotentes (`GET`, `PUT`, `DELETE`), tras un error de red o una respuesta `429`, `502`, `503` o `504`. Las peticiones `POST`, como `create()`, un login o un commit, y las operaciones de una transacción nunca se reintentan.

## Hooks de petición y peticiones directas

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

Llama a cualquier ruta con `request()`, o con `send()` para obtener también el código de estado y las cabeceras:

```ts
const types = await db.request<{ entities: string[] }>("GET", "/api/entity/types/name");

const { data, headers } = await db.send<Book[]>("GET", "/api/books", { query: { limit: 5 } });
headers.get("X-Elysian-Cache"); // "HIT" or "MISS"
```

## Entornos de ejecución y navegadores

- Node.js 20 o superior, Bun, Deno y navegadores: el cliente solo necesita `fetch`. En otros entornos, pasa `fetch` en las opciones.
- Se publican tanto módulos ES (`import`) como CommonJS (`require`), con tipos TypeScript.
- Los navegadores solo pueden llamar a ElysianDB desde otro origen si ese origen figura en `server.http.cors.allowedOrigins`.
- No envíes credenciales de admin ni el token de la instancia a los navegadores.

ElysianDB 0.2.3 limita lo que una página puede hacer entre orígenes distintos:

- La cabecera `X-Request-Id` no está permitida: una petición con la opción `requestId` falla en el preflight CORS. No uses `requestId` en navegadores que llaman a otro origen.
- Las cabeceras de respuesta no se exponen: `health().version` es `null`, `error.requestId` y `error.retryAfter` son `undefined`, `send()` solo ve las cabeceras que CORS considera seguras, como `Content-Type`, y `admin.backup()` llama al archivo `elysiandb-backup.tar.gz`.

`tx.create()` genera los IDs con `crypto.randomUUID()`, o con `crypto.getRandomValues()` en las páginas que no se sirven por HTTPS.

## Referencia de la API

| Llamada | Ruta |
| --- | --- |
| **Cliente** | |
| `createClient(url, options)` / `new ElysianDB({ url, ... })` | |
| `db.health()` | `GET /health` |
| `db.query(request)` | `POST /api/query` |
| `db.transaction(fn)` / `db.beginTransaction()` | `POST /api/tx/...` |
| `db.request(method, path, options)` / `db.send(...)` | cualquiera |
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

## Migrar desde 0.0.x

La mayor parte del código sigue funcionando. Estos son los cambios:

| 0.0.x | Ahora |
| --- | --- |
| `new ElysianDB({ baseUrl, token })` | Sigue funcionando. Es preferible `createClient(url, { auth: { token } })`. |
| Las peticiones fallidas se resolvían con el cuerpo del error | Lanzan un `ElysianDBError`. |
| `count()` devolvía `{ count }` | `count()` devuelve un número. |
| `countWithOptions(options)` | `count(options)` (el nombre antiguo sigue funcionando). |
| `tx.write(entity, data)` | `tx.create(entity, data)` (el nombre antiguo sigue funcionando). |
| `db.transaction()` se resolvía con `undefined` | Se resuelve con el valor que devuelve el callback. |
| `db.rawRequest(path, init)` | `db.request(method, path, options)` (el método antiguo sigue funcionando). |
| Importaciones desde `dist/index.js` | El paquete tiene un mapa `exports`: importa solo desde `@elysiandbjs/client`. |

## Desarrollo

```bash
npm install
npm run build       # dist/esm, dist/cjs and dist/types
npm test            # unit tests
npm run demo        # examples/demo.mjs against http://localhost:8089
```

Los tests de integración se ejecutan contra servidores ElysianDB reales, uno por modo de autenticación:

```bash
scripts/start-test-servers.sh /path/to/elysiandb
npm run test:integration:local
```

La CI compila ElysianDB 0.2.3 desde el código fuente y ejecuta ambas suites.

Para publicar una versión, ejecuta `make release` (o `make release VERSION=minor`) sobre un `main` actualizado: sube el número de versión y hace push de la etiqueta, y el workflow Release ejecuta la CI y publica el paquete en npm con provenance. El workflow necesita el secreto `NPM_TOKEN`.

`README.md` es la documentación de referencia: modifícalo primero y después las traducciones de [`docs/i18n`](./), que no se publican en npm. `CHANGELOG.md` solo está en inglés.

## Licencia

MIT
