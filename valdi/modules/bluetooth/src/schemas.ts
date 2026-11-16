import type {
  BleNotifyParams,
  BlePairParams,
  BlePeripheralAdvertisingParams,
  BlePeripheralService,
  BleReadParams,
  BleScanParams,
  BleWriteParams,
} from './BleHost';
import { invalidBleData } from './errors';
import { type BinaryInput, bytes } from './native';
import type {
  BLEPeripheralAdvertisingOptions,
  BLEPeripheralService as PeripheralServiceInput,
  BLEPeripheralWriteOptions,
  OpenBluetoothAdapterOptions,
} from './peripheral';
import type { BleNotifyType, BleWriteType, StartBluetoothDevicesDiscoveryOptions } from './wechat';

/** Lowercase with dashes, 16- and 32-bit UUIDs on the Bluetooth base UUID; anything else only trimmed and lowercased. */
export const canonicalUuid = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(normalized)) {
    return `0000${normalized}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{8}$/.test(normalized)) {
    return `${normalized}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{32}$/.test(normalized)) {
    return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
  }
  return normalized;
};

const SHORT_UUID_PATTERN = /^[0-9a-f]{4}(?:[0-9a-f]{4})?$/;

const compactUuid = (value: string): string => {
  const short = value.trim().toLowerCase();
  return SHORT_UUID_PATTERN.test(short) ? short : canonicalUuid(value);
};

const trimDeviceId = (deviceId: string): string => {
  const trimmed = deviceId?.trim();
  if (!trimmed) throw invalidBleData('deviceId must be a non-empty string');
  return trimmed;
};

const toBytes = (value: unknown, field: string): Uint8Array<ArrayBuffer> => {
  if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) {
    throw invalidBleData(`${field} must be an ArrayBuffer or Uint8Array`);
  }
  return bytes(value);
};

const optionalBytes = (value: BinaryInput | undefined, field: string): Uint8Array<ArrayBuffer> =>
  value === undefined ? new Uint8Array(0) : toBytes(value, field);

// Central role normalizers (wechat.ts)

export const openAdapterOptions = (
  options?: OpenBluetoothAdapterOptions,
): { mode: 'central' | 'peripheral' } => ({
  mode: options?.mode ?? 'central',
});

export const discoveryOptions = (options: StartBluetoothDevicesDiscoveryOptions = {}): BleScanParams => ({
  ...(options.services !== undefined ? { services: options.services.map(canonicalUuid) } : {}),
  ...(options.allowDuplicatesKey !== undefined ? { allowDuplicatesKey: options.allowDuplicatesKey } : {}),
  ...(options.interval !== undefined ? { interval: options.interval } : {}),
  ...(options.powerLevel !== undefined ? { powerLevel: options.powerLevel } : {}),
});

export const deviceOptions = (options: { deviceId: string }): { deviceId: string } => ({
  deviceId: trimDeviceId(options.deviceId),
});

export const connectOptions = (options: {
  deviceId: string;
  timeout?: number;
}): { deviceId: string; timeout?: number } => ({
  deviceId: trimDeviceId(options.deviceId),
  ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
});

export const pairOptions = (options: { deviceId: string; pin: string; timeout?: number }): BlePairParams => ({
  deviceId: trimDeviceId(options.deviceId),
  pin: options.pin,
  timeout: options.timeout ?? 20_000,
});

export const serviceOptions = (options: {
  deviceId: string;
  serviceId: string;
}): { deviceId: string; serviceId: string } => ({
  deviceId: trimDeviceId(options.deviceId),
  serviceId: canonicalUuid(options.serviceId),
});

export const characteristicOptions = (options: {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
}): BleReadParams => ({
  deviceId: trimDeviceId(options.deviceId),
  serviceId: canonicalUuid(options.serviceId),
  characteristicId: canonicalUuid(options.characteristicId),
});

