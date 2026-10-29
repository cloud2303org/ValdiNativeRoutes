import * as v from 'valibot';
import { router } from './routes';

/**
 * Where the host keeps the token: the iOS Keychain; on Android encrypted with a Keystore key. Synchronous, called on
 * the JS thread, so startApp can choose the first page with it.
 *
 * @ExportModel({ios: 'VRTokenStore', android: 'io.valdiroutes.pages.TokenStore'})
 */
export interface TokenStore {
  /** Whether a token is stored, without reading it: on Android that would unlock the Keystore key at startup. */
  has: () => boolean;
  /** '' when there is none. */
  read: () => string;
  write: (token: string) => void;
  clear: () => void;
}

// On globalThis, as NavigationHost: a module Valdi unloads and reloads would lose it.
const STORE_KEY = '__valdiRoutesTokenStore';

export function installAuth(store: TokenStore): void {
  (globalThis as any)[STORE_KEY] = store;
}

function tokenStore(): TokenStore {
  const store: TokenStore | undefined = (globalThis as any)[STORE_KEY];
  if (!store) {
    throw new Error('the token store is not installed');
  }
  return store;
}

const tokenSchema = v.pipe(v.string('token must be a string'), v.regex(/\S/, 'token must not be empty'));

/** Read once from the store, then kept here; undefined until then, null when signed out. */
let cached: string | null | undefined;

/**
 * The session, as a mini program does it by hand: startApp opens the login page or the app depending on
 * isSignedIn, and signing in or out starts the stack over, so no page of the other side stays below.
 */
export const auth = {
  isSignedIn(): boolean {
    return cached !== undefined ? cached !== null : tokenStore().has();
  },

  /** The token for requests; undefined when signed out. */
  getToken(): string | undefined {
    if (cached === undefined) {
      cached = tokenStore().read() || null;
    }
    return cached ?? undefined;
  },

  /** Keeps the token and opens the app (`main`) in place of everything on the stack, the login page included. */
  signIn(token: string): void {
    v.parse(tokenSchema, token);
    tokenStore().write(token);
    cached = token;
    router.reset('main', {});
  },

  /** Forgets the token and starts over at the login page. */
  signOut(): void {
    tokenStore().clear();
    cached = null;
    router.reset('login', {});
  },
};
