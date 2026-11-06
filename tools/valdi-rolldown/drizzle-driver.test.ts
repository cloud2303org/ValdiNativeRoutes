import assert from 'node:assert/strict';
import test from 'node:test';
import { DrizzleQueryError, sql, eq } from '../../valdi/node_modules/drizzle-orm/index.js';
import { alias, blob, customType, integer, sqliteTable, text } from '../../valdi/node_modules/drizzle-orm/sqlite-core/index.js';
import { nativeDatabase, deferred, microtasks } from './tests/drizzle-native-test';

const modulePath = '../../valdi/modules/app_pages/src/database/driver';
async function driver() {
  const loaded = await import(modulePath).catch(() => undefined);
  assert.ok(loaded?.createValdiDatabase, 'production createValdiDatabase must exist');
  return loaded as typeof import('../../valdi/modules/app_pages/src/database/driver');
}
const items = sqliteTable('items', {
  id: integer().primaryKey(),
  name: text().notNull().unique(),
});
async function setup(options?: Record<string, unknown>) {
  const { createValdiDatabase } = await driver();
  const native = nativeDatabase();
  const api = createValdiDatabase(native.connection, { items }, options);
  await api.run('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  return { ...native, ...api, get registrations() { return native.registrations; } };
}

test('real constraints/upsert, positional joins, get, and exact concurrent metadata', async () => {
  const a = await setup();
  try {
    const results = await Promise.all([
      a.run("INSERT INTO items(id,name) VALUES (9007199254740993,'one')"),
      a.run("INSERT INTO items(id,name) VALUES (9007199254740994,'two')"),
    ]);
    assert.deepEqual(results, [
      { changes: 1, lastInsertRowid: '9007199254740993' },
      { changes: 1, lastInsertRowid: '9007199254740994' },
    ]);
    await a.run('DELETE FROM items');
    await a.db.insert(items).values({ id: 1, name: 'one' });
    await assert.rejects(a.db.insert(items).values({ id: 2, name: 'one' }).execute());
    await a.db.insert(items).values({ id: 1, name: 'updated' })
      .onConflictDoUpdate({ target: items.id, set: { name: 'updated' } });
    const other = alias(items, 'other');
    assert.deepEqual(await a.db.select().from(items).leftJoin(other, eq(items.id, other.id)),
      [{ items: { id: 1, name: 'updated' }, other: { id: 1, name: 'updated' } }]);
    assert.deepEqual(await a.queryRows('SELECT 1 AS x, 2 AS x'), [[1, 2]]);
    assert.equal(await a.db.select().from(items).where(eq(items.id, 99)).get(), undefined);
  } finally { await a.close(); }
});

test('native outer rollback, true nested rollback/release/continue, scoped escape and overlap guards', async () => {
  const a = await setup();
  let escaped: any;
  try {
    await assert.rejects(a.db.transaction(async tx => {
      await tx.insert(items).values({ name: 'rolled back' });
      throw new Error('outer failure');
    }), /outer failure/);
    assert.deepEqual(await a.db.select().from(items), []);
    await a.db.transaction(async tx => {
      escaped = tx;
      await tx.insert(items).values({ id: 1, name: 'outer' });
      await assert.rejects(a.db.select().from(items).execute(), /parent|scope|transaction/i);
      await assert.rejects(tx.transaction(async nested => {
        await nested.insert(items).values({ id: 2, name: 'nested' });
        await assert.rejects(tx.select().from(items).execute(), /parent|scope|transaction/i);
        throw new Error('nested failure');
      }), /nested failure/);
      await tx.transaction(async nested => {
        await nested.insert(items).values({ id: 3, name: 'kept' });
      });
    });
    assert.deepEqual((await a.db.select().from(items)).map(x => x.name), ['outer', 'kept']);
    await assert.rejects(escaped.select().from(items).execute(), /scope|retired/i);
    assert.equal(a.statements.filter(s => s.startsWith('ROLLBACK TO')).length, 1);
    assert.equal(a.statements.filter(s => s.startsWith('RELEASE')).length, 2);
  } finally { await a.close(); }
});

test('started fire-and-forget work drains; failed work poisons the transaction even when caught', async () => {
  const a = await setup();
  try {
    await a.db.transaction(async tx => {
      void tx.insert(items).values({ name: 'drained' }).execute();
    });
    assert.equal((await a.db.select().from(items)).length, 1);
    await assert.rejects(a.db.transaction(async tx => {
      await tx.insert(items).values({ name: 'new' });
      await tx.insert(items).values({ name: 'drained' }).execute().catch(() => {});
    }));
    assert.deepEqual((await a.db.select().from(items)).map(x => x.name), ['drained']);
  } finally { await a.close(); }
});

test('native timeout retires scopes and ignores late JS completion', async () => {
  const a = await setup();
  const entered = deferred();
  const continueBody = deferred();
  let escaped: any;
  const transaction = a.db.transaction(async tx => {
    escaped = tx;
    await tx.insert(items).values({ name: 'timeout' });
    entered.resolve();
    await continueBody.promise;
    await assert.rejects(tx.select().from(items).execute(), /scope|retired/i);
  });
  const rejection = assert.rejects(transaction, /timed out/);
  await entered.promise;
  a.failTransaction();
  await rejection;
  assert.deepEqual(await a.db.select().from(items), []);
  continueBody.resolve();
  await microtasks();
  await assert.rejects(escaped.select().from(items).execute(), /scope|retired/i);
  await a.close();
});

test('implicit RETURNING conversions roll back and get consumes every row', async () => {
  const a = await setup();
  const throwing = customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    fromDriver: () => { throw new Error('conversion failure'); },
  });
  const typed = sqliteTable('items', { id: integer().primaryKey(), name: throwing() });
  try {
    await assert.rejects(a.db.insert(typed).values({ name: 'bad' }).returning().execute(), /conversion failure/);
    assert.deepEqual(await a.db.select().from(items), []);
    const first = await a.db.insert(items).values([{ name: 'one' }, { name: 'two' }]).returning().get();
    assert.equal(first?.name, 'one');
    assert.equal((await a.db.select().from(items)).length, 2);
  } finally { await a.close(); }
});

