import type { Element as SolidElement } from 'solid-js';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { ScrollEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { NativeElement } from './native-tree';

export type CSSLength = number | string;

export interface LayoutProps {
  width?: CSSLength;
  height?: CSSLength;
  minWidth?: CSSLength;
  maxWidth?: CSSLength;
  minHeight?: CSSLength;
  maxHeight?: CSSLength;
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: CSSLength;
  flexDirection?: 'column' | 'column-reverse' | 'row' | 'row-reverse';
  flexWrap?: 'no-wrap' | 'wrap' | 'wrap-reverse';
  alignItems?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  alignContent?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'space-between' | 'space-around';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  position?: 'relative' | 'absolute';
  top?: CSSLength;
  right?: CSSLength;
  bottom?: CSSLength;
  left?: CSSLength;
  margin?: CSSLength;
  marginTop?: CSSLength;
  marginRight?: CSSLength;
  marginBottom?: CSSLength;
  marginLeft?: CSSLength;
  padding?: CSSLength;
  paddingTop?: CSSLength;
  paddingRight?: CSSLength;
  paddingBottom?: CSSLength;
  paddingLeft?: CSSLength;
  zIndex?: number;
  accessibilityId?: string;
  accessibilityLabel?: string;
  onLayout?: (frame: ElementFrame) => void;
  ref?: ((el: NativeElement) => void) | ((el: NativeElement) => void)[];
  children?: SolidElement;
}

export interface ViewProps extends LayoutProps {
  backgroundColor?: string;
  opacity?: number;
  borderRadius?: CSSLength | string;
  borderWidth?: number;
  borderColor?: string;
  boxShadow?: string;
  touchEnabled?: boolean;
  onTap?: (event: TouchEvent) => void;
  onTouchStart?: (event: TouchEvent) => void;
  onTouchEnd?: (event: TouchEvent) => void;
  [prop: string]: any;
}

export interface LabelProps extends Omit<ViewProps, 'children'> {
  value?: string;
  color?: string;
  font?: string;
  textAlign?: 'left' | 'right' | 'center' | 'justified';
  numberOfLines?: number;
  textDecoration?: 'none' | 'strikethrough' | 'underline';
  children?: never;
}

export interface ScrollProps extends ViewProps {
  horizontal?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  bounces?: boolean;
  onScroll?: (event: ScrollEvent) => void;
}

export interface ImageProps extends Omit<ViewProps, 'children'> {
  src?: string | Asset;
  objectFit?: 'fill' | 'contain' | 'cover' | 'none';
  tint?: string;
  children?: never;
}

export interface TextFieldProps extends Omit<ViewProps, 'children'> {
  value?: string;
  placeholder?: string;
  placeholderColor?: string;
  color?: string;
  font?: string;
  onChange?: (event: { text: string }) => void;
  children?: never;
}

declare global {
  namespace JSX {
    type Element = SolidElement;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicAttributes {
      ref?: ((el: NativeElement) => void) | ((el: NativeElement) => void)[];
    }

    interface IntrinsicElements {
      layout: LayoutProps;
      view: ViewProps;
      label: LabelProps;
      scroll: ScrollProps;
      image: ImageProps;
      textfield: TextFieldProps;
      textview: TextFieldProps;
      spinner: ViewProps;
      shape: ViewProps;
      button: ViewProps;
      blur: ViewProps;
      glass: ViewProps;
    }
  }
}
