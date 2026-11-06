import { count } from 'drizzle-orm';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';
import { createValdiDatabase } from 'app_foundation/src/database/driver';
import { APP_DATABASE_IDENTITY, migrateAppDatabase } from '../database/migrations';
import type { NativeConnection } from 'app_foundation/src/database/native-types';
import * as schema from '../database/schema';

declare function require(path: string): any;

export interface AppDatabase {
  readonly ready: Promise<void>;
  insertSubmission(summary: string, createdAt: number): Promise<void>;
  watchSubmissionCount(listener: (count: number) => void, onError?: (error: Error) => void): () => void;
  close(): Promise<void>;
}

const KEY = 'valdi:routes:drizzle:database';
const bindNative = <T>(body: () => T): T => withGlobalNativeRefs('app-database', body);
const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

function openAppDatabase(): AppDatabase {
  const { openDatabase } = require('client_sql/src/ClientSQLNative') as {
    openDatabase(
      name: string, version: number, statements: string[],
      migrations: { version: number; statements: string[] }[],
    ): NativeConnection;
  };
  // Fixed ClientSQL bootstrap only; Drizzle owns all business DDL and history.
  const connection = bindNative(() => openDatabase(APP_DATABASE_IDENTITY, 1, [], []));
  const options = { identity: APP_DATABASE_IDENTITY, bindNative };
  const driver = createValdiDatabase(connection, schema, options);
  const ready = migrateAppDatabase(connection, options);
  // Keep startup rejection observed even before a page subscribes. Consumers
  // still receive the original rejection through ready, operations and onError.
  void ready.catch(error => console.error('App database migration failed', error));
  let closed = false;
  let closing: Promise<void> | undefined;
  const subscriptions = new Set<() => void>();
  const assertOpen = (): void => {
    if (closed) throw new Error('App database is closed');
  };
  return {
    ready,
    async insertSubmission(summary, createdAt): Promise<void> {
      assertOpen();
      await ready;
      assertOpen();
      await driver.db.insert(schema.submission).values({ summary, createdAt });
    },
    watchSubmissionCount(listener, onError): () => void {
      assertOpen();
      let active = true;
      let stopDriver: (() => void) | undefined;
      const stop = (): void => {
        if (!active) return;
        active = false;
        stopDriver?.();
        subscriptions.delete(stop);
      };
      const report = (error: unknown): void => {
        if (!active || closed) return;
        try {
          if (onError) onError(asError(error));
          else console.error('App submission count failed', error);
        } catch (listenerError) {
          console.error('App database error listener failed', listenerError);
        }
      };
      subscriptions.add(stop);
      void ready.then(() => {
        if (!active || closed) return;
        stopDriver = driver.watch(
          () => driver.db.select({ count: count() }).from(schema.submission),
          rows => { if (active && !closed) listener(rows[0]?.count ?? 0); },
          report,
        );
      }).catch(report);
      return stop;
    },
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      subscriptions.forEach(stop => stop());
      closing = ready.catch(() => {}).then(() => driver.close());
      return closing;
    },
  };
}

export function initializeAppDb(): void {
  const state = globalThis as unknown as { [KEY]?: AppDatabase };
  if (!state[KEY]) state[KEY] = openAppDatabase();
}

export function getAppDb(): AppDatabase {
  const database = (globalThis as unknown as { [KEY]?: AppDatabase })[KEY];
  if (!database) throw new Error('The App database must be initialized by startApp before opening pages');
  return database;
}
