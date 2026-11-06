import { fillPlaceholders, getTableColumns, is } from 'drizzle-orm';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import type { ExtractTablesWithRelations, RelationalSchemaConfig } from 'drizzle-orm/relations';
import { BaseSQLiteDatabase, customType, SQLiteAsyncDialect, SQLiteSession, SQLiteTable, SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import type { SQLiteTransactionConfig } from 'drizzle-orm/sqlite-core';
import { SQLiteRemoteSession } from 'drizzle-orm/sqlite-proxy/session';
import type { NativeCallback, NativeConnection, NativeParameter, NativeRunResult, NativeTransaction } from './native-types';

export type ValdiDatabaseOptions = {
  /** Share commit notifications only when callers explicitly identify one database. */
  identity?: unknown;
  /** E.g. withGlobalNativeRefs: wrap each synchronous native callback registration. */
  bindNative?: <T>(body: () => T) => T;
};

/**
 * Portable BLOB column. Built-in blob(buffer/json/bigint) encoders depend on Node
 * Buffer and are unsupported on Valdi. No global Buffer polyfill is installed.
 * Reads return a fresh Uint8Array; writes accept ArrayBuffer or Uint8Array views.
 */
export const bytes = customType<{ data: Uint8Array | ArrayBuffer; driverData: ArrayBuffer }>({
  dataType: () => 'blob',
  toDriver: value => copyBytes(value),
  fromDriver: value => new Uint8Array(copyBytes(value)),
});

function copyBytes(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return new Uint8Array(value).slice().buffer as ArrayBuffer;
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer as ArrayBuffer;
  throw new Error('Unsupported binary parameter; use ArrayBuffer or Uint8Array');
}

function parameters(values: readonly unknown[]): NativeParameter[] {
  return values.map(value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new Error('Invalid number parameter: finite values and safe integers required');
      }
      return value;
    }
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) return copyBytes(value);
    throw new Error('Unsupported SQLite parameter');
  });
}

/**
 * A narrow SQLite lexer, not a mutability heuristic. Accept one statement, with
 * a special case for SQLite CREATE TRIGGER's BEGIN/CASE/END body. Strings, quoted
 * identifiers and comments cannot smuggle statement boundaries into this check.
 * Native prepare remains responsible for full SQLite grammar validation.
 */
function userStatement(source: string): void {
  const tokens: string[] = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c <= ' ' || c === '\ufeff') { i++; continue; }
    if (c === '-' && source[i + 1] === '-') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated SQL comment');
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const quote = c === '[' ? ']' : c;
      i++;
      let ended = false;
      while (i < source.length) {
        if (source[i++] !== quote) continue;
        if (c !== '[' && source[i] === quote) { i++; continue; }
        ended = true;
        break;
      }
      if (!ended) throw new Error('Unterminated SQL quoted token');
      tokens.push('<quoted>');
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      const start = i++;
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) i++;
      tokens.push(source.slice(start, i).toUpperCase());
      continue;
    }
    tokens.push(c);
    i++;
  }
  if (!tokens.length) throw new Error('Empty SQL statement');
  if (['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(tokens[0])) {
    throw new Error('SQL transaction control is owned by the driver');
  }
  const trigger = tokens[0] === 'CREATE'
    && (tokens[1] === 'TRIGGER' || (['TEMP', 'TEMPORARY'].includes(tokens[1]) && tokens[2] === 'TRIGGER'));
  let body = false;
  let finished = false;
  let cases = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (finished) throw new Error('Only one SQL statement is allowed');
    if (trigger && !body && token === 'BEGIN') { body = true; continue; }
    if (body) {
      if (token === 'CASE') cases++;
      if (token === 'END') {
        if (cases) cases--;
        else { body = false; finished = true; }
      }
      if (finished && tokens[i + 1] === ';') i++;
      continue;
    }
    if (token === ';') finished = true;
  }
}

