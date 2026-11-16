import { AnyRenderFunction } from 'valdi_core/src/AnyRenderFunction';
import { Component, StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';

import { BottomSheetPortalRegistry, resolveOptionalPortalRegistry } from './BottomSheetProvider';
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
  /** Settle spring duration in milliseconds (`>= 0`). Defaults to `450` ms. */
  settleDuration?: number;
  /**
   * Custom render function for the sheet surface (e.g. blur view or custom card material),
   * replacing the default `#ffffff` surface.
   */
  surface?: AnyRenderFunction;
  /** Card shape (corner radii / curve), shadows (`boxShadow`, `elevation`, `shadow*`), and surface colors. */
  surfaceStyle?: SurfaceStyle;
  /** Style applied to the sheet's content wrapper. */
  style?: Style<View> | Style<Layout> | View;
  children?: unknown;
}

/** Internal props shared with `ModalBottomSheet`. */
export interface BottomSheetInternalProps extends Omit<BottomSheetProps, 'detents'> {
  detents: readonly ModalDetent[];
  modal?: boolean;
}

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
  surface?: AnyRenderFunction;
  contentStyle?: Style<View> | Style<Layout> | View;
  shouldRenderChildren: boolean;
  onIndexChange?: (index: number) => void;
  onSettle: (index: number) => void;
  onPositionChange?: (event: PositionChangeEvent) => void;
  onCloseRequest?: () => void;
  children?: unknown;
}

interface HostGeometryState {
  hasNativeGeometry: boolean;
  contentRegionWidth: number;
  contentRegionHeight: number;
  surfaceHeight: number;
  contentRegionInset: number;
}

class BottomSheetHostNode extends StatefulComponent<BottomSheetHostNodeProps, HostGeometryState> {
  state: HostGeometryState = {
    hasNativeGeometry: false,
    contentRegionWidth: 0,
    contentRegionHeight: 0,
    surfaceHeight: 0,
    contentRegionInset: 0,
  };

  private readonly handleNativeGeometry = (
    contentRegionWidth: number,
    contentRegionHeight: number,
    surfaceHeight: number,
    contentRegionInset: number,
  ): void => {
    const prev = this.state;
    if (
      prev.hasNativeGeometry &&
      Math.abs(prev.contentRegionWidth - contentRegionWidth) <= 0.01 &&
      Math.abs(prev.contentRegionHeight - contentRegionHeight) <= 0.01 &&
      Math.abs(prev.surfaceHeight - surfaceHeight) <= 0.01 &&
      Math.abs(prev.contentRegionInset - contentRegionInset) <= 0.01
    ) {
      return;
    }
    this.setState({
      hasNativeGeometry: true,
      contentRegionWidth,
      contentRegionHeight,
      surfaceHeight,
      contentRegionInset,
    });
  };

  private readonly handleNativeIndexChange = (index: number): void => {
    this.viewModel.onIndexChange?.(index);
  };

  private readonly handleNativeSettle = (index: number): void => {
    this.viewModel.onSettle(index);
  };

  private readonly handleNativePositionChange = (position: number, index: number): void => {
    this.viewModel.onPositionChange?.({
      nativeEvent: { position, index },
    });
  };

  private readonly handleNativeCloseRequest = (): void => {
    this.viewModel.onCloseRequest?.();
  };

