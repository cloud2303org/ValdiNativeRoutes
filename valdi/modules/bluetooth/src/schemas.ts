import * as v from 'valibot';
import { invalidBleData } from './errors';
import { bytes } from './native';

/**
 * The arguments of the Bluetooth API (wechat.ts) and of its peripheral servers (peripheral.ts): every rule is checked
 * here, once, as the public method starts, and what native needs is normalized here too (canonical UUIDs, copied
 * bytes, defaults). Nothing after this checks them again, nor the replies and events native sends back.
 */

/** The parsed options, or the mini-program's invalid-data failure (errCode 10013) with the first issue's message. */
export function parseOptions<TSchema extends v.GenericSchema>(schema: TSchema, input: unknown): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) throw invalidBleData(result.issues[0].message);
  return result.output;
}

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHORT_UUID_PATTERN = /^[0-9a-f]{4}(?:[0-9a-f]{4})?$/;

/** A 16/32/128-bit UUID, made canonical; `compact` keeps 16- and 32-bit ones short. */
const bleUuid = (typeMessage: string, formatMessage: string, compact = false) =>
  v.pipe(
    v.string(typeMessage),
    v.check(value => UUID_PATTERN.test(canonicalUuid(value)), formatMessage),
    v.transform(value => {
      const short = value.trim().toLowerCase();
      return compact && SHORT_UUID_PATTERN.test(short) ? short : canonicalUuid(value);
    }),
  );
const bluetoothUuid = (field: string) =>
  bleUuid(`${field} must be a Bluetooth UUID string`, `${field} is not a valid 16/32/128-bit UUID`);
const serverUuid = (field: string, compact = false) =>
  bleUuid(`${field} must be a UUID`, `${field} must be a 16/32/128-bit UUID`, compact);

/** v.object, but a missing field fails with that field's own message, as an undefined one does. */
function fields<TEntries extends v.ObjectEntries>(entries: TEntries, message: string) {
  const all: v.ObjectEntries = entries;
  return v.object(entries, issue => {
    const key = issue.path?.[0].key as string | undefined;
    if (key === undefined) return message;
    return v.safeParse(all[key], undefined).issues?.[0].message ?? message;
  });
}
const isRecord = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
/** fields(), refusing arrays as well. */
const record = <TEntries extends v.ObjectEntries>(entries: TEntries, message: string) =>
  v.pipe(v.custom<unknown>(isRecord, message), fields(entries, message));

const optionsMessage = 'options must be an object';
const powerLevel = v.picklist(['low', 'medium', 'high'], 'powerLevel must be low, medium or high');

// wechat.ts, the central role.

const deviceMessage = 'deviceId must be a non-empty string';
const deviceId = v.pipe(v.string(deviceMessage), v.trim(), v.minLength(1, deviceMessage));
const nonNegative = (field: string) => {
  const message = `${field} must be a non-negative finite number`;
  return v.pipe(v.number(message), v.finite(message), v.minValue(0, message));
};
const writeType = v.picklist(['write', 'writeNoResponse'], 'writeType must be write or writeNoResponse');
const pinMessage = 'pin must be a non-empty Base64 string';
const servicesMessage = 'services must be an array of Bluetooth UUIDs';
// Item by item, so that each message names its index: `services[1] is not a valid 16/32/128-bit UUID`.
const services = v.pipe(
  v.array(v.unknown(), servicesMessage),
  v.rawTransform(({ dataset, addIssue, NEVER }) => {
    const uuids: string[] = [];
    for (const [index, value] of dataset.value.entries()) {
      const result = v.safeParse(bluetoothUuid(`services[${index}]`), value);
      if (!result.success) {
        addIssue({ message: result.issues[0].message });
        return NEVER;
      }
      uuids.push(result.output);
    }
    return uuids;
  }),
);
const characteristic = {
  deviceId,
  serviceId: bluetoothUuid('serviceId'),
  characteristicId: bluetoothUuid('characteristicId'),
};

