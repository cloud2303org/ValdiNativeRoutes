import { createStore } from 'zustand/vanilla';

/** Demo application state. A real app owns its user model and persistence policy. */
export interface SessionState {
  token: string | undefined;
}

export const sessionStore = createStore<SessionState>()(() => ({
  token: undefined,
}));
