# App database: Drizzle on ClientSQL

The template uses Drizzle ORM **0.45.4** and Drizzle Kit **0.31.11**. **ClientSQL is the native SQLite foundation; Drizzle is the sole business ORM, schema and migration layer.** The app loads `client_sql/src/ClientSQLNative` directly and uses its callback connection through the Drizzle driver. The native declaration is `src/valdi_modules/src/valdi/client_sql/src/ClientSQLNative.d.ts` in the pinned Valdi source, with the native implementation in the adjacent `client_sql/native/` directory. The Drizzle driver requires `run` and positional `queryRows` extensions on both connection and transaction handles.

The database identity is **`valdiroutes_app_drizzle.sqlite`**, resolved by ClientSQL's native storage mechanism. This identity does not establish a new storage root or prove isolation from an earlier prototype using the same identity. There is no import, copy, deletion or adoption of an older template schema. The initial Drizzle migration creates `submission`; an existing unjournaled table with that name causes startup to fail rather than being adopted. The app does not load `ClientSQLDebugger` or use legacy SQLgen business queries or migration lists.

The reusable driver and native connection types are in `app_foundation/src/database/`.
Business schema, migration history and startup migration policy remain in
`app_pages/src/database/`; the application connection and submission queries are
in `app_pages/src/services/database.ts`. Foundation does not import app_pages.

## Schema and generation

Edit `valdi/modules/app_pages/src/database/schema.ts`. The initial table has:

```ts
export const submission = sqliteTable('submission', {
  id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
  summary: text('summary').notNull(),
  createdAt: integer('created_at').notNull(),
});
```

From the repository root:

```sh
pnpm db:generate
pnpm db:check
```

`db:generate` runs the locally installed Kit from the `valdi` directory with `drizzle.config.ts`, then generates runtime constants. The config's schema and output paths are relative to `valdi`. Commit the schema, **all** `valdi/drizzle/*.sql` and `valdi/drizzle/meta/*` outputs, and `database/generated-migrations.ts` together.

`scripts/generate-drizzle-migrations.mjs` reads Kit's SQLite journal and SQL files at build time. It validates contiguous indexes, unique tags, increasing timestamps and the supported journal format. It hashes the entire SQL file with SHA256, then copies the SQL into TypeScript constants using exactly Kit's `--> statement-breakpoint` delimiter. It never splits on semicolons, which may occur inside literals and trigger bodies.

`db:check` verifies that the runtime constants still match the checked-in SQL and journal. It does not generate a new Kit migration from a changed TypeScript schema: run `db:generate` after schema edits, then review the SQL.

The runtime imports only those constants. It does not read files, hash SQL, load Kit or Drizzle's Node migrator, or require `Buffer`, Node crypto, or a filesystem.

## One migration owner

`initializeAppDb()` runs synchronously from `startApp`, opens the native connection once, and stores the app service on the JS runtime through the pinned `openDatabase` export:

```ts
const { openDatabase } = require('client_sql/src/ClientSQLNative');
openDatabase(APP_DATABASE_IDENTITY, 1, [], []);
```

The original ClientSQL bootstrap accepts the storage identity, native schema version, create statements and migration list. Its version stays fixed at **1**, with both arrays empty: it receives no business DDL or business migration history. On a fresh database, native bootstrap sets `PRAGMA user_version = 1`; this marker is independent of the Drizzle migration count and never advances for business migrations. **Drizzle owns all business schema DDL and its own `__drizzle_migrations` table.** The Drizzle migration runner leaves `user_version` unchanged. Do not restore old ClientSQL create statements or migration lists, or increment the native bootstrap version to evolve business tables.

`migrateAppDatabase(connection, { identity, bindNative })` queues startup by storage identity within this JS runtime. The native writer transaction creates or strictly validates the journal table, reads **every** journal row in ID order, and requires an exact prefix of the bundled migration manifest: contiguous IDs plus matching SHA256 and Kit timestamp. Unknown/future rows, gaps, changed history, or a mismatched journal schema reject startup before applying pending migrations.

All pending SQL and corresponding journal entries run inside one native transaction. A failure rolls the entire pending batch back, including DDL, data edits and journal inserts. A fresh database therefore gets both its business schema and journal atomically. Already committed rows and history remain unchanged when a later migration fails. The startup queue is released on both success and failure.

The journal uses `id INTEGER PRIMARY KEY NOT NULL`, `hash TEXT NOT NULL`, and `created_at INTEGER NOT NULL`; IDs are Kit indexes plus one. This runner checks the full history rather than relying on only the last journal timestamp. Do not run another migrator against the same journal or evolve the same tables through a separate schema owner.

