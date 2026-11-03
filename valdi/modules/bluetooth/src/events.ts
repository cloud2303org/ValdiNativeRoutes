import type { BleHostEvents } from './BleHost';

// The one event sink handed to native at install time (from the host's retained JS scope, so it lives as long as the
// app), fanned out here to the listeners native.ts registers. Listener callbacks therefore never cross the bridge.

type Event<K extends keyof BleHostEvents> = Parameters<BleHostEvents[K]>[0];

const channels = new Map<keyof BleHostEvents, Map<number, (event: any) => void>>();
let nextId = 1;

export function listen<K extends keyof BleHostEvents>(kind: K, callback: (event: Event<K>) => void): number {
  const id = nextId++;
  let channel = channels.get(kind);
  if (!channel) channels.set(kind, (channel = new Map()));
  channel.set(id, callback);
  return id;
}

export function unlisten(kind: keyof BleHostEvents, id: number): void {
  channels.get(kind)?.delete(id);
}

function emit(kind: keyof BleHostEvents) {
  return (event: unknown) => {
    const channel = channels.get(kind);
    if (!channel) return;
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
