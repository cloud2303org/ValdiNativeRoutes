import { Device } from 'valdi_core/src/Device';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';
import { getHost } from './Ota';
import type { OtaHost, OtaInfo } from './OtaHost';

export type { OtaInfo } from './OtaHost';

let host: OtaHost | undefined;

function nativeHost(): OtaHost {
  if (!Device.isAndroid() && !Device.isIOS()) {
    throw new Error('OTA is supported on Android and iOS');
  }
  return host ??= withGlobalNativeRefs('app-ota', () => getHost());
}

export async function getInfo(): Promise<OtaInfo> {
  return nativeHost().getInfo();
}

export async function checkForUpdate(): Promise<OtaInfo> {
  return nativeHost().checkForUpdate();
}