  override onRender(): void {
    const vm = this.viewModel;
    const { hasNativeGeometry, contentRegionWidth, contentRegionHeight, surfaceHeight, contentRegionInset } =
      this.state;

    const regionWidth: number | `${number}%` = hasNativeGeometry ? contentRegionWidth : '100%';
    const regionHeight: number | `${number}%` = hasNativeGeometry ? contentRegionHeight : '100%';
    const resolvedSurfaceHeight: number | `${number}%` = hasNativeGeometry ? surfaceHeight : '100%';

    <custom-view
      iosClass="VRBottomSheetView"
      androidClass="io.valdiroutes.app.BottomSheetView"
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
      detents={vm.detents}
      detentIndex={vm.index}
      animateIn={vm.animateIn}
      animateContentHeight={vm.animateContentHeight}
      modal={vm.modal}
      windowOverlay={vm.windowOverlay}
      openOrder={vm.openOrder}
      scrollExpandCoordination={vm.scrollExpandCoordination}
      scrollCollapseCoordination={vm.scrollCollapseCoordination}
      settleDuration={vm.settleDurationSeconds}
      hasCloseRequestHandler={vm.hasCloseRequestHandler}
      scrimColorArgb={vm.scrimColorArgb}
      scrimAccessibilityLabel={vm.scrimAccessibilityLabel}
      surfaceCornerRadii={vm.surfaceCornerRadii}
      surfaceCornerCurve={vm.surfaceCornerCurve}
      surfaceShadows={vm.surfaceShadows}
      surfaceElevation={vm.surfaceElevation}
      surfaceShadowColorArgb={vm.surfaceShadowColorArgb}
      committedContentRegionInset={hasNativeGeometry ? contentRegionInset : undefined}
      onNativeGeometry={this.handleNativeGeometry}
      onNativeIndexChange={this.handleNativeIndexChange}
      onNativeSettle={this.handleNativeSettle}
      onNativePositionChange={vm.onPositionChange ? this.handleNativePositionChange : undefined}
      onNativeCloseRequest={this.handleNativeCloseRequest}
    >
      <custom-view
        iosClass="VRBottomSheetSurfaceView"
        androidClass="io.valdiroutes.app.BottomSheetSurfaceView"
        position="absolute"
        top={0}
        left={hasNativeGeometry ? contentRegionInset : 0}
        width={regionWidth}
        height={resolvedSurfaceHeight}
      >
        {vm.surface ? (
          vm.surface()
        ) : (
          <view
            flexGrow={1}
            backgroundColor={vm.defaultSurfaceStyle.backgroundColor ?? '#ffffff'}
            borderColor={vm.defaultSurfaceStyle.borderColor}
            borderWidth={vm.defaultSurfaceStyle.borderWidth}
            opacity={vm.defaultSurfaceStyle.opacity}
          />
        )}
      </custom-view>
      <custom-view
        iosClass="VRBottomSheetContentWrapperView"
        androidClass="io.valdiroutes.app.BottomSheetContentWrapperView"
        marginLeft={hasNativeGeometry ? contentRegionInset : 0}
        width={regionWidth}
        height={regionHeight}
        flexShrink={0}
        style={vm.contentStyle as Style<Layout> | undefined}
      >
        {vm.shouldRenderChildren && <slot />}
        <custom-view
          iosClass="VRBottomSheetMarkerView"
          androidClass="io.valdiroutes.app.BottomSheetMarkerView"
          height={0}
          flexShrink={0}
        />
      </custom-view>
    </custom-view>;
  }
}

interface BottomSheetState {
  lazyMounted: boolean;
  openOrder: number;
}

let nextSheetInstanceId = 0;
let fallbackOverlayOpenOrderCounter = 0;

/**
 * Non-modal bottom sheet component aligned 1:1 with `@swmansion/react-native-bottom-sheet` v1.0.0.
 *
 * Renders inline inside its parent container while interactions pass through to sibling views above the sheet card.
 * For modal presentation with backdrop scrim, accessibility isolation, and dismissal gestures, use `ModalBottomSheet`.
 */
export class BottomSheet extends StatefulComponent<BottomSheetProps, BottomSheetState> {
  private readonly portalKey = `bottom-sheet-portal-${++nextSheetInstanceId}`;
  private readonly portalSlot = new DetachedSlot();
  private portalRegistry?: BottomSheetPortalRegistry;
  private normalizedDetents: NormalizedDetent[] = [];
  private wasClosed = true;
  private isRegisteredInPortal = false;

  state: BottomSheetState = {
    lazyMounted: true,
    openOrder: 0,
  };

  private get internalProps(): BottomSheetInternalProps {
    return this.viewModel as BottomSheetInternalProps;
  }

  private allocateOpenOrder(): number {
    if (this.portalRegistry) {
      return this.portalRegistry.nextOpenOrder();
    }
    return ++fallbackOverlayOpenOrderCounter;
  }

  private isClosedAt(index: number): boolean {
    const detent = this.normalizedDetents[index];
    return index < 0 || (detent !== undefined && isNormalizedDetentClosed(detent));
  }

