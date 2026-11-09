import type { BleHostEvents } from './BleHost';

// The one event sink handed to native on first use inside withGlobalNativeRefs, so it lives as long as the app,
// fanned out here to the listeners native.ts registers. Listener callbacks therefore never cross the bridge.

type Event<K extends keyof BleHostEvents> = Parameters<BleHostEvents[K]>[0];

const channels: { [K in keyof BleHostEvents]: Map<number, (event: Event<K>) => void> } = {
  deviceFound: new Map(),
  adapterStateChange: new Map(),
  connectStateChange: new Map(),
  characteristicUpdate: new Map(),
  mtuChange: new Map(),
  peripheralReadRequest: new Map(),
  peripheralWriteRequest: new Map(),
  peripheralSubscribed: new Map(),
  peripheralUnsubscribed: new Map(),
  peripheralConnectionStateChange: new Map(),
};
let nextId = 1;

export function listen<K extends keyof BleHostEvents>(kind: K, callback: (event: Event<K>) => void): number {
  const id = nextId++;
  channels[kind].set(id, callback);
  return id;
}

export function unlisten(kind: keyof BleHostEvents, id: number): void {
  channels[kind].delete(id);
}

function emit<K extends keyof BleHostEvents>(kind: K) {
  return (event: Event<K>) => {
    const channel = channels[kind];
    // A copy: a listener may remove itself or another one while this runs.
    for (const callback of [...channel.values()]) {
      try {
        callback(event);
      } catch (error) {
        console.error(`[ble] ${kind} listener failed`, error);
      }
    }
  };
}

export const bleEvents: BleHostEvents = {
  deviceFound: emit('deviceFound'),
  adapterStateChange: emit('adapterStateChange'),
  connectStateChange: emit('connectStateChange'),
  characteristicUpdate: emit('characteristicUpdate'),
  mtuChange: emit('mtuChange'),
  peripheralReadRequest: emit('peripheralReadRequest'),
  peripheralWriteRequest: emit('peripheralWriteRequest'),
  peripheralSubscribed: emit('peripheralSubscribed'),
  peripheralUnsubscribed: emit('peripheralUnsubscribed'),
  peripheralConnectionStateChange: emit('peripheralConnectionStateChange'),
};