const hubs = new Map<unknown, Set<() => void>>();
const asError = (value: unknown) => value instanceof Error ? value : new Error(String(value));
class RootLeaseContentionError extends Error {
  constructor(readonly released: Promise<void>) {
    super('Use the transaction scope; parent database handle is suspended');
    this.name = 'RootLeaseContentionError';
  }
}
function rootLeaseContention(error: unknown): RootLeaseContentionError | undefined {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    if (error instanceof RootLeaseContentionError) return error;
    seen.add(error);
    error = (error as Error & { cause?: unknown }).cause;
  }
  return undefined;
}
type Scope = {
  native?: NativeTransaction;
  alive: boolean;
  accepting: boolean;
  child?: Scope;
  tail: Promise<void>;
  failure?: Error;
  dirty: boolean;
  aborted: Promise<never>;
  abort: (reason: Error) => void;
};
function scope(): Scope {
  let abort!: Scope['abort'];
  const aborted = new Promise<never>((_, reject) => { abort = reject; });
  void aborted.catch(() => {});
  return { alive: true, accepting: true, tail: Promise.resolve(), dirty: false, aborted, abort };
}
function retire(current: Scope, error = new Error('Transaction scope retired')): void {
  current.alive = current.accepting = false;
  current.abort(error);
  if (current.child) retire(current.child, error);
}
function deferredOnly(config?: SQLiteTransactionConfig): void {
  if (config && Object.keys(config).some(key => key !== 'behavior')) {
    throw new Error('Only deferred transaction configuration is supported');
  }
  if (config?.behavior !== undefined && config.behavior !== 'deferred') {
    throw new Error('Only deferred transactions are supported by native SQLite');
  }
}

/**
 * Async Drizzle driver over the frozen callback API. There are no runtime
 * dependencies on Expo, WCDB, node:sqlite, Buffer, timers, or JSON transport.
 * Drizzle query builders are lazy: invoke .execute()/.run() or await them to
 * start work. Work started before a transaction body settles is drained.
 */
