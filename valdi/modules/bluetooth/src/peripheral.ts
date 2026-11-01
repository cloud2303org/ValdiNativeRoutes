import type { BlePeripheralConnectionState, BlePeripheralReadRequest, BlePeripheralSubscriptionEvent } from './BleHost';
import { throwWechatBleError } from './errors';
import { nativeBLE, type PeripheralWriteRequest } from './native';
import {
  addServiceOptions,
  advertisingOptions,
  canonicalUuid,
  listener,
  parseOptions,
  removeServiceOptions,
  writeValueOptions,
} from './schemas';
import type { BleResult, BluetoothPowerLevel } from './wechat';

export interface OpenBluetoothAdapterOptions {
  mode?: 'central' | 'peripheral';
}
export interface BLEPeripheralDescriptor {
  uuid: string;
  permission?: { read?: boolean; write?: boolean };
  value?: ArrayBuffer;
}
export interface BLEPeripheralCharacteristic {
  uuid: string;
  properties?: {
    read?: boolean;
    write?: boolean;
    writeNoResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
  permission?: {
    readable?: boolean;
    writeable?: boolean;
    readEncryptionRequired?: boolean;
    writeEncryptionRequired?: boolean;
  };
  value?: ArrayBuffer;
  descriptors?: BLEPeripheralDescriptor[];
}
export interface BLEPeripheralService {
  uuid: string;
  characteristics: BLEPeripheralCharacteristic[];
}
export interface BLEPeripheralAdvertisingOptions {
  advertiseRequest: {
    connectable?: boolean;
    deviceName?: string;
    serviceUuids?: string[];
    manufacturerData?: {
      manufacturerId: string;
      manufacturerSpecificData?: ArrayBuffer;
    }[];
    beacon?: { uuid: string; major: number; minor: number; measuredPower?: number };
  };
  powerLevel?: BluetoothPowerLevel;
}
export interface BLEPeripheralWriteOptions {
  serviceId: string;
  characteristicId: string;
  value: ArrayBuffer;
  needNotify: boolean;
  callbackId?: number;
}
export type BLEPeripheralReadRequest = Pick<BlePeripheralReadRequest, 'serviceId' | 'characteristicId' | 'callbackId'>;
export type BLEPeripheralWriteRequest = BLEPeripheralReadRequest & { value: ArrayBuffer };
export type BLEPeripheralSubscriptionEvent = Pick<BlePeripheralSubscriptionEvent, 'serviceId' | 'characteristicId'>;
export type BLEPeripheralConnectionStateChangedCallback = (event: BlePeripheralConnectionState) => void;

export interface BLEPeripheralServer {
  addService(options: { service: BLEPeripheralService }): Promise<BleResult>;
  removeService(options: { serviceId: string }): Promise<BleResult>;
  startAdvertising(options: BLEPeripheralAdvertisingOptions): Promise<BleResult>;
  stopAdvertising(): Promise<BleResult>;
  writeCharacteristicValue(options: BLEPeripheralWriteOptions): Promise<BleResult>;
  close(): Promise<BleResult>;
  onCharacteristicReadRequest(callback: (event: BLEPeripheralReadRequest) => void): void;
  offCharacteristicReadRequest(callback?: (event: BLEPeripheralReadRequest) => void): void;
  onCharacteristicWriteRequest(callback: (event: BLEPeripheralWriteRequest) => void): void;
  offCharacteristicWriteRequest(callback?: (event: BLEPeripheralWriteRequest) => void): void;
  onCharacteristicSubscribed(callback: (event: BLEPeripheralSubscriptionEvent) => void): void;
  offCharacteristicSubscribed(callback?: (event: BLEPeripheralSubscriptionEvent) => void): void;
  onCharacteristicUnsubscribed(callback: (event: BLEPeripheralSubscriptionEvent) => void): void;
  offCharacteristicUnsubscribed(callback?: (event: BLEPeripheralSubscriptionEvent) => void): void;
}

function invoke<T>(callback: ((value: T) => void) | undefined, value: T): void {
  try {
    callback?.(value);
  } catch (error) {
    console.error('[ble] listener failed', error);
  }
}

/** Adds `operation:ok`, or turns a failure into the mini-program error (`errMsg`, `errCode`). */
export async function withErrMsg<T extends object>(
  operation: string,
  execute: () => Promise<T>,
): Promise<BleResult<T>> {
  try {
    return { ...(await execute()), errMsg: `${operation}:ok` };
  } catch (original) {
    let error: Error & { errMsg?: string } = original instanceof Error ? original : new Error(String(original));
    try {
      throwWechatBleError(operation, original);
    } catch (mapped) {
      error = mapped instanceof Error ? mapped : new Error(String(mapped));
    }
    error.errMsg ??= `${operation}:fail ${error.message}`;
    throw error;
  }
}

class PendingCalls {
  private pending = new Set<(error: Error) => void>();
  track<T>(task: Promise<T>, onLate?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let cancelled = false;
      const cancel = (error: Error) => {
        cancelled = true;
        reject(error);
      };
      this.pending.add(cancel);
      task
        .then(value => {
          if (cancelled) onLate?.(value);
          else resolve(value);
        }, reject)
        .finally(() => {
          this.pending.delete(cancel);
        })
        .catch(() => {});
    });
  }
  cancel(error: Error): void {
    for (const cancel of this.pending) cancel(error);
    this.pending.clear();
  }
}

