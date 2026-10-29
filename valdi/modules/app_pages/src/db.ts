import { AppDb } from './sqlgen/AppDb';

let appDb: AppDb | undefined;

/**
 * The app's SQLite database (schema in sql/AppDb), shared by every page. Opened by startApp (app.ts): the connection
 * ClientSQL returns is made of native functions, disposed with the Context they were created in, so one opened lazily
 * from a page died with that page's root view (e.g. when the Android activity was destroyed).
 */
export function getAppDb(): AppDb {
  if (!appDb) {
    appDb = AppDb.open('app');
  }
  return appDb;
}