export function createValdiDatabase<TSchema extends Record<string, unknown>>(
  connection: NativeConnection,
  schema: TSchema,
  options: ValdiDatabaseOptions = {},
) {
  const exportInstruction = 'Rebuild/export the app with the ClientSQL run/queryRows native extensions, then relaunch';
  for (const method of ['run', 'queryRows', 'transaction', 'close'] as const) {
    if (typeof connection?.[method] !== 'function') {
      throw new Error(`Missing native ${method}(). ${exportInstruction}`);
    }
  }
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) continue;
    for (const column of Object.values(getTableColumns(table))) {
      if (['SQLiteBlobBuffer', 'SQLiteBlobJson', 'SQLiteBigInt'].includes(column.columnType)) {
        throw new Error('Drizzle blob modes require Node Buffer; use the portable bytes() customType');
      }
    }
  }
  const bind = options.bindNative ?? (<T>(body: () => T): T => body());
  const identity = options.identity ?? {};
  const dialect = new SQLiteAsyncDialect();
  const extracted = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  const relational: RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> = {
    fullSchema: schema, schema: extracted.tables as ExtractTablesWithRelations<TSchema>,
    tableNamesMap: extracted.tableNamesMap,
  };
  let tail = Promise.resolve();
  let owner: Scope | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  let savepoint = 0;
  const subscriptions = new Set<() => void>();

  function native<T>(register: (cb: NativeCallback<T>) => void, current?: Scope): Promise<T> {
    // A timeout can retire a scope after a callback resolves but before the
    // awaiting JS continuation runs. Never register another native operation.
    if (current && !current.alive) return Promise.reject(new Error('Transaction scope retired'));
    const reply = new Promise<T>((resolve, reject) => {
      try {
        bind(() => register((value, error) => {
          if (error !== undefined) reject(new Error(error));
          else resolve(value as T);
        }));
      } catch (error) { reject(error); }
    });
    return current ? Promise.race([reply, current.aborted]) : reply;
  }
  function valid(current?: Scope): void {
    if (current) {
      if (!current.alive || !current.accepting) throw new Error('Transaction scope retired');
      if (current.child) throw new Error('Parent transaction scope is suspended during nested transaction');
    } else {
      if (closed) throw new Error('Database driver closed');
      if (owner) throw new RootLeaseContentionError(tail);
    }
  }
  function enqueue<T>(current: Scope | undefined, work: () => Promise<T>, poison = true): Promise<T> {
    try { valid(current); } catch (error) { return Promise.reject(error); }
    const start = current ? current.tail : tail;
    const result = start.then(() => {
      if (current && !current.alive) throw new Error('Transaction scope retired');
      if (current?.failure) throw current.failure;
      return work();
    });
    const settled = result.then(() => {}, error => {
      if (current && poison) current.failure ??= asError(error);
    });
    if (current) current.tail = settled;
    else tail = settled;
    return result;
  }
  function rejectQuery(current: Scope | undefined, error: unknown): Promise<never> {
    // Validation is part of a started transaction operation too. Record it in
    // the drain so catching its individual promise cannot commit partial work.
    if (current?.alive && current.accepting && !current.child) {
      return enqueue(current, async () => { throw error; });
    }
    return Promise.reject(error);
  }
  function notify(): void {
    // Snapshot permits listener reentrancy, self-unsubscribe, and new watches.
    for (const request of [...(hubs.get(identity) ?? [])]) {
      try { request(); } catch { /* subscriber failures never affect a commit */ }
    }
  }
  async function drain<T>(current: Scope, body: () => Promise<T>): Promise<T> {
    let value!: T;
    try { value = await body(); }
    catch (error) { current.failure ??= asError(error); }
    current.accepting = false;
    await current.tail;
    if (current.failure) throw current.failure;
    if (!current.alive) throw new Error('Transaction scope retired');
    return value;
  }
  function nativeTransaction<T>(current: Scope, body: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let result!: T;
      let failure: Error | undefined;
      let ended = false;
      try {
        bind(() => connection.transaction((tx, done) => {
          if (ended) return;
          current.native = tx;
          // Observe every body continuation even if native times out first.
          void drain(current, async () => {
            for (const method of ['run', 'queryRows', 'execute'] as const) {
              if (typeof tx?.[method] !== 'function') {
                throw new Error(`Missing native transaction ${method}(). ${exportInstruction}`);
              }
            }
            return body();
          }).then(value => {
            result = value;
            if (!ended) {
              try { done(undefined, undefined); } catch (error) { finish(asError(error)); }
            }
          }, error => {
            failure = asError(error);
            if (!ended) {
              try { done(undefined, failure.message); } catch (doneError) { finish(asError(doneError)); }
            }
          });
        }, (_value, error) => finish(error === undefined ? undefined : failure ?? new Error(error))));
      } catch (error) { finish(asError(error)); }
      function finish(error?: Error): void {
        if (ended) return;
        ended = true;
        retire(current, error);
        if (error ?? failure) reject(error ?? failure);
        else resolve(result);
      }
    });
  }
  const fingerprintSQL = 'SELECT total_changes(), schema_version, user_version FROM pragma_schema_version, pragma_user_version';
  async function rows(current: Scope, sql: string, params: NativeParameter[]): Promise<unknown[][]> {
    const value = await native<unknown[][]>(cb => current.native!.queryRows(sql, params, cb), current);
    if (!Array.isArray(value) || !value.every(Array.isArray)) {
      throw new Error(`Native queryRows must return positional row arrays. ${exportInstruction}`);
    }
    return value;
  }
  async function statement<T>(
    current: Scope, sql: string, params: NativeParameter[], method: 'run' | 'rows',
    map: (value: NativeRunResult | unknown[][]) => T,
  ): Promise<T> {
    const tx = current.native!;
    const before = await rows(current, fingerprintSQL, []);
    const value = method === 'run'
      ? await native<NativeRunResult>(cb => tx.run(sql, params, cb), current)
      : await rows(current, sql, params);
    if (method === 'run') {
      const result = value as NativeRunResult;
      if (!result || !Number.isSafeInteger(result.changes) || result.changes < 0
        || typeof result.lastInsertRowid !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(result.lastInsertRowid)) {
        throw new Error(`Invalid native run metadata; lastInsertRowid must be an exact decimal string. ${exportInstruction}`);
      }
    }
    const mapped = map(value);
    const after = await rows(current, fingerprintSQL, []);
    if (before[0].some((v, i) => v !== after[0][i])) current.dirty = true;
    return mapped;
  }
  function execute<T>(
    current: Scope | undefined, sql: string, values: readonly unknown[], method: 'run' | 'rows',
    map: (value: NativeRunResult | unknown[][]) => T,
  ): Promise<T> {
    let params: NativeParameter[];
    try {
      valid(current);
      userStatement(sql);
      // Copy mutable input before ANY queue or await boundary.
      params = parameters(values);
    } catch (error) { return rejectQuery(current, error); }
    if (current) return enqueue(current, () => statement(current, sql, params, method, map));
    return enqueue(undefined, async () => {
      const implicit = scope();
      const result = await nativeTransaction(implicit, () => statement(implicit, sql, params, method, map));
      if (implicit.dirty) notify();
      return result;
    });
  }

  // Reuse exactly the installed sqlite-proxy mappers, including duplicate-name
  // positional rows, relational queries, and nullable joins. Run the mappers
  // inside the native transaction rather than after the remote client resolves.
  type DriverSession = SQLiteSession<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>>;
  class Session extends SQLiteSession<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>> {
    private readonly mapper = new SQLiteRemoteSession<TSchema, ExtractTablesWithRelations<TSchema>>(
      async () => { throw new Error('Unreachable proxy client'); }, dialect, relational,
    );
    constructor(private readonly current?: Scope) {
      super(dialect);
    }
    override prepareQuery(...args: Parameters<DriverSession['prepareQuery']>): ReturnType<DriverSession['prepareQuery']> {
      const prepared = this.mapper.prepareQuery(...args);
      const query = args[0];
      const invoke = (method: 'run' | 'all' | 'get' | 'values', placeholders?: Record<string, unknown>) => {
        let values: unknown[];
        try { values = fillPlaceholders(query.params, placeholders ?? {}); }
        catch (error) { return rejectQuery(this.current, error); }
        return execute(this.current, query.sql, values, method === 'run' ? 'run' : 'rows', result => {
          if (method === 'run') return result;
          const rows = result as unknown[][];
          if (method === 'values') return rows;
          if (method === 'all') return prepared.mapAllResult(rows);
          // queryRows fully steps RETURNING before selecting first; also
          // validate all row conversions before committing a get().
          for (let i = 1; i < rows.length; i++) prepared.mapGetResult(rows[i]);
          return prepared.mapGetResult(rows[0]);
        });
      };
      prepared.run = placeholders => invoke('run', placeholders) as ReturnType<typeof prepared.run>;
      prepared.all = placeholders => invoke('all', placeholders) as ReturnType<typeof prepared.all>;
      prepared.get = placeholders => invoke('get', placeholders) as ReturnType<typeof prepared.get>;
      prepared.values = ((placeholders?: Record<string, unknown>) =>
        invoke('values', placeholders)) as typeof prepared.values;
      return prepared as unknown as ReturnType<DriverSession['prepareQuery']>;
    }
    override transaction<T>(
      body: (tx: SQLiteTransaction<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>>) => Promise<T>,
      config?: SQLiteTransactionConfig,
    ): Promise<T> {
      try { valid(this.current); deferredOnly(config); }
      catch (error) { return Promise.reject(error); }
      if (this.current) return nested(this.current, body);
      const explicit = scope();
      const result = enqueue(undefined, async () => {
        try {
          const value = await nativeTransaction(explicit, () => body(transactionHandle(explicit)));
          if (explicit.dirty) notify();
          return value;
        } finally { owner = undefined; }
      });
      // Reserve synchronously so parent use in the body can never queue behind
      // itself, including the interval before native calls the body.
      owner = explicit;
      return result;
    }
    async batch(): Promise<never> {
      throw new Error('db.batch is unsupported; use db.transaction for atomic work');
    }
  }
  type Tx = SQLiteTransaction<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>>;
  class ScopedTransaction extends SQLiteTransaction<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>> {
    constructor(private readonly current: Scope) {
      super('async', dialect, new Session(current), relational);
    }
    override transaction<T>(body: (tx: Tx) => Promise<T>, config?: SQLiteTransactionConfig): Promise<T> {
      try { valid(this.current); deferredOnly(config); }
      catch (error) { return Promise.reject(error); }
      return nested(this.current, body);
    }
  }
  function transactionHandle(current: Scope): Tx {
    return new ScopedTransaction(current);
  }
  function nested<T>(parent: Scope, body: (tx: Tx) => Promise<T>): Promise<T> {
    const child = scope();
    child.native = parent.native;
    const name = `valdi_sp_${++savepoint}`;
    const control = (sql: string) => native<void>(cb => parent.native!.execute(sql, [], cb), parent);
    const result = enqueue(parent, async () => {
      let opened = false;
      try {
        await control(`SAVEPOINT ${name}`);
        opened = true;
        const value = await drain(child, () => body(transactionHandle(child)));
        await control(`RELEASE SAVEPOINT ${name}`);
        parent.dirty ||= child.dirty;
        return value;
      } catch (error) {
        if (opened && parent.alive) {
          try {
            await control(`ROLLBACK TO SAVEPOINT ${name}`);
            await control(`RELEASE SAVEPOINT ${name}`);
          } catch (rollbackError) { parent.failure ??= asError(rollbackError); }
        } else parent.failure ??= asError(error);
        throw error;
      } finally {
        retire(child);
        parent.child = undefined;
      }
    }, false);
    parent.child = child;
    return result;
  }
  // Expose an explicit batch rejection rather than a non-atomic implementation.
  const session = new Session();
  const db = new BaseSQLiteDatabase('async', dialect, session, relational) as unknown as
    BaseSQLiteDatabase<'async', NativeRunResult, TSchema, ExtractTablesWithRelations<TSchema>> & {
      batch(queries: readonly unknown[]): Promise<never>;
    };
  db.batch = () => session.batch();

  function watch<T>(
    query: () => PromiseLike<T> | T, listener: (value: T) => void, onError?: (error: Error) => void,
  ): () => void {
    if (closed) throw new Error('Database driver closed');
    let active = true;
    let running = false;
    let requested = false;
    let version = 0;
    const report = (error: unknown) => {
      if (active && !closed) {
        try { onError?.(asError(error)); } catch { /* isolate error listeners too */ }
      }
    };
    const request = () => {
      if (!active || closed) return;
      requested = true;
      version++;
      if (running) return;
      running = true;
      void Promise.resolve().then(async () => {
        try {
          while (requested && active && !closed) {
            // Include already-accepted writes before the initial snapshot.
            const ready = tail;
            await ready;
            if (!active || closed) break;
            // A transaction can reserve the root after we capture its old tail.
            // Keep the refresh pending and await the actual new queue entry.
            if (ready !== tail || owner) continue;
            requested = false;
            const observed = version;
            let value: T;
            try {
              value = await query();
            } catch (error) {
              // query() may itself await before reaching the root handle.
              // Only typed lease contention retries, even through Drizzle's
              // cause wrapper. Its release promise also resolves on rollback.
              const contention = rootLeaseContention(error);
              if (contention) {
                requested = true;
                await contention.released;
              } else report(error);
              continue;
            }
            if (active && !closed && observed === version) {
              try { listener(value); } catch (error) { report(error); }
            }
          }
        } finally { running = false; }
      }).catch(report);
    };
    let hub = hubs.get(identity);
    if (!hub) hubs.set(identity, hub = new Set());
    hub.add(request);
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      hub!.delete(request);
      if (!hub!.size) hubs.delete(identity);
      subscriptions.delete(unsubscribe);
    };
    subscriptions.add(unsubscribe);
    request();
    return unsubscribe;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    if (owner) return Promise.reject(new Error('Cannot close the parent handle during a transaction'));
    closed = true;
    for (const unsubscribe of [...subscriptions]) unsubscribe();
    closing = tail.then(() => native<void>(cb => connection.close(cb)));
    return closing;
  }
  return {
    db, watch, close,
    run: (sql: string, params: readonly unknown[] = []) =>
      execute(undefined, sql, params, 'run', value => value as NativeRunResult),
    queryRows: (sql: string, params: readonly unknown[] = []) =>
      execute(undefined, sql, params, 'rows', value => value as unknown[][]),
  };
}