test('narrow SQL lexer blocks transaction ownership escapes including scripts and comments', async () => {
  const a = await setup();
  try {
    for (const statement of ['BEGIN', '/* hello */ COMMIT', '-- hi\nROLLBACK', 'END',
      'SAVEPOINT x', 'RELEASE x', 'SELECT 1; BEGIN', 'SELECT 1; /* x */ END']) {
      await assert.rejects(a.run(statement), /transaction|statement|control/i);
    }
    assert.deepEqual(await a.queryRows("SELECT 'BEGIN; COMMIT' AS x /* ROLLBACK */"), [['BEGIN; COMMIT']]);
    await a.run("CREATE TRIGGER item_trigger AFTER INSERT ON items BEGIN SELECT 1; END");
    await a.db.insert(items).values({ name: 'trigger' });
    await assert.rejects(a.db.transaction(async () => {}, { behavior: 'immediate' }), /deferred/i);
    await assert.rejects(a.db.batch([a.db.insert(items).values({ name: 'batch' })]), /batch/i);
  } finally { await a.close(); }
});

test('binary subviews snapshot at invocation, no Buffer dependency, invalid params reject before native', async () => {
  const { bytes } = await driver();
  const a = await setup();
  const binary = sqliteTable('binary', { value: bytes().notNull() });
  await a.run('CREATE TABLE binary(value BLOB NOT NULL)');
  try {
    const input = new Uint8Array([0, 1, 2, 3]);
    const promise = a.db.insert(binary).values({ value: input.subarray(1, 3) }).execute();
    input.fill(9);
    await promise;
    const saved = await a.db.select().from(binary).get();
    assert.deepEqual([...new Uint8Array(saved!.value)], [1, 2]);
    const raw = new Uint8Array([4, 5]);
    const queued = a.run('INSERT INTO binary VALUES (?)', [raw.buffer]);
    raw.fill(8);
    await queued;
    assert.deepEqual([...(new Uint8Array((await a.queryRows('SELECT value FROM binary'))[1][0] as ArrayBuffer))], [4, 5]);
    const count = a.registrations;
    for (const value of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, undefined, 1n]) {
      await assert.rejects(a.run('SELECT ?', [value as never]), /param|number|integer|unsupported/i);
    }
    assert.equal(a.registrations, count);
  } finally { await a.close(); }
});

