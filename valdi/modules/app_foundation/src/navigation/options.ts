import { Device } from 'valdi_core/src/Device';
import type { ResolvedNavigation } from './models';
export type { ResolvedNavigation } from './models';

/** Android presets, as ExpoNativeRoutes' NativeRouteAnimations; iOS has only the system push and none. */
export const ANDROID_ANIMATIONS = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'] as const;
export const IOS_ANIMATIONS = ['default', 'none'] as const;
export type AndroidAnimation = (typeof ANDROID_ANIMATIONS)[number];
export type IosAnimation = (typeof IOS_ANIMATIONS)[number];

interface AnimationSettings<A extends string> {
  animation?: A;
  /** Integer 0–2000, default 300; 0 is the same as 'none'. */
  durationMs?: number;
}

/**
 * Same shape as ExpoNativeRoutes' navigation options: the global NAVIGATION, then the route's options, then the
 * call's, each with optional per-platform branches; later layers win, and a platform branch beats the shared keys
 * of its own layer. 'fullScreen' covers the stack on iOS, as a modal; Android has no such presentation.
 */
export interface NavigationOptions extends AnimationSettings<IosAnimation> {
  android?: AnimationSettings<AndroidAnimation>;
  ios?: AnimationSettings<IosAnimation> & { presentation?: 'push' | 'fullScreen' };
}

export function resolveNavigation(...layers: (NavigationOptions | undefined)[]): ResolvedNavigation {
  const platform = Device.isAndroid() ? 'android' : 'ios';
  const result: ResolvedNavigation = { animation: 'default', durationMs: 300, presentation: 'push' };
  for (const layer of layers) {
    if (layer === undefined) continue;
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      throw new Error('Invalid navigation options');
    }
    const { android, ios, ...shared } = layer;
    // A platform branch beats the shared keys of its own layer; a key left undefined keeps the layer below.
    for (const settings of [shared, platform === 'android' ? android : ios]) {
      if (settings === undefined) continue;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('Invalid navigation options');
      }
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}
