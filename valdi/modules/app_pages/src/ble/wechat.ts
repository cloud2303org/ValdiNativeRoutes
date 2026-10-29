import { serializePermissionRequest } from '../permissions/index';
import type {
  BleAdapterState as AdapterState,
  BleCharacteristic as Characteristic,
  BleConnectStateChange as ConnectStateChange,
  BleMTUChange as MTUChange,
  BleService as Service,
} from './BleHost';
import { throwWechatBleError } from './errors';
import { type CharacteristicValue, type Device, nativeBLE } from './native';
import {
  type BLEPeripheralConnectionStateChangedCallback,
  type BLEPeripheralServer,
  invalidatePeripheralRuntimes,
  type OpenBluetoothAdapterOptions,
  PeripheralRuntime,
  withErrMsg,
} from './peripheral';
import { requestBlePermissions } from './permission';
import {
  canonicalUuid,
  characteristicOptions,
  connectedDevicesOptions,
  connectOptions,
  deviceOptions,
  discoveryOptions,
  getMtuOptions,
  notifyOptions,
  openAdapterOptions,
  pairOptions,
  parseOptions,
  serviceOptions,
  setMtuOptions,
  writeOptions,
} from './schemas';

export type * from './peripheral';

export type BleResult<T extends object = object> = {
  errMsg: string;
} & T;

export type BluetoothDevice = Device;

export type BluetoothDeviceFoundCallback = (result: { devices: BluetoothDevice[] }) => void;
export type BluetoothAdapterState = Pick<AdapterState, 'available' | 'discovering'>;
export type BluetoothAdapterStateChangeCallback = (result: BluetoothAdapterState) => void;
export type BLEConnectionStateChangeCallback = (result: ConnectStateChange) => void;
export type BLECharacteristicValueChangeCallback = (result: CharacteristicValue) => void;
export type BLEMTUChangeCallback = (result: MTUChange) => void;

export type BluetoothPowerLevel = 'low' | 'medium' | 'high';
export type BleNotifyType = 'notification' | 'indication';

export interface StartBluetoothDevicesDiscoveryOptions {
  services?: string[];
  allowDuplicatesKey?: boolean;
  interval?: number;
  powerLevel?: BluetoothPowerLevel;
}

export type BleWriteType = 'write' | 'writeNoResponse';

export interface WechatBleApi {
  openBluetoothAdapter(options?: OpenBluetoothAdapterOptions): Promise<BleResult>;
  createBLEPeripheralServer(): Promise<BleResult<{ server: BLEPeripheralServer }>>;
  onBLEPeripheralConnectionStateChanged(callback: BLEPeripheralConnectionStateChangedCallback): void;
  offBLEPeripheralConnectionStateChanged(callback?: BLEPeripheralConnectionStateChangedCallback): void;
  closeBluetoothAdapter(): Promise<BleResult>;
  getBluetoothAdapterState(): Promise<BleResult<BluetoothAdapterState>>;
  startBluetoothDevicesDiscovery(options?: StartBluetoothDevicesDiscoveryOptions): Promise<BleResult>;
  stopBluetoothDevicesDiscovery(): Promise<BleResult>;
  getBluetoothDevices(): Promise<BleResult<{ devices: BluetoothDevice[] }>>;
  createBLEConnection(options: { deviceId: string; timeout?: number }): Promise<BleResult>;
  closeBLEConnection(options: { deviceId: string }): Promise<BleResult>;
  makeBluetoothPair(options: { deviceId: string; pin: string; timeout?: number }): Promise<BleResult>;
  isBluetoothDevicePaired(options: { deviceId: string }): Promise<BleResult>;
  getBLEDeviceServices(options: { deviceId: string }): Promise<BleResult<{ services: Service[] }>>;
  getBLEDeviceCharacteristics(options: {
    deviceId: string;
    serviceId: string;
  }): Promise<BleResult<{ characteristics: Characteristic[] }>>;
  getBLEDeviceRSSI(options: { deviceId: string }): Promise<BleResult<{ RSSI: number }>>;
  notifyBLECharacteristicValueChange(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    state: boolean;
    type?: BleNotifyType;
  }): Promise<BleResult>;
  writeBLECharacteristicValue(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    value: ArrayBuffer;
    writeType?: BleWriteType;
  }): Promise<BleResult>;
  readBLECharacteristicValue(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
  }): Promise<BleResult>;
  setBLEMTU(options: { deviceId: string; mtu: number }): Promise<BleResult<{ mtu: number }>>;
  getBLEMTU(options: { deviceId: string; writeType?: BleWriteType }): Promise<BleResult<{ mtu: number }>>;
  getConnectedBluetoothDevices(options: {
    services: string[];
  }): Promise<BleResult<{ devices: { deviceId: string; name: string }[] }>>;
  onBluetoothDeviceFound(callback: BluetoothDeviceFoundCallback): void;
  offBluetoothDeviceFound(callback?: BluetoothDeviceFoundCallback): void;
  onBluetoothAdapterStateChange(callback: BluetoothAdapterStateChangeCallback): void;
  offBluetoothAdapterStateChange(callback?: BluetoothAdapterStateChangeCallback): void;
  onBLEConnectionStateChange(callback: BLEConnectionStateChangeCallback): void;
  offBLEConnectionStateChange(callback?: BLEConnectionStateChangeCallback): void;
  onBLECharacteristicValueChange(callback: BLECharacteristicValueChangeCallback): void;
  offBLECharacteristicValueChange(callback?: BLECharacteristicValueChangeCallback): void;
  onBLEMTUChange(callback: BLEMTUChangeCallback): void;
  offBLEMTUChange(callback?: BLEMTUChangeCallback): void;
}