export const notifyOptions = (options: {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  state: boolean;
  type?: BleNotifyType;
}): BleNotifyParams => ({
  ...characteristicOptions(options),
  state: options.state,
  ...(options.type !== undefined ? { type: options.type } : {}),
});

export const writeOptions = (options: {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: BinaryInput;
  writeType?: BleWriteType;
}): BleWriteParams => ({
  ...characteristicOptions(options),
  // Snapshot at public admission, before any scheduling or native async wait.
  value: toBytes(options.value, 'value'),
  writeType: options.writeType ?? 'write',
});

export const setMtuOptions = (options: { deviceId: string; mtu: number }): { deviceId: string; mtu: number } => ({
  deviceId: trimDeviceId(options.deviceId),
  mtu: options.mtu,
});

export const getMtuOptions = (options: {
  deviceId: string;
  writeType?: BleWriteType;
}): { deviceId: string; writeType: BleWriteType } => ({
  deviceId: trimDeviceId(options.deviceId),
  writeType: options.writeType ?? 'write',
});

export const connectedDevicesOptions = (options: { services: string[] }): { services: string[] } => ({
  services: options.services.map(canonicalUuid),
});

// Peripheral server normalizers (peripheral.ts)

export const addServiceOptions = (options: { service: PeripheralServiceInput }): { service: BlePeripheralService } => {
  const { service } = options;
  return {
    service: {
      uuid: canonicalUuid(service.uuid),
      characteristics: service.characteristics.map(item => ({
        uuid: canonicalUuid(item.uuid),
        properties: {
          read: item.properties?.read ?? false,
          write: item.properties?.write ?? false,
          writeNoResponse: item.properties?.writeNoResponse ?? false,
          notify: item.properties?.notify ?? false,
          indicate: item.properties?.indicate ?? false,
        },
        permission: {
          readable: item.permission?.readable ?? false,
          writeable: item.permission?.writeable ?? false,
          readEncryptionRequired: item.permission?.readEncryptionRequired ?? false,
          writeEncryptionRequired: item.permission?.writeEncryptionRequired ?? false,
        },
        value: optionalBytes(item.value, 'value'),
        descriptors: (item.descriptors ?? []).map(desc => ({
          uuid: canonicalUuid(desc.uuid),
          read: desc.permission?.read ?? false,
          write: desc.permission?.write ?? false,
          value: optionalBytes(desc.value, 'descriptor.value'),
        })),
      })),
    },
  };
};

export const removeServiceOptions = (options: { serviceId: string }): { serviceId: string } => ({
  serviceId: canonicalUuid(options.serviceId),
});

export const advertisingOptions = (
  options: BLEPeripheralAdvertisingOptions,
): Omit<BlePeripheralAdvertisingParams, 'serverId'> => {
  const request = options.advertiseRequest;
  const beacon = request.beacon
    ? {
        uuid: canonicalUuid(request.beacon.uuid),
        major: request.beacon.major,
        minor: request.beacon.minor,
        measuredPower: request.beacon.measuredPower ?? -59,
      }
    : undefined;
  return {
    connectable: request.connectable ?? !beacon,
    deviceName: request.deviceName ?? '',
    serviceUuids: (request.serviceUuids ?? []).map(compactUuid),
    manufacturerData: (request.manufacturerData ?? []).map(entry => ({
      manufacturerId: Number.parseInt(entry.manufacturerId.replace(/^0x/i, ''), 16),
      manufacturerSpecificData: optionalBytes(entry.manufacturerSpecificData, 'manufacturerSpecificData'),
    })),
    powerLevel: options.powerLevel ?? 'medium',
    ...(beacon ? { beacon } : {}),
  };
};

export const writeValueOptions = (options: BLEPeripheralWriteOptions) => ({
  serviceId: canonicalUuid(options.serviceId),
  characteristicId: canonicalUuid(options.characteristicId),
  value: toBytes(options.value, 'value'),
  needNotify: options.needNotify,
  ...(options.callbackId !== undefined ? { callbackId: options.callbackId } : {}),
});
