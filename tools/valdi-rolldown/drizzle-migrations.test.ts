import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.join(root, 'valdi/modules/app_pages/src');
const requireApp = createRequire(path.join(root, 'valdi/package.json'));
const identity = 'valdiroutes_app_drizzle.sqlite';
const loaded = new Map<string, any>();

function load(file: string, overrides: Record<string, any> = {}): any {
  if (loaded.has(file) && Object.keys(overrides).length === 0) return loaded.get(file);
  assert.ok(existsSync(file), `Missing implementation: ${path.relative(root, file)}`);
  const module = { exports: {} as any };
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: file,
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports,console){${output}\n})`, { filename: file })(
    (name: string) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith('app_foundation/')) return load(path.join(root, 'valdi/modules', `${name}.ts`), overrides);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`), overrides);
      return requireApp(name);
    }, module, module.exports, overrides['test:console'] ?? console,
  );
  if (Object.keys(overrides).length === 0) loaded.set(file, module.exports);
  return module.exports;
}

function migrations() {
  return load(path.join(sourceRoot, 'database/migrations.ts'));
}
function manifest(): any[] {
  return load(path.join(sourceRoot, 'database/generated-migrations.ts')).APP_MIGRATIONS;
}

/** A native callback transport backed by real SQLite, including actual BEGIN/COMMIT/ROLLBACK. */
function sqlite(file = ':memory:') {
  const db = new DatabaseSync(file);
  let bound = 0;
  let installations = 0;
  let closes = 0;
  const bindNative = <T>(body: () => T): T => {
    bound++;
    try { return body(); } finally { bound--; }
  };
  const install = () => {
    assert.ok(bound > 0, 'every native callback installation must use the injected binder');
    installations++;
  };
  const callbackCall = (callback: (value: any, error?: string) => void, body: () => any) => {
    let result: any;
    try { result = body(); } catch (error) {
      queueMicrotask(() => callback(undefined, String(error)));
      return;
    }
    queueMicrotask(() => callback(result, undefined));
  };
  const operations = {
    execute(sql: string, params: any[] | undefined, callback: any) {
      install();
      callbackCall(callback, () => { db.prepare(sql).run(...(params ?? [])); });
    },
    queryRows(sql: string, params: any[], callback: any) {
      install();
      callbackCall(callback, () => db.prepare(sql).all(...params).map(row => Object.values(row)));
    },
    run(sql: string, params: any[], callback: any) {
      install();
      callbackCall(callback, () => {
        const result = db.prepare(sql).run(...params);
        return { changes: Number(result.changes), lastInsertRowid: String(result.lastInsertRowid) };
      });
    },
  };
  const connection = {
    ...operations,
    transaction(body: any, callback: any) {
      install();
      db.exec('BEGIN TRANSACTION');
      queueMicrotask(() => body(operations, (value: unknown, error?: string) => {
        assert.equal(value, undefined, 'transaction done uses (undefined, error)');
        assert.ok(error === undefined || typeof error === 'string');
        try {
          db.exec(error == null ? 'COMMIT' : 'ROLLBACK');
          callback(undefined, error);
        } catch (failure) { callback(undefined, String(failure)); }
      }));
    },
    close(callback: any) { install(); closes++; callbackCall(callback, () => db.close()); },
  };
  return {
    db, connection, options: { identity, bindNative },
    assertBound() { assert.ok(bound > 0, 'native API called outside binder'); },
    get installations() { return installations; },
    get closes() { return closes; },
  };
}

function journal(db: DatabaseSync) {
  return db.prepare('SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id').all();
}
function extra(sql: string, idx = 1) {
  return {
    idx, tag: `${String(idx).padStart(4, '0')}_test`, when: 1800000000000 + idx,
    hash: createHash('sha256').update(sql).digest('hex'), statements: [sql],
  };
}

