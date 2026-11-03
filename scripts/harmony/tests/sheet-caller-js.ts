// Executed INSIDE the official Valdi JS adapter by sheet-caller-native.cpp.
// index.ts, Router, NavigationHost, options, data and defineRoutes are production
// modules. Only ../routes is redirected to a small declaration by the loader.
import { installNavigation } from '../../../valdi/modules/app_pages/src/NavigationHost';
import { router, Router } from '../../../valdi/modules/app_pages/src/navigation/index';

declare const __sheetHost: Parameters<typeof installNavigation>[0];
declare function __sheetCapture(label: string, callback: () => unknown): void;
declare function __sheetMark(label: string): void;
declare function __sheetOwnerInvoke(callback: () => unknown): void;

installNavigation(__sheetHost);
const saved: Record<string, () => unknown> = {};
const settled: Record<string, unknown[]> = {};
const pageHandle = new Router({
  finish() { throw new Error('finish is outside this caller fixture'); },
  back() { throw new Error('back is outside this caller fixture'); },
} as any);

function emit(label: string, pageScoped = false): Promise<unknown> {
  __sheetMark(label);
  const handle = pageScoped ? pageHandle : router;
  const promise = handle.pushForResult('sheet' as any, { label } as any, 'sheet');
  promise.then(value => {
    (settled[label] ??= []).push(value);
    __sheetMark(`${label}:result`);
  });
  return promise;
}

(globalThis as any).sheetCaller = {
  emit,
  make(label: string, mode = 'router') {
    const callback = () => {
      if (mode === 'owner') return __sheetOwnerInvoke(() => emit(label));
      if (mode === 'async') {
        return Promise.resolve().then(() => {
          __sheetMark(`${label}:microtask`);
          return emit(label);
        });
      }
      if (mode === 'chain') {
        return emit(label).then(() => emit(`${label}:next`, true));
      }
      return emit(label, mode === 'Router');
    };
    saved[label] = callback;
    __sheetCapture(label, callback);
  },
  direct(label: string) { return saved[label](); },
  count(label: string) { return settled[label]?.length ?? 0; },
};
