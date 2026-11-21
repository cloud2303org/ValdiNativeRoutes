import type { View } from 'valdi_tsx/src/NativeTemplateElements';

export type ColorValue = string;

/**
 * - `number` — sheet height in points (dp on Android, pt on iOS). Must be >= 0.
 * - `` `${number}%` `` — percentage of the available height, e.g. `'50%'`, `'100%'`. Must be in 0%–100%.
 * - `'content'` — height matching the natural size of the sheet's children, clamped to the available height.
 */
export type DetentValue = number | `${number}%` | 'content';

/**
 * Space kept between the sheet card and the container's edges at a detent, in points.
 */
export interface DetentInsets {
  left?: number;
  right?: number;
  /** Inline-start gap; overrides `left` in LTR and `right` in RTL. */
  start?: number;
  /** Inline-end gap; overrides `right` in LTR and `left` in RTL. */
  end?: number;
  /** Gap kept below the card once open; as the sheet closes, the card slides down through it. */
  bottom?: number;
}

/** Object form of a detent entry, used to attach per-detent options. */
export interface DetentConfig {
  /** Sheet height at this detent. */
  value: DetentValue;
  /**
   * When `true`, the sheet cannot be dragged or dismissed to this detent — it
   * is reachable only by updating `index` from code. Defaults to `false`.
   */
  programmatic?: boolean;
  /** Space kept around the sheet card at this detent, floating it off the container's edges. */
  insets?: DetentInsets;
}

/** A detent entry: either a bare {@link DetentValue} or a {@link DetentConfig} object. */
export type Detent = DetentValue | DetentConfig;

/** Object form of a modal detent entry, extending {@link DetentConfig} with backdrop options. */
export interface ModalDetentConfig extends DetentConfig {
  /**
   * Multiplier in `[0, 1]` applied to `scrimColor`'s alpha when settled at this
   * detent; linearly interpolated between adjacent detents. Defaults to `0` at
   * a closed detent (`0` / `'0%'`) and `1` everywhere else.
   */
  scrimOpacity?: number;
}

/** A detent entry for `ModalBottomSheet`: either a bare {@link DetentValue} or a {@link ModalDetentConfig} object. */
export type ModalDetent = DetentValue | ModalDetentConfig;

/** Structured `boxShadow` item matching React Native 0.76+ / CSS box-shadow semantics. */
export interface BoxShadowValue {
  offsetX: number;
  offsetY: number;
  blurRadius?: number;
  spreadDistance?: number;
  color?: ColorValue;
  inset?: boolean;
}

/**
 * Visual style of the sheet card: its corner shape, shadows, and surface appearance.
 * Corner radii clip both the surface and the content to the card; outset shadows are cast around it.
 */
export interface SurfaceStyle extends Omit<View, 'boxShadow'> {
  backgroundColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: number;
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderTopStartRadius?: number;
  borderTopEndRadius?: number;
  borderBottomStartRadius?: number;
  borderBottomEndRadius?: number;
  /** Corner curve on iOS (`'circular'` or `'continuous'`). Defaults to `'circular'`. */
  borderCurve?: 'circular' | 'continuous';
  /** CSS `box-shadow` string or array of structured shadow descriptors. */
  boxShadow?: string | readonly BoxShadowValue[];
  /** Android outline elevation in dp. */
  elevation?: number;
  /** Shadow color (iOS layer shadow & Android API 28+ outline shadow). */
  shadowColor?: ColorValue;
  /** iOS layer shadow offset in pt. */
  shadowOffset?: { width?: number; height?: number };
  /** iOS layer shadow opacity in `[0, 1]`. */
  shadowOpacity?: number;
  /** iOS layer shadow blur radius in pt. */
  shadowRadius?: number;
}

/** The sheet-wide horizontal layout, carried on every native detent. */
export interface CardLayout {
  readonly maxWidth: number;
  readonly placementBias: number;
}

export interface NormalizedDetent {
  value: number;
  kind: 'points' | 'percentage' | 'content';
  programmatic: boolean;
  usesStatusBarTopInset: boolean;
  insetTop: number;
  insetLeft: number;
  insetRight: number;
  insetBottom: number;
  widestCard: boolean;
  /** The sheet's `maxWidth`, or 0 for none. The same on every detent. */
  maxWidth: number;
  /** The sheet's `placement` as a physical bias (`0` left, `0.5` center, `1` right). */
  placementBias: number;
  scrimOpacity: number;
}

export interface NormalizedCardShadow {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  /** Packed 32-bit ARGB integer (`0xAARRGGBB`, signed 32-bit safe for native bridge). */
  colorArgb: number;
  colorCss: string;
  opacity: number;
  excludesInterior: boolean;
}