type OperationName = keyof Pick<
  WechatBleApi,
  | 'openBluetoothAdapter'
  | 'closeBluetoothAdapter'
  | 'getBluetoothAdapterState'
  | 'startBluetoothDevicesDiscovery'
  | 'stopBluetoothDevicesDiscovery'
  | 'getBluetoothDevices'
  | 'createBLEConnection'
  | 'closeBLEConnection'
  | 'makeBluetoothPair'
  | 'isBluetoothDevicePaired'
  | 'getBLEDeviceServices'
  | 'getBLEDeviceCharacteristics'
  | 'getBLEDeviceRSSI'
  | 'notifyBLECharacteristicValueChange'
  | 'writeBLECharacteristicValue'
  | 'readBLECharacteristicValue'
  | 'setBLEMTU'
  | 'getBLEMTU'
  | 'getConnectedBluetoothDevices'
>;

const normalizeDevice = (device: Device): BluetoothDevice => ({
  ...device,
  advertisServiceUUIDs: device.advertisServiceUUIDs.map(canonicalUuid),
  serviceData: Object.fromEntries(
    Object.entries(device.serviceData).map(([uuid, value]) => [canonicalUuid(uuid), value]),
  ),
});

const success = <T extends object = object>(operation: OperationName, payload?: T): BleResult<T> => ({
  errMsg: `${operation}:ok`,
  ...(payload ?? ({} as T)),
});

interface QueuedOperation {
  run: () => Promise<void>;
  reject: (error: Error) => void;
}

interface DeviceQueue {
  pending: QueuedOperation[];
  active?: QueuedOperation;
}

export class WechatBleRuntime implements WechatBleApi {
  private readonly native = nativeBLE;

  constructor() {
    this.peripheral = new PeripheralRuntime(
      () => {
        if (!this.peripheralOpened || this.closing) throw new Error('E_BLE_NOT_INITIALIZED:Open peripheral mode first');
        if (!this.adapterAvailable) throw new Error('E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable');
      },
      () => {
        this.peripheralOpened = false;
        this.peripheralEpoch++;
      },
    );
  }
  private readonly peripheral: PeripheralRuntime;
  private opened = false;
  private opening?: Promise<void>;
  private peripheralOpened = false;
  private peripheralOpening?: Promise<void>;
  private peripheralEpoch = 0;
  private openEpoch = 0;
  private closing?: Promise<void>;
  private adapterSession = 0;
  private allowDuplicates = false;
  private discoveryIntervalMs = 0;
  private discoveredDeviceIds = new Set<string>();
  private lastDeviceEmission = new Map<string, number>();
  private deviceQueues = new Map<string, DeviceQueue>();
  private disconnectedDevices = new Set<string>();
  private adapterAvailable = true;

