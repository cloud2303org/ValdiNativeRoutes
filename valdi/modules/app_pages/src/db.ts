import { AppDb } from './sqlgen/AppDb';

let appDb: AppDb | undefined;

/** The app's SQLite database (schema in sql/AppDb), opened on first use and shared by every page. */
export function getAppDb(): AppDb {
  if (!appDb) {
    appDb = AppDb.open('app');
  }
  return appDb;
}
