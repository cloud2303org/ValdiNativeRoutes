import * as v from 'valibot';
import { router } from '../routing/index';
import { sessionStore } from '../state/session';

const tokenSchema = v.pipe(v.string('token must be a string'), v.regex(/\S/, 'token must not be empty'));

/**
 * Demo authentication policy belongs to the application, including its Zustand
 * state and route changes. This sample keeps the session only for this JS runtime.
 */
export const auth = {
  isSignedIn(): boolean {
    return sessionStore.getState().token !== undefined;
  },

  /** The token for requests; undefined when signed out. */
  getToken(): string | undefined {
    return sessionStore.getState().token;
  },

  /** Updates the demo session and replaces the login stack with the app tabs. */
  signIn(token: string): void {
    v.parse(tokenSchema, token);
    sessionStore.setState({ token });
    router.resetToTabs();
  },

  /** Clears the demo session and starts over at the login page. */
  signOut(): void {
    sessionStore.setState({ token: undefined });
    router.reset('login', {});
  },
};
