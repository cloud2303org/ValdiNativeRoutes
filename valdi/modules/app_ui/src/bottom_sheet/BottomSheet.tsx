import { createMemo, createRenderEffect, createSignal, onCleanup, Show, untrack } from 'solid-js';
import { isDevBuild } from 'valdi_core/src/BuildType';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';

import { type BottomSheetConfig, BottomSheetCornerCurve, BottomSheetDetentKind } from './BottomSheetHost';
import { resolveOptionalPortalRegistry } from './BottomSheetProvider';
import {
  ColorValue,
  Detent,
  isNormalizedDetentClosed,
  ModalDetent,
  NormalizedCardShadow,
  NormalizedDetent,
  normalizeDetents,
  parseColorToArgb,
  resolveSurfaceStyle,
  SurfaceStyle,
  validateIndex,
  validateSettleDuration,
} from './bottomSheetUtils';
import { crowdedInsetsWarning, resolveMaxWidth, resolvePlacement, type SheetPlacement } from './cardPlacement';

export type { SheetPlacement } from './cardPlacement';

/** Payload of {@link BottomSheetProps.onPositionChange}. */
export interface PositionChangeEventData {
  /** Current sheet height in points (0 when fully closed). */
  position: number;
  /**
   * Current position as a fractional index into `detents` — `0` at the
   * shortest detent, `1` at the next, and so on, interpolated linearly by
   * sheet height in between.
   */
  index: number;
}

/**
 * Event delivered to {@link BottomSheetProps.onPositionChange}.
 */
export interface PositionChangeEvent {
  readonly nativeEvent: PositionChangeEventData;
}

/**
 * How the sheet coordinates vertical gestures with scrollable views inside it:
 * - `'none'` — gestures on scrollable content never move the sheet.
 * - `'initial'` — ownership is decided once at gesture start from the scroll offset.
 * - `'handoff'` — ownership transfers mid-drag at detent/scroll boundaries.
 */
export type ScrollCoordinationMode = 'none' | 'initial' | 'handoff';

/**
 * Either a single {@link ScrollCoordinationMode} applied to both directions or
 * per-direction modes (`expand` defaults to `'handoff'`, `collapse` to `'initial'`).
 */
export type ScrollCoordination =
  | ScrollCoordinationMode
  | {
      expand?: ScrollCoordinationMode;
      collapse?: ScrollCoordinationMode;
    };