const APP_KEY = 'valdi:routes:drizzle:database';
function appRuntime(h: ReturnType<typeof sqlite>, delayMigration = false) {
  delete (globalThis as any)[APP_KEY];
  let opens = 0;
  let release!: () => void;
  let waiting = false;
  const reported: unknown[][] = [];
  const transaction = h.connection.transaction;
  if (delayMigration) h.connection.transaction = (body, callback) => {
    h.assertBound();
    waiting = true;
    h.connection.transaction = transaction;
    release = () => h.options.bindNative(() => transaction(body, callback));
  };
  const api = load(path.join(sourceRoot, 'services/database.ts'), {
    'test:console': { error: (...args: unknown[]) => reported.push(args) },
    'client_sql/src/ClientSQLNative': {
      openDatabase(...args: [name: string, version: number, statements: string[], migrations: unknown[]]) {
        h.assertBound();
        opens++;
        assert.deepEqual(args, [identity, 1, [], []], 'ClientSQL bootstrap is fixed and contains no business DDL');
        // Model only the bootstrap marker; this does not execute ClientSQL native code.
        h.db.exec('PRAGMA user_version = 1');
        return h.connection;
      },
    },
    'valdi_core/src/NativeReferences': {
      withGlobalNativeRefs(attribution: string, body: () => any) {
        assert.equal(attribution, 'app-database');
        return h.options.bindNative(body);
      },
    },
  });
  return { api, reported, get waiting() { return waiting; }, get opens() { return opens; }, release: () => release() };
}
async function microtasksUntil(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) await Promise.resolve();
  assert.ok(condition(), 'expected callback did not arrive');
}

test('app passes the fixed empty ClientSQL bootstrap and leaves business DDL to Drizzle', async () => {
  const { APP_DATABASE_IDENTITY } = migrations();
  assert.equal(APP_DATABASE_IDENTITY, identity);
  const h = sqlite();
  const app = appRuntime(h);
  app.api.initializeAppDb();
  assert.equal(app.opens, 1);
  assert.deepEqual(h.db.prepare('SELECT name FROM sqlite_master').all(), []);
  assert.equal(h.db.prepare('PRAGMA user_version').get()!.user_version, 1);
  const database = app.api.getAppDb();
  await database.ready;
  assert.equal(journal(h.db).length, 1);
  assert.equal(h.db.prepare('PRAGMA user_version').get()!.user_version, 1);
  await database.close();
  delete (globalThis as any)[APP_KEY];
});

test('fresh database applies the Kit initial schema without changing user_version', async () => {
  const h = sqlite();
  await migrations().migrateAppDatabase(h.connection, h.options);
  assert.equal(journal(h.db).length, 1);
  assert.equal(h.db.prepare('PRAGMA user_version').get()!.user_version, 0);
  assert.ok(h.installations > 4);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM submission').get()!.n, 0);
  h.db.close();
});

test('reopening preserves rows, constraints, AUTOINCREMENT high-water mark and binary bytes', async () => {
  const h = sqlite();
  await migrations().migrateAppDatabase(h.connection, h.options);
  h.db.exec("INSERT INTO submission VALUES (41, 'kept', 123); INSERT INTO submission VALUES (99, 'deleted', 456); DELETE FROM submission WHERE id = 99");
  h.db.exec('CREATE TABLE unrelated_binary (value BLOB NOT NULL)');
  const bytes = new Uint8Array([0, 255, 128, 39, 59, 0]);
  h.db.prepare('INSERT INTO unrelated_binary VALUES (?)').run(bytes);
  h.db.exec('PRAGMA user_version = 37');
  await migrations().migrateAppDatabase(h.connection, h.options);
  assert.equal(h.db.prepare('PRAGMA user_version').get()!.user_version, 37);
  assert.deepEqual({ ...h.db.prepare('SELECT * FROM submission').get() }, { id: 41, summary: 'kept', created_at: 123 });
  assert.equal(h.db.prepare("INSERT INTO submission(summary, created_at) VALUES ('next', 789)").run().lastInsertRowid, 100);
  assert.deepEqual(h.db.prepare('SELECT value FROM unrelated_binary').get()!.value, bytes);
  h.db.close();
});