  private deviceFoundCallbacks = new Set<BluetoothDeviceFoundCallback>();
  private adapterStateCallbacks = new Set<BluetoothAdapterStateChangeCallback>();
  private connectionCallbacks = new Set<BLEConnectionStateChangeCallback>();
  private characteristicCallbacks = new Set<BLECharacteristicValueChangeCallback>();
  private mtuCallbacks = new Set<BLEMTUChangeCallback>();

  private deviceFoundSubscription?: number;
  private adapterStateSubscription?: number;
  private connectionSubscription?: number;
  private characteristicSubscription?: number;
  private mtuSubscription?: number;

  openBluetoothAdapter(options: OpenBluetoothAdapterOptions = {}): Promise<BleResult> {
    return withErrMsg('openBluetoothAdapter', async () => {
      const { mode } = parseOptions(openAdapterOptions, options);
      if (this.closing) await this.closing;
      if (mode === 'central' && this.opened) return {};
      // Revalidate peripheral state: the native manager may retire after a timed-out advertisement.
      let opening = mode === 'peripheral' ? this.peripheralOpening : this.opening;
      if (!opening) {
        const peripheralEpoch = this.peripheralEpoch;
        const openEpoch = this.openEpoch;
        const checkActive = () => {
          if (openEpoch !== this.openEpoch) throw new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter closed');
          if (mode === 'peripheral' && peripheralEpoch !== this.peripheralEpoch)
            throw new Error('E_BLE_NOT_INITIALIZED:Peripheral session ended');
        };
        if (mode === 'peripheral') this.peripheral.activate();
        opening = (async () => {
          try {
            const granted = await requestBlePermissions(mode, checkActive);
            checkActive();
            if (!granted) throw new Error('E_BLE_PERMISSION:Bluetooth permission denied');
            this.ensureAdapterStateSubscription();
            if (mode === 'central') this.ensureConnectionSubscription();
            // On iOS the first native open itself displays the Bluetooth permission dialog.
            await serializePermissionRequest(() => this.native.openBluetoothAdapter(mode), checkActive);
            checkActive();
            this.adapterAvailable = true;
            if (mode === 'peripheral') this.peripheralOpened = true;
            else this.opened = true;
          } catch (error) {
            // A failed role initialization must not tear down the other role's
            // state or the adapter observer needed to report power recovery.
            if (mode === 'peripheral') this.peripheralOpened = false;
            else this.opened = false;
            throw error;
          }
        })().finally(() => {
          if (mode === 'peripheral') this.peripheralOpening = undefined;
          else this.opening = undefined;
        });
        if (mode === 'peripheral') this.peripheralOpening = opening;
        else this.opening = opening;
      }
      await opening;
      return {};
    });
  }

  createBLEPeripheralServer(): Promise<BleResult<{ server: BLEPeripheralServer }>> {
    return this.peripheral.create();
  }

  onBLEPeripheralConnectionStateChanged(callback: BLEPeripheralConnectionStateChangedCallback): void {
    this.peripheral.onConnection(callback);
  }

  offBLEPeripheralConnectionStateChanged(callback?: BLEPeripheralConnectionStateChangedCallback): void {
    this.peripheral.offConnection(callback);
  }

  async closeBluetoothAdapter(): Promise<BleResult> {
    const operation = 'closeBluetoothAdapter';
    try {
      if (this.closing) {
        await this.closing;
        return success(operation);
      }
      if (!this.opened && !this.opening && !this.peripheralOpened && !this.peripheralOpening) {
        throw new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter not initialized');
      }
      if (!this.closing) {
        const error = new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter closed');
        this.openEpoch++;
        this.cancelAllQueues(error);
        invalidatePeripheralRuntimes(error);
        this.closing = (async () => {
          try {
            await Promise.allSettled([this.opening, this.peripheralOpening].filter(Boolean));
            this.opened = false;
            this.peripheralOpened = false;
            await this.native.closeBluetoothAdapter();
          } finally {
            this.resetAdapterSession();
          }
        })().finally(() => {
          this.closing = undefined;
        });
      }
      await this.closing;
      return success(operation);
    } catch (error) {
      this.opened = false;
      return throwWechatBleError(operation, error);
    }
  }