test('watch initial/commit/rollback, separate subscriptions, reentrancy and listener isolation', async () => {
  const a = await setup({ identity: 'watch-test' });
  const seen: string[][] = [];
  const errors: unknown[] = [];
  const off = a.watch(() => a.db.select().from(items), rows => {
    seen.push(rows.map(row => row.name));
    if (seen.length > 1) throw new Error('listener isolated');
  }, e => errors.push(e));
  await microtasks(100);
  assert.deepEqual(seen, [[]]);
  await a.db.transaction(async tx => {
    await tx.insert(items).values({ name: 'commit' });
    await tx.insert(items).values({ name: 'second' });
  });
  await microtasks(100);
  assert.deepEqual(seen, [[], ['commit', 'second']]);
  await assert.rejects(a.db.transaction(async tx => {
    await tx.insert(items).values({ name: 'rollback' });
    throw new Error('rollback');
  }));
  await microtasks(100);
  assert.equal(seen.length, 2);
  assert.equal(errors.length, 1);
  off();
  const delayed = deferred<string>();
  let late = false;
  const offLate = a.watch(() => delayed.promise, () => { late = true; });
  await microtasks();
  offLate();
  delayed.resolve('late');
  await microtasks();
  assert.equal(late, false);
  await a.close();
  assert.throws(() => a.watch(() => Promise.resolve(1), () => {}), /closed/i);
});

test('close drains accepted queued operations, rejects new work, closes once, bindNative covers registration', async () => {
  let binds = 0;
  const a = await setup({ bindNative: <T>(body: () => T) => { binds++; return body(); } });
  const queued = a.run("INSERT INTO items(name) VALUES ('before close')");
  const closing = a.close();
  await assert.rejects(a.run('SELECT 1'), /closed/i);
  await queued;
  await closing;
  await a.close();
  assert.equal(binds, a.registrations);
  await assert.rejects(a.db.select().from(items).execute(), /closed/i);
});

test('stale native exports fail fast with rebuild/export guidance; object rows cannot fall back', async () => {
  const { createValdiDatabase } = await driver();
  assert.throws(() => createValdiDatabase({} as never, {}), /export.*native|native.*export/i);
  const a = nativeDatabase();
  const stale = {
    ...a.connection,
    transaction(body: Parameters<typeof a.connection.transaction>[0], cb: Parameters<typeof a.connection.transaction>[1]) {
      a.connection.transaction((tx, done) => body({
        ...tx,
        queryRows(sql, params, callback) {
          if (sql.includes('total_changes')) tx.queryRows(sql, params, callback);
          else tx.queryRows(sql, params, (rows, error) =>
            callback(rows?.map(row => ({ x: row[0] })) as never, error));
        },
      }, done), cb);
    },
  };
  const api = createValdiDatabase(stale, {});
  await assert.rejects(api.queryRows('SELECT 1'), /positional|array|export/i);
  await api.close();
});

test('standard Buffer-based blob modes are rejected and portable bytes work without global Buffer', async () => {
  const { createValdiDatabase, bytes } = await driver();
  const a = nativeDatabase();
  for (const mode of ['buffer', 'json', 'bigint'] as const) {
    const bad = sqliteTable('bad', { value: blob({ mode }) });
    assert.throws(() => createValdiDatabase(a.connection, { bad }), /blob|bytes|Buffer/i);
  }
  const binary = sqliteTable('binary', { value: bytes() });
  const api = createValdiDatabase(a.connection, { binary });
  await api.run('CREATE TABLE binary(value BLOB)');
  const original = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined as never;
    await api.db.insert(binary).values({ value: new Uint8Array([6, 7]) });
    assert.deepEqual([...(await api.db.select().from(binary).get())!.value as Uint8Array], [6, 7]);
  } finally { globalThis.Buffer = original; await api.close(); }
});