/** Props for {@link BottomSheet}. */
export interface BottomSheetProps {
  /** Snap heights available to the sheet, in ascending order. At least one entry is required. */
  detents: readonly Detent[];
  /** Controlled index into `detents` specifying the active snap point (`0` to `detents.length - 1`). */
  index: number;
  /**
   * Minimum gap in points kept between the top of the sheet card and the top
   * of its container. Defaults to the status bar's overlap with the container.
   */
  topInset?: number;
  /**
   * Maximum width of the sheet's column in points (side `insets` included).
   * Narrower containers still use their available width. Omit or pass `Infinity` for no cap.
   */
  maxWidth?: number;
  /**
   * Horizontal alignment when `maxWidth` makes the sheet narrower than its host.
   * `'start'` and `'end'` follow the current layout direction (LTR / RTL).
   * @default 'center'
   */
  placement?: SheetPlacement;
  /**
   * When `true`, the sheet animates from closed to its initial `index` on
   * first layout instead of appearing immediately at that position.
   * @default true
   */
  animateIn?: boolean;
  /**
   * When `true`, changes to the natural height of a `'content'` detent animate
   * with a spring instead of snapping immediately.
   * @default true
   */
  animateContentHeight?: boolean;
  /**
   * Defers mounting `children` until the sheet first opens (`index` points to a
   * non-closed detent), and unmounts them again once the sheet settles at a
   * closed detent (`0` or `'0%'`).
   * @default false
   */
  lazy?: boolean;
  /**
   * Fired when a user gesture commits to a new detent (or scrim dismissal snaps
   * the sheet closed). Not fired for programmatic `index` changes.
   */
  onIndexChange?: (index: number) => void;
  /** Fired once the settle animation to a detent finishes, for both gesture and programmatic snaps. */
  onSettle?: (index: number) => void;
  /** Fired continuously on every frame while the sheet moves (drag and settle). */
  onPositionChange?: (event: PositionChangeEvent) => void;
  /**
   * Fired when the user asks a modal sheet to close: by tapping the scrim,
   * activating the scrim's accessibility dismiss action, or pressing Android Back / Escape.
   * Supplying this handler intercepts automatic scrim dismissal so the caller controls `index`.
   */
  onCloseRequest?: () => void;
  /**
   * Hoists the sheet into a window-level overlay so it renders above native modals.
   * Works without `BottomSheetProvider`.
   * @default false
   */
  windowOverlay?: boolean;
  /** Backdrop color behind a modal sheet. @default 'rgba(0, 0, 0, 0.4)' */
  scrimColor?: ColorValue;
  /** Accessibility label announced for the scrim dismiss button. @default 'Dismiss' */
  scrimAccessibilityLabel?: string;
  /** Scroll gesture coordination strategy. @default { expand: 'handoff', collapse: 'initial' } */
  scrollCoordination?: ScrollCoordination;
  /**
   * Settle spring duration in milliseconds (`>= 0`).
   * Omit to use the pre-1.0 native default spring (`STIFFNESS_MEDIUM` on Android, `450` ms critical spring on iOS);
   * specify milliseconds to override with an exact-duration settle curve.
   */
  settleDuration?: number;
  /**
   * Custom render function for the sheet surface (e.g. blur view or custom card material),
   * replacing the default `#ffffff` surface.
   */
  surface?: () => JSX.Element;
  /** Card shape (corner radii / curve), shadows (`boxShadow`, `elevation`, `shadow*`), and surface colors. */
  surfaceStyle?: SurfaceStyle;
  /** Style applied to the sheet's content wrapper. */
  style?: Style<View> | Style<Layout> | View;
  children?: JSX.Element;
}

/** Internal props shared with `ModalBottomSheet`. */
export interface BottomSheetInternalProps extends Omit<BottomSheetProps, 'detents'> {
  detents: readonly ModalDetent[];
  modal?: boolean;
}

const DETENT_KIND_MAP: Record<NormalizedDetent['kind'], BottomSheetDetentKind> = {
  points: BottomSheetDetentKind.Points,
  percentage: BottomSheetDetentKind.Percentage,
  content: BottomSheetDetentKind.Content,
};

const SCROLL_COORDINATION_LEVEL: Record<ScrollCoordinationMode, number> = {
  none: 0,
  initial: 1,
  handoff: 2,
};

function resolveScrollCoordination(prop: ScrollCoordination | undefined): {
  expand: number;
  collapse: number;
} {
  if (prop === undefined) {
    return {
      expand: SCROLL_COORDINATION_LEVEL.handoff,
      collapse: SCROLL_COORDINATION_LEVEL.initial,
    };
  }
  if (typeof prop === 'string') {
    const level = SCROLL_COORDINATION_LEVEL[prop];
    return { expand: level, collapse: level };
  }
  return {
    expand: SCROLL_COORDINATION_LEVEL[prop.expand ?? 'handoff'],
    collapse: SCROLL_COORDINATION_LEVEL[prop.collapse ?? 'initial'],
  };
}

