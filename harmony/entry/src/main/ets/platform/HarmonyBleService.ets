import { ble, access, connection, constant } from '@kit.ConnectivityKit';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import {
  BleHost, BleHostEvents, BleDevice, BleAdapterState, BleScanParams, BleService, BleCharacteristic,
  BleCharacteristicProperties, BleReadParams, BleWriteParams, BleNotifyParams, BlePairParams,
  BleConnectedDevice, BlePeripheralService, BlePeripheralAdvertisingParams, BlePeripheralWriteParams,
  BleServiceData, BlePeripheralSubscriptionEvent
} from './PlatformServiceTypes';
import {
  bleError, bleUuid, bleBytes, bleBuffer, bleMtu, bleFailureCode,
  bleAdvertisement, blePin, bleBeacon
} from './HarmonyBleHelpers';
import {
  HarmonyBleExecutionCore, HarmonyBleExecutionSession, HarmonyBleExecutionTicket
} from './HarmonyBleExecutionCore';

export interface HarmonyBlePermission {
  requestPermission(kind: string): Promise<boolean>;
}

interface BleCancellation {
  deviceId: string;
  serverId: string;
  execution?: HarmonyBleExecutionSession;
  fail(error: Error): void;
}

class BlePending<T> implements BleCancellation {
  readonly promise: Promise<T>;
  deviceId: string;
  serverId: string;
  execution?: HarmonyBleExecutionSession;
  private resolve: (value: T) => void = (_value: T): void => {};
  private reject: (error: Error) => void = (_error: Error): void => {};
  private timer: number = -1;
  private settled: boolean = false;
  private done: () => void;

  constructor(deviceId: string, serverId: string, timeout: number, code: string, done: () => void) {
    this.deviceId = deviceId;
    this.serverId = serverId;
    this.done = done;
    this.promise = new Promise<T>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.timer = setTimeout(() => this.fail(bleError(code, 'Bluetooth operation timed out')), timeout);
  }

  succeed(value: T): void {
    if (this.settled) return;
    this.finish();
    this.resolve(value);
  }

  fail(error: Error): void {
    if (this.settled) return;
    this.finish();
    this.reject(error);
  }

  private finish(): void {
    this.settled = true;
    clearTimeout(this.timer);
    this.done();
  }
}

class BleClientSession {
  readonly deviceId: string;
  readonly execution: HarmonyBleExecutionSession;
  native?: ble.GattClientDevice;
  ticket?: HarmonyBleExecutionTicket;
  connectionResult?: Promise<void>;
  readonly connectionTerminal: Promise<void>;
  private connectionFinished?: () => void;
  connected: boolean = false;
  mtu: number = 23;
  services: ble.GattService[] | undefined = undefined;
  serviceRevision: number = 0;
  connecting: BlePending<void> | undefined = undefined;
  disconnecting: BlePending<void> | undefined = undefined;
  state: (event: ble.BLEConnectionChangeState) => void = (_event: ble.BLEConnectionChangeState): void => {};
  value: (value: ble.BLECharacteristic) => void = (_value: ble.BLECharacteristic): void => {};
  mtuChanged: (mtu: number) => void = (_mtu: number): void => {};
  serviceChanged: () => void = (): void => {};

  constructor(deviceId: string, execution: HarmonyBleExecutionSession) {
    this.deviceId = deviceId;
    this.execution = execution;
    this.connectionTerminal = new Promise<void>((resolve) => { this.connectionFinished = resolve; });
  }
  get client(): ble.GattClientDevice {
    if (!this.native) throw bleError('NOT_CONNECTED', 'GATT client has not been admitted');
    return this.native;
  }
  finishConnection(): void {
    this.connectionFinished?.();
    this.connectionFinished = undefined;
  }
}

class BleScanSession {
  readonly scanner: ble.BleScanner;
  readonly epoch: number;
  readonly execution: HarmonyBleExecutionSession;
  ticket?: HarmonyBleExecutionTicket;
  finding: (report: ble.ScanReport) => void = (_report: ble.ScanReport): void => {};
  seen: Map<string, number> = new Map<string, number>();
  running: boolean = false;
  starting: BlePending<void> | undefined = undefined;

  constructor(scanner: ble.BleScanner, epoch: number, execution: HarmonyBleExecutionSession) {
    this.scanner = scanner; this.epoch = epoch; this.execution = execution;
  }
}

class BlePairSession {
  readonly pin: string;
  readonly pending: BlePending<void>;
  readonly execution: HarmonyBleExecutionSession;
  ticket?: HarmonyBleExecutionTicket;
  bondLease?: BlePairBondLease;
  constructor(pin: string, pending: BlePending<void>, execution: HarmonyBleExecutionSession) {
    this.pin = pin; this.pending = pending; this.execution = execution;
  }
}

/**
 * SDK-owned callbacks capture this relay only. Graph delivery is cleared before
 * any off() call, including partial registration, failures and SDK reentry.
 * Failed registration handles stay inert until an explicit cleanup retry.
 */
class BleRuntimeListeners {
  private radioDelivery?: (state: access.BluetoothState) => void;
  private bondDelivery?: (event: connection.BondStateParam) => void;
  private pinDelivery?: (event: connection.PinRequiredParam) => void;
  private radioRegistered: boolean = false;
  private bondRegistered: boolean = false;
  private pinRegistered: boolean = false;
  private detaching: boolean = false;
  private readonly radio: (state: access.BluetoothState) => void;
  private readonly bond: (event: connection.BondStateParam) => void;
  private readonly pin: (event: connection.PinRequiredParam) => void;

  constructor() {
    // Construct without delivery arguments: these lexical scopes never contain
    // a service, permission object, context, pair or PIN.
    this.radio = (state: access.BluetoothState): void => { this.radioDelivery?.(state); };
    this.bond = (event: connection.BondStateParam): void => { this.bondDelivery?.(event); };
    this.pin = (event: connection.PinRequiredParam): void => { this.pinDelivery?.(event); };
  }

  attach(radio: (state: access.BluetoothState) => void,
    bond: (event: connection.BondStateParam) => void,
    pin: (event: connection.PinRequiredParam) => void): void {
    this.radioDelivery = radio;
    this.bondDelivery = bond;
    this.pinDelivery = pin;
  }

  register(): void {
    // Set each flag first, so a partially throwing SDK on() still receives the
    // exact registered callback during cleanup.
    this.radioRegistered = true;
    access.on('stateChange', this.radio);
    this.bondRegistered = true;
    connection.on('bondStateChange', this.bond);
    this.pinRegistered = true;
    connection.on('pinRequired', this.pin);
  }

  retireDelivery(): void {
    this.radioDelivery = undefined;
    this.bondDelivery = undefined;
    this.pinDelivery = undefined;
  }

  detach(): boolean {
    this.retireDelivery();
    if (this.detaching) return false;
    this.detaching = true;
    try {
      if (this.radioRegistered) {
        try { access.off('stateChange', this.radio); this.radioRegistered = false; } catch (_error) {}
      }
      if (this.bondRegistered) {
        try { connection.off('bondStateChange', this.bond); this.bondRegistered = false; } catch (_error) {}
      }
      if (this.pinRegistered) {
        try { connection.off('pinRequired', this.pin); this.pinRegistered = false; } catch (_error) {}
      }
    } finally { this.detaching = false; }
    return !this.radioRegistered && !this.bondRegistered && !this.pinRegistered;
  }
}

/**
 * Graph-created native bond observer, not a runtime/event owner. After caller
 * retirement it retains only a device ID, execution ticket/core, and terminal
 * SDK callbacks. It never stores the PIN, context, service or host event sink.
 */
class BlePairBondLease {
  readonly terminal: Promise<void>;
  private readonly core: HarmonyBleExecutionCore;
  private readonly ticket: HarmonyBleExecutionTicket;
  private readonly deviceId: string;
  private pending?: BlePending<void>;
  private resolveTerminal?: () => void;
  private started: boolean = false;
  private finished: boolean = false;
  private bondRegistered: boolean = false;
  private radioRegistered: boolean = false;
  private readonly bond: (event: connection.BondStateParam) => void;
  private readonly radio: (state: access.BluetoothState) => void;

  constructor(core: HarmonyBleExecutionCore, ticket: HarmonyBleExecutionTicket,
    deviceId: string, pending: BlePending<void>) {
    this.core = core;
    this.ticket = ticket;
    this.deviceId = deviceId;
    this.pending = pending;
    this.terminal = new Promise<void>((resolve) => { this.resolveTerminal = resolve; });
    this.bond = (event: connection.BondStateParam): void => {
      if (this.finished || !this.started || event.deviceId !== this.deviceId) return;
      if (event.state === connection.BondState.BOND_STATE_BONDED) {
        if (this.pending && this.core.isCurrent(this.ticket)) this.pending.succeed(undefined);
        this.finish();
      } else if (event.state === connection.BondState.BOND_STATE_INVALID) {
        if (this.pending && this.core.isCurrent(this.ticket)) {
          this.pending.fail(bleError('PAIR_FAILED', event.causeMessage ?? 'Bluetooth pairing failed'));
        }
        this.finish();
      }
    };
    this.radio = (state: access.BluetoothState): void => {
      if (this.finished || state !== access.BluetoothState.STATE_OFF) return;
      const deliver = this.core.isCurrent(this.ticket);
      const error = bleError('ADAPTER_NOT_AVAILABLE', 'Bluetooth is off');
      this.core.powerOff(error);
      if (deliver) this.pending?.fail(error);
      this.finish();
    };
  }

  register(): void {
    try {
      // Registration flags precede the call: even a partial throwing on() gets
      // the exact same callback passed to best-effort off().
      this.bondRegistered = true;
      connection.on('bondStateChange', this.bond);
      this.radioRegistered = true;
      access.on('stateChange', this.radio);
    } catch (error) { this.finish(); throw error as Error; }
  }

  arm(): void { this.started = true; }

