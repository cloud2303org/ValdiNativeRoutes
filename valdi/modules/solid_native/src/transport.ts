import type { AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { withLocalNativeRefs } from 'valdi_core/src/NativeReferences';
import type { NativeFrameObserver, NativeVisibilityObserver } from 'valdi_core/src/RenderRequest';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import { getValdiRuntime } from 'valdi_core/src/ValdiRuntimeProvider';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { IStyle } from 'valdi_tsx/src/IStyle';
import type { NativeNode } from 'valdi_tsx/src/NativeNode';
import type { NativeView } from 'valdi_tsx/src/NativeView';
import type { PropertyList } from 'valdi_tsx/src/PropertyList';

export type TransportMode = 'compat' | 'native-solid';

export const enum EntryOpcode {
  CREATE_ELEMENT = 1,
  DESTROY_ELEMENT = 2,
  SET_ROOT_ELEMENT = 3,
  MOVE_ELEMENT_TO_PARENT = 4,
  SET_ATTRIBUTE_UNDEFINED = 5,
  SET_ATTRIBUTE_NULL = 6,
  SET_ATTRIBUTE_FALSE = 7,
  SET_ATTRIBUTE_TRUE = 8,
  SET_ATTRIBUTE_INT = 9,
  SET_ATTRIBUTE_DOUBLE = 10,
  SET_ATTRIBUTE_ARRAY = 11,
  SET_ATTRIBUTE_STYLE = 12,
  SET_ATTRIBUTE_ATTACHED_VALUE = 13,
  BEGIN_ANIMATIONS = 14,
  END_ANIMATIONS = 15,
  ON_LAYOUT_COMPLETE = 16,
  CANCEL_ANIMATION = 17,
  ON_NEXT_DRAW = 18,
  DETACH_ELEMENT = 19,
  INSERT_ELEMENT_BEFORE = 20,
}

export interface BatchStats {
  mode: TransportMode;
  batches: number;
  totalOps: number;
  lastBatchOps: number;
}

export interface NativeSink {
  readonly mode: TransportMode;
  readonly stats: BatchStats;
  getPlatform?(): number;
  run<T>(action: () => T): T;
  begin(): void;
  end(): void;
  create(id: number, tag: string): void;
  setRoot(id: number): void;
  move(id: number, parentId: number, index: number): void;
  insertBefore?(id: number, parentId: number, anchorId: number): void;
  detach(id: number): void;
  destroy(id: number): void;
  set(id: number, name: string, value: unknown): void;
  beginAnimation?(options: AnimationOptions, cancelToken: number): void;
  endAnimation?(): void;
  cancelAnimation?(cancelToken: number): void;
  onLayoutComplete?(callback: () => void): void;
  onNextDraw(callback: () => void): void;
  observeFrames?(callback: NativeFrameObserver): void;
  observeVisibility?(callback: NativeVisibilityObserver): void;
  getFrame?(id: number, callback: (frame: ElementFrame | undefined) => void): void;
  getNativeView?(id: number, callback: (view: NativeView | undefined) => void): void;
  getNativeNode?(id: number): NativeNode | undefined;
  takeSnapshot?(id: number, callback: (snapshotBase64: string | undefined) => void): void;
  dispose(): void;
}

class CommandBuffer {
  private view: DataView;
  private pos = 0;

  constructor(initialCapacity = 512) {
    this.view = new DataView(new ArrayBuffer(initialCapacity));
  }

  get byteLength(): number {
    return this.pos;
  }

  get buffer(): ArrayBuffer {
    return this.view.buffer as ArrayBuffer;
  }

  rewind(): void {
    this.pos = 0;
  }

  private ensure(extra: number): void {
    const needed = this.pos + extra;
    if (needed <= this.view.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.view.byteLength * 2, needed));
    new Uint8Array(next).set(new Uint8Array(this.view.buffer, 0, this.pos));
    this.view = new DataView(next);
  }

  putU32(a: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, a, true);
    this.pos += 4;
  }

  putU32_2(a: number, b: number): void {
    this.ensure(8);
    this.view.setUint32(this.pos, a, true);
    this.view.setUint32(this.pos + 4, b, true);
    this.pos += 8;
  }

  putU32_3(a: number, b: number, c: number): void {
    this.ensure(12);
    this.view.setUint32(this.pos, a, true);
    this.view.setUint32(this.pos + 4, b, true);
    this.view.setUint32(this.pos + 8, c, true);
    this.pos += 12;
  }

  putF64(value: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, value, true);
    this.pos += 8;
  }
}

