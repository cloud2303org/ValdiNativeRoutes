// Pure protocol helpers. Kept free of SDK imports so the production code can be
// compiled and exercised in isolation without loading a radio or an Ability.
export interface HarmonyBleAdvertisementData {
  localName: string;
  serviceUuids: string[];
  serviceData: HarmonyBleAdvertisementServiceData[];
}

export interface HarmonyBleAdvertisementServiceData {
  uuid: string;
  data: Uint8Array;
}

export function bleError(code: string, detail: string): Error {
  return new Error(`E_BLE_${code}:${detail}`);
}

export function bleUuid(input: string): string {
  let uuid = input.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(uuid)) uuid = `0000${uuid}-0000-1000-8000-00805f9b34fb`;
  else if (/^[0-9a-f]{8}$/.test(uuid)) uuid = `${uuid}-0000-1000-8000-00805f9b34fb`;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
    throw bleError('INVALID_DATA', 'Invalid Bluetooth UUID');
  }
  return uuid;
}

export function bleBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer).slice();
}

export function bleBuffer(bytes: Uint8Array): ArrayBuffer {
  // Never hand the SDK the full backing buffer of a sliced bridge byte view.
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

export function bleMtu(mtu: number): number {
  if (!Number.isInteger(mtu) || mtu < 23 || mtu > 517) {
    throw bleError('INVALID_DATA', 'ATT MTU must be an integer between 23 and 517');
  }
  return mtu;
}

export function bleFailureCode(sdkCode: number, fallback: string): string {
  if (sdkCode === 201 || sdkCode === 202) return 'PERMISSION';
  if (sdkCode === 801) return 'SYSTEM_NOT_SUPPORTED';
  if (sdkCode === 401) return 'INVALID_DATA';
  if (sdkCode === 2900003) return 'ADAPTER_NOT_AVAILABLE';
  if (sdkCode === 2901003) return 'NOT_CONNECTED';
  if (sdkCode === 2901008) return 'SERVICE_NOT_FOUND';
  return fallback;
}

function littleUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = bytes.length - 1; i >= 0; i--) hex += bytes[i].toString(16).padStart(2, '0');
  if (bytes.length === 16) {
    hex = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return bleUuid(hex);
}

function utf8(bytes: Uint8Array): string {
  // Decode advertising names without a Node, browser or process-wide decoder.
  let result = '';
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++];
    if (first < 0x80) { result += String.fromCharCode(first); continue; }
    const count = first >= 0xF0 && first <= 0xF4 ? 3 : first >= 0xE0 && first <= 0xEF ? 2 :
      first >= 0xC2 && first <= 0xDF ? 1 : 0;
    if (count === 0 || i + count > bytes.length) { result += '\uFFFD'; continue; }
    let point = first & (0x7F >> (count + 1));
    let valid = true;
    for (let j = 0; j < count; j++) {
      const next = bytes[i + j];
      if ((next & 0xC0) !== 0x80) { valid = false; break; }
      point = (point << 6) | (next & 0x3F);
    }
    if (!valid || point < (count === 1 ? 0x80 : count === 2 ? 0x800 : 0x10000) ||
      point > 0x10FFFF || (point >= 0xD800 && point <= 0xDFFF)) { result += '\uFFFD'; continue; }
    i += count;
    result += String.fromCodePoint(point);
  }
  return result;
}

export function bleAdvertisement(bytes: Uint8Array): HarmonyBleAdvertisementData {
  const data: HarmonyBleAdvertisementData = { localName: '', serviceUuids: [], serviceData: [] };
  let completeName = false;
  for (let offset = 0; offset < bytes.length;) {
    const length = bytes[offset++];
    if (length === 0) break;
    if (offset + length > bytes.length) break; // Truncated AD structures are not parsed as valid fields.
    const type = bytes[offset];
    const value = bytes.slice(offset + 1, offset + length);
    offset += length;
    if (type === 8 || type === 9) {
      if (!completeName || type === 9) data.localName = utf8(value);
      if (type === 9) completeName = true;
    }
    const width = type === 2 || type === 3 ? 2 : type === 4 || type === 5 ? 4 : type === 6 || type === 7 ? 16 : 0;
    if (width !== 0) {
      for (let i = 0; i + width <= value.length; i += width) {
        const uuid = littleUuid(value.slice(i, i + width));
        if (data.serviceUuids.indexOf(uuid) < 0) data.serviceUuids.push(uuid);
      }
    }
    const serviceWidth = type === 0x16 ? 2 : type === 0x20 ? 4 : type === 0x21 ? 16 : 0;
    if (serviceWidth !== 0 && value.length >= serviceWidth) {
      data.serviceData.push({ uuid: littleUuid(value.slice(0, serviceWidth)), data: value.slice(serviceWidth) });
    }
  }
  return data;
}

export function blePin(encoded: string): string {
  // The shared ABI supplies Base64, not a literal PIN string.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw bleError('INVALID_DATA', 'PIN must be Base64 encoded');
  }
  let bits = 0;
  let count = 0;
  let result = '';
  for (let i = 0; i < encoded.length && encoded[i] !== '='; i++) {
    bits = (bits << 6) | alphabet.indexOf(encoded[i]);
    count += 6;
    if (count >= 8) {
      count -= 8;
      const byte = (bits >> count) & 255;
      if (byte < 32 || byte > 126) throw bleError('INVALID_DATA', 'Harmony PIN must contain printable ASCII');
      result += String.fromCharCode(byte);
    }
  }
  if (result.length < 1 || result.length > 16) throw bleError('INVALID_DATA', 'PIN must contain 1 to 16 bytes');
  return result;
}

export function bleBeacon(uuid: string, major: number, minor: number, power: number): Uint8Array {
  if (!Number.isInteger(major) || major < 0 || major > 65535 ||
    !Number.isInteger(minor) || minor < 0 || minor > 65535 ||
    !Number.isInteger(power) || power < -128 || power > 127) {
    throw bleError('INVALID_DATA', 'Invalid beacon fields');
  }
  const hex = bleUuid(uuid).replace(/-/g, '');
  const data = new Uint8Array(23);
  data[0] = 0x02;
  data[1] = 0x15;
  for (let i = 0; i < 16; i++) data[i + 2] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  data[18] = major >> 8;
  data[19] = major & 255;
  data[20] = minor >> 8;
  data[21] = minor & 255;
  data[22] = power & 255;
  return data;
}