  acceptsDelivery(): boolean {
    return this.started && !this.finished && this.pending !== undefined && this.core.isCurrent(this.ticket);
  }

  retireDelivery(): void { this.pending = undefined; }

  abortUnstarted(): void {
    if (!this.started) this.finish();
  }

  rejectedSynchronously(): void {
    // The NAPI binding validates arguments/creates async work before StartPair
    // runs. A synchronous call failure has not dispatched that async request.
    this.started = false;
    this.finish();
  }

  observeInitiation(native: Promise<void>): void {
    // Captures this terminal-only lease, never a graph/service closure.
    native.then(() => {
      if (this.finished) return;
      try {
        // BONDED is positive terminal evidence. INVALID immediately after a
        // successful StartPair can still precede the asynchronous BONDING event.
        if (connection.getPairState(this.deviceId) === connection.BondState.BOND_STATE_BONDED) {
          if (this.pending && this.core.isCurrent(this.ticket)) this.pending.succeed(undefined);
          this.finish();
        }
      } catch (error) { this.failCaller(error as BusinessError); }
    }, (error: BusinessError) => {
      // A rejected initiation fails its caller; it is not evidence that an
      // asynchronous bond procedure has terminated. Keep the terminal observer.
      this.failCaller(error);
    });
  }

  observePin(native: Promise<void>): void {
    // The SDK Promise may never settle, even after bond/OFF. Its rejection
    // callback retains only this lease; retirement clears the pending delivery.
    native.catch((error: BusinessError) => this.failCaller(error));
  }

  private failCaller(error: BusinessError): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending && this.core.isCurrent(this.ticket)) {
      pending.fail(bleError(bleFailureCode(error.code, 'PAIR_FAILED'), error.message ?? 'Pair initiation failed'));
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.pending = undefined;
    this.resolveTerminal?.();
    this.resolveTerminal = undefined;
    if (this.bondRegistered) {
      try { connection.off('bondStateChange', this.bond); this.bondRegistered = false; } catch (_error) {}
    }
    if (this.radioRegistered) {
      try { access.off('stateChange', this.radio); this.radioRegistered = false; } catch (_error) {}
    }
    // Actual terminal bond state, confirmed OFF, or a pre-dispatch failure is
    // sufficient proof even if the initiation Promise's JS settlement is late.
    this.core.cleaned(this.ticket.session);
  }
}

class BleServerRequest {
  readonly id: number;
  readonly transId: number;
  readonly deviceId: string;
  readonly serviceId: string;
  readonly characteristicId: string;
  readonly offset: number;
  readonly incoming: Uint8Array | undefined;
  readonly needResponse: boolean;
  timer: number = -1;
  constructor(id: number, transId: number, deviceId: string, serviceId: string, characteristicId: string,
    offset: number, incoming: Uint8Array | undefined, needResponse: boolean) {
    this.id = id;
    this.transId = transId;
    this.deviceId = deviceId;
    this.serviceId = serviceId;
    this.characteristicId = characteristicId;
    this.offset = offset;
    this.incoming = incoming;
    this.needResponse = needResponse;
  }
}

class BleServerSession {
  readonly id: string;
  readonly server: ble.GattServer;
  readonly execution: HarmonyBleExecutionSession;
  advertisingExecution?: HarmonyBleExecutionSession;
  services: Map<string, ble.GattService> = new Map<string, ble.GattService>();
  devices: Set<string> = new Set<string>();
  deviceExecutions: Map<string, HarmonyBleExecutionSession> = new Map<string, HarmonyBleExecutionSession>();
  // Composite service/characteristic key -> (opaque device ID -> CCCD flags).
  subscriptions: Map<string, Map<string, number>> = new Map<string, Map<string, number>>();
  requests: Map<number, BleServerRequest> = new Map<number, BleServerRequest>();
  advertisement: number | undefined = undefined;
  advertising: boolean = false;
  advertisingEpoch: number = 0;
  closed: boolean = false;
  read: (event: ble.CharacteristicReadRequest) => void = (_event: ble.CharacteristicReadRequest): void => {};
  write: (event: ble.CharacteristicWriteRequest) => void = (_event: ble.CharacteristicWriteRequest): void => {};
  descriptorRead: (event: ble.DescriptorReadRequest) => void = (_event: ble.DescriptorReadRequest): void => {};
  descriptorWrite: (event: ble.DescriptorWriteRequest) => void = (_event: ble.DescriptorWriteRequest): void => {};
  state: (event: ble.BLEConnectionChangeState) => void = (_event: ble.BLEConnectionChangeState): void => {};

  constructor(id: string, server: ble.GattServer, execution: HarmonyBleExecutionSession) {
    this.id = id; this.server = server; this.execution = execution;
  }
}

/**
 * One host owns one instance. The context is explicit at the composition boundary;
 * authorization uses the same injected permission owner as Wi-Fi/NFC.
 * Constructing this object never calls the SDK or opens/enables a radio.
 */
export class HarmonyBleService implements BleHost {
  readonly ble: BleHost = this;
  private readonly permission: HarmonyBlePermission;
  private readonly execution: HarmonyBleExecutionCore;
  private readonly executionOwner: number;
  private adapterExecution: HarmonyBleExecutionSession;
  private closingClients: Map<string, BleClientSession> = new Map<string, BleClientSession>();
  private events: BleHostEvents | undefined = undefined;
  private active: boolean = true;
  private disposed: boolean = false;
  private opened: boolean = false;
  private epoch: number = 0;
  private activityEpoch: number = 0;
  private scanEpoch: number = 0;
  private scan: BleScanSession | undefined = undefined;
  private devices: Map<string, BleDevice> = new Map<string, BleDevice>();
  private clients: Map<string, BleClientSession> = new Map<string, BleClientSession>();
  private pairs: Map<string, BlePairSession> = new Map<string, BlePairSession>();
  private pending: Set<BleCancellation> = new Set<BleCancellation>();
  private servers: Map<string, BleServerSession> = new Map<string, BleServerSession>();
  private nextServer: number = 0;
  private nextRequest: number = 0;
  private listeners?: BleRuntimeListeners;
  private retiredListeners: BleRuntimeListeners[] = [];
  private cleaningListeners: boolean = false;
  private radioChanged: (state: access.BluetoothState) => void;
  private bondChanged: (event: connection.BondStateParam) => void;
  private pinRequired: (event: connection.PinRequiredParam) => void;

  constructor(context: common.UIAbilityContext, permission: HarmonyBlePermission) {
    this.permission = permission;
    this.execution = HarmonyBleExecutionCore.forContext(context);
    this.executionOwner = this.execution.openOwner();
    this.adapterExecution = this.execution.session(this.executionOwner);
    this.radioChanged = (state: access.BluetoothState): void => {
      if (!this.opened || this.disposed) return;
      if (state !== access.BluetoothState.STATE_ON && state !== access.BluetoothState.STATE_BLE_ON) {
        this.epoch++;
        const error = bleError('ADAPTER_NOT_AVAILABLE', 'Bluetooth is off');
        this.execution.unavailable(error);
        if (state === access.BluetoothState.STATE_OFF) this.execution.powerOff(error);
        this.retirePairDeliveries();
        this.stopScanOwned();
        this.failPending(error);
        this.clients.forEach((session) => this.disposeClient(session, true));
        this.servers.forEach((server) => this.disposeServer(server));
        this.pairs.clear();
      }
      this.emitAdapter();
    };
    this.bondChanged = (event: connection.BondStateParam): void => {
      const pair = this.pairs.get(event.deviceId);
      if (!pair?.ticket || !this.execution.isCurrent(pair.ticket) || !pair.bondLease?.acceptsDelivery()) return;
      if (event.state === connection.BondState.BOND_STATE_BONDED) pair.pending.succeed(undefined);
      else if (event.state === connection.BondState.BOND_STATE_INVALID) {
        pair.pending.fail(bleError('PAIR_FAILED', event.causeMessage ?? 'Bluetooth pairing failed'));
      }
    };
    this.pinRequired = (event: connection.PinRequiredParam): void => {
      if (!this.active || !this.opened || this.disposed) return;
      const pair = this.pairs.get(event.deviceId);
      // A locally queued pair is not the current hardware pairing owner.
      if (!pair?.ticket || !this.execution.isCurrent(pair.ticket) || !pair.bondLease?.acceptsDelivery()) return;
      try {
        const native = connection.setDevicePinCode(event.deviceId, pair.pin);
        if (pair.ticket) this.execution.track(pair.ticket, native);
        pair.bondLease.observePin(native);
      } catch (error) { pair.pending.fail(this.failure(error as BusinessError, 'PAIR_FAILED')); }
    };
  }

