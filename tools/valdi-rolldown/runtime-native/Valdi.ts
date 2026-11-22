// Native ABI entry point. The C++ runtime loads this module by its stable path
// (`valdi_core/src/Valdi`) to bootstrap Solid 2.0 Universal from cold start.
import type { DaemonClientManager } from 'valdi_core/src/debugging/DaemonClientManager';
import { daemon } from 'valdi_core/src/NativeDebuggerTransport';
import type { IRootComponentsManager } from 'valdi_core/src/IRootComponentsManager';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';

declare const runtime: ValdiRuntime;
declare const require: (path: string, disableProxy?: boolean) => any;

let manager: (IRootComponentsManager & { rootComponents: Record<string, any> }) | undefined;

export function makeRootComponentsManager(): IRootComponentsManager {
  // Delayed until C++ requests its first context so all app archives are registered.
  manager = require('solid_native/src/bridge', true).createRootComponentsManager();
  return manager!;
}

export function getLastRootComponentsManager():
  | (IRootComponentsManager & { rootComponents: Record<string, any> })
  | undefined {
  return manager;
}

export function onDaemonClientEvent(type: number, client: any, payload?: any): void {
  daemon.onEvent(type, client, payload);
}

export function getDaemonClientManager(): DaemonClientManager {
  return daemon;
}

export function performSyncWithMainThread(action: () => void): void {
  runtime.performSyncWithMainThread(action);
}

export const isModuleLoaded = (name: string): boolean => runtime.isModuleLoaded(name);
export const loadModule = (name: string, completion: (error?: string) => void): void =>
  runtime.loadModule(name, completion);
export const getModuleFileEntryAsBytes = (name: string, path: string): Uint8Array =>
  runtime.getModuleEntry(name, path, false) as Uint8Array;
export const getModuleFileEntryAsString = (name: string, path: string): string =>
  runtime.getModuleEntry(name, path, true) as string;
export const getModuleJsPaths = (name: string): string[] => runtime.getModuleJsPaths(name);