The manifest hashes detect divergence between the persisted history and the bundled history. They are build-generated integrity values, not a cryptographic attestation of every live SQLite table or of a maliciously rewritten journal. The runner does not repair arbitrary external schema edits.

## Business API and callback lifetime

The app service in `valdi/modules/app_pages/src/services/database.ts` exposes:

```ts
interface AppDatabase {
  readonly ready: Promise<void>;
  insertSubmission(summary: string, createdAt: number): Promise<void>;
  watchSubmissionCount(
    listener: (count: number) => void,
    onError?: (error: Error) => void,
  ): () => void;
  close(): Promise<void>;
}
```

Operations and a subscription's first query wait for `ready`. A cancellation before readiness prevents installation of the driver watcher. Migration errors reject `ready` and writes, reach active subscription error handlers, and are logged at startup. Query errors reach `onError` or the console. `HomePage` displays database errors through its existing result text; `FormPage` reports a failed save through the existing toast API and only finishes the route after a successful insert.

`watchSubmissionCount` returns an idempotent cancellation function. It is driven by committed driver operations and has no polling timer. Close cancels app watchers immediately, waits for migrations to settle, and closes the driver once. Close is terminal for this runtime's singleton; normal page destruction only cancels that page's subscription.

Each synchronous native callback installation is wrapped in `withGlobalNativeRefs('app-database', body)`: opening the connection, transaction callbacks, every migration statement/query, driver calls, and close. The scope wraps the synchronous installation, not an entire async function. This attributes callbacks to the app rather than a page context, so page teardown should not dispose an outstanding app operation; the native operation must still release its own callback when it completes. Native callback lifetime remains a native validation requirement.

The native ABI is `(value, error)`, including transaction completion: success calls `done(undefined, undefined)` and failure calls `done(undefined, errorString)`. `run` returns `{ changes: number, lastInsertRowid: string }`. `queryRows` returns positional arrays and runs on the writer connection, including within a transaction. The driver receives `{ identity, bindNative }`.

## Driver and native runtime boundary

`database/driver.ts` exposes the typed asynchronous Drizzle database plus `run`, `queryRows`, `watch`, and `close`. SQL crosses the native boundary as a SQL string and a parameter array. Query results cross as positional arrays, preserving duplicate column names. Rows and binary values are not serialized as JSON.

`database/native-types.ts` describes the structural Drizzle-facing subset of the ClientSQL native contract. Connections expose `run`, `queryRows`, `transaction(body, callback)`, and `close`; transaction handles expose `run`, `queryRows`, and `execute`. ClientSQL's native implementation and declaration must supply the `run`/`queryRows` extensions with writer-connection semantics, exact run metadata, and `(value, error)` callbacks. The original pinned declaration supplies the four-argument `openDatabase` bootstrap but lacks those extensions. The app-side structural types do not implement or validate the native bridge. Changing this bridge requires new Android and iOS runtime exports; rebuilding only the TS modules cannot update an installed runtime. Missing methods or malformed results fail with guidance to export the ClientSQL native extensions.

Transactions use the native SQLite transaction and nested SQLite savepoints. Operations accepted within a transaction drain before commit; SQL or result-conversion failures roll back. An expired transaction handle rejects further operations. Only deferred transaction behavior is supported. `db.batch()` rejects explicitly; use `db.transaction()` for atomic groups.

Numeric parameters must be finite, and integer parameters must fit JavaScript's safe integer range. `lastInsertRowid` is an exact signed-64-bit decimal string. Ordinary numeric query columns retain the native number representation; applications needing exact larger integers must use an explicit text representation rather than treating a rounded JS number as an identifier.

For binary columns, use the driver's portable custom type:

```ts
import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';
import { bytes } from './driver';

export const packet = sqliteTable('packet', {
  id: integer('id').primaryKey(),
  payload: bytes('payload').notNull(),
});
```

Writes accept `Uint8Array` or `ArrayBuffer`, snapshot the supplied bytes before queuing, and reads return an owned `Uint8Array`. This provides mutation safety, not zero-copy transport. Standard Drizzle BLOB modes that depend on Node `Buffer` are rejected; no global `Buffer` polyfill is installed.

Watchers refresh after committed writes through drivers sharing the same explicit `identity`. They do not observe arbitrary writes from another process, runtime, or external SQLite client. A refresh waits for an active root transaction to release its lease, including after a read-only commit or rollback. This uses queue completion promises rather than polling. Mutation detection adds two small SQLite metadata queries per statement.

## OTA policy

Use append-only, **expand-only** migrations during an OTA compatibility window: add tables or nullable/defaulted columns; keep old names and meanings readable until every supported app version has moved forward. Review generated SQLite rebuilds carefully because dropping/recreating a table can remove data or constraints.