  private resetAdapterSession(): void {
    this.opened = false;
    this.peripheralOpened = false;
    this.adapterSession += 1;
    this.adapterAvailable = false;
    this.allowDuplicates = false;
    this.discoveryIntervalMs = 0;
    this.discoveredDeviceIds.clear();
    this.lastDeviceEmission.clear();
    this.disconnectedDevices.clear();

    // These two subscriptions are created internally on open for queue cleanup.
    // Public on/off subscriptions remain the caller's responsibility.
    const adapterSubscription = this.adapterStateSubscription;
    const connectionSubscription = this.connectionSubscription;
    this.adapterStateSubscription = undefined;
    this.connectionSubscription = undefined;
    try {
      if (adapterSubscription !== undefined) {
        this.native.removeAdapterStateListener(adapterSubscription);
      }
    } finally {
      if (connectionSubscription !== undefined) {
        this.native.removeConnectStateListener(connectionSubscription);
      }
    }
  }

  async getBluetoothAdapterState(): Promise<BleResult<BluetoothAdapterState>> {
    return this.run('getBluetoothAdapterState', async () => {
      const { available, discovering } = await this.native.getBluetoothAdapterState();
      return { available, discovering };
    });
  }

  async startBluetoothDevicesDiscovery(options: StartBluetoothDevicesDiscoveryOptions = {}): Promise<BleResult> {
    return this.run('startBluetoothDevicesDiscovery', () => {
      const request = parseOptions(discoveryOptions, options);
      this.allowDuplicates = request.allowDuplicatesKey === true;
      this.discoveryIntervalMs = request.interval ?? 0;
      this.discoveredDeviceIds.clear();
      this.lastDeviceEmission.clear();
      return this.native.startBluetoothDevicesDiscovery(request);
    });
  }

  async stopBluetoothDevicesDiscovery(): Promise<BleResult> {
    return this.run('stopBluetoothDevicesDiscovery', () => this.native.stopBluetoothDevicesDiscovery());
  }

  async getBluetoothDevices(): Promise<BleResult<{ devices: BluetoothDevice[] }>> {
    return this.run('getBluetoothDevices', async () => {
      const devices = await this.native.getBluetoothDevices();
      return { devices: devices.map(normalizeDevice) };
    });
  }

  async createBLEConnection(options: { deviceId: string; timeout?: number }): Promise<BleResult> {
    const operation = 'createBLEConnection';
    const session = this.adapterSession;
    try {
      this.ensureOpened();
      const { deviceId, timeout } = parseOptions(connectOptions, options);
      await this.native.createBLEConnection(deviceId, timeout);
      if (session !== this.adapterSession || !this.opened || this.closing) {
        throw new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter session ended');
      }
      this.disconnectedDevices.delete(deviceId.toLowerCase());
      return success(operation);
    } catch (error) {
      return throwWechatBleError(operation, error);
    }
  }

  async closeBLEConnection(options: { deviceId: string }): Promise<BleResult> {
    return this.run('closeBLEConnection', () => {
      const { deviceId } = parseOptions(deviceOptions, options);
      this.cancelDeviceQueue(deviceId);
      return this.native.closeBLEConnection(deviceId);
    });
  }

  async makeBluetoothPair(options: { deviceId: string; pin: string; timeout?: number }): Promise<BleResult> {
    return this.run('makeBluetoothPair', () => this.native.makeBluetoothPair(parseOptions(pairOptions, options)));
  }

  async isBluetoothDevicePaired(options: { deviceId: string }): Promise<BleResult> {
    return this.run('isBluetoothDevicePaired', () =>
      this.native.isBluetoothDevicePaired(parseOptions(deviceOptions, options).deviceId),
    );
  }

