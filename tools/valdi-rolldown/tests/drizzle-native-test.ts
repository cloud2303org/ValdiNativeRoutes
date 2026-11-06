import { DatabaseSync } from 'node:sqlite';

type Param = string | number | boolean | ArrayBuffer | null;
type Callback<T> = (value: T | undefined, error: string | undefined) => void;
type Result = { changes: number; lastInsertRowid: string };

/**
 * A callback transport around real SQLite, not a SQL-result mock. Microtasks model
 * asynchronous native callbacks. failTransaction models the native timeout/error
 * callback without waiting 30 seconds or adding a production timer.
 */
export function nativeDatabase(database = new DatabaseSync(':memory:')) {
  let closed = false;
  let completion: Callback<void> | undefined;
  const statements: string[] = [];
  let registrations = 0;
  const completions: { value: void; error: string | undefined }[] = [];
  const args = (params: Param[]) => params.map(p =>
    p instanceof ArrayBuffer ? new Uint8Array(p) : typeof p === 'boolean' ? Number(p) : p);
  const reply = <T>(cb: Callback<T>, body: () => T) => {
    registrations++;
    queueMicrotask(() => {
      try {
        if (closed) throw new Error('native closed');
        const value = body();
        cb(value, undefined);
      } catch (e) { cb(undefined, String(e)); }
    });
  };
  const tx = {
    run(sql: string, params: Param[], cb: Callback<Result>) {
      reply(cb, () => {
        statements.push(sql);
        const stmt = database.prepare(sql);
        stmt.setReadBigInts(true);
        const result = stmt.run(...args(params));
        return { changes: Number(result.changes), lastInsertRowid: String(result.lastInsertRowid) };
      });
    },
    queryRows(sql: string, params: Param[], cb: Callback<unknown[][]>) {
      reply(cb, () => {
        statements.push(sql);
        const stmt = database.prepare(sql);
        stmt.setReturnArrays(true);
        return (stmt.all(...args(params)) as unknown as unknown[][]).map(row =>
          row.map(v => v instanceof Uint8Array ? v.slice().buffer : v));
      });
    },
    execute(sql: string, params: Param[] | undefined, cb: Callback<void>) {
      reply(cb, () => { statements.push(sql); database.prepare(sql).run(...args(params ?? [])); });
    },
  };
  const connection = {
    ...tx,
    transaction(body: (scope: typeof tx, done: Callback<void>) => void, cb: Callback<void>) {
      registrations++;
      queueMicrotask(() => {
        database.exec('BEGIN');
        completion = cb;
        let ended = false;
        const done: Callback<void> = (value, error) => {
          completions.push({ value, error });
          if (ended) return;
          ended = true;
          queueMicrotask(() => {
            if (completion !== cb) return;
            completion = undefined;
            try { database.exec(error === undefined ? 'COMMIT' : 'ROLLBACK'); }
            catch (e) { cb(undefined, String(e)); return; }
            cb(undefined, error);
          });
        };
        try { body(tx, done); } catch (e) { done(undefined, String(e)); }
      });
    },
    close(cb: Callback<void>) {
      reply(cb, () => { closed = true; database.close(); });
    },
  };
  return {
    connection, database, statements, completions,
    get registrations() { return registrations; },
    failTransaction(message = 'native transaction timed out') {
      const cb = completion;
      if (!cb) throw new Error('no active native transaction');
      completion = undefined;
      database.exec('ROLLBACK');
      cb(undefined, message);
    },
  };
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function microtasks(count = 30) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}