Never edit or remove an already shipped SQL file or journal entry. Preserve the complete prefix when adding another migration. A newer database with journal entries absent from an older OTA bundle is **refused**, even when the schema expansion happens to look compatible. This is a conservative rollback policy: a rollback bundle must retain the newer migration manifest and be able to use the expanded schema. Do not clear the journal, decrease timestamps, or run down migrations to force an old bundle to start.

If startup fails, surface the error and stop database-dependent work. Ship a forward fix against the complete history or perform an explicitly designed recovery. There is no automatic destructive reset or compatibility adoption.

## Source verification

The existing focused suites contain 30 driver tests and 17 migration/app tests. They run actual `node:sqlite` SQL, including transactions, constraints, journal changes, file-backed reopen/concurrent startup, BLOB preservation, and the app service connected to the real Drizzle driver:

```sh
node --import ./tools/valdi-rolldown/node_modules/tsx/dist/loader.mjs \
  --test tools/valdi-rolldown/drizzle-migrations.test.ts
node --import ./tools/valdi-rolldown/node_modules/tsx/dist/loader.mjs \
  --test tools/valdi-rolldown/drizzle-driver.test.ts
node scripts/generate-drizzle-migrations.mjs --check
pnpm db:test:native
```

The test transport implements the structural native callback ABI over `node:sqlite` and asserts that every callback installation uses the injected binder. The app lifecycle tests replace the ClientSQL bootstrap export with that transport and inject the native-reference binder and diagnostic console; the app service, Drizzle driver, migration runner and SQLite execution are real. The bootstrap stub asserts exactly `[APP_DATABASE_IDENTITY, 1, [], []]` and models `user_version = 1`; it does not execute or validate ClientSQL bootstrap code. Tests verify `done(undefined, error)` and exercise readiness, cancellation, startup failure, and idempotent close. Direct migration-runner tests bypass bootstrap and verify that the runner preserves whatever `user_version` SQLite already holds.

`pnpm db:test:native` prepares the patched framework and executes ClientSQL's native test target. It checks both patch copies before running. The Node suites do not establish native writer scheduling, on-device callback disposal, or native device presentation; those need separate native and mobile validation.

## Local validation on 2026-11-05

The selected ClientSQL integration passed 42 macOS native cases (34 existing cases plus eight extension regressions), 30 Drizzle driver cases, and 17 migration/app cases. The complete npm test pipeline and generated binding goldens passed. The final runtime ABI check requires the patched ClientSQL declaration rather than accepting the old ABI.

Release Hermes modules compiled successfully. Android and iOS **Debug** runtimes and hosts built successfully; this is not a native Release application result. Both configured runtime action graphs contain ClientSQL and exclude the removed independent driver, legacy compiler actions, and the old C++ toolbox. Both export receipts match the current source fingerprint.

Android validation used only the Windows emulator at `127.0.0.1:15555`, with a data-preserving APK update. Its installed APK hash matches the built APK. Two cold launches failed with startup ANRs, sampled in framework native-module initialization through `ValdiHost.notifyDarkMode`; the cause has not been attributed to Drizzle. A copied device database passed `integrity_check`, retained `user_version = 1`, and contained the expected Drizzle journal and empty business table. UI writes, watcher refresh, and restart persistence have **not** passed on that emulator.

The iOS runtime check uses an isolated `io.valdiroutes.drizzleqa` simulator installation. It clones the built host and changes its bundle identifier, display name and ad-hoc signatures; embedded framework and module bytes are unchanged. The original application's data is preserved. Independent reads of the captured QA databases confirm counts **0 → 1 → process restart 1 → second write 2**, with matching migration hashes, `user_version = 1`, and successful integrity checks. One uninterrupted warm submission replay passed **14/14 actions/checks in 17.2 seconds**, with zero failures, errors, skips, or warnings and no manual recovery. Its prerequisite was a synthetic tester signed in on Home; Home refreshed to count 2 without another process restart. This is a database-specific result with one replay, not two-pass full-app QA. Exact count deltas were verified separately from the structural replay.

The QA app returned to Login after restart; login/session persistence is not established for this isolated installation. A signing/Keychain limitation is plausible but unproven without an error code, and no original production-auth regression is claimed. The first walkthrough's four failed waits and ambiguous password-selector warning remain diagnostic evidence, separate from the successful final replay.

Local logs, source hashes, action graphs, package bindings and device evidence are retained under `/tmp/valdi-drizzle-clientsql-final-20261105/`. The previously tested independent driver is archived outside the project and is not part of this integration.
