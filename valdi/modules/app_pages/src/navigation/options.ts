import { Device } from 'valdi_core/src/Device';
import * as v from 'valibot';
import type { ResolvedNavigation } from './models';

export type { ResolvedNavigation } from './models';

/** Android presets, as ExpoNativeRoutes' NativeRouteAnimations; iOS has only the system push and none. */
export const ANDROID_ANIMATIONS = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'] as const;
export const IOS_ANIMATIONS = ['default', 'none'] as const;
export const HARMONY_ANIMATIONS = ['default', 'none', 'slideRight', 'slideUp', 'fade', 'zoom'] as const;
export type AndroidAnimation = (typeof ANDROID_ANIMATIONS)[number];
export type IosAnimation = (typeof IOS_ANIMATIONS)[number];
export type HarmonyAnimation = (typeof HARMONY_ANIMATIONS)[number];

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
  /** Native ArkUI transitions. Default uses slideRight; none/duration 0 apply immediately. */
  harmony?: AnimationSettings<HarmonyAnimation>;
}

const unknownOption = 'Unknown navigation option';
const durationMessage = 'durationMs must be an integer from 0 to 2000';
const durationMs = v.optional(
  v.pipe(
    v.number(durationMessage),
    v.integer(durationMessage),
    v.minValue(0, durationMessage),
    v.maxValue(2000, durationMessage),
  ),
);
/** One layer of NavigationOptions. Every platform branch is checked, so a typo fails on every platform. */
const navigationLayer = v.strictObject(
  {
    animation: v.optional(v.picklist(IOS_ANIMATIONS, 'Unknown animation')),
    durationMs,
    android: v.optional(
      v.strictObject(
        { animation: v.optional(v.picklist(ANDROID_ANIMATIONS, 'Unknown animation')), durationMs },
        unknownOption,
      ),
    ),
    ios: v.optional(
      v.strictObject(
        {
          animation: v.optional(v.picklist(IOS_ANIMATIONS, 'Unknown animation')),
          durationMs,
          presentation: v.optional(v.picklist(['push', 'fullScreen'], 'Invalid iOS presentation')),
        },
        unknownOption,
      ),
    ),
    harmony: v.optional(
      v.strictObject(
        { animation: v.optional(v.picklist(HARMONY_ANIMATIONS, 'Unknown Harmony animation')), durationMs },
        unknownOption,
      ),
    ),
  },
  unknownOption,
);

export function resolveNavigation(...layers: (NavigationOptions | undefined)[]): ResolvedNavigation {
  // String comparison also compiles against upstream versions whose enum predates Harmony.
  const platform = String(Device.getSystemType()) === 'harmony' ? 'harmony' : Device.isAndroid() ? 'android' : 'ios';
  const result: ResolvedNavigation = { animation: 'default', durationMs: 300, presentation: 'push' };
  layers.forEach(layer => {
    if (!layer) return;
    const { android, ios, harmony, ...shared } = v.parse(navigationLayer, layer);
    // A platform branch beats the shared keys of its own layer; a key left undefined keeps the layer below.
    for (const settings of [shared, platform === 'harmony' ? harmony : platform === 'android' ? android : ios]) {
      Object.entries(settings ?? {}).forEach(([key, value]) => {
        if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
      });
    }
  });
  if (platform === 'harmony' && (result.animation === 'none' || result.durationMs === 0)) {
    result.animation = 'none';
    result.durationMs = 0;
  }
  return result;
}