  private syncProps(isInitial: boolean): void {
    const props = this.internalProps;
    const modal = props.modal ?? false;
    const windowOverlay = props.windowOverlay ?? false;
    if (modal && !windowOverlay && !this.portalRegistry) {
      throw new Error('ModalBottomSheet must be used inside BottomSheetProvider, or pass windowOverlay={true}.');
    }

    this.normalizedDetents = normalizeDetents(props.detents, Device.isRTL(), props.topInset);
    validateIndex(props.index, this.normalizedDetents.length, modal);
    validateSettleDuration(props.settleDuration);

    const isClosedTarget = this.isClosedAt(props.index);
    const lazy = props.lazy ?? false;

    if (isInitial) {
      const openOrder = !isClosedTarget ? this.allocateOpenOrder() : 0;
      this.wasClosed = isClosedTarget;
      this.state = {
        lazyMounted: !lazy || !isClosedTarget,
        openOrder,
      };
      this.syncPortalRegistration(modal && !windowOverlay, openOrder);
      return;
    }

    const nextOpenOrder = this.wasClosed && !isClosedTarget ? this.allocateOpenOrder() : this.state.openOrder;
    this.wasClosed = isClosedTarget;
    const nextLazyMounted = !lazy || !isClosedTarget || this.state.lazyMounted;

    if (nextOpenOrder !== this.state.openOrder || nextLazyMounted !== this.state.lazyMounted) {
      this.setState({
        openOrder: nextOpenOrder,
        lazyMounted: nextLazyMounted,
      });
    }
    this.syncPortalRegistration(modal && !windowOverlay, nextOpenOrder);
  }

  override onCreate(): void {
    this.portalRegistry = resolveOptionalPortalRegistry();
    this.syncProps(true);
  }

  override onViewModelUpdate(previousViewModel?: BottomSheetProps): void {
    if (previousViewModel) {
      this.syncProps(false);
    }
  }

  override onDestroy(): void {
    if (this.isRegisteredInPortal) {
      this.portalRegistry?.unmount(this.portalKey);
      this.isRegisteredInPortal = false;
    }
  }

  private syncPortalRegistration(usesPortal: boolean, openOrder: number): void {
    if (usesPortal && this.portalRegistry) {
      this.portalRegistry.upsert(this.portalKey, this.portalSlot, openOrder);
      this.isRegisteredInPortal = true;
    } else if (this.isRegisteredInPortal) {
      this.portalRegistry?.unmount(this.portalKey);
      this.isRegisteredInPortal = false;
    }
  }

  private readonly handleSettle = (settledIndex: number): void => {
    const props = this.internalProps;
    if (props.lazy && settledIndex === props.index && this.isClosedAt(settledIndex) && this.state.lazyMounted) {
      this.setState({ lazyMounted: false });
    }
    props.onSettle?.(settledIndex);
  };

  override onRender(): void {
    const props = this.internalProps;
    const modal = props.modal ?? false;
    const windowOverlay = props.windowOverlay ?? false;
    const usesPortal = modal && !windowOverlay;

    const shouldRenderChildren = !(props.lazy ?? false) || !this.isClosedAt(props.index) || this.state.lazyMounted;
    const { expand, collapse } = resolveScrollCoordination(props.scrollCoordination);
    const resolvedSurface = resolveSurfaceStyle(props.surfaceStyle, Device.isRTL(), Device.isIOS());
    const resolvedScrimColor = props.scrimColor ?? (modal ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)');
    const scrimColorArgb = parseColorToArgb(resolvedScrimColor, modal ? 0x66000000 : 0x00000000);

    const renderHostNode = (): void => {
      <BottomSheetHostNode
        detents={this.normalizedDetents}
        index={props.index}
        animateIn={props.animateIn ?? true}
        animateContentHeight={props.animateContentHeight ?? true}
        modal={modal}
        windowOverlay={windowOverlay}
        openOrder={this.state.openOrder}
        scrollExpandCoordination={expand}
        scrollCollapseCoordination={collapse}
        settleDurationSeconds={props.settleDuration !== undefined ? props.settleDuration / 1000 : 0}
        hasCloseRequestHandler={props.onCloseRequest !== undefined}
        scrimColorArgb={scrimColorArgb}
        scrimAccessibilityLabel={props.scrimAccessibilityLabel ?? 'Dismiss'}
        surfaceCornerRadii={resolvedSurface.cornerRadii}
        surfaceCornerCurve={resolvedSurface.cornerCurve}
        surfaceShadows={resolvedSurface.shadows}
        surfaceElevation={resolvedSurface.elevation}
        surfaceShadowColorArgb={resolvedSurface.shadowColorArgb}
        defaultSurfaceStyle={resolvedSurface.viewStyle}
        surface={props.surface}
        contentStyle={props.style}
        shouldRenderChildren={shouldRenderChildren}
        onIndexChange={props.onIndexChange}
        onSettle={this.handleSettle}
        onPositionChange={props.onPositionChange}
        onCloseRequest={props.onCloseRequest}
      >
        <slot />
      </BottomSheetHostNode>;
    };

    if (usesPortal) {
      this.portalSlot.slotted(renderHostNode);
      return;
    }

    renderHostNode();
  }
}