export interface ResolvedSurfaceStyle {
  /** `[topLeft, topRight, bottomRight, bottomLeft]` in points. */
  cornerRadii: [number, number, number, number];
  cornerCurve: 'circular' | 'continuous';
  shadows: NormalizedCardShadow[];
  elevation: number;
  /** Packed 32-bit ARGB integer for Android `outlineSpotShadowColor` / `outlineAmbientShadowColor`. */
  shadowColorArgb: number;
  /** Remaining visual styles applied to the default surface `<view>`. */
  viewStyle: {
    backgroundColor?: ColorValue;
    borderColor?: ColorValue;
    borderWidth?: number;
    opacity?: number;
  };
}

const PERCENTAGE_DETENT_REGEX = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/;

const CLOSED_INSETS = {
  usesStatusBarTopInset: false,
  insetTop: 0,
  insetLeft: 0,
  insetRight: 0,
  insetBottom: 0,
} as const;

const DEFAULT_CARD_LAYOUT: CardLayout = {
  maxWidth: 0,
  placementBias: 0.5,
};

const NAMED_COLORS: Record<string, number> = {
  transparent: 0x00000000,
  black: 0xff000000,
  white: 0xffffffff,
  red: 0xffff0000,
  green: 0xff008000,
  blue: 0xff0000ff,
  gray: 0xff808080,
  grey: 0xff808080,
};

function toSignedInt32(argb: number): number {
  return argb | 0;
}

/**
 * Parses CSS hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb(...)`, `rgba(...)`,
 * or basic named colors into a signed 32-bit `0xAARRGGBB` integer.
 */
export function parseColorToArgb(color: ColorValue | undefined, fallbackArgb = 0xff000000): number {
  const trimmed = color?.trim().toLowerCase();
  if (!trimmed) {
    return toSignedInt32(fallbackArgb);
  }
  if (trimmed in NAMED_COLORS) {
    return toSignedInt32(NAMED_COLORS[trimmed]!);
  }
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      const a = hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) : 0xff;
      return toSignedInt32((a << 24) | (r << 16) | (g << 8) | b);
    }
    if (hex.length === 6) {
      return toSignedInt32((0xff << 24) | parseInt(hex, 16));
    }
    if (hex.length === 8) {
      return toSignedInt32((parseInt(hex.slice(6, 8), 16) << 24) | parseInt(hex.slice(0, 6), 16));
    }
    return toSignedInt32(fallbackArgb);
  }

  const rgbaMatch = /^rgba?\(\s*([^)]+)\s*\)$/.exec(trimmed);
  if (rgbaMatch) {
    const parts = rgbaMatch[1]!.replace(/\s*\/\s*/, ',').split(/[\s,]+/).filter(Boolean);
    if (parts.length >= 3) {
      const parseChannel = (part: string): number =>
        part.endsWith('%')
          ? Math.round(Math.min(100, Math.max(0, parseFloat(part))) * 2.55)
          : Math.round(Math.min(255, Math.max(0, parseFloat(part))));
      const r = parseChannel(parts[0]!);
      const g = parseChannel(parts[1]!);
      const b = parseChannel(parts[2]!);
      const rawAlpha = parts[3];
      const alphaFloat =
        rawAlpha === undefined ? 1 : rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
      const a = Math.round(Math.min(1, Math.max(0, alphaFloat)) * 255);
      return toSignedInt32((a << 24) | (r << 16) | (g << 8) | b);
    }
  }

  return toSignedInt32(fallbackArgb);
}

function parseDetentValue(detent: DetentValue, index: number): Pick<NormalizedDetent, 'value' | 'kind'> {
  if (detent === 'content') {
    return { value: 0, kind: 'content' };
  }
  if (typeof detent === 'number') {
    if (!Number.isFinite(detent) || detent < 0) {
      throw new Error(`Invalid bottom sheet detent at index ${index}: point values must be >= 0.`);
    }
    return { value: detent, kind: 'points' };
  }
  const match = PERCENTAGE_DETENT_REGEX.exec(detent.trim());
  const percentage = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(`Invalid bottom sheet detent at index ${index}: expected 0%–100%, received "${detent}".`);
  }
  return { value: percentage / 100, kind: 'percentage' };
}

