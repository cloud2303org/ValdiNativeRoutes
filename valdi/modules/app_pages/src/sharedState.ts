import { createSignal } from 'solid-js';

export const ACCENTS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#E11D48'] as const;

const [globalCount, setGlobalCount] = createSignal(0);
const [accentIndex, setAccentIndex] = createSignal(0);

export { accentIndex, globalCount, setAccentIndex, setGlobalCount };

export const accentColor = () => ACCENTS[accentIndex() % ACCENTS.length];

export function cycleAccent(): void {
  setAccentIndex(i => (i + 1) % ACCENTS.length);
}