interface BottomSheetHostNodeProps {
  detents: NormalizedDetent[];
  resolvedMaxWidth: number;
  contentMaxWidth?: number;
  index: number;
  animateIn: boolean;
  animateContentHeight: boolean;
  modal: boolean;
  windowOverlay: boolean;
  openOrder: number;
  scrollExpandCoordination: number;
  scrollCollapseCoordination: number;
  settleDurationSeconds: number;
  hasCloseRequestHandler: boolean;
  scrimColorArgb: number;
  scrimAccessibilityLabel: string;
  surfaceCornerRadii: [number, number, number, number];
  surfaceCornerCurve: 'circular' | 'continuous';
  surfaceShadows: NormalizedCardShadow[];
  surfaceElevation: number;
  surfaceShadowColorArgb: number;
  defaultSurfaceStyle: {
    backgroundColor?: ColorValue;
    borderColor?: ColorValue;
    borderWidth?: number;
    opacity?: number;
  };
  surface?: () => JSX.Element;
  contentStyle?: Style<View> | Style<Layout> | View;
  shouldRenderChildren: boolean;
  onIndexChange?: (index: number) => void;
  onSettle: (index: number) => void;
  onPositionChange?: (event: PositionChangeEvent) => void;
  onCloseRequest?: () => void;
  children?: JSX.Element;
}

interface HostGeometryState {
  hasNativeGeometry: boolean;
  contentRegionWidth: number;
  contentRegionHeight: number;
  surfaceHeight: number;
  contentRegionInset: number;
}