test('shared identity propagates commits between instances and independent/reentrant watches remain safe', async () => {
  const { createValdiDatabase } = await driver();
  const a = await setup({ identity: 'shared-test' });
  // Two wrappers share one native writer gate; only `a` owns closing it.
  const b = createValdiDatabase(a.connection, { items }, { identity: 'shared-test' });
  const snapshots: number[] = [];
  const initial = deferred();
  let off2 = () => {};
  const off1 = b.watch(() => b.db.select().from(items), rows => {
    snapshots.push(rows.length);
    initial.resolve();
    if (rows.length === 1) off2();
  });
  const otherSnapshots: number[] = [];
  off2 = b.watch(() => b.db.select().from(items), rows => otherSnapshots.push(rows.length));
  await initial.promise;
  await microtasks(100);
  await a.db.insert(items).values({ name: 'shared' });
  await microtasks(100);
  assert.deepEqual(snapshots, [0, 1]);
  assert.deepEqual(otherSnapshots, [0]);
  off1();
  await a.close();
});

test('rollback of only nested writes does not invalidate watchers', async () => {
  const a = await setup();
  const seen: number[] = [];
  const off = a.watch(() => a.db.select().from(items), rows => seen.push(rows.length));
  await microtasks(100);
  await a.db.transaction(async tx => {
    await assert.rejects(tx.transaction(async child => {
      await child.insert(items).values({ name: 'discarded' });
      throw new Error('rollback nested');
    }));
  });
  await microtasks(100);
  assert.deepEqual(seen, [0]);
  off();
  await a.close();
});

test('native transaction done receives error in second callback argument and rolls back body failure', async () => {
  const a = await setup();
  const before = a.completions.length;
  await assert.rejects(a.db.transaction(async tx => {
    await tx.insert(items).values({ name: 'must rollback' });
    throw new Error('second callback argument');
  }), /second callback argument/);
  assert.deepEqual(a.completions[before], { value: undefined, error: 'second callback argument' });
  assert.deepEqual(await a.db.select().from(items), []);
  await a.close();
});

test('unsubscribing twice cannot remove a newer identity hub', async () => {
  const a = await setup({ identity: 'unsubscribe-twice' });
  const old = a.watch(() => 1, () => {});
  old();
  const seen: number[] = [];
  const off = a.watch(() => a.db.select().from(items), rows => seen.push(rows.length));
  await microtasks(100);
  old();
  await a.db.insert(items).values({ name: 'notification' });
  await microtasks(100);
  assert.deepEqual(seen, [0, 1]);
  off();
  await a.close();
});

test('watch initial snapshot coalesces already-queued commits without duplicate emissions', async () => {
  const a = await setup();
  const first = a.run("INSERT INTO items(name) VALUES ('first')");
  const second = a.run("INSERT INTO items(name) VALUES ('second')");
  const seen: number[] = [];
  const off = a.watch(() => a.db.select().from(items), rows => seen.push(rows.length));
  await Promise.all([first, second]);
  await microtasks(150);
  assert.deepEqual(seen, [2]);
  off();
  await a.close();
});

test('missing tx additive methods fail with export guidance and roll back', async () => {
  const { createValdiDatabase } = await driver();
  const native = nativeDatabase();
  const api = createValdiDatabase({
    ...native.connection,
    transaction(body, cb) {
      native.connection.transaction((tx, done) => body({ execute: tx.execute } as never, done), cb);
    },
  }, {});
  await assert.rejects(api.queryRows('SELECT 1'), /export.*native|native.*export/i);
  assert.match(native.completions[0].error!, /export.*native|native.*export/i);
  await api.close();
});

test('parameter validation inside an explicit transaction poisons it even when the rejection is caught', async () => {
  const a = await setup();
  await assert.rejects(a.db.transaction(async tx => {
    await tx.insert(items).values({ name: 'rollback on invalid input' });
    await tx.run(sql`SELECT ${Infinity}`).execute().catch(() => {});
  }), /number parameter/);
  assert.deepEqual(await a.db.select().from(items), []);
  await a.close();
});

