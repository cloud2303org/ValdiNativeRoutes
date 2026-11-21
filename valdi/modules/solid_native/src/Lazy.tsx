import { createSignal, Show, type Element as SolidElement } from 'solid-js';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { EventTime } from 'valdi_tsx/src/GestureEvents';
import type { Layout } from 'valdi_tsx/src/NativeTemplateElements';
import type { SolidRef } from './jsx';

type LazyLayoutKeys =
  | 'width'
  | 'height'
  | 'minWidth'
  | 'minHeight'
  | 'maxWidth'
  | 'maxHeight'
  | 'flexGrow'
  | 'flexShrink'
  | 'flexBasis'
  | 'flexDirection'
  | 'alignItems'
  | 'alignSelf'
  | 'justifyContent'
  | 'margin'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'position'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'zIndex'
  | 'style'
  | 'id'
  | 'accessibilityLabel';

export interface LazyProps extends Pick<Layout, LazyLayoutKeys> {
  estimatedWidth?: number;
  estimatedHeight?: number;
  lazyLayout?: boolean;
  /** Unmount subtree when scrolled out of viewport + buffer while preserving last measured size (default: true). */
  unmountWhenHidden?: boolean;
  fallback?: SolidElement;
  onVisibilityChanged?: (isVisible: boolean, eventTime: EventTime) => void;
  onLayout?: (frame: ElementFrame) => void;
  ref?: SolidRef;
  children?: SolidElement;
}

/**
 * Defers mounting of offscreen children until the container enters the viewport
 * (including any scroll `viewportExtension*`), optionally unmounting them when hidden
 * while preserving measured dimensions to avoid scroll jumps.
 */
export function Lazy(props: LazyProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [wasEverVisible, setWasEverVisible] = createSignal(false);
  const [placeholderHeight, setPlaceholderHeight] = createSignal<number | undefined>(undefined);
  const [placeholderWidth, setPlaceholderWidth] = createSignal<number | undefined>(undefined);

  // Plain variables avoid extra bridge writes on every layout pass while children stay mounted.
  let lastMeasuredHeight: number | undefined;
  let lastMeasuredWidth: number | undefined;

  const shouldUnmount = () => props.unmountWhenHidden !== false;
  const shouldRender = () => (shouldUnmount() ? visible() : wasEverVisible());

  const effectiveEstimatedHeight = () =>
    props.height === undefined ? (placeholderHeight() ?? props.estimatedHeight) : props.estimatedHeight;

  const effectiveEstimatedWidth = () =>
    props.width === undefined && props.estimatedWidth !== undefined
      ? (placeholderWidth() ?? props.estimatedWidth)
      : props.estimatedWidth;

  const effectiveLazyLayout = () =>
    props.lazyLayout ?? (effectiveEstimatedWidth() === undefined && effectiveEstimatedHeight() === undefined);

  const handleVisibilityChanged = (isVisible: boolean, eventTime: EventTime) => {
    if (isVisible) {
      setWasEverVisible(true);
      setVisible(true);
    } else if (shouldUnmount()) {
      if (props.height === undefined && lastMeasuredHeight !== undefined && lastMeasuredHeight > 0) {
        setPlaceholderHeight(lastMeasuredHeight);
      }
      if (
        props.width === undefined &&
        props.estimatedWidth !== undefined &&
        lastMeasuredWidth !== undefined &&
        lastMeasuredWidth > 0
      ) {
        setPlaceholderWidth(lastMeasuredWidth);
      }
      setVisible(false);
    }
    props.onVisibilityChanged?.(isVisible, eventTime);
  };

  const handleLayout = (frame: ElementFrame) => {
    if (shouldRender()) {
      if (frame.height > 0) lastMeasuredHeight = frame.height;
      if (frame.width > 0) lastMeasuredWidth = frame.width;
    }
    props.onLayout?.(frame);
  };

  return (
    <layout
      width={props.width}
      height={props.height}
      minWidth={props.minWidth}
      minHeight={props.minHeight}
      maxWidth={props.maxWidth}
      maxHeight={props.maxHeight}
      flexGrow={props.flexGrow}
      flexShrink={props.flexShrink}
      flexBasis={props.flexBasis}
      flexDirection={props.flexDirection}
      alignItems={props.alignItems}
      alignSelf={props.alignSelf}
      justifyContent={props.justifyContent}
      margin={props.margin}
      marginTop={props.marginTop}
      marginRight={props.marginRight}
      marginBottom={props.marginBottom}
      marginLeft={props.marginLeft}
      position={props.position}
      top={props.top}
      right={props.right}
      bottom={props.bottom}
      left={props.left}
      zIndex={props.zIndex}
      style={props.style}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
      estimatedWidth={effectiveEstimatedWidth()}
      estimatedHeight={effectiveEstimatedHeight()}
      lazyLayout={effectiveLazyLayout()}
      onVisibilityChanged={handleVisibilityChanged}
      onLayout={handleLayout}
      ref={props.ref}
    >
      <Show when={shouldRender()} fallback={props.fallback}>
        {props.children}
      </Show>
    </layout>
  );
}