const runtimes = new Set<PeripheralRuntime>();
export function invalidatePeripheralRuntimes(error: Error): void {
  for (const runtime of [...runtimes]) runtime.invalidate(error);
}

/** Per-session JS handles; the native core owns radio serialization and ATT request identity. */
export class PeripheralRuntime {
  constructor(
    private readonly ensureOpened: () => void,
    private readonly didInvalidate: () => void,
  ) {}
  private readonly native = nativeBLE;
  private servers = new Map<string, PeripheralServer>();
  private calls = new PendingCalls();
  private epoch = 0;
  private callbacks = new Set<BLEPeripheralConnectionStateChangedCallback>();
  private subscriptions: (() => void)[] = [];
  private connectionSubscription?: number;

  activate(): void {
    runtimes.add(this);
  }

  create(): Promise<BleResult<{ server: BLEPeripheralServer }>> {
    return withErrMsg('createBLEPeripheralServer', async () => {
      this.ensureOpened();
      this.ensureServerEvents();
      const epoch = this.epoch;
      const serverId = await this.calls.track(this.native.createBLEPeripheralServer(), late => this.closeLate(late));
      if (epoch !== this.epoch) {
        this.closeLate(serverId);
        throw new Error('E_BLE_NOT_INITIALIZED:Peripheral session ended');
      }
      const server = new PeripheralServer(serverId, () => this.servers.delete(serverId));
      this.servers.set(serverId, server);
      return { server: server.api };
    });
  }
  private closeLate(serverId: string): void {
    try {
      void this.native.closeBLEPeripheralServer(serverId).catch(() => {});
    } catch {
      /* Native release may already have removed the server. */
    }
  }
  onConnection(callback: BLEPeripheralConnectionStateChangedCallback): void {
    parseOptions(listener, callback);
    this.callbacks.add(callback);
    runtimes.add(this);
    if (this.connectionSubscription === undefined) {
      const epoch = this.epoch;
      this.connectionSubscription = this.native.onPeripheralConnectionStateChange(event => {
        if (epoch !== this.epoch || !this.servers.has(event.serverId)) return;
        for (const listener of [...this.callbacks]) {
          if (epoch !== this.epoch || !this.servers.has(event.serverId)) break;
          if (this.callbacks.has(listener))
            invoke(listener, { serverId: event.serverId, deviceId: event.deviceId, connected: event.connected });
        }
      });
    }
  }
  offConnection(callback?: BLEPeripheralConnectionStateChangedCallback): void {
    if (callback) this.callbacks.delete(callback);
    else this.callbacks.clear();
    if (!this.callbacks.size && this.connectionSubscription !== undefined) {
      this.native.removePeripheralConnectionStateListener(this.connectionSubscription);
      this.connectionSubscription = undefined;
    }
  }
  private ensureServerEvents(): void {
    if (this.subscriptions.length) return;
    runtimes.add(this);
    const epoch = this.epoch;
    const read = this.native.onPeripheralReadRequest(event => {
      if (epoch === this.epoch) this.servers.get(event.serverId)?.read(event);
    });
    this.subscriptions.push(() => this.native.removePeripheralReadRequestListener(read));
    const write = this.native.onPeripheralWriteRequest(event => {
      if (epoch === this.epoch) this.servers.get(event.serverId)?.write(event);
    });
    this.subscriptions.push(() => this.native.removePeripheralWriteRequestListener(write));
    const subscribed = this.native.onPeripheralSubscribed(event => {
      if (epoch === this.epoch) this.servers.get(event.serverId)?.subscription(true, event);
    });
    this.subscriptions.push(() => this.native.removePeripheralSubscribedListener(subscribed));
    const unsubscribed = this.native.onPeripheralUnsubscribed(event => {
      if (epoch === this.epoch) this.servers.get(event.serverId)?.subscription(false, event);
    });
    this.subscriptions.push(() => this.native.removePeripheralUnsubscribedListener(unsubscribed));
  }
  invalidate(error: Error): void {
    this.epoch++;
    this.didInvalidate();
    this.calls.cancel(error);
    for (const server of this.servers.values()) server.invalidate(error);
    this.servers.clear();
    for (const remove of this.subscriptions.splice(0)) remove();
    this.offConnection();
    runtimes.delete(this);
  }
}