test('stale object-row fingerprints fail with export guidance before executing user SQL', async () => {
  const { createValdiDatabase } = await driver();
  const native = nativeDatabase();
  const api = createValdiDatabase({
    ...native.connection,
    transaction(body, callback) {
      native.connection.transaction((tx, done) => body({
        ...tx,
        queryRows(sql, params, cb) {
          tx.queryRows(sql, params, (rows, error) =>
            cb(rows?.map(row => ({ total_changes: row[0] })) as never, error));
        },
      }, done), callback);
    },
  }, {});
  await assert.rejects(api.run('CREATE TABLE must_not_exist (id)'), /positional|array|export/i);
  assert.equal(native.database.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='must_not_exist'").get()!.n, 0);
  await api.close();
});

test('nested native timeout retires every child and queued statement, ignores late done, then allows root recovery', async () => {
  const a = await setup();
  const entered = deferred();
  const resume = deferred();
  const bodyFinished = deferred();
  let queued!: Promise<unknown>;
  let child: any;
  const pending = a.db.transaction(async tx => {
    await tx.transaction(async nested => {
      child = nested;
      queued = nested.insert(items).values({ name: 'queued timeout' }).execute();
      entered.resolve();
      await resume.promise;
      await assert.rejects(queued, /timed out|retired/i);
      bodyFinished.resolve();
    });
  });
  const rejected = assert.rejects(pending, /timed out/);
  await entered.promise;
  void queued.catch(() => {});
  a.failTransaction();
  await rejected;
  const doneCalls = a.completions.length;
  resume.resolve();
  await bodyFinished.promise;
  await microtasks(100);
  assert.equal(a.completions.length, doneCalls);
  await assert.rejects(child.select().from(items).execute(), /scope|retired/i);
  assert.deepEqual(await a.db.select().from(items), []);
  await a.db.insert(items).values({ name: 'recovered' });
  await a.close();
});

test('watch suppresses an in-flight result after close; close inside a transaction is explicitly rejected', async () => {
  const a = await setup();
  await a.db.transaction(async tx => {
    await assert.rejects(a.close(), /transaction/i);
    await tx.insert(items).values({ name: 'still live' });
  });
  const value = deferred<number>();
  const started = deferred();
  let emitted = false;
  a.watch(() => { started.resolve(); return value.promise; }, () => { emitted = true; });
  await started.promise;
  await a.close();
  value.resolve(1);
  await microtasks();
  assert.equal(emitted, false);
});

test('invalid native run metadata rejects and rolls back the standalone statement', async () => {
  const { createValdiDatabase } = await driver();
  const native = nativeDatabase();
  native.database.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
  const api = createValdiDatabase({
    ...native.connection,
    transaction(body, callback) {
      native.connection.transaction((tx, done) => body({
        ...tx,
        run(sql, params, cb) {
          tx.run(sql, params, (result, error) => {
            cb(result ? { ...result, lastInsertRowid: Number(result.lastInsertRowid) as never } : undefined, error);
          });
        },
      }, done), callback);
    },
  }, {});
  await assert.rejects(api.run("INSERT INTO items(name) VALUES ('wrong metadata')"), /metadata|lastInsertRowid|export/i);
  assert.equal(native.database.prepare('SELECT count(*) AS n FROM items').get()!.n, 0);
  await api.close();
});

test('native retirement between a callback and its JS continuation prevents new native registrations', async () => {
  const { createValdiDatabase } = await driver();
  const native = nativeDatabase();
  native.database.exec('CREATE TABLE items (name TEXT)');
  let runs = 0;
  let fail = true;
  const api = createValdiDatabase({
    ...native.connection,
    transaction(body, callback) {
      native.connection.transaction((tx, done) => body({
        ...tx,
        run(sql, params, cb) { runs++; tx.run(sql, params, cb); },
        queryRows(sql, params, cb) {
          tx.queryRows(sql, params, (value, error) => {
            cb(value, error);
            if (fail) { fail = false; native.failTransaction(); }
          });
        },
      }, done), callback);
    },
  }, {});
  await assert.rejects(api.run("INSERT INTO items(name) VALUES ('must never execute')"), /timed out/);
  await microtasks(100);
  assert.equal(runs, 0);
  assert.equal(native.database.prepare('SELECT count(*) AS n FROM items').get()!.n, 0);
  await api.close();
});

for (const outcome of ['commit', 'rollback'] as const) {
  test(`watch preserves initial refresh across a root read-only ${outcome} after its old tail resolves`, async () => {
    const a = await setup();
    const seen: unknown[][][] = [];
    const errors: Error[] = [];
    const off = a.watch(() => a.queryRows('SELECT 1'), rows => seen.push(rows), error => errors.push(error));
    try {
      // The watcher starts awaiting the previous root tail in this microtask.
      // The transaction reserves the root handle before that await resumes.
      await Promise.resolve();
      const pending = a.db.transaction(async () => {
        if (outcome === 'rollback') throw new Error('read-only rollback');
      });
      if (outcome === 'rollback') await assert.rejects(pending, /read-only rollback/);
      else await pending;
      await microtasks(100);
      assert.deepEqual(seen, [[[1]]]);
      assert.deepEqual(errors, []);
    } finally { off(); await a.close(); }
  });

  for (const wrapped of [false, true]) {
    test(`watch retries an async query encountering a root read-only ${outcome}${wrapped ? ' through a Drizzle error cause' : ''}`, async () => {
      const a = await setup();
      const started = deferred();
      const queryReady = deferred();
      const transactionEntered = deferred();
      const finishTransaction = deferred();
      const seen: unknown[][][] = [];
      const errors: Error[] = [];
      let attempts = 0;
      const off = a.watch(async () => {
        attempts++;
        if (attempts === 1) {
          started.resolve();
          await queryReady.promise;
        }
        try { return await a.queryRows('SELECT 1'); }
        catch (error) {
          if (wrapped) throw new DrizzleQueryError('SELECT 1', [], error as Error);
          throw error;
        }
      }, rows => seen.push(rows), error => errors.push(error));
      let pending: Promise<void> | undefined;
      try {
        await started.promise;
        pending = a.db.transaction(async () => {
          transactionEntered.resolve();
          await finishTransaction.promise;
          if (outcome === 'rollback') throw new Error('read-only rollback');
        });
        const completed = outcome === 'rollback'
          ? assert.rejects(pending, /read-only rollback/)
          : pending;
        await transactionEntered.promise;
        queryReady.resolve();
        await microtasks(40);
        // The refresh must wait for the actual lease release, without repeatedly
        // calling query() or surfacing a transient ownership error to onError.
        assert.equal(attempts, 1);
        assert.deepEqual(seen, []);
        assert.deepEqual(errors, []);
        finishTransaction.resolve();
        await completed;
        await microtasks(100);
        assert.equal(attempts, 2);
        assert.deepEqual(seen, [[[1]]]);
        assert.deepEqual(errors, []);
      } finally {
        off();
        queryReady.resolve();
        finishTransaction.resolve();
        await pending?.catch(() => {});
        await a.close();
      }
    });
  }
}

test('watch reports genuine SQLite failures and lookalike lease messages without retrying them', async () => {
  const a = await setup();
  const failures: Error[] = [];
  let sqlAttempts = 0;
  let lookalikeAttempts = 0;
  const offSQL = a.watch(async () => {
    sqlAttempts++;
    try { return await a.queryRows('SELECT missing_column'); }
    catch (error) { throw new DrizzleQueryError('SELECT missing_column', [], error as Error); }
  }, () => assert.fail('a failed query cannot emit'), error => failures.push(error));
  const lookalike = new Error('Use the transaction scope; parent database handle is suspended');
  const offLookalike = a.watch(() => {
    lookalikeAttempts++;
    throw lookalike;
  }, () => assert.fail('a failed query cannot emit'), error => failures.push(error));
  try {
    await microtasks(100);
    assert.equal(sqlAttempts, 1);
    assert.equal(lookalikeAttempts, 1);
    assert.equal(failures.length, 2);
    assert.ok(failures.includes(lookalike));
    assert.ok(failures.some(error => error instanceof DrizzleQueryError && String(error.cause).includes('missing_column')));
  } finally { offSQL(); offLookalike(); await a.close(); }
});