function parseDetentEntry(
  detent: ModalDetent,
  index: number,
  topInset: number | undefined,
  cardLayout: CardLayout,
  isRTL: boolean,
): NormalizedDetent {
  const config = typeof detent === 'object' ? detent : { value: detent };
  const parsed = parseDetentValue(config.value, index);
  const insets = config.insets;
  const left = (isRTL ? insets?.end : insets?.start) ?? insets?.left ?? 0;
  const right = (isRTL ? insets?.start : insets?.end) ?? insets?.right ?? 0;
  const bottom = insets?.bottom ?? 0;
  const isClosed = parsed.kind !== 'content' && parsed.value === 0;
  return {
    ...parsed,
    programmatic: config.programmatic ?? false,
    ...(isClosed
      ? CLOSED_INSETS
      : {
          usesStatusBarTopInset: topInset === undefined,
          insetTop: topInset ?? 0,
          insetLeft: left,
          insetRight: right,
          insetBottom: bottom,
        }),
    widestCard: false,
    maxWidth: cardLayout.maxWidth,
    placementBias: cardLayout.placementBias,
    scrimOpacity: 'scrimOpacity' in config && config.scrimOpacity !== undefined ? config.scrimOpacity : isClosed ? 0 : 1,
  };
}

export function isNormalizedDetentClosed(detent: NormalizedDetent): boolean {
  return detent.kind !== 'content' && detent.value === 0;
}

function sameInsets(a: NormalizedDetent, b: NormalizedDetent): boolean {
  return (
    a.usesStatusBarTopInset === b.usesStatusBarTopInset &&
    a.insetTop === b.insetTop &&
    a.insetLeft === b.insetLeft &&
    a.insetRight === b.insetRight &&
    a.insetBottom === b.insetBottom
  );
}

/**
 * Normalizes and validates `detents` in ascending order, marking the widest open card.
 * `maxWidth` caps every card alike, so it never changes which card is widest.
 */
export function normalizeDetents(
  detents: readonly ModalDetent[],
  isRTL = false,
  topInset?: number,
  cardLayout: CardLayout = DEFAULT_CARD_LAYOUT,
): NormalizedDetent[] {
  if (detents.length === 0) {
    throw new Error('BottomSheet requires at least one detent.');
  }

  const normalized = detents.map((d, i) => parseDetentEntry(d, i, topInset, cardLayout, isRTL));

  let widestIndex = -1;
  let smallestSideGap = Infinity;
  let seenContent = false;
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i]!;
    if (current.kind === 'content') {
      if (seenContent) {
        throw new Error("BottomSheet supports at most one 'content' detent.");
      }
      seenContent = true;
    }
    if (!isNormalizedDetentClosed(current)) {
      const sideGap = current.insetLeft + current.insetRight;
      if (sideGap < smallestSideGap) {
        smallestSideGap = sideGap;
        widestIndex = i;
      }
    }
    if (i === 0) {
      continue;
    }
    const previous = normalized[i - 1]!;
    const currentClosed = isNormalizedDetentClosed(current);
    const previousClosed = isNormalizedDetentClosed(previous);
    if (currentClosed && !previousClosed) {
      throw new Error(`Invalid bottom sheet detent at index ${i}: detents must be sorted in ascending order.`);
    }
    if (
      !currentClosed &&
      !previousClosed &&
      current.kind === previous.kind &&
      current.kind !== 'content' &&
      sameInsets(current, previous) &&
      current.value < previous.value
    ) {
      throw new Error(`Invalid bottom sheet detent at index ${i}: detents must be sorted in ascending order.`);
    }
  }

  if (widestIndex >= 0) {
    normalized[widestIndex]!.widestCard = true;
  }

  return normalized;
}

export function validateIndex(index: number, detentsCount: number, modal = false): void {
  const minIndex = modal ? -1 : 0;
  if (!Number.isInteger(index) || index < minIndex || index >= detentsCount) {
    throw new Error(
      `Invalid bottom sheet index ${String(index)} for ${detentsCount} detent(s). Expected an integer between ${minIndex} and ${detentsCount - 1}.`,
    );
  }
}

export function validateSettleDuration(settleDuration: number | undefined): void {
  if (settleDuration !== undefined && (!Number.isFinite(settleDuration) || settleDuration < 0)) {
    throw new Error(
      `Invalid bottom sheet settleDuration: expected a finite number >= 0, received ${String(settleDuration)}.`,
    );
  }
}

function parseLengthToken(token: string): number | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(token.trim());
  return match ? Number(match[1]) : undefined;
}

function splitShadowList(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  return parts;
}