  setEvents(events: BleHostEvents): void { if (!this.disposed) this.events = events; }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    this.activityEpoch++;
    if (!active) {
      this.stopScanOwned();
      this.pairs.forEach((pair) => {
        const error = bleError('OPERATE_FAILED', 'Host entered background');
        pair.bondLease?.retireDelivery();
        this.execution.cancel(pair.execution, error);
        pair.pending.fail(error);
      });
      this.pairs.clear();
    }
    // Existing GATT connections and servers remain owned and connected. Background
    // policy stops discovery; it does not fabricate disconnect events.
  }

  close(): void {
    if (this.disposed) { this.unlisten(); return; }
    this.disposed = true;
    this.shutdown();
    this.execution.closeOwner(this.executionOwner, bleError('NOT_INITIALIZED', 'BLE owner closed'));
    this.events = undefined;
  }

  async openBluetoothAdapter(mode: string | undefined): Promise<void> {
    this.ensureLive();
    if (mode !== undefined && mode !== 'central' && mode !== 'peripheral') {
      throw bleError('INVALID_DATA', 'Unknown adapter mode');
    }
    this.ensureForeground();
    const epoch = this.epoch;
    const activity = this.activityEpoch;
    const granted = await this.wait(this.sdk(() => this.permission.requestPermission('bluetooth'), 'PERMISSION'), 'PERMISSION');
    this.ensureLive();
    if (epoch !== this.epoch || activity !== this.activityEpoch) throw bleError('NOT_INITIALIZED', 'Open was cancelled');
    if (!granted) throw bleError('PERMISSION', 'ohos.permission.ACCESS_BLUETOOTH denied');
    if (!this.sdk(() => access.isBluetoothSupported(), 'SYSTEM_NOT_SUPPORTED')) throw bleError('SYSTEM_NOT_SUPPORTED', 'Bluetooth is unsupported');
    if (!this.radioAvailable()) throw bleError('ADAPTER_NOT_AVAILABLE', 'Enable Bluetooth in system settings');
    try {
      this.listen();
      if (!this.adapterExecution.valid) this.adapterExecution = this.execution.session(this.executionOwner);
      this.opened = true;
      this.emitAdapter();
    } catch (error) {
      this.unlisten();
      throw this.failure(error as BusinessError, 'OPERATE_FAILED');
    }
  }

  async closeBluetoothAdapter(): Promise<void> { this.ensureLive(); this.shutdown(); }

  async getBluetoothAdapterState(): Promise<BleAdapterState> {
    this.ensureLive();
    return this.adapterState();
  }

  async startBluetoothDevicesDiscovery(params: BleScanParams): Promise<void> {
    const filters: ble.ScanFilter[] = [];
    if (params.services) params.services.forEach((uuid) => filters.push({ serviceUuid: bleUuid(uuid) }));
    await this.startScan(filters, params);
  }

  async startBluetoothDevicesDiscoveryWithNames(names: string[]): Promise<void> {
    if (names.length === 0) throw bleError('INVALID_DATA', 'Name filters must not be empty');
    const filters: ble.ScanFilter[] = [];
    names.forEach((name) => filters.push({ name: name }));
    await this.startScan(filters, {});
  }

  async startBluetoothDevicesDiscoveryWithAddresses(addresses: string[]): Promise<void> {
    if (addresses.length === 0) throw bleError('INVALID_DATA', 'Device filters must not be empty');
    const filters: ble.ScanFilter[] = [];
    // deviceId is an opaque platform identifier. Do not validate it as a MAC or
    // use BluetoothAddress (real addresses require additional privileges).
    addresses.forEach((deviceId) => { this.validateDevice(deviceId); filters.push({ deviceId: deviceId }); });
    await this.startScan(filters, {});
  }

  async stopBluetoothDevicesDiscovery(): Promise<void> {
    this.ready();
    const scan = this.scan;
    this.scan = undefined;
    this.scanEpoch++;
    if (!scan) return;
    this.execution.cancel(scan.execution, bleError('OPERATE_FAILED', 'Scan stopped'));
    scan.starting?.fail(bleError('OPERATE_FAILED', 'Scan start was cancelled'));
    try { scan.scanner.off('BLEDeviceFind', scan.finding); } catch (_error) {}
    try { await this.wait(this.sdk(() => scan.scanner.stopScan(), 'OPERATE_FAILED'), 'OPERATE_FAILED'); }
    finally { this.emitAdapter(); }
  }

  async getBluetoothDevices(): Promise<BleDevice[]> {
    this.ready();
    return Array.from(this.devices.values()).map((device) => this.copyDevice(device));
  }

  async createBLEConnection(deviceId: string, timeout: number | undefined): Promise<void> {
    this.ready();
    this.validateDevice(deviceId);
    const existing = this.clients.get(deviceId);
    if (existing) {
      if (existing.connecting && existing.connectionResult) return existing.connectionResult;
      throw bleError(existing.connected ? 'ALREADY_CONNECTED' : 'CONNECTION_FAILED', 'Device already has an owned GATT client');
    }
    const duration = this.timeout(timeout, 20000);
    const session = new BleClientSession(deviceId, this.execution.session(this.executionOwner));
    this.clients.set(deviceId, session);
    const pending = this.task<void>(deviceId, duration, 'CONNECTION_TIMEOUT', '', session.execution);
    // A connect can expire/cancel before it acquires the device lease.
    pending.promise.catch((error: Error) => {
      if (!session.connected) {
        this.execution.cancel(session.execution, error);
        this.disposeClient(session, false);
      }
    });
    session.connecting = pending;
    session.connectionResult = this.runClient(session, () => this.connectClient(session, pending));
    return session.connectionResult;
  }

  private async connectClient(session: BleClientSession, pending: BlePending<void>): Promise<void> {
    const deviceId = session.deviceId;
    let client: ble.GattClientDevice;
    try { client = this.sdk(() => ble.createGattClientDevice(deviceId), 'CONNECTION_FAILED'); }
    catch (error) { pending.fail(error as Error); throw error as Error; }
    session.native = client;
    session.state = (event: ble.BLEConnectionChangeState): void => {
      if (event.state === constant.ProfileConnectionState.STATE_CONNECTED ||
        event.state === constant.ProfileConnectionState.STATE_DISCONNECTED) session.finishConnection();
      if (!this.ownsClient(session)) return;
      if (event.state === constant.ProfileConnectionState.STATE_CONNECTED) {
        if (!session.execution.valid) return;
        if (session.connected) return;
        session.connected = true;
        session.connecting = undefined;
        pending.succeed(undefined);
        this.events?.connectStateChange({ deviceId: deviceId, connected: true });
      } else if (event.state === constant.ProfileConnectionState.STATE_DISCONNECTED) {
        const error = bleError('NOT_CONNECTED', event.reasonMessage ?? 'GATT disconnected');
        this.execution.cancel(session.execution, error);
        this.failSession(session.execution, error);
        session.disconnecting?.succeed(undefined);
        this.disposeClient(session, true);
      }
    };
    session.value = (value: ble.BLECharacteristic): void => {
      if (this.ownsConnected(session)) this.emitValue(session, value);
    };
    session.mtuChanged = (mtu: number): void => {
      if (!this.ownsConnected(session)) return;
      this.updateMtu(session, mtu);
    };
    session.serviceChanged = (): void => {
      if (!this.ownsClient(session)) return;
      session.services = undefined;
      session.serviceRevision++;
    };
    try {
      // All listeners precede connect(), which returns void.
      client.on('BLEConnectionStateChange', session.state);
      client.on('BLECharacteristicChange', session.value);
      client.on('BLEMtuChange', session.mtuChanged);
      client.on('serviceChange', session.serviceChanged);
      if (session.ticket) this.execution.track(session.ticket, session.connectionTerminal);
      client.connect();
    } catch (error) {
      session.finishConnection();
      pending.fail(this.failure(error as BusinessError, 'CONNECTION_FAILED'));
    }
    try { await pending.promise; }
    catch (error) { this.disposeClient(session, false); throw error as Error; }
  }

  async closeBLEConnection(deviceId: string): Promise<void> {
    this.ensureLive();
    if (!this.opened) throw bleError('NOT_INITIALIZED', 'Call openBluetoothAdapter first');
    const current = this.clients.get(deviceId);
    const closing = this.closingClients.get(deviceId);
    if (closing?.disconnecting && (!current || current === closing)) return closing.disconnecting.promise;
    const session = current;
    if (!session) throw bleError('NOT_CONNECTED', 'No owned GATT client');
    if (session.disconnecting) return session.disconnecting.promise;
    const error = bleError('NOT_CONNECTED', 'GATT client closing');
    this.execution.cancel(session.execution, error);
    this.failSession(session.execution, error);
    const pending = this.task<void>(deviceId, 10000, 'CONNECTION_TIMEOUT');
    session.disconnecting = pending;
    this.closingClients.set(deviceId, session);
    try {
      if (session.native) session.client.disconnect();
      if (!session.connected) {
        this.disposeClient(session, false);
        pending.succeed(undefined);
      }
    }
    catch (error) { pending.fail(this.failure(error as BusinessError, 'OPERATE_FAILED')); }
    try {
      await pending.promise;
    } finally {
      // The disconnected callback can synchronously install a replacement for
      // this device ID before this continuation runs. Only clean up our session.
      if (this.clients.get(deviceId) === session) {
        this.failSession(session.execution, bleError('NOT_CONNECTED', 'GATT client closed'));
        this.disposeClient(session, true);
      }
      if (this.closingClients.get(deviceId) === session) this.closingClients.delete(deviceId);
    }
  }

  async makeBluetoothPair(params: BlePairParams): Promise<void> {
    this.ready();
    this.ensureForeground();
    this.validateDevice(params.deviceId);
    const existing = this.pairs.get(params.deviceId);
    if (existing) return existing.pending.promise;
    const pin = blePin(params.pin);
    const deviceId = params.deviceId;
    const execution = this.execution.session(this.executionOwner);
    const pending = this.task<void>(deviceId, this.timeout(params.timeout, 20000), 'PAIR_TIMEOUT', '', execution);
    const pair = new BlePairSession(pin, pending, execution);
    this.pairs.set(params.deviceId, pair);
    pending.promise.catch((error: Error) => {
      pair.bondLease?.retireDelivery();
      this.execution.cancel(execution, error);
    });
    try {
      await this.runExecution(execution, `device:${deviceId}`, async (ticket): Promise<void> => {
        pair.ticket = ticket;
        this.ensureForeground();
        const state = this.sdk(() => connection.getPairState(deviceId), 'PAIR_FAILED');
        if (state === connection.BondState.BOND_STATE_BONDED) {
          pending.succeed(undefined);
          return;
        }
        const lease = new BlePairBondLease(this.execution, ticket, deviceId, pending);
        pair.bondLease = lease;
        lease.register();
        this.execution.track(ticket, lease.terminal);
        ticket.validate();
        lease.arm();
        if (state === connection.BondState.BOND_STATE_BONDING) {
          lease.retireDelivery();
          pending.fail(bleError('PAIR_FAILED', 'Device is already bonding; waiting for its native terminal state'));
          await pending.promise;
          return;
        }
        try {
          let native: Promise<void>;
          try { native = connection.pairDevice(deviceId); }
          catch (error) { lease.rejectedSynchronously(); throw error as Error; }
          this.execution.track(ticket, native);
          lease.observeInitiation(native);
        } catch (error) { pending.fail(this.failure(error as BusinessError, 'PAIR_FAILED')); }
        await pending.promise;
      });
    } catch (error) {
      pending.fail(this.failure(error as BusinessError, 'PAIR_FAILED'));
      throw error as Error;
    } finally {
      pair.bondLease?.retireDelivery();
      pair.bondLease?.abortUnstarted();
      if (this.pairs.get(deviceId) === pair) this.pairs.delete(deviceId);
      this.execution.cancel(execution, bleError('PAIR_FAILED', 'Pairing session ended'));
    }
  }

  async isBluetoothDevicePaired(deviceId: string): Promise<void> {
    this.ready();
    this.validateDevice(deviceId);
    const execution = this.execution.session(this.executionOwner);
    try {
      await this.runExecution(execution, `device:${deviceId}`, async (): Promise<void> => {
        if (this.sdk(() => connection.getPairState(deviceId), 'PAIR_FAILED') !== connection.BondState.BOND_STATE_BONDED) {
          throw bleError('NOT_PAIRED', 'Device is not bonded');
        }
      });
    } finally { this.execution.cancel(execution, bleError('NOT_INITIALIZED', 'Pair-state query ended')); }
  }

  async getBLEDeviceServices(deviceId: string): Promise<BleService[]> {
    const session = this.requireClient(deviceId);
    return this.runClient(session, async (): Promise<BleService[]> => {
      const services = await this.services(session);
      return services.map((service): BleService => ({ uuid: bleUuid(service.serviceUuid), isPrimary: service.isPrimary }));
    });
  }

  async getBLEDeviceRSSI(deviceId: string): Promise<number> {
    const session = this.requireClient(deviceId);
    return this.runClient(session, async (): Promise<number> =>
      this.clientWait(session, this.sdk(() => session.client.getRssiValue(), 'RSSI_FAILED'), 'RSSI_FAILED'));
  }

  async getBLEDeviceCharacteristics(deviceId: string, serviceId: string): Promise<BleCharacteristic[]> {
    const session = this.requireClient(deviceId);
    return this.runClient(session, async (): Promise<BleCharacteristic[]> => {
      const service = await this.service(session, serviceId);
      return service.characteristics.map((characteristic): BleCharacteristic => ({
        uuid: bleUuid(characteristic.characteristicUuid), properties: this.properties(characteristic.properties)
      }));
    });
  }

  async notifyBLECharacteristicValueChange(params: BleNotifyParams): Promise<void> {
    const admitted: BleNotifyParams = { deviceId: params.deviceId, serviceId: params.serviceId,
      characteristicId: params.characteristicId, state: params.state, type: params.type };
    const session = this.requireClient(admitted.deviceId);
    return this.runClient(session, () => this.notifyCharacteristic(session, admitted));
  }

  private async notifyCharacteristic(session: BleClientSession, params: BleNotifyParams): Promise<void> {
    const characteristic = await this.characteristic(session, params.serviceId, params.characteristicId);
    const properties = this.properties(characteristic.properties);
    const kind = params.type ?? (properties.notify ? 'notification' : 'indication');
    if (kind !== 'notification' && kind !== 'indication') throw bleError('INVALID_DATA', 'Unknown notification type');
    if (kind === 'notification' ? !properties.notify : !properties.indicate) {
      throw bleError('PROPERTY_NOT_SUPPORTED', 'Requested notification type is unavailable');
    }
    if (kind === 'indication') {
      await this.clientWait(session, this.sdk(() =>
        session.client.setCharacteristicChangeIndication(characteristic, params.state), 'NOTIFY_FAILED'), 'NOTIFY_FAILED');
    } else {
      await this.clientWait(session, this.sdk(() =>
        session.client.setCharacteristicChangeNotification(characteristic, params.state), 'NOTIFY_FAILED'), 'NOTIFY_FAILED');
    }
  }

  async writeBLECharacteristicValue(params: BleWriteParams): Promise<void> {
    const admitted: BleWriteParams = { deviceId: params.deviceId, serviceId: params.serviceId,
      characteristicId: params.characteristicId, value: new Uint8Array(params.value), writeType: params.writeType };
    const session = this.requireClient(admitted.deviceId);
    return this.runClient(session, () => this.writeCharacteristic(session, admitted));
  }

  private async writeCharacteristic(session: BleClientSession, params: BleWriteParams): Promise<void> {
    const characteristic = await this.characteristic(session, params.serviceId, params.characteristicId);
    const properties = this.properties(characteristic.properties);
    const kind = params.writeType ?? (properties.writeDefault ? 'write' : 'writeNoResponse');
    if (kind !== 'write' && kind !== 'writeNoResponse') throw bleError('INVALID_DATA', 'Unknown write type');
    if (kind === 'write' ? !properties.writeDefault : !properties.writeNoResponse) {
      throw bleError('PROPERTY_NOT_SUPPORTED', 'Requested write type is unavailable');
    }
    if (params.value.length > session.mtu - 3 || params.value.length > 512) {
      throw bleError('WRITE_FAILED', 'Value exceeds negotiated ATT write payload');
    }
    const request: ble.BLECharacteristic = {
      serviceUuid: characteristic.serviceUuid, characteristicUuid: characteristic.characteristicUuid,
      characteristicValue: bleBuffer(params.value), descriptors: characteristic.descriptors,
      properties: characteristic.properties, permissions: characteristic.permissions,
      characteristicValueHandle: characteristic.characteristicValueHandle
    };
    await this.clientWait(session, this.sdk(() => session.client.writeCharacteristicValue(request,
      kind === 'write' ? ble.GattWriteType.WRITE : ble.GattWriteType.WRITE_NO_RESPONSE), 'WRITE_FAILED'), 'WRITE_FAILED');
  }

  async readBLECharacteristicValue(params: BleReadParams): Promise<void> {
    const admitted: BleReadParams = { deviceId: params.deviceId, serviceId: params.serviceId,
      characteristicId: params.characteristicId };
    const session = this.requireClient(admitted.deviceId);
    return this.runClient(session, () => this.readCharacteristic(session, admitted));
  }

  private async readCharacteristic(session: BleClientSession, params: BleReadParams): Promise<void> {
    const characteristic = await this.characteristic(session, params.serviceId, params.characteristicId);
    if (!characteristic.properties?.read) throw bleError('PROPERTY_NOT_SUPPORTED', 'Characteristic is not readable');
    const result = await this.clientWait(session,
      this.sdk(() => session.client.readCharacteristicValue(characteristic), 'READ_FAILED'), 'READ_FAILED');
    this.emitValue(session, result);
  }

  async setBLEMTU(deviceId: string, mtu: number): Promise<number> {
    const session = this.requireClient(deviceId);
    const requested = bleMtu(mtu);
    return this.runClient(session, async (): Promise<number> => {
      const actual = await this.clientWait(session, this.sdk(() => session.client.setBLEMtu(requested), 'MTU_FAILED'), 'MTU_FAILED');
      this.updateMtu(session, actual);
      return session.mtu;
    });
  }

  async getBLEMTU(deviceId: string, writeType: string | undefined): Promise<number> {
    if (writeType !== undefined && writeType !== 'write' && writeType !== 'writeNoResponse') {
      throw bleError('INVALID_DATA', 'Unknown write type');
    }
    const session = this.requireClient(deviceId);
    return this.runClient(session, async (): Promise<number> => session.mtu);
  }

  async getConnectedBluetoothDevices(services: string[]): Promise<BleConnectedDevice[]> {
    this.ready();
    const wanted = services.map((uuid) => bleUuid(uuid));
    const sessions = Array.from(this.clients.values()).filter((session) => session.connected);
    const result: BleConnectedDevice[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      await this.runClient(session, async (): Promise<void> => {
        const found = await this.services(session);
        if (wanted.length > 0 && !found.some((service) => wanted.indexOf(bleUuid(service.serviceUuid)) >= 0)) return;
        const name = await this.clientWait(session, this.sdk(() => session.client.getDeviceName(), 'OPERATE_FAILED'), 'OPERATE_FAILED');
        result.push({ deviceId: session.deviceId, name: name });
      });
    }
    return result;
  }

  async createBLEPeripheralServer(): Promise<string> {
    this.ready();
    return this.runExecution(this.adapterExecution, '@adapter', async (): Promise<string> => this.createPeripheralServer());
  }

  private async createPeripheralServer(): Promise<string> {
    const server = new BleServerSession(`harmony-ble-${++this.nextServer}`, this.sdk(() => ble.createGattServer(), 'OPERATE_FAILED'),
      this.execution.session(this.executionOwner));
    this.servers.set(server.id, server);
    server.read = (event: ble.CharacteristicReadRequest): void => this.serverRead(server, event);
    server.write = (event: ble.CharacteristicWriteRequest): void => this.serverWrite(server, event);
    server.descriptorRead = (event: ble.DescriptorReadRequest): void => this.serverDescriptorRead(server, event);
    server.descriptorWrite = (event: ble.DescriptorWriteRequest): void => this.serverDescriptorWrite(server, event);
    server.state = (event: ble.BLEConnectionChangeState): void => {
      if (!this.ownsServer(server)) return;
      const connected = event.state === constant.ProfileConnectionState.STATE_CONNECTED;
      if (!connected && event.state !== constant.ProfileConnectionState.STATE_DISCONNECTED) return;
      const wasConnected = server.devices.has(event.deviceId);
      if (connected) server.devices.add(event.deviceId);
      else {
        server.devices.delete(event.deviceId);
        const execution = server.deviceExecutions.get(event.deviceId);
        if (execution) {
          const error = bleError('NOT_CONNECTED', 'Peripheral central disconnected');
          this.execution.cancel(execution, error);
          this.failSession(execution, error);
          // A real disconnected event is terminal for this central's GATT link.
          this.execution.cleaned(execution);
          server.deviceExecutions.delete(event.deviceId);
        }
        this.clearSubscriptions(server, event.deviceId);
        server.requests.forEach((request) => {
          if (request.deviceId === event.deviceId) this.dropRequest(server, request);
        });
      }
      if (wasConnected !== connected) this.events?.peripheralConnectionStateChange({
        serverId: server.id, deviceId: event.deviceId, connected: connected
      });
    };
    try {
      server.server.on('characteristicRead', server.read);
      server.server.on('characteristicWrite', server.write);
      server.server.on('descriptorRead', server.descriptorRead);
      server.server.on('descriptorWrite', server.descriptorWrite);
      server.server.on('connectionStateChange', server.state);
    } catch (error) { this.disposeServer(server); throw this.failure(error as BusinessError, 'OPERATE_FAILED'); }
    return server.id;
  }

  async addPeripheralService(serverId: string, service: BlePeripheralService): Promise<void> {
    const server = this.requireServer(serverId);
    const uuid = bleUuid(service.uuid);
    if (server.services.has(uuid)) throw bleError('INVALID_DATA', 'Duplicate peripheral service');
    const characteristics: ble.BLECharacteristic[] = [];
    const seen: Set<string> = new Set<string>();
    service.characteristics.forEach((input) => {
      const characteristicId = bleUuid(input.uuid);
      if (seen.has(characteristicId)) throw bleError('INVALID_DATA', 'Duplicate peripheral characteristic');
      seen.add(characteristicId);
      this.validateValue(input.value);
      const descriptors: ble.BLEDescriptor[] = [];
      const descriptorIds: Set<string> = new Set<string>();
      input.descriptors.forEach((descriptor) => {
        const id = bleUuid(descriptor.uuid);
        if (descriptorIds.has(id) || id === bleUuid('2902')) throw bleError('INVALID_DATA', 'CCCD is owned by the BLE service');
        descriptorIds.add(id);
        this.validateValue(descriptor.value);
        descriptors.push({
          serviceUuid: uuid, characteristicUuid: characteristicId, descriptorUuid: id,
          descriptorValue: bleBuffer(descriptor.value), permissions: { read: descriptor.read, write: descriptor.write }
        });
      });
      if (input.properties.notify || input.properties.indicate) {
        descriptors.push({
          serviceUuid: uuid, characteristicUuid: characteristicId, descriptorUuid: bleUuid('2902'),
          descriptorValue: new ArrayBuffer(2), permissions: { read: true, write: true }
        });
      }
      characteristics.push({
        serviceUuid: uuid, characteristicUuid: characteristicId, characteristicValue: bleBuffer(input.value),
        descriptors: descriptors,
        properties: {
          read: input.properties.read, write: input.properties.write, writeNoResponse: input.properties.writeNoResponse,
          notify: input.properties.notify, indicate: input.properties.indicate
        },
        permissions: {
          read: input.permission.readable, write: input.permission.writeable,
          readEncrypted: input.permission.readEncryptionRequired, writeEncrypted: input.permission.writeEncryptionRequired
        }
      });
    });
    const native: ble.GattService = { serviceUuid: uuid, isPrimary: true, characteristics: characteristics };
    await this.runExecution(server.execution, '@adapter', async (): Promise<void> => {
      if (server.services.has(uuid)) throw bleError('INVALID_DATA', 'Duplicate peripheral service');
      try { server.server.addService(native); }
      catch (error) { throw this.failure(error as BusinessError, 'OPERATE_FAILED'); }
      server.services.set(uuid, native);
    });
  }

  async removePeripheralService(serverId: string, serviceId: string): Promise<void> {
    const server = this.requireServer(serverId);
    return this.runExecution(server.execution, '@adapter', () => this.removePeripheralServiceNow(server, serviceId));
  }

  private async removePeripheralServiceNow(server: BleServerSession, serviceId: string): Promise<void> {
    const uuid = bleUuid(serviceId);
    if (!server.services.has(uuid)) throw bleError('SERVICE_NOT_FOUND', 'Peripheral service is absent');
    try { server.server.removeService(uuid); }
    catch (error) { throw this.failure(error as BusinessError, 'OPERATE_FAILED'); }
    server.services.delete(uuid);
    server.requests.forEach((request) => {
      if (request.serviceId === uuid) {
        this.response(server, request.deviceId, request.transId, request.offset, 1, new Uint8Array());
        this.dropRequest(server, request);
      }
    });
    this.clearSubscriptions(server, undefined, uuid);
  }

  async startPeripheralAdvertising(params: BlePeripheralAdvertisingParams): Promise<void> {
    const server = this.requireServer(params.serverId);
    this.ensureForeground();
    if (server.advertisement !== undefined || server.advertising) throw bleError('OPERATE_FAILED', 'Server is already advertising');
    // SDK advertiseName requires MANAGE_BLUETOOTH_ADVERTISER_NAME. Ordinary apps
    // may include the existing system name, but cannot silently replace it.
    if (params.deviceName.length > 0 && params.deviceName !== this.sdk(() => connection.getLocalName(), 'OPERATE_FAILED')) {
      throw bleError('SYSTEM_NOT_SUPPORTED', 'Custom advertising name requires MANAGE_BLUETOOTH_ADVERTISER_NAME');
    }
    const manufactureData: ble.ManufactureData[] = [];
    const ids: Set<number> = new Set<number>();
    params.manufacturerData.forEach((item) => {
      if (!Number.isInteger(item.manufacturerId) || item.manufacturerId < 0 || item.manufacturerId > 65535 ||
        ids.has(item.manufacturerId)) throw bleError('INVALID_DATA', 'Invalid or duplicate manufacturer ID');
      ids.add(item.manufacturerId);
      manufactureData.push({ manufactureId: item.manufacturerId, manufactureValue: bleBuffer(item.manufacturerSpecificData) });
    });
    if (params.beacon) {
      if (ids.has(0x004C)) throw bleError('INVALID_DATA', 'Beacon conflicts with Apple manufacturer data');
      manufactureData.push({ manufactureId: 0x004C, manufactureValue: bleBuffer(bleBeacon(
        params.beacon.uuid, params.beacon.major, params.beacon.minor, params.beacon.measuredPower)) });
    }
    const power = params.powerLevel;
    if (power !== 'low' && power !== 'medium' && power !== 'high') throw bleError('INVALID_DATA', 'Unknown advertising power');
    const data: ble.AdvertiseData = {
      serviceUuids: params.serviceUuids.map((uuid) => bleUuid(uuid)), manufactureData: manufactureData,
      serviceData: [], includeDeviceName: params.deviceName.length > 0
    };
    const settings: ble.AdvertiseSetting = { connectable: params.connectable, txPower: power === 'high' ? 1 : power === 'medium' ? -7 : -15 };
    const native: ble.AdvertisingParams = { advertisingSettings: settings, advertisingData: data };
    const epoch = ++server.advertisingEpoch;
    const execution = this.execution.session(this.executionOwner);
    server.advertisingExecution = execution;
    server.advertising = true;
    try {
      await this.runExecution(execution, '@adapter', async (ticket): Promise<void> => {
        this.ensureForeground();
        if (!this.ownsServer(server) || epoch !== server.advertisingEpoch) throw bleError('NOT_INITIALIZED', 'Advertising start was cancelled');
        const operation = this.sdk(() => ble.startAdvertising(native), 'OPERATE_FAILED');
        const terminal = operation.then(async (id): Promise<void> => {
          if (!this.ownsServer(server) || epoch !== server.advertisingEpoch) await ble.stopAdvertising(id);
        });
        this.execution.track(ticket, terminal);
        const id = await this.wait(operation, 'OPERATE_FAILED', '', server.id, ticket);
        ticket.validate();
        if (!this.ownsServer(server) || epoch !== server.advertisingEpoch) {
          throw bleError('NOT_INITIALIZED', 'Advertising start was cancelled');
        }
        server.advertisement = id;
      });
    } catch (error) {
      server.advertisingEpoch++;
      throw error as Error;
    } finally {
      server.advertising = false;
      this.execution.cancel(execution, bleError('NOT_INITIALIZED', 'Advertising admission ended'));
    }
  }

  async stopPeripheralAdvertising(serverId: string): Promise<void> {
    const server = this.requireServer(serverId);
    server.advertisingEpoch++;
    if (server.advertisingExecution) {
      const error = bleError('OPERATE_FAILED', 'Advertising start stopped');
      this.execution.cancel(server.advertisingExecution, error);
      this.failSession(server.advertisingExecution, error);
    }
    const id = server.advertisement;
    if (id !== undefined) {
      await this.wait(this.sdk(() => ble.stopAdvertising(id), 'OPERATE_FAILED'), 'OPERATE_FAILED', '', server.id);
      if (server.advertisement === id) server.advertisement = undefined;
    }
  }

  async writePeripheralCharacteristicValue(params: BlePeripheralWriteParams): Promise<void> {
    const admitted: BlePeripheralWriteParams = { serverId: params.serverId, serviceId: params.serviceId,
      characteristicId: params.characteristicId, value: new Uint8Array(params.value),
      needNotify: params.needNotify, callbackId: params.callbackId };
    return this.writePeripheralValue(admitted);
  }

  private async writePeripheralValue(params: BlePeripheralWriteParams): Promise<void> {
    const server = this.requireServer(params.serverId);
    this.validateValue(params.value);
    const characteristic = this.serverCharacteristic(server, params.serviceId, params.characteristicId);
    const serviceId = bleUuid(params.serviceId);
    const characteristicId = bleUuid(params.characteristicId);
    if (params.callbackId !== undefined) {
      if (params.needNotify) throw bleError('INVALID_DATA', 'Request response cannot also notify');
      const request = server.requests.get(params.callbackId);
      if (!request || request.serviceId !== serviceId || request.characteristicId !== characteristicId) {
        throw bleError('INVALID_DATA', 'Unknown, mismatched, expired or already answered callback');
      }
      if (request.incoming === undefined && request.offset > params.value.length) {
        this.response(server, request.deviceId, request.transId, request.offset, 7, new Uint8Array());
        this.dropRequest(server, request);
        throw bleError('INVALID_DATA', 'Read offset exceeds response value');
      }
      if (request.incoming === undefined && params.value.length - request.offset > 22) {
        this.response(server, request.deviceId, request.transId, request.offset, 0x0D, new Uint8Array());
        this.dropRequest(server, request);
        throw bleError('SYSTEM_NOT_SUPPORTED', 'Server read responses above 22 bytes require a per-central MTU unavailable in the SDK event');
      }
      if (request.needResponse) this.response(server, request.deviceId, request.transId, request.offset, 0,
        request.incoming === undefined ? params.value.slice(request.offset, request.offset + 22) : new Uint8Array());
      this.dropRequest(server, request);
      characteristic.characteristicValue = bleBuffer(request.incoming ?? params.value);
      return;
    }
    if (!params.needNotify) { characteristic.characteristicValue = bleBuffer(params.value); return; }
    const subscriptions = server.subscriptions.get(this.characteristicKey(serviceId, characteristicId));
    if (!subscriptions || subscriptions.size === 0) throw bleError('NOT_CONNECTED', 'No subscribed central');
    // The SDK server MTU event does not identify a central. Without a per-device
    // negotiated MTU, the only safe payload guaranteed by the ABI is 20 bytes.
    if (params.value.length > 20) throw bleError('INVALID_DATA', 'Server notifications are limited to the default ATT payload of 20 bytes');
    const devices = Array.from(subscriptions.keys());
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      if (!this.ownsServer(server) || !server.devices.has(device)) throw bleError('NOT_CONNECTED', 'Central disconnected');
      let execution = server.deviceExecutions.get(device);
      if (!execution) {
        execution = this.execution.session(this.executionOwner);
        server.deviceExecutions.set(device, execution);
      }
      await this.runExecution(execution, `device:${device}`, async (ticket): Promise<void> => {
        if (!this.ownsServer(server) || !server.devices.has(device)) throw bleError('NOT_CONNECTED', 'Central disconnected before dispatch');
        const flags = subscriptions.get(device);
        if (!flags) throw bleError('NOT_CONNECTED', 'Central unsubscribed');
        const notification: ble.NotifyCharacteristic = {
          serviceUuid: serviceId, characteristicUuid: characteristicId, characteristicValue: bleBuffer(params.value),
          confirm: (flags & 2) !== 0
        };
        await this.wait(this.sdk(() => server.server.notifyCharacteristicChanged(device, notification), 'OPERATE_FAILED'),
          'OPERATE_FAILED', device, server.id, ticket);
      });
      if (!this.ownsServer(server)) throw bleError('NOT_INITIALIZED', 'Server was closed');
    }
    characteristic.characteristicValue = bleBuffer(params.value);
  }

  async closeBLEPeripheralServer(serverId: string): Promise<void> { this.disposeServer(this.requireServer(serverId)); }

  private ready(): void {
    this.ensureLive();
    if (!this.opened) throw bleError('NOT_INITIALIZED', 'Call openBluetoothAdapter first');
    if (!this.radioAvailable()) throw bleError('ADAPTER_NOT_AVAILABLE', 'Bluetooth is off');
  }

  private ensureLive(): void { if (this.disposed) throw bleError('NOT_INITIALIZED', 'BLE owner has closed'); }
  private ensureForeground(): void { if (!this.active) throw bleError('OPERATE_FAILED', 'Bluetooth discovery and prompts require foreground'); }
  private validateDevice(deviceId: string): void { if (deviceId.trim().length === 0) throw bleError('INVALID_DATA', 'Device ID is empty'); }
  private validateValue(value: Uint8Array): void { if (value.length > 512) throw bleError('INVALID_DATA', 'GATT value exceeds 512 bytes'); }
  private timeout(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value <= 0 || value > 2147483647) throw bleError('INVALID_DATA', 'Invalid timeout');
    return value;
  }

  private radioAvailable(): boolean {
    const state = this.sdk(() => access.getState(), 'OPERATE_FAILED');
    return state === access.BluetoothState.STATE_ON || state === access.BluetoothState.STATE_BLE_ON;
  }

  private adapterState(): BleAdapterState {
    // There is no ordinary SDK capability query for peripheral/advertiser
    // support. Leave the optional capability unknown until actual API calls.
    return { available: this.radioAvailable(), discovering: this.scan?.running ?? false };
  }
  private emitAdapter(): void { if (!this.disposed) this.events?.adapterStateChange(this.adapterState()); }

  private failure(error: BusinessError, fallback: string): Error {
    if (error.message?.startsWith('E_BLE_')) return new Error(error.message);
    return bleError(bleFailureCode(error.code, fallback), error.message ?? 'Bluetooth SDK operation failed');
  }

  private sdk<T>(operation: () => T, code: string): T {
    try { return operation(); }
    catch (error) { throw this.failure(error as BusinessError, code); }
  }

  private task<T>(deviceId: string, timeout: number, code: string, serverId: string = '',
    execution?: HarmonyBleExecutionSession): BlePending<T> {
    const pending: BlePending<T> = new BlePending<T>(deviceId, serverId, timeout, code, () => this.pending.delete(pending));
    pending.execution = execution;
    this.pending.add(pending);
    return pending;
  }

  private async wait<T>(operation: Promise<T>, code: string, deviceId: string = '', serverId: string = '',
    ticket?: HarmonyBleExecutionTicket): Promise<T> {
    if (ticket) this.execution.track(ticket, operation);
    const pending = this.task<T>(deviceId, 20000, code, serverId, ticket?.session);
    operation.then((value) => pending.succeed(value)).catch((error: BusinessError) => pending.fail(this.failure(error, code)));
    return pending.promise;
  }

  private async clientWait<T>(session: BleClientSession, operation: Promise<T>, code: string): Promise<T> {
    const result = await this.wait(operation, code, session.deviceId, '', session.ticket);
    if (!this.ownsConnected(session) || !session.execution.valid) {
      throw bleError('NOT_CONNECTED', 'GATT operation belongs to an expired connection');
    }
    return result;
  }

  private failPending(error: Error): void { Array.from(this.pending).forEach((pending) => pending.fail(error)); }
  private failSession(session: HarmonyBleExecutionSession, error: Error): void {
    Array.from(this.pending).forEach((pending) => { if (pending.execution === session) pending.fail(error); });
  }
  private async runExecution<T>(session: HarmonyBleExecutionSession, resource: string,
    operation: (ticket: HarmonyBleExecutionTicket) => Promise<T>): Promise<T> {
    const ticket = this.execution.acquire(session, resource);
    try {
      if (!ticket.admitted) await ticket.ready;
      ticket.validate();
      this.ready();
      return await operation(ticket);
    } finally { this.execution.finish(ticket); }
  }

  private async runClient<T>(session: BleClientSession, operation: () => Promise<T>): Promise<T> {
    return this.runExecution(session.execution, `device:${session.deviceId}`, async (ticket): Promise<T> => {
      if (!this.ownsClient(session)) throw bleError('NOT_CONNECTED', 'GATT session replaced before dispatch');
      session.ticket = ticket;
      try { return await operation(); }
      finally { if (session.ticket === ticket) session.ticket = undefined; }
    });
  }

  private listen(): void {
    if (this.listeners) return;
    this.unlisten();
    // Reopen gets fresh callbacks. An old failed-off registration can never be
    // reactivated by attaching delivery to a new adapter session.
    const listeners = new BleRuntimeListeners();
    this.listeners = listeners;
    listeners.attach(this.radioChanged, this.bondChanged, this.pinRequired);
    listeners.register();
  }

  private unlisten(): void {
    if (this.listeners) {
      this.listeners.retireDelivery();
      this.retiredListeners.push(this.listeners);
      this.listeners = undefined;
    }
    // Clear every forwarder BEFORE the first SDK off() can reenter.
    this.retiredListeners.forEach((listeners) => listeners.retireDelivery());
    if (this.cleaningListeners) return;
    this.cleaningListeners = true;
    try {
      this.retiredListeners = this.retiredListeners.filter((listeners) => !listeners.detach());
    } finally { this.cleaningListeners = false; }
  }

  private shutdown(): void {
    this.epoch++;
    this.activityEpoch++;
    this.opened = false;
    this.retirePairDeliveries();
    this.execution.cancelOwner(this.executionOwner, bleError('NOT_INITIALIZED', 'Bluetooth adapter closed'));
    this.stopScanOwned();
    this.failPending(bleError('NOT_INITIALIZED', 'Bluetooth adapter closed'));
    this.clients.forEach((session) => this.disposeClient(session, true));
    this.servers.forEach((server) => this.disposeServer(server));
    this.pairs.clear();
    this.devices.clear();
    this.unlisten();
    this.emitAdapter();
  }

  private retirePairDeliveries(): void {
    this.pairs.forEach((pair) => pair.bondLease?.retireDelivery());
  }

  private async startScan(filters: ble.ScanFilter[], params: BleScanParams): Promise<void> {
    this.ready();
    this.ensureForeground();
    this.stopScanOwned();
    const power = params.powerLevel ?? 'medium';
    if (power !== 'low' && power !== 'medium' && power !== 'high') throw bleError('INVALID_DATA', 'Unknown scan power');
    const interval = params.interval ?? 0;
    if (!Number.isFinite(interval) || interval < 0) throw bleError('INVALID_DATA', 'Invalid scan interval');
    const scan = new BleScanSession(this.sdk(() => ble.createBleScanner(), 'OPERATE_FAILED'), ++this.scanEpoch,
      this.execution.session(this.executionOwner));
    const options: ble.ScanOptions = {
      interval: 0, // Bridge interval is a per-device throttle, not SDK batch mode.
      dutyMode: power === 'high' ? ble.ScanDuty.SCAN_MODE_LOW_LATENCY :
        power === 'low' ? ble.ScanDuty.SCAN_MODE_LOW_POWER : ble.ScanDuty.SCAN_MODE_BALANCED,
      reportMode: ble.ScanReportMode.NORMAL
    };
    this.scan = scan;
    scan.finding = (report: ble.ScanReport): void => {
      if (this.scan !== scan || !scan.execution.valid || scan.epoch !== this.scanEpoch || !this.active || !this.opened) return;
      if (report.reportType === ble.ScanReportType.ON_LOST) return;
      report.scanResult.forEach((result) => {
        const bytes = bleBytes(result.data);
        const advertisement = bleAdvertisement(bytes);
        const services = result.serviceUuids ? result.serviceUuids.map((uuid) => bleUuid(uuid)) : advertisement.serviceUuids;
        const serviceData = advertisement.serviceData;
        if (result.serviceDataMap) {
          serviceData.length = 0;
          result.serviceDataMap.forEach((data, uuid) => serviceData.push({ uuid: bleUuid(uuid), data: new Uint8Array(data) }));
        }
        const device: BleDevice = {
          RSSI: result.rssi, advertisData: bytes, advertisServiceUUIDs: services,
          deviceId: result.deviceId, localName: advertisement.localName,
          name: result.deviceName, serviceData: serviceData, connectable: result.connectable
        };
        this.devices.set(result.deviceId, device);
        const now = Date.now();
        const last = scan.seen.get(result.deviceId);
        if (last !== undefined && (!params.allowDuplicatesKey || now - last < interval)) return;
        scan.seen.set(result.deviceId, now);
        this.events?.deviceFound(this.copyDevice(device));
      });
    };
    try {
      await this.runExecution(scan.execution, '@adapter', async (ticket): Promise<void> => {
        scan.ticket = ticket;
        this.ensureForeground();
        scan.scanner.on('BLEDeviceFind', scan.finding);
        const operation = scan.scanner.startScan(filters, options);
        const starting = this.task<void>('', 20000, 'OPERATE_FAILED', '', scan.execution);
        scan.starting = starting;
        // Retain the allocation fence through cleanup of a late-created scanner.
        const terminal = operation.then(async (): Promise<void> => {
          if (this.scan !== scan || scan.epoch !== this.scanEpoch) await scan.scanner.stopScan();
        });
        this.execution.track(ticket, terminal);
        operation.then(() => starting.succeed(undefined))
          .catch((error: BusinessError) => starting.fail(this.failure(error, 'OPERATE_FAILED')));
        await starting.promise;
        ticket.validate();
        if (this.scan !== scan || scan.epoch !== this.scanEpoch) throw bleError('OPERATE_FAILED', 'Scan start was cancelled');
        scan.running = true;
        this.emitAdapter();
      });
    } catch (error) {
      if (this.scan === scan) this.stopScanOwned();
      throw this.failure(error as BusinessError, 'OPERATE_FAILED');
    } finally { scan.starting = undefined; }
  }

  private stopScanOwned(): void {
    const scan = this.scan;
    this.scan = undefined;
    this.scanEpoch++;
    if (!scan) return;
    this.execution.cancel(scan.execution, bleError('OPERATE_FAILED', 'Scan start was cancelled'));
    scan.starting?.fail(bleError('OPERATE_FAILED', 'Scan start was cancelled'));
    try { scan.scanner.off('BLEDeviceFind', scan.finding); } catch (_error) {}
    try { scan.scanner.stopScan().catch((_error: BusinessError): void => {}); } catch (_error) {}
    this.emitAdapter();
  }

  private copyDevice(device: BleDevice): BleDevice {
    return {
      RSSI: device.RSSI, advertisData: new Uint8Array(device.advertisData), advertisServiceUUIDs: device.advertisServiceUUIDs.slice(),
      deviceId: device.deviceId, localName: device.localName, name: device.name, connectable: device.connectable,
      serviceData: device.serviceData.map((item): BleServiceData => ({ uuid: item.uuid, data: new Uint8Array(item.data) }))
    };
  }

  private ownsClient(session: BleClientSession): boolean { return !this.disposed && this.opened && this.clients.get(session.deviceId) === session; }
  private ownsConnected(session: BleClientSession): boolean {
    return this.ownsClient(session) && session.execution.valid && session.connected;
  }
  private requireClient(deviceId: string): BleClientSession {
    this.ready();
    const session = this.clients.get(deviceId);
    if (!session || !this.ownsConnected(session) || session.disconnecting) throw bleError('NOT_CONNECTED', 'No connected owned GATT client');
    return session;
  }

  private disposeClient(session: BleClientSession, emit: boolean): void {
    if (this.clients.get(session.deviceId) !== session) return;
    if (session.execution.valid) this.execution.cancel(session.execution, bleError('NOT_CONNECTED', 'GATT client disposed'));
    this.clients.delete(session.deviceId);
    const connected = session.connected;
    session.connected = false;
    session.services = undefined;
    session.serviceRevision++;
    let cleaned = !session.native;
    if (session.native) {
      try { session.client.off('BLEConnectionStateChange', session.state); } catch (_error) {}
      try { session.client.off('BLECharacteristicChange', session.value); } catch (_error) {}
      try { session.client.off('BLEMtuChange', session.mtuChanged); } catch (_error) {}
      try { session.client.off('serviceChange', session.serviceChanged); } catch (_error) {}
      try { session.client.disconnect(); } catch (_error) {}
      try { session.client.close(); cleaned = true; } catch (_error) {}
    }
    if (cleaned) {
      session.finishConnection();
      this.execution.cleaned(session.execution);
    }
    if (emit && connected && !this.disposed) this.events?.connectStateChange({ deviceId: session.deviceId, connected: false });
  }

  private async services(session: BleClientSession): Promise<ble.GattService[]> {
    if (!this.ownsConnected(session)) throw bleError('NOT_CONNECTED', 'Connection expired before service discovery');
    if (session.services) return session.services;
    const revision = session.serviceRevision;
    const services = await this.clientWait(session, this.sdk(() => session.client.getServices(), 'OPERATE_FAILED'), 'OPERATE_FAILED');
    if (revision !== session.serviceRevision) throw bleError('OPERATE_FAILED', 'GATT services changed during discovery; retry');
    session.services = services;
    return services;
  }

  private async service(session: BleClientSession, serviceId: string): Promise<ble.GattService> {
    const uuid = bleUuid(serviceId);
    const revision = session.serviceRevision;
    const services = await this.services(session);
    if (!this.ownsConnected(session) || revision !== session.serviceRevision) {
      throw bleError('OPERATE_FAILED', 'GATT service cache expired; retry');
    }
    const service = services.find((candidate) => bleUuid(candidate.serviceUuid) === uuid);
    if (!service) throw bleError('SERVICE_NOT_FOUND', 'GATT service is absent');
    return service;
  }

  private async characteristic(session: BleClientSession, serviceId: string, characteristicId: string): Promise<ble.BLECharacteristic> {
    const revision = session.serviceRevision;
    const service = await this.service(session, serviceId);
    const uuid = bleUuid(characteristicId);
    const characteristic = service.characteristics.find((candidate) => bleUuid(candidate.characteristicUuid) === uuid);
    if (!characteristic) throw bleError('CHARACTERISTIC_NOT_FOUND', 'GATT characteristic is absent');
    if (!this.ownsConnected(session)) throw bleError('NOT_CONNECTED', 'Connection expired during discovery');
    if (revision !== session.serviceRevision) throw bleError('OPERATE_FAILED', 'GATT characteristic cache expired; retry');
    return characteristic;
  }

  private properties(input: ble.GattProperties | undefined): BleCharacteristicProperties {
    return {
      read: input?.read ?? false, write: (input?.write ?? false) || (input?.writeNoResponse ?? false),
      writeDefault: input?.write ?? false, writeNoResponse: input?.writeNoResponse ?? false,
      notify: input?.notify ?? false, indicate: input?.indicate ?? false
    };
  }

  private emitValue(session: BleClientSession, value: ble.BLECharacteristic): void {
    if (!this.ownsConnected(session)) return;
    this.events?.characteristicUpdate({
      deviceId: session.deviceId, serviceId: bleUuid(value.serviceUuid),
      characteristicId: bleUuid(value.characteristicUuid), value: bleBytes(value.characteristicValue)
    });
  }

  private updateMtu(session: BleClientSession, actual: number): void {
    bleMtu(actual);
    if (session.mtu === actual) return;
    session.mtu = actual;
    this.events?.mtuChange({ deviceId: session.deviceId, mtu: actual });
  }

  private ownsServer(server: BleServerSession): boolean {
    return !this.disposed && this.opened && server.execution.valid && !server.closed && this.servers.get(server.id) === server;
  }
  private requireServer(id: string): BleServerSession {
    this.ready();
    const server = this.servers.get(id);
    if (!server || server.closed) throw bleError('INVALID_DATA', 'Unknown peripheral server');
    return server;
  }

  private characteristicKey(serviceId: string, characteristicId: string): string { return `${bleUuid(serviceId)}/${bleUuid(characteristicId)}`; }
  private serverCharacteristic(server: BleServerSession, serviceId: string, characteristicId: string): ble.BLECharacteristic {
    const service = server.services.get(bleUuid(serviceId));
    if (!service) throw bleError('SERVICE_NOT_FOUND', 'Peripheral service is absent');
    const uuid = bleUuid(characteristicId);
    const characteristic = service.characteristics.find((item) => bleUuid(item.characteristicUuid) === uuid);
    if (!characteristic) throw bleError('CHARACTERISTIC_NOT_FOUND', 'Peripheral characteristic is absent');
    return characteristic;
  }

  private response(server: BleServerSession, deviceId: string, transId: number, offset: number, status: number, value: Uint8Array): void {
    const response: ble.ServerResponse = { deviceId: deviceId, transId: transId, offset: offset, status: status, value: bleBuffer(value) };
    try { server.server.sendResponse(response); }
    catch (error) { throw this.failure(error as BusinessError, 'OPERATE_FAILED'); }
  }

  private dropRequest(server: BleServerSession, request: BleServerRequest): void {
    clearTimeout(request.timer);
    server.requests.delete(request.id);
  }

  private recordRequest(server: BleServerSession, transId: number, deviceId: string, serviceId: string,
    characteristicId: string, offset: number, value: Uint8Array | undefined, response: boolean): BleServerRequest {
    const request = new BleServerRequest(++this.nextRequest, transId, deviceId, bleUuid(serviceId),
      bleUuid(characteristicId), offset, value, response);
    server.requests.set(request.id, request);
    request.timer = setTimeout(() => {
      if (!this.ownsServer(server) || !server.requests.has(request.id)) return;
      if (request.needResponse) {
        try { this.response(server, deviceId, transId, offset, 0x0E, new Uint8Array()); } catch (_error) {}
      }
      this.dropRequest(server, request);
    }, 10000);
    return request;
  }

  private serverRead(server: BleServerSession, event: ble.CharacteristicReadRequest): void {
    if (!this.ownsServer(server)) return;
    try {
      const characteristic = this.serverCharacteristic(server, event.serviceUuid, event.characteristicUuid);
      if (!characteristic.properties?.read) { this.response(server, event.deviceId, event.transId, event.offset, 2, new Uint8Array()); return; }
      const request = this.recordRequest(server, event.transId, event.deviceId, event.serviceUuid,
        event.characteristicUuid, event.offset, undefined, true);
      this.events?.peripheralReadRequest({
        serverId: server.id, serviceId: request.serviceId, characteristicId: request.characteristicId,
        callbackId: request.id, deviceId: event.deviceId, offset: event.offset
      });
    } catch (_error) {
      try { this.response(server, event.deviceId, event.transId, event.offset, 0x0E, new Uint8Array()); } catch (_ignored) {}
    }
  }

  private serverWrite(server: BleServerSession, event: ble.CharacteristicWriteRequest): void {
    if (!this.ownsServer(server)) return;
    try {
      const characteristic = this.serverCharacteristic(server, event.serviceUuid, event.characteristicUuid);
      // Shared ABI has no execute/cancel-prepared-write phase. Reject this scope
      // explicitly rather than exposing an uncommitted write as successful.
      if (event.isPrepared || event.offset !== 0) {
        if (event.needRsp) this.response(server, event.deviceId, event.transId, event.offset, event.isPrepared ? 6 : 7, new Uint8Array());
        return;
      }
      if (!characteristic.properties?.write && !characteristic.properties?.writeNoResponse) {
        if (event.needRsp) this.response(server, event.deviceId, event.transId, event.offset, 3, new Uint8Array());
        return;
      }
      const value = bleBytes(event.value);
      this.validateValue(value);
      const request = this.recordRequest(server, event.transId, event.deviceId, event.serviceUuid,
        event.characteristicUuid, event.offset, value, event.needRsp);
      if (!event.needRsp) characteristic.characteristicValue = bleBuffer(value);
      this.events?.peripheralWriteRequest({
        serverId: server.id, serviceId: request.serviceId, characteristicId: request.characteristicId,
        callbackId: request.id, deviceId: event.deviceId, offset: event.offset, value: new Uint8Array(value),
        needResponse: event.needRsp
      });
    } catch (_error) {
      if (event.needRsp) {
        try { this.response(server, event.deviceId, event.transId, event.offset, 0x0E, new Uint8Array()); } catch (_ignored) {}
      }
    }
  }

  private serverDescriptorRead(server: BleServerSession, event: ble.DescriptorReadRequest): void {
    if (!this.ownsServer(server)) return;
    try {
      const characteristic = this.serverCharacteristic(server, event.serviceUuid, event.characteristicUuid);
      const uuid = bleUuid(event.descriptorUuid);
      const descriptor = characteristic.descriptors.find((item) => bleUuid(item.descriptorUuid) === uuid);
      if (!descriptor) { this.response(server, event.deviceId, event.transId, event.offset, 1, new Uint8Array()); return; }
      if (!descriptor.permissions?.read) { this.response(server, event.deviceId, event.transId, event.offset, 2, new Uint8Array()); return; }
      let value = bleBytes(descriptor.descriptorValue);
      if (uuid === bleUuid('2902')) {
        const flags = server.subscriptions.get(this.characteristicKey(event.serviceUuid, event.characteristicUuid))?.get(event.deviceId) ?? 0;
        value = new Uint8Array([flags, 0]);
      }
      if (event.offset > value.length || event.offset < 0) {
        this.response(server, event.deviceId, event.transId, event.offset, 7, new Uint8Array()); return;
      }
      if (value.length - event.offset > 22) {
        this.response(server, event.deviceId, event.transId, event.offset, 0x0D, new Uint8Array()); return;
      }
      this.response(server, event.deviceId, event.transId, event.offset, 0, value.slice(event.offset));
    } catch (_error) {
      try { this.response(server, event.deviceId, event.transId, event.offset, 0x0E, new Uint8Array()); } catch (_ignored) {}
    }
  }

  private serverDescriptorWrite(server: BleServerSession, event: ble.DescriptorWriteRequest): void {
    if (!this.ownsServer(server)) return;
    try {
      const characteristic = this.serverCharacteristic(server, event.serviceUuid, event.characteristicUuid);
      const uuid = bleUuid(event.descriptorUuid);
      const descriptor = characteristic.descriptors.find((item) => bleUuid(item.descriptorUuid) === uuid);
      let status = !descriptor ? 1 : !descriptor.permissions?.write ? 3 : event.isPrepared ? 6 : event.offset !== 0 ? 7 : 0;
      const value = bleBytes(event.value);
      if (value.length > 512) status = 0x0D;
      if (uuid === bleUuid('2902') && status === 0) {
        const flags = value.length === 2 ? value[0] | (value[1] << 8) : -1;
        if (flags < 0 || flags > 3 || ((flags & 1) !== 0 && !characteristic.properties?.notify) ||
          ((flags & 2) !== 0 && !characteristic.properties?.indicate)) status = 0x13;
      }
      if (event.needRsp) this.response(server, event.deviceId, event.transId, event.offset, status, new Uint8Array());
      if (status !== 0 || !descriptor) return;
      if (uuid !== bleUuid('2902')) { descriptor.descriptorValue = bleBuffer(value); return; }
      const key = this.characteristicKey(event.serviceUuid, event.characteristicUuid);
      let subscriptions = server.subscriptions.get(key);
      if (!subscriptions) { subscriptions = new Map<string, number>(); server.subscriptions.set(key, subscriptions); }
      const flags = value[0] | (value[1] << 8);
      const old = subscriptions.get(event.deviceId) ?? 0;
      if (flags === 0) subscriptions.delete(event.deviceId); else subscriptions.set(event.deviceId, flags);
      const eventValue: BlePeripheralSubscriptionEvent = { serverId: server.id, serviceId: bleUuid(event.serviceUuid),
        characteristicId: bleUuid(event.characteristicUuid), deviceId: event.deviceId };
      if (old === 0 && flags !== 0) this.events?.peripheralSubscribed(eventValue);
      if (old !== 0 && flags === 0) this.events?.peripheralUnsubscribed(eventValue);
    } catch (_error) {
      if (event.needRsp) {
        try { this.response(server, event.deviceId, event.transId, event.offset, 0x0E, new Uint8Array()); } catch (_ignored) {}
      }
    }
  }

  private clearSubscriptions(server: BleServerSession, deviceId: string | undefined, serviceId: string | undefined = undefined): void {
    server.subscriptions.forEach((devices, key) => {
      const ids = key.split('/');
      if (serviceId !== undefined && ids[0] !== serviceId) return;
      devices.forEach((_flags, device) => {
        if (deviceId !== undefined && device !== deviceId) return;
        devices.delete(device);
        if (!this.disposed) this.events?.peripheralUnsubscribed({
          serverId: server.id, serviceId: ids[0], characteristicId: ids[1], deviceId: device
        });
      });
      if (devices.size === 0) server.subscriptions.delete(key);
    });
  }

  private disposeServer(server: BleServerSession): void {
    if (server.closed) return;
    server.closed = true;
    server.advertisingEpoch++;
    const error = bleError('NOT_INITIALIZED', 'Peripheral server closed');
    this.execution.cancel(server.execution, error);
    if (server.advertisingExecution) this.execution.cancel(server.advertisingExecution, error);
    server.deviceExecutions.forEach((execution) => this.execution.cancel(execution, error));
    this.servers.delete(server.id);
    Array.from(this.pending).forEach((pending) => {
      if (pending.serverId === server.id) pending.fail(bleError('NOT_INITIALIZED', 'Peripheral server closed'));
    });
    const advertisement = server.advertisement;
    server.advertisement = undefined;
    if (advertisement !== undefined) {
      try { ble.stopAdvertising(advertisement).catch((_error: BusinessError): void => {}); } catch (_error) {}
    }
    server.requests.forEach((request) => this.dropRequest(server, request));
    this.clearSubscriptions(server, undefined);
    try { server.server.off('characteristicRead', server.read); } catch (_error) {}
    try { server.server.off('characteristicWrite', server.write); } catch (_error) {}
    try { server.server.off('descriptorRead', server.descriptorRead); } catch (_error) {}
    try { server.server.off('descriptorWrite', server.descriptorWrite); } catch (_error) {}
    try { server.server.off('connectionStateChange', server.state); } catch (_error) {}
    server.devices.forEach((device) => {
      try { server.server.disconnect(device); } catch (_error) {}
      if (!this.disposed) this.events?.peripheralConnectionStateChange({ serverId: server.id, deviceId: device, connected: false });
    });
    server.devices.clear();
    try {
      server.server.close();
      this.execution.cleaned(server.execution);
      server.deviceExecutions.forEach((execution) => this.execution.cleaned(execution));
    } catch (_error) {}
    server.deviceExecutions.clear();
    server.services.clear();
  }
}
