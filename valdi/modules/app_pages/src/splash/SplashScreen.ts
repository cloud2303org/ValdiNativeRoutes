import { Device } from 'valdi_core/src/Device';
import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';
import { getHost } from './SplashScreenNative';
import type { AndroidSplashScreenHost } from './SplashScreenNative';

let host: AndroidSplashScreenHost | undefined;

function nativeHost(): AndroidSplashScreenHost {
  if (!Device.isAndroid()) throw new Error('SplashScreen controls are currently implemented on Android only');
  return host ??= withGlobalNativeRefs('splash-screen', () => getHost());
}

/**
 * Call during startup, before awaiting other work. Returns false if the initial
 * splash has already left. Repeated calls hold the same launch, not a counter.
 */
export function preventAutoHide(): boolean {
  return nativeHost().preventAutoHide();
}

/** Submit hide synchronously. Initial content and the native transition still finish later. */
export function hide(): void {
  nativeHost().hide();
}
