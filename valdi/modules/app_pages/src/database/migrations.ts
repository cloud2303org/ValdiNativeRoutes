import { APP_MIGRATIONS } from './generated-migrations';
import type { NativeCallback, NativeParameter, NativeRunResult } from './native-types';

export const APP_DATABASE_IDENTITY = 'valdiroutes_app_drizzle.sqlite';

export interface AppMigration {
  readonly idx: number;
  readonly tag: string;
  readonly when: number;
  readonly hash: string;
  readonly statements: readonly string[];
}

export interface MigrationTransaction {
  run(sql: string, params: NativeParameter[], callback: NativeCallback<NativeRunResult>): void;
  queryRows(sql: string, params: NativeParameter[], callback: NativeCallback<unknown[][]>): void;
}

/** Native SQLite transaction completion is (value, error), like its other callbacks. */
export interface MigrationConnection {
  transaction(
    body: (transaction: MigrationTransaction, done: NativeCallback<void>) => void,
    callback: NativeCallback<void>,
  ): void;
}

export interface MigrationOptions {
  identity: string;
  bindNative<T>(body: () => T): T;
}

const JOURNAL = '__drizzle_migrations';
const JOURNAL_DDL = 'CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL)';
const startupByIdentity = new Map<string, Promise<void>>();
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function nativePromise<T>(options: MigrationOptions, install: (callback: NativeCallback<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    options.bindNative(() => install((value, error) => {
      if (error !== undefined && error !== null) reject(new Error(error));
      else resolve(value as T);
    }));
  });
}

function validateManifest(history: readonly AppMigration[]): void {
  if (!history.length) throw new Error('Migration history must include the initial schema');
  const tags = new Set<string>();
  history.forEach((entry, index) => {
    if (entry.idx !== index || !entry.tag || tags.has(entry.tag) ||
        !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.when) || entry.when < 0 ||
        (index > 0 && entry.when <= history[index - 1].when) || !entry.statements.length) {
      throw new Error(`Invalid migration history at index ${index}`);
    }
    tags.add(entry.tag);
  });
}

function sameColumns(rows: unknown[][]): boolean {
  const expected = [['id', 'INTEGER', 1, null, 1], ['hash', 'TEXT', 1, null, 0], ['created_at', 'INTEGER', 1, null, 0]];
  return rows.length === expected.length && rows.every((row, index) =>
    row[0] === index && row[1] === expected[index][0] &&
    String(row[2]).toUpperCase() === expected[index][1] && row[3] === expected[index][2] &&
    row[4] === expected[index][3] && row[5] === expected[index][4] && row[6] === 0);
}

async function apply(
  tx: MigrationTransaction,
  options: MigrationOptions,
  history: readonly AppMigration[],
): Promise<void> {
  const rows = (sql: string, params: NativeParameter[] = []): Promise<unknown[][]> =>
    nativePromise(options, callback => tx.queryRows(sql, params, callback));
  const run = (sql: string, params: NativeParameter[] = []): Promise<NativeRunResult> =>
    nativePromise(options, callback => tx.run(sql, params, callback));
  const table = await rows('SELECT type, sql FROM sqlite_master WHERE name = ?', [JOURNAL]);
  if (table.length === 0) {
    // No IF NOT EXISTS: an unjournaled business table must fail initial DDL, never be adopted.
    await run(JOURNAL_DDL);
  } else {
    const columns = await rows('PRAGMA table_xinfo("__drizzle_migrations")');
    const indexes = await rows('PRAGMA index_list("__drizzle_migrations")');
    const foreignKeys = await rows('PRAGMA foreign_key_list("__drizzle_migrations")');
    const triggers = await rows("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?", [JOURNAL]);
    const normalize = (sql: unknown): string => String(sql).replace(/[\s"`[\];]/g, '').toLowerCase();
    if (table.length !== 1 || table[0][0] !== 'table' || !sameColumns(columns) ||
        indexes.length || foreignKeys.length || triggers.length ||
        normalize(table[0][1]) !== normalize(JOURNAL_DDL)) {
      throw new Error('Migration journal schema is incompatible');
    }
  }
  const applied = await rows('SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY id');
  if (applied.length > history.length) throw new Error('Migration journal contains future history; OTA rollback refused');
  applied.forEach((row, index) => {
    const expected = history[index];
    if (row[0] !== index + 1 || row[1] !== expected.hash || row[2] !== expected.when) {
      throw new Error(`Migration journal history/checksum mismatch at index ${index}`);
    }
  });
  for (let index = applied.length; index < history.length; index++) {
    const migration = history[index];
    for (const statement of migration.statements) {
      if (statement.trim()) await run(statement);
    }
    await run('INSERT INTO "__drizzle_migrations" (id, hash, created_at) VALUES (?, ?, ?)', [
      index + 1, migration.hash, migration.when,
    ]);
  }
}

/**
 * Serialize startup per storage identity. Each caller revalidates the complete
 * persisted prefix. The native transaction commits all pending SQL and journal
 * rows together, or rolls the entire startup batch back. Call before driver use.
 */
export function migrateAppDatabase(
  connection: MigrationConnection,
  options: MigrationOptions,
  history: readonly AppMigration[] = APP_MIGRATIONS,
): Promise<void> {
  const previous = startupByIdentity.get(options.identity) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => {
    validateManifest(history);
    return nativePromise<void>(options, callback => connection.transaction((tx, done) => {
      void apply(tx, options, history).then(
        () => done(undefined, undefined),
        error => done(undefined, message(error)),
      );
    }, callback));
  });
  startupByIdentity.set(options.identity, current);
  const cleanup = (): void => {
    if (startupByIdentity.get(options.identity) === current) startupByIdentity.delete(options.identity);
  };
  void current.then(cleanup, cleanup);
  return current;
}