function BottomSheetHostNode(props: BottomSheetHostNodeProps) {
  let hostWidth = 0;
  let lastCrowdedWarning: string | null = null;

  const [geometry, setGeometry] = createSignal<HostGeometryState>({
    hasNativeGeometry: false,
    contentRegionWidth: 0,
    contentRegionHeight: 0,
    surfaceHeight: 0,
    contentRegionInset: 0,
  });

  const warnAboutCrowdedInsets = (): void => {
    if (!isDevBuild()) {
      return;
    }
    const warning = crowdedInsetsWarning(props.detents, hostWidth, props.resolvedMaxWidth);
    if (warning !== null && warning !== lastCrowdedWarning) {
      console.warn(warning);
    }
    lastCrowdedWarning = warning;
  };

  createRenderEffect(
    () => ({ detents: props.detents, maxWidth: props.resolvedMaxWidth }),
    () => {
      if (hostWidth > 0) {
        warnAboutCrowdedInsets();
      }
    },
  );

  const handleNativeGeometry = (
    contentRegionWidth: number,
    contentRegionHeight: number,
    surfaceHeight: number,
    contentRegionInset: number,
    nextHostWidth = 0,
  ): void => {
    if (nextHostWidth > 0) {
      hostWidth = nextHostWidth;
    }
    warnAboutCrowdedInsets();
    const prev = geometry();
    if (
      prev.hasNativeGeometry &&
      Math.abs(prev.contentRegionWidth - contentRegionWidth) <= 0.01 &&
      Math.abs(prev.contentRegionHeight - contentRegionHeight) <= 0.01 &&
      Math.abs(prev.surfaceHeight - surfaceHeight) <= 0.01 &&
      Math.abs(prev.contentRegionInset - contentRegionInset) <= 0.01
    ) {
      return;
    }
    setGeometry({
      hasNativeGeometry: true,
      contentRegionWidth,
      contentRegionHeight,
      surfaceHeight,
      contentRegionInset,
    });
  };

  const handleNativeIndexChange = (index: number): void => {
    props.onIndexChange?.(index);
  };

  const handleNativeSettle = (index: number): void => {
    props.onSettle(index);
  };

  const handleNativePositionChange = (position: number, index: number): void => {
    props.onPositionChange?.({
      nativeEvent: { position, index },
    });
  };

  const handleNativeCloseRequest = (): void => {
    props.onCloseRequest?.();
  };

  const resolvedContentStyle = createMemo<Style<View> | undefined>(() => {
    const s = props.contentStyle;
    if (!s) {
      return undefined;
    }
    if (typeof (s as { toNative?: unknown }).toNative === 'function') {
      return s as Style<View>;
    }
    return new Style<View>(s as View);
  });

  const config = createMemo<BottomSheetConfig>(() => {
    const g = geometry();
    return {
      detents: props.detents.map(d => ({
        value: d.value,
        kind: DETENT_KIND_MAP[d.kind],
        programmatic: d.programmatic,
        usesStatusBarTopInset: d.usesStatusBarTopInset,
        insetTop: d.insetTop,
        insetLeft: d.insetLeft,
        insetRight: d.insetRight,
        insetBottom: d.insetBottom,
        widestCard: d.widestCard,
        maxWidth: d.maxWidth,
        placementBias: d.placementBias,
        scrimOpacity: d.scrimOpacity,
      })),
      detentIndex: props.index,
      animateIn: props.animateIn,
      animateContentHeight: props.animateContentHeight,
      modal: props.modal,
      windowOverlay: props.windowOverlay,
      openOrder: props.openOrder,
      scrollExpandCoordination: props.scrollExpandCoordination,
      scrollCollapseCoordination: props.scrollCollapseCoordination,
      settleDuration: props.settleDurationSeconds,
      hasCloseRequestHandler: props.hasCloseRequestHandler,
      scrimColorArgb: props.scrimColorArgb,
      scrimAccessibilityLabel: props.scrimAccessibilityLabel,
      surfaceCornerRadii: [...props.surfaceCornerRadii],
      surfaceCornerCurve:
        props.surfaceCornerCurve === 'continuous'
          ? BottomSheetCornerCurve.Continuous
          : BottomSheetCornerCurve.Circular,
      surfaceShadows: props.surfaceShadows.map(s => ({
        offsetX: s.offsetX,
        offsetY: s.offsetY,
        blurRadius: s.blurRadius,
        spreadDistance: s.spreadDistance,
        colorArgb: s.colorArgb,
        opacity: s.opacity,
        excludesInterior: s.excludesInterior,
      })),
      surfaceElevation: props.surfaceElevation,
      surfaceShadowColorArgb: props.surfaceShadowColorArgb,
      ...(g.hasNativeGeometry ? { committedContentRegionInset: g.contentRegionInset } : {}),
    };
  });

  return (
    <custom-view
      iosClass="VRBottomSheetView"
      androidClass="io.valdiroutes.app.BottomSheetView"
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
      config={config()}
      onNativeGeometry={handleNativeGeometry}
      onNativeIndexChange={handleNativeIndexChange}
      onNativeSettle={handleNativeSettle}
      onNativePositionChange={props.onPositionChange ? handleNativePositionChange : undefined}
      onNativeCloseRequest={handleNativeCloseRequest}
    >
      <custom-view
        iosClass="VRBottomSheetSurfaceView"
        androidClass="io.valdiroutes.app.BottomSheetSurfaceView"
        position="absolute"
        top={0}
        left={geometry().hasNativeGeometry ? geometry().contentRegionInset : 0}
        width={geometry().hasNativeGeometry ? geometry().contentRegionWidth : '100%'}
        maxWidth={geometry().hasNativeGeometry ? undefined : props.contentMaxWidth}
        height={geometry().hasNativeGeometry ? geometry().surfaceHeight : '100%'}
      >
        <Show
          when={props.surface}
          fallback={
            <view
              flexGrow={1}
              backgroundColor={props.defaultSurfaceStyle.backgroundColor ?? '#ffffff'}
              borderColor={props.defaultSurfaceStyle.borderColor}
              borderWidth={props.defaultSurfaceStyle.borderWidth}
              opacity={props.defaultSurfaceStyle.opacity}
            />
          }
        >
          {surfaceFn => surfaceFn()()}
        </Show>
      </custom-view>
      <custom-view
        iosClass="VRBottomSheetContentWrapperView"
        androidClass="io.valdiroutes.app.BottomSheetContentWrapperView"
        marginLeft={geometry().hasNativeGeometry ? geometry().contentRegionInset : 0}
        width={geometry().hasNativeGeometry ? geometry().contentRegionWidth : '100%'}
        maxWidth={geometry().hasNativeGeometry ? undefined : props.contentMaxWidth}
        height={geometry().hasNativeGeometry ? geometry().contentRegionHeight : '100%'}
        flexShrink={0}
        style={resolvedContentStyle()}
      >
        <Show when={props.shouldRenderChildren}>{props.children}</Show>
        <custom-view
          iosClass="VRBottomSheetMarkerView"
          androidClass="io.valdiroutes.app.BottomSheetMarkerView"
          height={0}
          flexShrink={0}
        />
      </custom-view>
    </custom-view>
  );
}