export const openAdapterOptions = fields(
  { mode: v.nullish(v.picklist(['central', 'peripheral'], 'mode must be central or peripheral'), 'central') },
  optionsMessage,
);
export const discoveryOptions = fields(
  {
    services: v.optional(services),
    allowDuplicatesKey: v.optional(v.boolean('allowDuplicatesKey must be a boolean')),
    interval: v.optional(nonNegative('interval')),
    powerLevel: v.optional(powerLevel),
  },
  optionsMessage,
);
export const deviceOptions = fields({ deviceId }, optionsMessage);
export const connectOptions = fields({ deviceId, timeout: v.optional(nonNegative('timeout')) }, optionsMessage);
export const pairOptions = fields(
  {
    deviceId,
    pin: v.pipe(
      v.string(pinMessage),
      v.regex(/^[A-Za-z0-9+/]+={0,2}$/, pinMessage),
      v.check(pin => pin.length % 4 === 0, pinMessage),
    ),
    timeout: v.optional(nonNegative('timeout'), 20_000),
  },
  optionsMessage,
);
export const serviceOptions = fields({ deviceId, serviceId: characteristic.serviceId }, optionsMessage);
export const characteristicOptions = fields(characteristic, optionsMessage);
export const notifyOptions = fields(
  {
    state: v.boolean('state must be a boolean'),
    ...characteristic,
    type: v.optional(v.picklist(['notification', 'indication'], 'type must be notification or indication')),
  },
  optionsMessage,
);
export const writeOptions = fields(
  {
    value: v.instance(ArrayBuffer, 'value must be an ArrayBuffer'),
    ...characteristic,
    writeType: v.optional(writeType, 'write'),
  },
  optionsMessage,
);
const mtuMessage = 'mtu must be an integer between 23 and 511';
export const setMtuOptions = fields(
  {
    deviceId,
    mtu: v.pipe(v.number(mtuMessage), v.integer(mtuMessage), v.minValue(23, mtuMessage), v.maxValue(511, mtuMessage)),
  },
  optionsMessage,
);
export const getMtuOptions = fields({ deviceId, writeType: v.optional(writeType, 'write') }, optionsMessage);
export const connectedDevicesOptions = fields({ services }, optionsMessage);

// peripheral.ts, the peripheral role's servers.

const flag = (field: string) => v.optional(v.boolean(`${field} must be a boolean`), false);
const integer = (field: string, min: number, max: number) => {
  const message = `${field} is out of range`;
  return v.pipe(v.number(message), v.safeInteger(message), v.minValue(min, message), v.maxValue(max, message));
};
/** A copy, as it crosses the bridge as Uint8Array: native reads it later, maybe after the caller changed it. */
const data = (field: string) => v.pipe(v.instance(ArrayBuffer, `${field} must be an ArrayBuffer`), v.transform(bytes));
const optionalData = (field: string) => v.optional(data(field), () => new ArrayBuffer(0));
const distinct = (values: unknown[]) => new Set(values).size === values.length;

const descriptor = v.pipe(
  record(
    {
      uuid: serverUuid('descriptor.uuid'),
      permission: v.nullish(
        record(
          { read: flag('descriptor.permission.read'), write: flag('descriptor.permission.write') },
          'descriptor.permission must be an object',
        ),
        {},
      ),
      value: optionalData('descriptor.value'),
    },
    'descriptor must be an object',
  ),
  v.transform(({ uuid, permission, value }) => ({ uuid, ...permission, value })),
);
const characteristicDefinition = record(
  {
    uuid: serverUuid('characteristic.uuid'),
    properties: v.nullish(
      record(
        {
          read: flag('read'),
          write: flag('write'),
          writeNoResponse: flag('writeNoResponse'),
          notify: flag('notify'),
          indicate: flag('indicate'),
        },
        'properties must be an object',
      ),
      {},
    ),
    permission: v.nullish(
      record(
        {
          readable: flag('readable'),
          writeable: flag('writeable'),
          readEncryptionRequired: flag('readEncryptionRequired'),
          writeEncryptionRequired: flag('writeEncryptionRequired'),
        },
        'permission must be an object',
      ),
      {},
    ),
    value: optionalData('value'),
    descriptors: v.optional(
      v.pipe(
        v.array(descriptor, 'descriptors must be an array'),
        v.check(items => distinct(items.map(item => item.uuid)), 'descriptors contains duplicate UUIDs'),
      ),
      () => [],
    ),
  },
  'characteristic must be an object',
);
const serviceDefinition = record(
  {
    uuid: serverUuid('service.uuid'),
    characteristics: v.pipe(
      v.array(characteristicDefinition, 'characteristics must be an array'),
      v.check(items => distinct(items.map(item => item.uuid)), 'characteristics contains duplicate UUIDs'),
    ),
  },
  'service must be an object',
);

