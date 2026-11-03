import { AppDb } from './sqlgen/AppDb';

// Native ClientSQL functions belong to the scope that opened the connection. Keep the App-startup connection on
// this JS runtime across module hot reloads; reopening it from HomePage would bind it to a disposable page context.
const KEY = '__valdiRoutesAppDb';

export function initializeAppDb(): void {
  const state = globalThis as unknown as { [KEY]?: AppDb };
  if (!state[KEY]) state[KEY] = AppDb.open('app');
}

export function getAppDb(): AppDb {
  const database = (globalThis as unknown as { [KEY]?: AppDb })[KEY];
  if (!database) throw new Error('The App database must be initialized by startApp before opening pages');
  return database;
}