  async getBLEDeviceServices(options: { deviceId: string }): Promise<BleResult<{ services: Service[] }>> {
    const operation = 'getBLEDeviceServices';
    try {
      this.ensureOpened();
      const { deviceId } = parseOptions(deviceOptions, options);
      const services = await this.enqueue(deviceId, () => this.native.getBLEDeviceServices(deviceId));
      return success(operation, {
        services: services.map(service => ({
          ...service,
          uuid: canonicalUuid(service.uuid),
        })),
      });
    } catch (error) {
      return throwWechatBleError(operation, error);
    }
  }

  async getBLEDeviceCharacteristics(options: {
    deviceId: string;
    serviceId: string;
  }): Promise<BleResult<{ characteristics: Characteristic[] }>> {
    const operation = 'getBLEDeviceCharacteristics';
    try {
      this.ensureOpened();
      const { deviceId, serviceId } = parseOptions(serviceOptions, options);
      const characteristics = await this.enqueue(deviceId, () =>
        this.native.getBLEDeviceCharacteristics(deviceId, serviceId),
      );
      return success(operation, {
        characteristics: characteristics.map(characteristic => ({
          ...characteristic,
          uuid: canonicalUuid(characteristic.uuid),
        })),
      });
    } catch (error) {
      return throwWechatBleError(operation, error);
    }
  }

  async getBLEDeviceRSSI(options: { deviceId: string }): Promise<BleResult<{ RSSI: number }>> {
    return this.run('getBLEDeviceRSSI', () => {
      const { deviceId } = parseOptions(deviceOptions, options);
      return this.enqueue(deviceId, async () => ({ RSSI: await this.native.getBLEDeviceRSSI(deviceId) }));
    });
  }

