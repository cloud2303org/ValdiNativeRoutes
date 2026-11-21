import type { Element as SolidElement } from 'solid-js';
import type {
  AnimatedImage,
  BlurView,
  GlassView,
  ImageView,
  Label,
  Layout,
  ScrollViewInteractive,
  ShapeView,
  SpinnerView,
  TextAnimationGroup,
  TextFieldInteractive,
  TextViewInteractive,
  VideoView,
  View,
  WebViewElement,
} from 'valdi_tsx/src/NativeTemplateElements';
import type { ViewFactory } from 'valdi_tsx/src/ViewFactory';
import type { NativeElement } from './native-tree';

export type CSSLength = number | string;

export type SolidRef = NativeElement | ((el: NativeElement) => void) | ((el: NativeElement) => void)[];

export type SolidIntrinsic<T, AllowChildren extends boolean = true> = Omit<T, 'children' | 'ref'> & {
  ref?: SolidRef;
} & (AllowChildren extends true ? { children?: SolidElement } : { children?: never });

export type LayoutProps = SolidIntrinsic<Layout>;
export type ViewProps = SolidIntrinsic<View>;
export type ScrollProps = SolidIntrinsic<ScrollViewInteractive>;
export type LabelProps = SolidIntrinsic<Label, false>;
export type ImageProps = SolidIntrinsic<ImageView, false>;
export type VideoProps = SolidIntrinsic<VideoView, false>;
export type WebViewProps = SolidIntrinsic<WebViewElement, false>;
export type TextFieldProps = SolidIntrinsic<TextFieldInteractive, false>;
export type TextViewProps = SolidIntrinsic<TextViewInteractive, false>;
export type TextAnimationGroupProps = SolidIntrinsic<TextAnimationGroup>;
export type SpinnerProps = SolidIntrinsic<SpinnerView, false>;
export type ShapeProps = SolidIntrinsic<ShapeView, false>;
export type BlurProps = SolidIntrinsic<BlurView>;
export type GlassProps = SolidIntrinsic<GlassView>;
export type AnimatedImageProps = SolidIntrinsic<AnimatedImage, false>;

export type CustomViewProps = SolidIntrinsic<View> & {
  iosClass?: string;
  androidClass?: string;
  macosClass?: string;
  linuxClass?: string;
  viewFactory?: ViewFactory;
  [prop: string]: any;
};

declare global {
  namespace JSX {
    type Element = SolidElement;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicAttributes {
      ref?: SolidRef;
    }

    interface IntrinsicElements {
      layout: LayoutProps;
      view: ViewProps;
      scroll: ScrollProps;
      label: LabelProps;
      image: ImageProps;
      video: VideoProps;
      webview: WebViewProps;
      textfield: TextFieldProps;
      textview: TextViewProps;
      textanimationgroup: TextAnimationGroupProps;
      spinner: SpinnerProps;
      shape: ShapeProps;
      blur: BlurProps;
      glass: GlassProps;
      animatedimage: AnimatedImageProps;
      button: ViewProps;
      'custom-view': CustomViewProps;
    }
  }
}