const IOS_VIEW_CLASSES: Record<string, string> = {
  layout: 'Layout',
  view: 'SCValdiView',
  label: 'SCValdiLabel',
  scroll: 'SCValdiScrollView',
  image: 'SCValdiImageView',
  video: 'SCValdiVideoView',
  webview: 'SCValdiWebView',
  button: 'UIButton',
  spinner: 'SCValdiSpinnerView',
  blur: 'SCValdiBlurView',
  glass: 'SCValdiGlassView',
  textfield: 'SCValdiTextField',
  textview: 'SCValdiTextView',
  textanimationgroup: 'SCValdiTextAnimationGroup',
  shape: 'SCValdiShapeView',
  animatedimage: 'SCValdiAnimatedContentView',
};

const ANDROID_VIEW_CLASSES: Record<string, string> = {
  layout: 'Layout',
  view: 'com.snap.valdi.views.ValdiView',
  label: 'com.snap.valdi.views.ValdiTextView',
  scroll: 'com.snap.valdi.views.ValdiScrollView',
  image: 'com.snap.valdi.views.ValdiImageView',
  video: 'com.snap.valdi.views.ValdiVideoView',
  webview: 'com.snap.valdi.modules.webview.ValdiWebView',
  button: 'android.widget.Button',
  spinner: 'com.snap.valdi.views.ValdiSpinnerView',
  blur: 'com.snap.valdi.views.ValdiView',
  glass: 'com.snap.valdi.views.ValdiView',
  textfield: 'com.snap.valdi.views.ValdiEditText',
  textview: 'com.snap.valdi.views.ValdiEditTextMultiline',
  textanimationgroup: 'com.snap.valdi.views.ValdiTextAnimationGroup',
  shape: 'com.snap.valdi.views.ShapeView',
  animatedimage: 'com.snap.valdi.views.AnimatedImageView',
};

const STAGING_CONTAINER_ID = 0xffffff;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolveCompatViewClass(tag: string, platform: number): string {
  // 1 = Android, 2 = iOS, 3 = MacOS, 4 = Web, 5 = Linux
  if (platform === 1) return ANDROID_VIEW_CLASSES[tag] ?? tag;
  if (platform === 2 || platform === 3 || platform === 5) return IOS_VIEW_CLASSES[tag] ?? tag;
  return tag;
}

export function resolveCustomViewClass(props: Record<string, unknown>, platform: number): string {
  if (props.viewFactory !== undefined) {
    return 'Deferred';
  }
  // 1 = Android, 2 = iOS, 3 = MacOS, 4 = Web, 5 = Linux
  if (platform === 1) {
    return nonEmptyString(props.androidClass) ?? 'view';
  }
  if (platform === 3) {
    return nonEmptyString(props.macosClass) ?? nonEmptyString(props.iosClass) ?? 'view';
  }
  if (platform === 5) {
    return nonEmptyString(props.linuxClass) ?? nonEmptyString(props.macosClass) ?? nonEmptyString(props.iosClass) ?? 'view';
  }
  if (platform === 2) {
    return nonEmptyString(props.iosClass) ?? 'view';
  }
  return nonEmptyString(props.iosClass) ?? nonEmptyString(props.androidClass) ?? 'view';
}

function isValdiStyle(value: unknown): value is IStyle<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IStyle<unknown>).toNative === 'function' &&
    typeof (value as { attributes?: unknown }).attributes === 'object' &&
    (value as { attributes?: unknown }).attributes !== null
  );
}

export class ValdiBinarySink implements NativeSink {
  readonly stats: BatchStats;
  private readonly bufferPool = [new CommandBuffer(1024)];
  private buffer = this.bufferPool.pop()!;
  private values: any[] = [];
  private valueByString = new Map<string, number>();
  private stringIds = new Map<string, number>();
  private attributeIds = new Map<string, number>();
  private opsInCurrentBatch = 0;
  private pendingFrameObserver?: NativeFrameObserver;
  private pendingVisibilityObserver?: NativeVisibilityObserver;
  private stagingCreated = false;
  private destroyed = false;
  private readonly platform: number;

  readonly insertBefore?: (id: number, parentId: number, anchorId: number) => void;

  constructor(
    readonly treeId: string,
    readonly mode: TransportMode = 'compat',
    private readonly runtime: ValdiRuntime = getValdiRuntime(),
  ) {
    this.platform = runtime.getCurrentPlatform();
    this.stats = { mode, batches: 0, totalOps: 0, lastBatchOps: 0 };
    if (mode === 'native-solid') {
      this.insertBefore = (id, parentId, anchorId) => {
        this.opsInCurrentBatch++;
        this.buffer.putU32_3(EntryOpcode.INSERT_ELEMENT_BEFORE | (id << 8), parentId, anchorId);
      };
    }
  }

