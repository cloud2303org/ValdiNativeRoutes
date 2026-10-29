import { type DevicePermissionResult, isAndroid } from '../permissions/index';
import { mapNFCError } from './errors';
import { nativeNFC } from './native';
import type { NFCAvailability } from './types';

/** Read-only hardware/switch/foreground state; does not enable reader mode. */
export async function getNFCAvailability(): Promise<NFCAvailability> {
  if (!isAndroid()) return { supported: false, enabled: false, foreground: false, permissionGranted: false };
  try {
    return await nativeNFC.getAvailability();
  } catch (error) {
    throw mapNFCError('getNFCAvailability', error);
  }
}

/** NFC is an install-time normal permission. No dangerous-permission dialog exists. */
export async function getNFCPermissionState(): Promise<DevicePermissionResult> {
  const state = await getNFCAvailability();
  if (!state.supported) return { status: 'unavailable', canAskAgain: false };
  return { status: state.permissionGranted ? 'granted' : 'unavailable', canAskAgain: false };
}

/** Kept uniform with other device packages; this is a read, never a runtime request. */
export const requestNFCPermission = getNFCPermissionState;