class PeripheralServer {
  constructor(
    private readonly id: string,
    private readonly removed: () => void,
  ) {}
  private readonly native = nativeBLE;
  private ended?: Error;
  private calls = new PendingCalls();
  private closing?: Promise<void>;
  private callbacks = {
    read: new Set<(event: BLEPeripheralReadRequest) => void>(),
    write: new Set<(event: BLEPeripheralWriteRequest) => void>(),
    subscribed: new Set<(event: BLEPeripheralSubscriptionEvent) => void>(),
    unsubscribed: new Set<(event: BLEPeripheralSubscriptionEvent) => void>(),
  };
  // One object with bound public methods, so destructuring cannot leak implementation state.
  readonly api: BLEPeripheralServer = {
    addService: options =>
      this.run('addService', () =>
        this.native.addPeripheralService(this.id, parseOptions(addServiceOptions, options).service),
      ),
    removeService: options =>
      this.run('removeService', () =>
        this.native.removePeripheralService(this.id, parseOptions(removeServiceOptions, options).serviceId),
      ),
    startAdvertising: options =>
      this.run('startAdvertising', () =>
        this.native.startPeripheralAdvertising({ serverId: this.id, ...parseOptions(advertisingOptions, options) }),
      ),
    stopAdvertising: () => this.run('stopAdvertising', () => this.native.stopPeripheralAdvertising(this.id)),
    writeCharacteristicValue: options =>
      this.run('writeCharacteristicValue', () => {
        const { serviceId, characteristicId, value, needNotify, callbackId } = parseOptions(writeValueOptions, options);
        // The native Core owns pending requests, reply deadlines and one-shot callback IDs.
        return this.native.writePeripheralCharacteristicValue({
          serverId: this.id,
          serviceId,
          characteristicId,
          value,
          needNotify,
          callbackId,
        });
      }),
    close: () =>
      withErrMsg('close', async () => {
        if (!this.closing) {
          this.check();
          this.invalidate(new Error('E_BLE_NOT_INITIALIZED:Peripheral server closed'));
          this.closing = this.calls.track(this.native.closeBLEPeripheralServer(this.id)).finally(this.removed);
        }
        await this.closing;
        return {};
      }),
    onCharacteristicReadRequest: callback => this.on(this.callbacks.read, callback),
    offCharacteristicReadRequest: callback => this.off(this.callbacks.read, callback),
    onCharacteristicWriteRequest: callback => this.on(this.callbacks.write, callback),
    offCharacteristicWriteRequest: callback => this.off(this.callbacks.write, callback),
    onCharacteristicSubscribed: callback => this.on(this.callbacks.subscribed, callback),
    offCharacteristicSubscribed: callback => this.off(this.callbacks.subscribed, callback),
    onCharacteristicUnsubscribed: callback => this.on(this.callbacks.unsubscribed, callback),
    offCharacteristicUnsubscribed: callback => this.off(this.callbacks.unsubscribed, callback),
  };
  private check(): void {
    if (this.ended) throw this.ended;
  }
  private run(operation: string, execute: () => Promise<void>): Promise<BleResult> {
    return withErrMsg(operation, async () => {
      this.check();
      await this.calls.track(execute());
      this.check();
      return {};
    });
  }
  private on<T>(callbacks: Set<(event: T) => void>, callback: (event: T) => void): void {
    this.check();
    parseOptions(listener, callback);
    callbacks.add(callback);
  }
  private off<T>(callbacks: Set<(event: T) => void>, callback?: (event: T) => void): void {
    if (callback) callbacks.delete(callback);
    else callbacks.clear();
  }
  read(event: BlePeripheralReadRequest): void {
    if (this.ended) return;
    const value = {
      serviceId: canonicalUuid(event.serviceId),
      characteristicId: canonicalUuid(event.characteristicId),
      callbackId: event.callbackId,
    };
    for (const callback of [...this.callbacks.read]) {
      if (this.ended) break;
      if (this.callbacks.read.has(callback)) invoke(callback, value);
    }
  }
  write(event: PeripheralWriteRequest): void {
    if (this.ended) return;
    const value = {
      serviceId: canonicalUuid(event.serviceId),
      characteristicId: canonicalUuid(event.characteristicId),
      callbackId: event.callbackId,
      value: event.value,
    };
    for (const callback of [...this.callbacks.write]) {
      if (this.ended) break;
      if (this.callbacks.write.has(callback)) invoke(callback, value);
    }
  }
  subscription(subscribed: boolean, event: BlePeripheralSubscriptionEvent): void {
    if (this.ended) return;
    const value = {
      serviceId: canonicalUuid(event.serviceId),
      characteristicId: canonicalUuid(event.characteristicId),
    };
    const listeners = this.callbacks[subscribed ? 'subscribed' : 'unsubscribed'];
    for (const callback of [...listeners]) {
      if (this.ended) break;
      if (listeners.has(callback)) invoke(callback, value);
    }
  }
  invalidate(error: Error): void {
    this.ended ??= error;
    this.calls.cancel(error);
    for (const callbacks of Object.values(this.callbacks)) callbacks.clear();
  }
}