let nextSheetInstanceId = 0;
let fallbackOverlayOpenOrderCounter = 0;

/**
 * Non-modal bottom sheet component aligned 1:1 with `@swmansion/react-native-bottom-sheet` v1.1.0.
 *
 * Renders inline inside its parent container while interactions pass through to sibling views above the sheet card.
 * For modal presentation with backdrop scrim, accessibility isolation, and dismissal gestures, use `ModalBottomSheet`.
 */
export function BottomSheetBase(props: BottomSheetInternalProps) {
  const portalKey = `bottom-sheet-portal-${++nextSheetInstanceId}`;
  const portalRegistry = resolveOptionalPortalRegistry();

  const modal = () => props.modal ?? false;
  const windowOverlay = () => props.windowOverlay ?? false;

  const usesPortal = createMemo(() => {
    const portal = modal() && !windowOverlay();
    if (portal && !portalRegistry) {
      throw new Error('ModalBottomSheet must be used inside BottomSheetProvider, or pass windowOverlay={true}.');
    }
    return portal;
  });

  const resolvedMaxWidth = createMemo(() => resolveMaxWidth(props.maxWidth));

  const normalizedDetents = createMemo(() => {
    const isRTL = Device.isRTL();
    return normalizeDetents(props.detents, isRTL, props.topInset, {
      maxWidth: resolvedMaxWidth(),
      placementBias: resolvePlacement(props.placement, isRTL),
    });
  });

  const validatedIndex = createMemo(() => {
    const detents = normalizedDetents();
    validateIndex(props.index, detents.length, modal());
    validateSettleDuration(props.settleDuration);
    return props.index;
  });

  const isClosedAt = (index: number): boolean => {
    const detent = normalizedDetents()[index];
    return index < 0 || (detent !== undefined && isNormalizedDetentClosed(detent));
  };

  const isClosedTarget = createMemo(() => isClosedAt(validatedIndex()));

  let wasClosed = true;
  let currentOpenOrder = 0;
  const openOrder = createMemo(() => {
    const closed = isClosedTarget();
    if (wasClosed && !closed) {
      currentOpenOrder = portalRegistry ? portalRegistry.nextOpenOrder() : ++fallbackOverlayOpenOrderCounter;
    }
    wasClosed = closed;
    return currentOpenOrder;
  });

  let openGeneration = 0;
  let settledGeneration = 0;
  const [closedGeneration, setClosedGeneration] = createSignal(0);
  const activeGeneration = createMemo(() => {
    if (!isClosedTarget() && openGeneration === settledGeneration) {
      openGeneration += 1;
    }
    return openGeneration;
  });

  const shouldRenderChildren = createMemo(() => {
    const generation = activeGeneration();
    if (!(props.lazy ?? false)) {
      return true;
    }
    if (!isClosedTarget()) {
      return true;
    }
    return generation > closedGeneration();
  });

  const handleSettle = (settledIndex: number): void => {
    if (props.lazy && settledIndex === validatedIndex() && isClosedAt(settledIndex)) {
      settledGeneration = openGeneration;
      setClosedGeneration(settledGeneration);
    }
    props.onSettle?.(settledIndex);
  };

  const scrollCoord = createMemo(() => resolveScrollCoordination(props.scrollCoordination));
  const resolvedSurface = createMemo(() => resolveSurfaceStyle(props.surfaceStyle, Device.isRTL(), Device.isIOS()));
  const scrimColorArgb = createMemo(() => {
    const isModal = modal();
    const resolvedScrimColor = props.scrimColor ?? (isModal ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)');
    return parseColorToArgb(resolvedScrimColor, isModal ? 0x66000000 : 0x00000000);
  });
  const contentMaxWidth = createMemo(() => {
    const widestDetent = normalizedDetents().find(detent => detent.widestCard);
    const contentLeft = widestDetent?.insetLeft ?? 0;
    const contentRight = widestDetent?.insetRight ?? 0;
    const maxW = resolvedMaxWidth();
    return maxW > 0 ? Math.max(0, maxW - contentLeft - contentRight) : undefined;
  });

  // Eagerly validate portal requirements and initial index/detents synchronously during mount.
  usesPortal();
  validatedIndex();

  const renderHostNode = (): JSX.Element => (
    <BottomSheetHostNode
      detents={normalizedDetents()}
      resolvedMaxWidth={resolvedMaxWidth()}
      contentMaxWidth={contentMaxWidth()}
      index={validatedIndex()}
      animateIn={props.animateIn ?? true}
      animateContentHeight={props.animateContentHeight ?? true}
      modal={modal()}
      windowOverlay={windowOverlay()}
      openOrder={openOrder()}
      scrollExpandCoordination={scrollCoord().expand}
      scrollCollapseCoordination={scrollCoord().collapse}
      settleDurationSeconds={props.settleDuration !== undefined ? props.settleDuration / 1000 : 0}
      hasCloseRequestHandler={props.onCloseRequest !== undefined}
      scrimColorArgb={scrimColorArgb()}
      scrimAccessibilityLabel={props.scrimAccessibilityLabel ?? 'Dismiss'}
      surfaceCornerRadii={resolvedSurface().cornerRadii}
      surfaceCornerCurve={resolvedSurface().cornerCurve}
      surfaceShadows={resolvedSurface().shadows}
      surfaceElevation={resolvedSurface().elevation}
      surfaceShadowColorArgb={resolvedSurface().shadowColorArgb}
      defaultSurfaceStyle={resolvedSurface().viewStyle}
      surface={props.surface}
      contentStyle={props.style}
      shouldRenderChildren={shouldRenderChildren()}
      onIndexChange={props.onIndexChange}
      onSettle={handleSettle}
      onPositionChange={props.onPositionChange}
      onCloseRequest={props.onCloseRequest}
    >
      {props.children}
    </BottomSheetHostNode>
  );

  // Create the portal host node inside its own memo owner (keyed solely on usesPortal)
  // so openOrder changes never dispose and recreate BottomSheetHostNode.
  const portalHostElement = createMemo<JSX.Element | undefined>(() =>
    usesPortal() ? untrack(renderHostNode) : undefined,
  );

  createRenderEffect(
    () => ({ portal: usesPortal(), order: openOrder(), el: portalHostElement() }),
    ({ portal, order, el }) => {
      if (portal && portalRegistry && el !== undefined) {
        portalRegistry.upsert(portalKey, el, order);
      } else {
        portalRegistry?.unmount(portalKey);
      }
    },
  );

  onCleanup(() => {
    portalRegistry?.unmount(portalKey);
  });

  return <Show when={!usesPortal()}>{renderHostNode()}</Show>;
}

/**
 * Non-modal bottom sheet component aligned 1:1 with `@swmansion/react-native-bottom-sheet` v1.1.0.
 *
 * Renders inline inside its parent container while interactions pass through to sibling views above the sheet card.
 * For modal presentation with backdrop scrim, accessibility isolation, and dismissal gestures, use `ModalBottomSheet`.
 */
export function BottomSheet(props: BottomSheetProps) {
  return <BottomSheetBase {...(props as unknown as BottomSheetInternalProps)}>{props.children}</BottomSheetBase>;
}