function tokenizeShadow(entry: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < entry.length; i++) {
    const ch = entry[i]!;
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')' && depth > 0) {
      depth--;
      current += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Parses a CSS `box-shadow` string into structured {@link BoxShadowValue} items.
 */
export function parseBoxShadowString(raw: string): BoxShadowValue[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'none') {
    return [];
  }

  const parsed: BoxShadowValue[] = [];
  for (const part of splitShadowList(trimmed)) {
    const tokens = tokenizeShadow(part.trim());
    let inset = false;
    let color: string | undefined;
    const lengths: number[] = [];

    for (const token of tokens) {
      if (token.toLowerCase() === 'inset') {
        inset = true;
        continue;
      }
      const len = parseLengthToken(token);
      if (len !== undefined && lengths.length < 4) {
        lengths.push(len);
      } else if (color === undefined) {
        color = token;
      }
    }

    if (lengths.length >= 2) {
      parsed.push({
        offsetX: lengths[0]!,
        offsetY: lengths[1]!,
        blurRadius: lengths[2] ?? 0,
        spreadDistance: lengths[3] ?? 0,
        color,
        inset,
      });
    }
  }

  return parsed;
}

function resolveCardShadows(style: SurfaceStyle, includeLayerShadowProps: boolean): NormalizedCardShadow[] {
  const shadows: NormalizedCardShadow[] = [];

  if (style.boxShadow !== undefined) {
    const rawList = typeof style.boxShadow === 'string' ? parseBoxShadowString(style.boxShadow) : style.boxShadow;
    for (const shadow of rawList) {
      if (shadow.inset) {
        continue;
      }
      const colorCss = shadow.color ?? '#000000';
      shadows.push({
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
        blurRadius: Math.max(0, shadow.blurRadius ?? 0),
        spreadDistance: shadow.spreadDistance ?? 0,
        colorArgb: parseColorToArgb(shadow.color, 0xff000000),
        colorCss,
        opacity: 1,
        excludesInterior: true,
      });
    }
  }

  if (includeLayerShadowProps && (style.shadowOpacity ?? 0) > 0) {
    const shadowOpacity = Math.min(1, Math.max(0, style.shadowOpacity ?? 0));
    const radius = Math.max(0, style.shadowRadius ?? 3);
    const colorCss = style.shadowColor ?? '#000000';
    shadows.push({
      offsetX: style.shadowOffset?.width ?? 0,
      offsetY: style.shadowOffset?.height ?? -3,
      blurRadius: radius * 2,
      spreadDistance: 0,
      colorArgb: parseColorToArgb(style.shadowColor, 0xff000000),
      colorCss,
      opacity: shadowOpacity,
      excludesInterior: false,
    });
  }

  return shadows;
}

/**
 * Splits `surfaceStyle` into card shape + outset shadows (owned by the native host)
 * and remaining surface view properties (applied to the default surface `<view>`).
 */
export function resolveSurfaceStyle(
  surfaceStyle: SurfaceStyle | undefined,
  isRTL = false,
  includeLayerShadowProps = true,
): ResolvedSurfaceStyle {
  if (!surfaceStyle) {
    return {
      cornerRadii: [0, 0, 0, 0],
      cornerCurve: 'circular',
      shadows: [],
      elevation: 0,
      shadowColorArgb: toSignedInt32(0xff000000),
      viewStyle: {},
    };
  }

  const all = Math.max(0, surfaceStyle.borderRadius ?? 0);
  const topStart = surfaceStyle.borderTopStartRadius;
  const topEnd = surfaceStyle.borderTopEndRadius;
  const bottomStart = surfaceStyle.borderBottomStartRadius;
  const bottomEnd = surfaceStyle.borderBottomEndRadius;

  const topLeft = Math.max(0, surfaceStyle.borderTopLeftRadius ?? (isRTL ? topEnd : topStart) ?? all);
  const topRight = Math.max(0, surfaceStyle.borderTopRightRadius ?? (isRTL ? topStart : topEnd) ?? all);
  const bottomRight = Math.max(0, surfaceStyle.borderBottomRightRadius ?? (isRTL ? bottomStart : bottomEnd) ?? all);
  const bottomLeft = Math.max(0, surfaceStyle.borderBottomLeftRadius ?? (isRTL ? bottomEnd : bottomStart) ?? all);

  return {
    cornerRadii: [topLeft, topRight, bottomRight, bottomLeft],
    cornerCurve: surfaceStyle.borderCurve === 'continuous' ? 'continuous' : 'circular',
    shadows: resolveCardShadows(surfaceStyle, includeLayerShadowProps),
    elevation: Math.max(0, surfaceStyle.elevation ?? 0),
    shadowColorArgb: parseColorToArgb(surfaceStyle.shadowColor, 0xff000000),
    viewStyle: {
      backgroundColor: surfaceStyle.backgroundColor,
      borderColor: surfaceStyle.borderColor,
      borderWidth: surfaceStyle.borderWidth,
      opacity: surfaceStyle.opacity,
    },
  };
}