  getPlatform(): number {
    return this.platform;
  }

  run<T>(action: () => T): T {
    return withLocalNativeRefs(this.treeId, action);
  }

  observeFrames(callback: NativeFrameObserver): void {
    this.pendingFrameObserver = callback;
  }

  observeVisibility(callback: NativeVisibilityObserver): void {
    this.pendingVisibilityObserver = callback;
  }

  begin(): void {
    this.buffer = this.bufferPool.pop() ?? new CommandBuffer(1024);
    this.buffer.rewind();
    this.opsInCurrentBatch = 0;
  }

  end(): void {
    const frameObserver = this.pendingFrameObserver;
    const visibilityObserver = this.pendingVisibilityObserver;
    this.pendingFrameObserver = undefined;
    this.pendingVisibilityObserver = undefined;

    if (this.destroyed || (this.buffer.byteLength === 0 && !frameObserver && !visibilityObserver)) {
      this.buffer.rewind();
      this.bufferPool.push(this.buffer);
      return;
    }

    const buffer = this.buffer;
    const descriptor = buffer.buffer;
    const descriptorSize = buffer.byteLength / 4;
    const values = this.values;
    if (values.length) {
      this.values = [];
      this.valueByString.clear();
    }

    this.stats.batches++;
    this.stats.lastBatchOps = this.opsInCurrentBatch;
    this.stats.totalOps += this.opsInCurrentBatch;

    this.runtime.submitRawRenderRequest(
      {
        treeId: this.treeId,
        descriptor,
        descriptorSize,
        values,
        visibilityObserver,
        frameObserver,
      },
      () => {
        buffer.rewind();
        this.bufferPool.push(buffer);
      },
    );
  }

  create(id: number, tag: string): void {
    const viewClass = this.mode === 'compat' ? resolveCompatViewClass(tag, this.platform) : tag;
    this.opsInCurrentBatch++;
    this.buffer.putU32_2(EntryOpcode.CREATE_ELEMENT | (id << 8), this.intern(viewClass));
  }