  async notifyBLECharacteristicValueChange(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    state: boolean;
    type?: BleNotifyType;
  }): Promise<BleResult> {
    return this.run('notifyBLECharacteristicValueChange', () => {
      const request = parseOptions(notifyOptions, options);
      return this.enqueue(request.deviceId, () => this.native.notifyBLECharacteristicValueChange(request));
    });
  }

  async writeBLECharacteristicValue(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    value: ArrayBuffer;
    writeType?: BleWriteType;
  }): Promise<BleResult> {
    return this.run('writeBLECharacteristicValue', () => {
      const request = parseOptions(writeOptions, options);
      return this.enqueue(request.deviceId, () => this.native.writeBLECharacteristicValue(request));
    });
  }

  async readBLECharacteristicValue(options: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
  }): Promise<BleResult> {
    return this.run('readBLECharacteristicValue', () => {
      const request = parseOptions(characteristicOptions, options);
      return this.enqueue(request.deviceId, () => this.native.readBLECharacteristicValue(request));
    });
  }

  async setBLEMTU(options: { deviceId: string; mtu: number }): Promise<BleResult<{ mtu: number }>> {
    return this.run('setBLEMTU', () => {
      const { deviceId, mtu } = parseOptions(setMtuOptions, options);
      return this.enqueue(deviceId, async () => ({
        mtu: await this.native.setBLEMTU(deviceId, mtu),
      }));
    });
  }

  async getBLEMTU(options: { deviceId: string; writeType?: BleWriteType }): Promise<BleResult<{ mtu: number }>> {
    return this.run('getBLEMTU', async () => {
      const { deviceId, writeType } = parseOptions(getMtuOptions, options);
      return { mtu: await this.native.getBLEMTU(deviceId, writeType) };
    });
  }

  async getConnectedBluetoothDevices(options: {
    services: string[];
  }): Promise<BleResult<{ devices: { deviceId: string; name: string }[] }>> {
    return this.run('getConnectedBluetoothDevices', async () => {
      const { services } = parseOptions(connectedDevicesOptions, options);
      return { devices: await this.native.getConnectedBluetoothDevices(services) };
    });
  }

  onBluetoothDeviceFound(callback: BluetoothDeviceFoundCallback): void {
    this.deviceFoundCallbacks.add(callback);
    if (this.deviceFoundSubscription === undefined) {
      this.deviceFoundSubscription = this.native.onBluetoothDeviceFound(rawDevice => {
        const device = normalizeDevice(rawDevice);
        const key = device.deviceId.toLowerCase();
        if (!this.allowDuplicates && this.discoveredDeviceIds.has(key)) return;
        if (this.allowDuplicates && this.discoveryIntervalMs > 0) {
          const now = Date.now();
          const lastEmission = this.lastDeviceEmission.get(key) ?? 0;
          if (now - lastEmission < this.discoveryIntervalMs) return;
          this.lastDeviceEmission.set(key, now);
        }
        this.discoveredDeviceIds.add(key);
        this.emit(this.deviceFoundCallbacks, { devices: [device] });
      });
    }
  }

  offBluetoothDeviceFound(callback?: BluetoothDeviceFoundCallback): void {
    this.removeCallback(this.deviceFoundCallbacks, callback);
    if (this.deviceFoundCallbacks.size === 0 && this.deviceFoundSubscription !== undefined) {
      this.native.removeBluetoothDeviceFoundListener(this.deviceFoundSubscription);
      this.deviceFoundSubscription = undefined;
    }
  }

  onBluetoothAdapterStateChange(callback: BluetoothAdapterStateChangeCallback): void {
    this.adapterStateCallbacks.add(callback);
    this.ensureAdapterStateSubscription();
  }

  private ensureAdapterStateSubscription(): void {
    if (this.adapterStateSubscription === undefined) {
      const session = this.adapterSession;
      this.adapterStateSubscription = this.native.onAdapterStateChange(event => {
        if (session !== this.adapterSession) return;
        this.adapterAvailable = event.available;
        if (!event.available || event.peripheralAvailable === false) {
          this.peripheral.invalidate(new Error('E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable'));
        }
        if (!event.available) {
          this.cancelAllQueues(new Error('E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable'));
        }
        this.emit(this.adapterStateCallbacks, { available: event.available, discovering: event.discovering });
      });
    }
  }

  offBluetoothAdapterStateChange(callback?: BluetoothAdapterStateChangeCallback): void {
    this.removeCallback(this.adapterStateCallbacks, callback);
    // Keep the internal subscription alive even without public listeners.
  }

  onBLEConnectionStateChange(callback: BLEConnectionStateChangeCallback): void {
    this.connectionCallbacks.add(callback);
    this.ensureConnectionSubscription();
  }

  private ensureConnectionSubscription(): void {
    if (this.connectionSubscription === undefined) {
      const session = this.adapterSession;
      this.connectionSubscription = this.native.onConnectStateChange(event => {
        if (session !== this.adapterSession) return;
        if (event.connected) {
          this.disconnectedDevices.delete(event.deviceId.trim().toLowerCase());
        } else {
          this.cancelDeviceQueue(event.deviceId);
        }
        this.emit(this.connectionCallbacks, event);
      });
    }
  }

  offBLEConnectionStateChange(callback?: BLEConnectionStateChangeCallback): void {
    this.removeCallback(this.connectionCallbacks, callback);
    // Public off() must not disable disconnect-driven queue cancellation.
  }

  onBLECharacteristicValueChange(callback: BLECharacteristicValueChangeCallback): void {
    this.characteristicCallbacks.add(callback);
    if (this.characteristicSubscription === undefined) {
      this.characteristicSubscription = this.native.onCharacteristicUpdate(event =>
        this.emit(this.characteristicCallbacks, {
          ...event,
          serviceId: canonicalUuid(event.serviceId),
          characteristicId: canonicalUuid(event.characteristicId),
        }),
      );
    }
  }

  offBLECharacteristicValueChange(callback?: BLECharacteristicValueChangeCallback): void {
    this.removeCallback(this.characteristicCallbacks, callback);
    if (this.characteristicCallbacks.size === 0 && this.characteristicSubscription !== undefined) {
      this.native.removeCharacteristicListener(this.characteristicSubscription);
      this.characteristicSubscription = undefined;
    }
  }

  onBLEMTUChange(callback: BLEMTUChangeCallback): void {
    this.mtuCallbacks.add(callback);
    if (this.mtuSubscription === undefined) {
      this.mtuSubscription = this.native.onMtuChange(event => this.emit(this.mtuCallbacks, event));
    }
  }

  offBLEMTUChange(callback?: BLEMTUChangeCallback): void {
    this.removeCallback(this.mtuCallbacks, callback);
    if (this.mtuCallbacks.size === 0 && this.mtuSubscription !== undefined) {
      this.native.removeMtuListener(this.mtuSubscription);
      this.mtuSubscription = undefined;
    }
  }

  private async run(operation: OperationName, execute: () => Promise<void>): Promise<BleResult>;
  private async run<T extends object>(operation: OperationName, execute: () => Promise<T>): Promise<BleResult<T>>;
  private async run<T extends object>(
    operation: OperationName,
    execute: () => Promise<T | void>,
  ): Promise<BleResult<T>> {
    try {
      if (operation === 'getBluetoothAdapterState') {
        if ((!this.opened && !this.peripheralOpened) || this.closing)
          throw new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter not initialized');
      } else this.ensureOpened();
      const payload = await execute();
      return success(operation, payload as T | undefined);
    } catch (error) {
      return throwWechatBleError(operation, error);
    }
  }

  private ensureOpened(): void {
    if (!this.opened || this.closing) {
      throw new Error('E_BLE_NOT_INITIALIZED:Bluetooth adapter not initialized');
    }
  }

  private enqueue<T>(deviceId: string, operation: () => Promise<T>): Promise<T> {
    this.ensureOpened();
    const key = deviceId.trim().toLowerCase();
    if (!this.adapterAvailable) {
      throw new Error('E_BLE_ADAPTER_NOT_AVAILABLE:Bluetooth is unavailable');
    }
    if (this.disconnectedDevices.has(key)) {
      throw new Error(`E_BLE_NOT_CONNECTED:Device ${deviceId} disconnected`);
    }
    let queue = this.deviceQueues.get(key);
    const isNewQueue = queue === undefined;
    if (!queue) {
      queue = { pending: [] };
      this.deviceQueues.set(key, queue);
    }
    const activeQueue = queue;
    const result = new Promise<T>((resolve, reject) => {
      activeQueue.pending.push({
        reject,
        run: async () => {
          try {
            resolve(await operation());
          } catch (error) {
            reject(error);
          }
        },
      });
    });
    if (isNewQueue) void this.drainQueue(key, queue);
    return result;
  }

  private async drainQueue(key: string, queue: DeviceQueue): Promise<void> {
    // Give a synchronous close/disconnect a chance to cancel before dispatch.
    await Promise.resolve();
    while (this.deviceQueues.get(key) === queue) {
      const task = queue.pending.shift();
      if (!task) {
        this.deviceQueues.delete(key);
        return;
      }
      queue.active = task;
      await task.run();
      queue.active = undefined;
    }
  }

  private cancelDeviceQueue(deviceId: string): void {
    const key = deviceId.trim().toLowerCase();
    this.disconnectedDevices.add(key);
    this.cancelQueue(key, new Error(`E_BLE_NOT_CONNECTED:Device ${deviceId} disconnected`));
  }

  private cancelAllQueues(error: Error): void {
    for (const key of this.deviceQueues.keys()) {
      this.disconnectedDevices.add(key);
      this.cancelQueue(key, error);
    }
  }

  private cancelQueue(key: string, error: Error): void {
    const queue = this.deviceQueues.get(key);
    if (!queue) return;
    this.deviceQueues.delete(key);
    // Native owns active work. Only reject tasks that were never submitted.
    for (const task of queue.pending.splice(0)) task.reject(error);
  }

  private removeCallback<T>(callbacks: Set<T>, callback?: T): void {
    if (callback) callbacks.delete(callback);
    else callbacks.clear();
  }

  private emit<T>(callbacks: Set<(event: T) => void>, event: T): void {
    for (const callback of [...callbacks]) {
      try {
        callback(event);
      } catch (error) {
        console.error('[ble] listener failed', error);
      }
    }
  }
}

const runtime = new WechatBleRuntime();

export const wechatBle: WechatBleApi = runtime;