export const addServiceOptions = record({ service: serviceDefinition }, optionsMessage);
export const removeServiceOptions = record({ serviceId: serverUuid('serviceId') }, optionsMessage);

const manufacturerMessage = 'manufacturerId must be a 0x-prefixed 16-bit hex string';
const manufacturerData = record(
  {
    manufacturerId: v.pipe(
      v.string(manufacturerMessage),
      v.regex(/^0x[\da-f]{1,4}$/i, manufacturerMessage),
      v.transform(id => Number.parseInt(id.slice(2), 16)),
    ),
    manufacturerSpecificData: optionalData('manufacturerSpecificData'),
  },
  'manufacturerData must be an object',
);
const beacon = record(
  {
    uuid: v.pipe(
      serverUuid('beacon.uuid', true),
      v.check(uuid => uuid.length === 36, 'beacon.uuid must be 128-bit'),
    ),
    major: integer('beacon.major', 0, 65535),
    minor: integer('beacon.minor', 0, 65535),
    measuredPower: v.nullish(integer('beacon.measuredPower', -128, 127), -59),
  },
  'beacon must be an object',
);
// deviceName, serviceUuids and manufacturerData keep undefined until the beacon check below has seen them.
const advertiseRequest = record(
  {
    connectable: v.optional(v.boolean('connectable must be a boolean')),
    deviceName: v.optional(v.string('deviceName must be a string')),
    serviceUuids: v.optional(
      v.pipe(
        v.array(serverUuid('serviceUuids', true), 'serviceUuids must be an array'),
        v.check(uuids => distinct(uuids.map(canonicalUuid)), 'serviceUuids contains duplicate UUIDs'),
      ),
    ),
    manufacturerData: v.optional(
      v.pipe(
        v.array(manufacturerData, 'manufacturerData must be an array'),
        v.check(items => distinct(items.map(item => item.manufacturerId)), 'duplicate manufacturerId'),
      ),
    ),
    beacon: v.optional(beacon),
  },
  'advertiseRequest must be an object',
);
/** BlePeripheralAdvertisingParams without the serverId. */
export const advertisingOptions = v.pipe(
  record({ advertiseRequest, powerLevel: v.nullish(powerLevel, 'medium') }, optionsMessage),
  v.check(
    ({ advertiseRequest: request }) =>
      !request.beacon ||
      (request.deviceName === undefined &&
        request.serviceUuids === undefined &&
        request.manufacturerData === undefined),
    'beacon cannot be combined with deviceName, serviceUuids or manufacturerData',
  ),
  v.transform(({ advertiseRequest: request, powerLevel }) => {
    const { beacon, connectable = !beacon, deviceName = '', serviceUuids = [], manufacturerData = [] } = request;
    return { connectable, deviceName, serviceUuids, manufacturerData, powerLevel, ...(beacon ? { beacon } : {}) };
  }),
  v.check(({ beacon, connectable }) => !(beacon && connectable), 'beacon advertising must be non-connectable'),
);
export const writeValueOptions = v.pipe(
  record(
    {
      needNotify: v.boolean('needNotify must be a boolean'),
      callbackId: v.optional(integer('callbackId', 0, Number.MAX_SAFE_INTEGER)),
      serviceId: serverUuid('serviceId'),
      characteristicId: serverUuid('characteristicId'),
      value: data('value'),
    },
    optionsMessage,
  ),
  v.check(
    ({ callbackId, needNotify }) => callbackId === undefined || !needNotify,
    'callbackId replies cannot also notify',
  ),
);

export const listener = v.function('listener must be a function');