  setRoot(id: number): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32(EntryOpcode.SET_ROOT_ELEMENT | (id << 8));
  }

  move(id: number, parentId: number, index: number): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32_3(EntryOpcode.MOVE_ELEMENT_TO_PARENT | (id << 8), parentId, index);
  }

  detach(id: number): void {
    this.opsInCurrentBatch++;
    if (this.mode === 'native-solid') {
      this.buffer.putU32(EntryOpcode.DETACH_ELEMENT | (id << 8));
      return;
    }
    if (!this.stagingCreated) {
      this.stagingCreated = true;
      const viewClass = resolveCompatViewClass('view', this.platform);
      this.buffer.putU32_2(EntryOpcode.CREATE_ELEMENT | (STAGING_CONTAINER_ID << 8), this.intern(viewClass));
    }
    this.buffer.putU32_3(EntryOpcode.MOVE_ELEMENT_TO_PARENT | (id << 8), STAGING_CONTAINER_ID, 0);
  }

  destroy(id: number): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32(EntryOpcode.DESTROY_ELEMENT | (id << 8));
  }

  set(id: number, name: string, value: unknown): void {
    if (
      name === 'onLayout' ||
      name === '$onLayout' ||
      name === 'onVisibilityChanged' ||
      name === 'onViewportChanged'
    ) {
      return;
    }
    const attrId = this.attributeId(name);
    this.opsInCurrentBatch++;

    if (value === undefined) {
      this.buffer.putU32_2(EntryOpcode.SET_ATTRIBUTE_UNDEFINED | (id << 8), attrId);
    } else if (value === null) {
      this.buffer.putU32_2(EntryOpcode.SET_ATTRIBUTE_NULL | (id << 8), attrId);
    } else if (typeof value === 'boolean') {
      this.buffer.putU32_2((value ? EntryOpcode.SET_ATTRIBUTE_TRUE : EntryOpcode.SET_ATTRIBUTE_FALSE) | (id << 8), attrId);
    } else if (typeof value === 'number') {
      this.buffer.putU32_2(EntryOpcode.SET_ATTRIBUTE_DOUBLE | (id << 8), attrId);
      this.buffer.putF64(value);
    } else if (Array.isArray(value)) {
      this.buffer.putU32_3(EntryOpcode.SET_ATTRIBUTE_ARRAY | (id << 8), attrId, value.length);
      for (const item of value) {
        this.buffer.putU32(this.attach(item));
      }
    } else if (isValdiStyle(value)) {
      const styleId = value.toNative((attrs: PropertyList) => this.runtime.createCSSRule(attrs));
      this.buffer.putU32_3(EntryOpcode.SET_ATTRIBUTE_STYLE | (id << 8), attrId, styleId);
    } else {
      this.buffer.putU32_3(EntryOpcode.SET_ATTRIBUTE_ATTACHED_VALUE | (id << 8), attrId, this.attach(value));
    }
  }

  beginAnimation(options: AnimationOptions, cancelToken: number): void {
    const opts = options as {
      duration?: number;
      curve?: unknown;
      beginFromCurrentState?: boolean;
      crossfade?: boolean;
      stiffness?: number;
      damping?: number;
      controlPoints?: number[];
      completion?: (wasCancelled: boolean) => void;
    };
    this.opsInCurrentBatch++;
    this.buffer.putU32(EntryOpcode.BEGIN_ANIMATIONS);
    this.buffer.putF64(opts.duration ?? 0);
    this.buffer.putU32(this.resolveAnimationCurve(opts.curve));
    this.buffer.putU32(opts.beginFromCurrentState ? 1 : 0);
    this.buffer.putU32(opts.crossfade ? 1 : 0);
    this.buffer.putF64(opts.stiffness ?? 0);
    this.buffer.putF64(opts.damping ?? 0);
    // C++ validates controlPointsIndex < valuesSize && completionIndex < valuesSize,
    // so both slots must always be attached into `values` even when undefined.
    this.buffer.putU32(this.attach(opts.controlPoints));
    this.buffer.putU32(this.attach(opts.completion));
    this.buffer.putU32(cancelToken);
  }

  endAnimation(): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32(EntryOpcode.END_ANIMATIONS);
  }

  cancelAnimation(cancelToken: number): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32_2(EntryOpcode.CANCEL_ANIMATION, cancelToken);
  }

  onLayoutComplete(callback: () => void): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32_2(EntryOpcode.ON_LAYOUT_COMPLETE, this.attach(callback));
  }

  onNextDraw(callback: () => void): void {
    this.opsInCurrentBatch++;
    this.buffer.putU32_2(EntryOpcode.ON_NEXT_DRAW, this.attach(callback));
  }

  getFrame(id: number, callback: (frame: ElementFrame | undefined) => void): void {
    if (this.destroyed) {
      callback(undefined);
      return;
    }
    this.runtime.getFrameForElementId(this.treeId, id, callback);
  }

  getNativeView(id: number, callback: (view: NativeView | undefined) => void): void {
    if (this.destroyed) {
      callback(undefined);
      return;
    }
    this.runtime.getNativeViewForElementId(this.treeId, id, callback);
  }

  getNativeNode(id: number): NativeNode | undefined {
    if (this.destroyed) return undefined;
    return this.runtime.getNativeNodeForElementId(this.treeId, id);
  }

  takeSnapshot(id: number, callback: (snapshotBase64: string | undefined) => void): void {
    if (this.destroyed) {
      callback(undefined);
      return;
    }
    this.runtime.takeElementSnapshot(this.treeId, id, callback);
  }

  dispose(): void {
    this.destroyed = true;
  }

  private resolveAnimationCurve(curve: unknown): number {
    switch (curve) {
      case 'linear':
        return 1;
      case 'easeIn':
        return 2;
      case 'easeOut':
        return 3;
      case 'easeInOut':
      default:
        return 4;
    }
  }

  private intern(str: string): number {
    let id = this.stringIds.get(str);
    if (id === undefined) {
      id = this.runtime.internString(str);
      this.stringIds.set(str, id);
    }
    return id;
  }

  private attributeId(name: string): number {
    let id = this.attributeIds.get(name);
    if (id === undefined) {
      id = name[0] === '$' ? this.runtime.getAttributeId(name.slice(1)) | (1 << 24) : this.runtime.getAttributeId(name);
      this.attributeIds.set(name, id);
    }
    return id;
  }

  private attach(value: unknown): number {
    if (typeof value === 'string') {
      const existing = this.valueByString.get(value);
      if (existing !== undefined) return existing;
      const idx = this.values.length;
      this.values.push(value);
      this.valueByString.set(value, idx);
      return idx;
    }
    const idx = this.values.length;
    this.values.push(value);
    return idx;
  }
}