test('an unjournaled business table is refused rather than adopted or hidden', async () => {
  const h = sqlite();
  h.db.exec('CREATE TABLE submission(id INTEGER PRIMARY KEY, incompatible TEXT)');
  h.db.exec("INSERT INTO submission VALUES(5,'untouched')");
  await assert.rejects(migrations().migrateAppDatabase(h.connection, h.options), /already exists|journal|schema/i);
  assert.equal(h.db.prepare("SELECT incompatible FROM submission WHERE id=5").get()!.incompatible, 'untouched');
  assert.equal(h.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='__drizzle_migrations'").get()!.n, 0);
  h.db.close();
});

test('Kit initial schema enforces NOT NULL and primary key constraints', async () => {
  const h = sqlite();
  await migrations().migrateAppDatabase(h.connection, h.options);
  for (const sql of [
    'INSERT INTO submission(summary, created_at) VALUES(NULL, 1)',
    "INSERT INTO submission(summary, created_at) VALUES('text', NULL)",
  ]) assert.throws(() => h.db.exec(sql), /NOT NULL/);
  h.db.exec("INSERT INTO submission VALUES(1,'first',1)");
  assert.throws(() => h.db.exec("INSERT INTO submission VALUES(1,'duplicate',2)"), /UNIQUE/);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM submission').get()!.n, 1);
  h.db.close();
});

test('a migration error rolls back its statements, old rows and journal changes', async () => {
  const h = sqlite();
  await migrations().migrateAppDatabase(h.connection, h.options);
  h.db.exec("INSERT INTO submission(summary,created_at) VALUES('original',1)");
  const before = journal(h.db);
  const bad = extra('DELETE FROM submission');
  bad.statements.push('CREATE TABLE attempted(value TEXT)', 'INSERT INTO nonexistent VALUES (1)');
  await assert.rejects(migrations().migrateAppDatabase(h.connection, h.options, [...manifest(), bad]), /nonexistent/);
  assert.equal(h.db.prepare('SELECT summary FROM submission').get()!.summary, 'original');
  assert.deepEqual(journal(h.db), before);
  assert.equal(h.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='attempted'").get()!.n, 0);
  h.db.close();
});

test('journal prefix, checksums, timestamps and future history are checked in full', async () => {
  for (const corrupt of [
    "UPDATE __drizzle_migrations SET hash='changed' WHERE id=1",
    'UPDATE __drizzle_migrations SET created_at=created_at+1 WHERE id=1',
    'UPDATE __drizzle_migrations SET id=7 WHERE id=1',
    'DELETE FROM __drizzle_migrations WHERE id=1',
    "INSERT INTO __drizzle_migrations VALUES(3,'future',9999999999999)",
  ]) {
    const h = sqlite();
    const next = extra('ALTER TABLE submission ADD COLUMN note TEXT');
    await migrations().migrateAppDatabase(h.connection, h.options, [...manifest(), next]);
    h.db.exec(corrupt);
    const before = journal(h.db);
    await assert.rejects(migrations().migrateAppDatabase(h.connection, h.options, [...manifest(), next]), /history|journal|checksum|baseline/i);
    assert.deepEqual(journal(h.db), before);
    h.db.close();
  }
});

test('OTA rollback refuses a database with a newer known-prefix history', async () => {
  const h = sqlite();
  await migrations().migrateAppDatabase(h.connection, h.options, [...manifest(), extra('ALTER TABLE submission ADD COLUMN note TEXT')]);
  await assert.rejects(migrations().migrateAppDatabase(h.connection, h.options), /future|history|journal/i);
  assert.equal(journal(h.db).length, 2);
  h.db.close();
});

test('malformed journal schema is rejected rather than hidden by IF NOT EXISTS', async () => {
  const h = sqlite();
  h.db.exec('CREATE TABLE __drizzle_migrations(id INTEGER PRIMARY KEY, hash TEXT)');
  await assert.rejects(migrations().migrateAppDatabase(h.connection, h.options), /journal|schema/i);
  assert.deepEqual(h.db.prepare('PRAGMA table_info(__drizzle_migrations)').all().map(row => row.name), ['id', 'hash']);
  h.db.close();
});

test('concurrent startup validates and applies a pending migration only once', async () => {
  const h = sqlite();
  const history = [...manifest(), extra("CREATE TABLE applied_once(value TEXT);")];
  await Promise.all(Array.from({ length: 8 }, () => migrations().migrateAppDatabase(h.connection, h.options, history)));
  assert.equal(journal(h.db).length, 2);
  h.db.close();
});

test('two file-backed connections serialize startup and revalidate persisted history after reopening', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'valdi-drizzle-startup-'));
  const file = path.join(folder, identity);
  try {
    const first = sqlite(file);
    const second = sqlite(file);
    const history = [...manifest(), extra('CREATE TABLE single_apply(value TEXT)')];
    await Promise.all([
      migrations().migrateAppDatabase(first.connection, first.options, history),
      migrations().migrateAppDatabase(second.connection, second.options, history),
    ]);
    assert.equal(journal(first.db).length, 2);
    assert.deepEqual(journal(second.db), journal(first.db));
    first.db.close();
    second.db.close();
    const reopened = sqlite(file);
    await migrations().migrateAppDatabase(reopened.connection, reopened.options, history);
    assert.equal(journal(reopened.db).length, 2);
    reopened.db.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('Kit SQL chunks and SHA256 agree with the generated runtime constants', () => {
  const { readMigrationFiles } = requireApp('drizzle-orm/migrator');
  const kit = readMigrationFiles({ migrationsFolder: path.join(root, 'valdi/drizzle') });
  const generated = manifest();
  assert.equal(generated.length, kit.length);
  generated.forEach((entry, index) => {
    assert.equal(entry.idx, index);
    assert.equal(entry.hash, kit[index].hash);
    assert.equal(entry.when, kit[index].folderMillis);
    assert.deepEqual(entry.statements, kit[index].sql);
  });
});

test('generator preserves official chunks including trigger semicolons, and --check detects stale SQL', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'valdi-drizzle-generator-'));
  try {
    for (const dir of ['scripts', 'valdi/drizzle/meta', 'valdi/modules/app_pages/src/database']) {
      mkdirSync(path.join(folder, dir), { recursive: true });
    }
    const script = path.join(folder, 'scripts/generate-drizzle-migrations.mjs');
    writeFileSync(script, readFileSync(path.join(root, 'scripts/generate-drizzle-migrations.mjs')));
    const chunks = [
      "CREATE TABLE test(value TEXT DEFAULT 'a;b');\n",
      "\nCREATE TRIGGER semicolons AFTER INSERT ON test BEGIN UPDATE test SET value='x;y'; SELECT 1; END;",
    ];
    const sqlFile = path.join(folder, 'valdi/drizzle/0000_test.sql');
    writeFileSync(sqlFile, chunks.join('--> statement-breakpoint'));
    const metadata = {
      version: '7', dialect: 'sqlite',
      entries: [{ idx: 0, version: '6', when: 1, tag: '0000_test', breakpoints: true }],
    };
    const metadataFile = path.join(folder, 'valdi/drizzle/meta/_journal.json');
    writeFileSync(metadataFile, JSON.stringify(metadata));
    const generate = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(generate('--check').status, 0);
    assert.equal(generate().status, 0);
    const output = path.join(folder, 'valdi/modules/app_pages/src/database/generated-migrations.ts');
    const generated = load(output).APP_MIGRATIONS;
    assert.deepEqual(generated[0].statements, chunks);
    assert.equal(generate('--check').status, 0);
    writeFileSync(sqlFile, `${chunks.join('--> statement-breakpoint')}\n`);
    const stale = generate('--check');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale/);
    metadata.entries[0].idx = 2;
    writeFileSync(metadataFile, JSON.stringify(metadata));
    assert.match(generate().stderr, /Invalid migration journal entry/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('app initializes synchronously once, then real Drizzle insert and watch wait for migrations', async () => {
  const h = sqlite();
  const app = appRuntime(h, true);
  app.api.initializeAppDb();
  app.api.initializeAppDb();
  const database = app.api.getAppDb();
  assert.equal(app.opens, 1);
  const counts: number[] = [];
  const stop = database.watchSubmissionCount((count: number) => counts.push(count), (error: Error) => { throw error; });
  const inserted = database.insertSubmission('from app', 7);
  await microtasksUntil(() => app.waiting);
  assert.equal(h.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='submission'").get()!.n, 0);
  assert.equal(counts.length, 0);
  app.release();
  await database.ready;
  await inserted;
  await microtasksUntil(() => counts.includes(1));
  assert.equal(h.db.prepare('SELECT summary FROM submission').get()!.summary, 'from app');
  assert.equal(await database.ready, undefined);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM submission').get()!.n, 1);
  stop();
  stop();
  await database.close();
  assert.equal(h.closes, 1);
  assert.throws(() => h.db.prepare('SELECT 1'), /not open/);
  delete (globalThis as any)[APP_KEY];
});

test('cancelling before ready suppresses the initial subscription and later notifications', async () => {
  const h = sqlite();
  const app = appRuntime(h, true);
  app.api.initializeAppDb();
  const database = app.api.getAppDb();
  const events: unknown[] = [];
  const stop = database.watchSubmissionCount((n: number) => events.push(n), (e: Error) => events.push(e));
  stop();
  await microtasksUntil(() => app.waiting);
  app.release();
  await database.ready;
  await database.insertSubmission('after unsubscribe', 1);
  await Promise.resolve();
  assert.deepEqual(events, []);
  await database.close();
  delete (globalThis as any)[APP_KEY];
});

test('failed startup rejects business operations and surfaces active subscription errors', async () => {
  const h = sqlite();
  h.db.exec('CREATE TABLE submission(incompatible TEXT)');
  const app = appRuntime(h);
  app.api.initializeAppDb();
  const database = app.api.getAppDb();
  const errors: Error[] = [];
  const values: number[] = [];
  database.watchSubmissionCount((n: number) => values.push(n), (error: Error) => errors.push(error));
  const cancelled = database.watchSubmissionCount(() => assert.fail('cancelled listener ran'), () => assert.fail('cancelled error ran'));
  cancelled();
  await assert.rejects(database.ready, /already exists/);
  await assert.rejects(database.insertSubmission('failed', 1), /already exists/);
  await microtasksUntil(() => errors.length === 1);
  assert.equal(app.reported.length, 1, 'startup errors are surfaced even without a subscription');
  assert.deepEqual(values, []);
  await database.close();
  delete (globalThis as any)[APP_KEY];
});

test('close before readiness blocks writes and subscriptions and closes only once', async () => {
  const h = sqlite();
  const app = appRuntime(h, true);
  app.api.initializeAppDb();
  const database = app.api.getAppDb();
  const events: unknown[] = [];
  database.watchSubmissionCount((n: number) => events.push(n), (e: Error) => events.push(e));
  const closing = database.close();
  assert.equal(database.close(), closing);
  await assert.rejects(database.insertSubmission('closed', 1), /closed/i);
  assert.throws(() => database.watchSubmissionCount(() => {}), /closed/i);
  await microtasksUntil(() => app.waiting);
  app.release();
  await closing;
  assert.equal(h.closes, 1);
  assert.deepEqual(events, []);
  assert.throws(() => h.db.prepare('SELECT 1'), /not open/);
  delete (globalThis as any)[APP_KEY];
});
