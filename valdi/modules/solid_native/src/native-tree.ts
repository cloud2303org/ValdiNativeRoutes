import { flush as solidFlush, getOwner, onCleanup } from 'solid-js';
import type { AnimationOptions } from 'valdi_core/src/AnimationOptions';
import type { EventTime } from 'valdi_tsx/src/GestureEvents';
import type { NativeNode } from 'valdi_tsx/src/NativeNode';
import type { NativeView } from 'valdi_tsx/src/NativeView';
import { resolveCustomViewClass, type NativeSink } from './transport';

export interface NativeFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimationHandle {
  readonly token: number;
  cancel(): void;
}

export interface NativeElement {
  id: number;
  tag: string;
  kind: 'element' | 'sentinel';
  tree: NativeTree;
  parent?: NativeElement;
  firstChild?: NativeElement;
  lastChild?: NativeElement;
  previousSibling?: NativeElement;
  nextSibling?: NativeElement;
  props: Record<string, unknown>;
  frame: NativeFrame;
  readonly children: NativeElement[];
  getFrame(): Promise<NativeFrame | undefined>;
  getNativeView(): Promise<NativeView | undefined>;
  getNativeNode(): NativeNode | undefined;
  takeSnapshot(): Promise<string | undefined>;
}

type HostOp =
  | { type: 'create'; node: NativeElement; tag: string }
  | { type: 'root'; node: NativeElement }
  | { type: 'set'; node: NativeElement; key: string; value: unknown }
  | {
      type: 'insert';
      node: NativeElement;
      parent: NativeElement;
      anchor?: NativeElement;
    }
  | { type: 'detach'; node: NativeElement; parent?: NativeElement }
  | { type: 'beginAnimation'; options: AnimationOptions; cancelToken: number }
  | { type: 'endAnimation' }
  | { type: 'cancelAnimation'; cancelToken: number }
  | { type: 'layoutComplete'; callback: () => void }
  | { type: 'nextDraw'; callback: () => void };

const JS_ONLY_PROPS = new Set(['onLayout', '$onLayout', 'onVisibilityChanged', 'onViewportChanged']);
const CUSTOM_VIEW_CLASS_PROPS = new Set(['iosClass', 'androidClass', 'macosClass', 'linuxClass']);

function isInlineTextContainer(node: NativeElement): boolean {
  return node.tag === 'label' || node.tag === 'textview';
}

function scheduleMicrotask(fn: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

export class NativeTree {
  readonly root: NativeElement;
  alive = true;

  private nextId = 1;
  private nextAnimationToken = 1;
  private operations: HostOp[] = [];
  private flushScheduled = false;
  private flushing = false;
  private materialized = new Set<NativeElement>();
  private disposedNodes = new Set<NativeElement>();
  private observedVisibilityNodes = new Set<NativeElement>();
  private elementsById = new Map<number, NativeElement>();
  private frameObserverRegistered = false;
  private visibilityObserverRegistered = false;
  private needsVisibilityObserver = false;

  constructor(readonly sink: NativeSink) {
    this.root = this.makeElement('view', { width: '100%', height: '100%' });
  }

  private makeElement(tag: string, staticProps?: Record<string, unknown>): NativeElement {
    if (this.nextId >= 0xfffffe) {
      throw new Error('Native node id space exhausted');
    }
    const id = this.nextId++;
    const props: Record<string, unknown> = {};
    if (staticProps) {
      for (const key in staticProps) {
        if (key !== 'children' && key !== 'ref') {
          props[key] = staticProps[key];
        }
      }
    }
    const tree = this;
    const node: NativeElement = {
      id,
      tag,
      kind: 'element',
      tree,
      props,
      frame: { x: 0, y: 0, width: 0, height: 0 },
      get children() {
        const list: NativeElement[] = [];
        for (let child = node.firstChild; child; child = child.nextSibling) {
          list.push(child);
        }
        return list;
      },
      getFrame() {
        return tree.getElementFrame(node);
      },
      getNativeView() {
        return tree.getElementNativeView(node);
      },
      getNativeNode() {
        return tree.getElementNativeNode(node);
      },
      takeSnapshot() {
        return tree.takeElementSnapshot(node);
      },
    };
    this.elementsById.set(id, node);
    if (staticProps && typeof staticProps.ref === 'function') {
      (staticProps.ref as (el: NativeElement) => void)(node);
    }
    return node;
  }

  create(tag: string, staticProps?: Record<string, unknown>): NativeElement {
    const node = this.makeElement(tag, staticProps);
    if (getOwner()) {
      onCleanup(() => {
        if (!this.alive) return;
        this.disposedNodes.add(node);
        if (this.materialized.has(node) && !node.parent) {
          this.scheduleFlush();
        }
      });
    }
    return node;
  }

  createSentinel(): NativeElement {
    const node: NativeElement = {
      id: 0,
      tag: '#sentinel',
      kind: 'sentinel',
      tree: this,
      props: {},
      frame: { x: 0, y: 0, width: 0, height: 0 },
      get children() {
        return [];
      },
      getFrame() {
        return Promise.resolve(undefined);
      },
      getNativeView() {
        return Promise.resolve(undefined);
      },
      getNativeNode() {
        return undefined;
      },
      takeSnapshot() {
        return Promise.resolve(undefined);
      },
    };
    return node;
  }

  set(node: NativeElement, key: string, value: unknown): void {
    if (!this.alive || node.kind !== 'element' || key === 'children') return;
    if (Object.is(node.props[key], value)) return;
    node.props[key] = value;

    if (key === 'onLayout' || key === '$onLayout') {
      return;
    }

    if (key === 'onVisibilityChanged' || key === 'onViewportChanged') {
      if (this.materialized.has(node)) {
        const wasObserving = this.observedVisibilityNodes.has(node);
        const shouldObserve = this.hasVisibilityObserver(node);
        if (shouldObserve && !wasObserving) {
          this.observedVisibilityNodes.add(node);
          this.needsVisibilityObserver = true;
          this.enqueue({ type: 'set', node, key: 'observeVisibility', value: true });
        } else if (!shouldObserve && wasObserving) {
          this.observedVisibilityNodes.delete(node);
          this.enqueue({ type: 'set', node, key: 'observeVisibility', value: false });
        }
      }
      return;
    }

    if (this.materialized.has(node)) {
      this.enqueue({ type: 'set', node, key, value });
    } else if (node === this.root) {
      this.materialize(node);
    }
  }

  adoptNativeAttribute(id: number, key: string, value: unknown): void {
    const node = this.elementsById.get(id);
    if (node) {
      node.props[key] = value;
    }
  }

  insert(parent: NativeElement, node: NativeElement, anchor?: NativeElement): void {
    if (!this.alive) return;
    if (parent.tree !== this || node.tree !== this || (anchor && anchor.parent !== parent)) {
      throw new Error('Cannot insert across native page trees or before an unrelated anchor');
    }
    if (node === this.root) throw new Error('Cannot reparent the page root');
    for (let ancestor: NativeElement | undefined = parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor === node) throw new Error('Cannot insert a node into its descendant');
    }
    if (node === anchor || (node.parent === parent && node.nextSibling === anchor)) return;

    if (node.kind === 'sentinel') {
      this.unlink(node);
      this.link(parent, node, anchor);
      return;
    }

    // Materialize parent (with any pre-existing children) before linking `node`
    // so `node` itself is inserted cleanly in order right after.
    this.materialize(parent);
    this.materialize(node);
    this.disposedNodes.delete(node);

    this.unlink(node);
    this.link(parent, node, anchor);

    this.enqueue({
      type: 'insert',
      node,
      parent,
      anchor: this.nextMaterializedSibling(node),
    });
  }

  remove(parent: NativeElement, node: NativeElement): void {
    if (!this.alive || node.parent !== parent) return;
    this.unlink(node);
    if (node.kind === 'sentinel') return;
    if (this.materialized.has(node)) {
      this.enqueue({ type: 'detach', node, parent });
    }
  }

  cleanup(parent: NativeElement, nodes: NativeElement[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.parent === parent) {
        this.remove(parent, node);
      }
      if (node.kind === 'element') {
        this.disposedNodes.add(node);
      }
    }
    if (this.alive && this.disposedNodes.size > 0) {
      this.scheduleFlush();
    }
  }

  onLayoutComplete(callback: () => void): void {
    if (!this.alive) return;
    this.enqueue({ type: 'layoutComplete', callback });
  }

  onNextDraw(callback: () => void): void {
    if (!this.alive) return;
    this.operations.push({ type: 'nextDraw', callback });
    this.flush();
  }

  animate(options: AnimationOptions, action: () => void): AnimationHandle {
    if (!this.alive || !this.sink.beginAnimation || !this.sink.endAnimation) {
      action();
      solidFlush();
      return { token: 0, cancel() {} };
    }

    // Drain any previously queued Solid effects and native ops before opening the animation block
    // so only mutations performed by `action()` are animated.
    solidFlush();
    this.flush();
    const token = this.nextAnimationToken++;
    this.operations.push({ type: 'beginAnimation', options, cancelToken: token });
    try {
      action();
      solidFlush();
    } finally {
      this.operations.push({ type: 'endAnimation' });
      this.flush();
    }
    return {
      token,
      cancel: () => this.cancelAnimation(token),
    };
  }

  cancelAnimation(token: number): void {
    if (!this.alive || token <= 0 || !this.sink.cancelAnimation) return;
    this.operations.push({ type: 'cancelAnimation', cancelToken: token });
    this.flush();
  }

  getElementFrame(node: NativeElement): Promise<NativeFrame | undefined> {
    if (!this.alive || node.kind !== 'element' || !this.materialized.has(node) || !this.sink.getFrame) {
      return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
      this.sink.getFrame!(node.id, frame => resolve(frame));
    });
  }

  getElementNativeView(node: NativeElement): Promise<NativeView | undefined> {
    if (!this.alive || node.kind !== 'element' || !this.materialized.has(node) || !this.sink.getNativeView) {
      return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
      this.sink.getNativeView!(node.id, view => resolve(view));
    });
  }

  getElementNativeNode(node: NativeElement): NativeNode | undefined {
    if (!this.alive || node.kind !== 'element' || !this.materialized.has(node) || !this.sink.getNativeNode) {
      return undefined;
    }
    return this.sink.getNativeNode(node.id);
  }

  getElementById(id: number): NativeElement | undefined {
    return this.elementsById.get(id);
  }

  takeElementSnapshot(node: NativeElement): Promise<string | undefined> {
    if (!this.alive || node.kind !== 'element' || !this.materialized.has(node) || !this.sink.takeSnapshot) {
      return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
      this.sink.takeSnapshot!(node.id, snapshot => resolve(snapshot));
    });
  }

  flush(): void {
    if (!this.alive || this.flushing) return;
    const registerVisibility =
      this.needsVisibilityObserver && !this.visibilityObserverRegistered && Boolean(this.sink.observeVisibility);
    if (this.operations.length === 0 && this.disposedNodes.size === 0 && !registerVisibility) {
      return;
    }

    this.flushing = true;
    const ops = this.operations;
    this.operations = [];

    try {
      this.sink.run(() => {
        this.sink.begin();
        if (!this.frameObserverRegistered && this.sink.observeFrames) {
          this.frameObserverRegistered = true;
          this.sink.observeFrames(updates => this.handleFrameUpdates(updates));
        }
        if (this.needsVisibilityObserver && !this.visibilityObserverRegistered && this.sink.observeVisibility) {
          this.visibilityObserverRegistered = true;
          this.sink.observeVisibility((appearingIds, disappearingIds, viewportUpdates, acknowledger, eventTime) =>
            this.handleVisibilityUpdates(appearingIds, disappearingIds, viewportUpdates, acknowledger, eventTime),
          );
        }

        let inlineTextChildParents: Set<NativeElement> | undefined;
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          if (op.type === 'insert' && isInlineTextContainer(op.parent)) {
            (inlineTextChildParents ??= new Set()).add(op.parent);
          } else if (op.type === 'detach' && op.parent && isInlineTextContainer(op.parent)) {
            (inlineTextChildParents ??= new Set()).add(op.parent);
          }
        }
        let createdInlineTextParents: Set<NativeElement> | undefined;
        let deferredValueSetNodes: Set<NativeElement> | undefined;
        if (inlineTextChildParents) {
          for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            if (op.type === 'create' && inlineTextChildParents.has(op.node)) {
              (createdInlineTextParents ??= new Set()).add(op.node);
            }
          }
        }
        const flushDeferredInlineTextValues = () => {
          if (!inlineTextChildParents || inlineTextChildParents.size === 0) return;
          for (const node of inlineTextChildParents) {
            if (!this.materialized.has(node)) continue;
            if (this.disposedNodes.has(node) && !this.isAttachedToRoot(node)) continue;
            const currentValue = node.props.value;
            if (Array.isArray(currentValue)) {
              // C++ ValueArray::operator== skips postprocessing when value stays structurally equal, so
              // clearing with undefined first forces ViewNodeTextInlineAttachment rebinding on child updates.
              if (!createdInlineTextParents?.has(node)) {
                this.sink.set(node.id, 'value', undefined);
              }
              this.sink.set(node.id, 'value', currentValue);
            } else if (deferredValueSetNodes?.has(node)) {
              this.sink.set(node.id, 'value', currentValue);
            }
          }
          inlineTextChildParents.clear();
          deferredValueSetNodes?.clear();
        };

        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          switch (op.type) {
            case 'create': {
              const resolvedTag =
                op.node.tag === 'custom-view'
                  ? resolveCustomViewClass(op.node.props, this.sink.getPlatform?.() ?? 2)
                  : op.tag;
              this.sink.create(op.node.id, resolvedTag);
              break;
            }
            case 'root':
              this.sink.setRoot(op.node.id);
              break;
            case 'set':
              if (op.key === 'value' && inlineTextChildParents?.has(op.node)) {
                (deferredValueSetNodes ??= new Set()).add(op.node);
                break;
              }
              this.sink.set(op.node.id, op.key, op.value);
              break;
            case 'insert':
              this.sink.insertBefore(op.node.id, op.parent.id, op.anchor ? op.anchor.id : 0);
              break;
            case 'detach':
              this.sink.detach(op.node.id);
              break;
            case 'beginAnimation':
              this.sink.beginAnimation?.(op.options, op.cancelToken);
              break;
            case 'endAnimation':
              flushDeferredInlineTextValues();
              this.sink.endAnimation?.();
              break;
            case 'cancelAnimation':
              this.sink.cancelAnimation?.(op.cancelToken);
              break;
            case 'layoutComplete':
              this.sink.onLayoutComplete?.(op.callback);
              break;
            case 'nextDraw':
              this.sink.onNextDraw(op.callback);
              break;
          }
        }
        flushDeferredInlineTextValues();

        const toDestroySet = new Set<NativeElement>();
        for (const node of this.disposedNodes) {
          if (this.materialized.has(node) && !this.isAttachedToRoot(node)) {
            toDestroySet.add(node);
          }
        }
        this.disposedNodes.clear();

        for (const node of toDestroySet) {
          if (!this.materialized.has(node)) continue;
          let hasAncestorInSet = false;
          for (let p = node.parent; p; p = p.parent) {
            if (toDestroySet.has(p)) {
              hasAncestorInSet = true;
              break;
            }
          }
          if (!hasAncestorInSet) {
            this.sink.destroy(node.id);
          }
          this.unmaterializeSubtree(node);
        }

        this.sink.end();
      });
    } finally {
      this.flushing = false;
    }

    if (this.operations.length > 0 || this.disposedNodes.size > 0) {
      this.scheduleFlush();
    }
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.operations = [];
    this.disposedNodes.clear();
    this.observedVisibilityNodes.clear();
    this.materialized.clear();
    this.elementsById.clear();
    this.sink.dispose();
  }

  private hasVisibilityObserver(node: NativeElement): boolean {
    return typeof node.props.onVisibilityChanged === 'function' || typeof node.props.onViewportChanged === 'function';
  }

  private handleFrameUpdates(updates: Float64Array): void {
    if (!this.alive) return;
    const changed: NativeElement[] = [];
    for (let i = 0; i + 4 < updates.length; i += 5) {
      const node = this.elementsById.get(updates[i]);
      if (!node) continue;
      node.frame = {
        x: updates[i + 1],
        y: updates[i + 2],
        width: updates[i + 3],
        height: updates[i + 4],
      };
      changed.push(node);
    }
    if (!changed.length) return;
    this.sink.run(() => {
      for (let i = 0; i < changed.length; i++) {
        const node = changed[i];
        const cb = node.props.onLayout;
        if (typeof cb === 'function') {
          (cb as (frame: NativeFrame) => void)(node.frame);
        }
        const injectedCb = node.props.$onLayout;
        if (typeof injectedCb === 'function') {
          (injectedCb as (frame: NativeFrame) => void)(node.frame);
        }
      }
    });
  }

  private handleVisibilityUpdates(
    appearingIds: number[],
    disappearingIds: number[],
    viewportUpdates: number[],
    acknowledger: () => void,
    eventTime: number,
  ): void {
    try {
      if (!this.alive) return;
      this.sink.run(() => {
        const time = eventTime as unknown as EventTime;
        if (disappearingIds) {
          for (let i = 0; i < disappearingIds.length; i++) {
            const node = this.elementsById.get(disappearingIds[i]);
            const cb = node?.props.onVisibilityChanged;
            if (typeof cb === 'function') {
              (cb as (isVisible: boolean, eventTime: EventTime) => void)(false, time);
            }
          }
        }
        if (appearingIds) {
          for (let i = 0; i < appearingIds.length; i++) {
            const node = this.elementsById.get(appearingIds[i]);
            const cb = node?.props.onVisibilityChanged;
            if (typeof cb === 'function') {
              (cb as (isVisible: boolean, eventTime: EventTime) => void)(true, time);
            }
          }
        }
        if (viewportUpdates) {
          for (let i = 0; i + 4 < viewportUpdates.length; i += 5) {
            const node = this.elementsById.get(viewportUpdates[i]);
            const cb = node?.props.onViewportChanged;
            if (node && typeof cb === 'function') {
              const viewport: NativeFrame = {
                x: viewportUpdates[i + 1],
                y: viewportUpdates[i + 2],
                width: viewportUpdates[i + 3],
                height: viewportUpdates[i + 4],
              };
              (cb as (viewport: NativeFrame, frame: NativeFrame, eventTime: EventTime) => void)(
                viewport,
                node.frame,
                time,
              );
            }
          }
        }
      });
    } finally {
      acknowledger();
    }
  }

  private isAttachedToRoot(node: NativeElement): boolean {
    let cur: NativeElement | undefined = node;
    while (cur) {
      if (cur === this.root) return true;
      cur = cur.parent;
    }
    return false;
  }

  private unmaterializeSubtree(node: NativeElement): void {
    this.materialized.delete(node);
    this.observedVisibilityNodes.delete(node);
    this.elementsById.delete(node.id);
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.kind === 'element') {
        this.unmaterializeSubtree(child);
      }
    }
  }

  private materialize(node: NativeElement): void {
    if (node.kind !== 'element' || this.materialized.has(node)) return;
    this.materialized.add(node);

    const isCustomView = node.tag === 'custom-view';
    const platform = this.sink.getPlatform?.() ?? 2;
    const createTag = isCustomView ? resolveCustomViewClass(node.props, platform) : node.tag;
    this.enqueue({ type: 'create', node, tag: createTag });

    const omitCustomViewClassProps = isCustomView && createTag !== 'view';
    for (const key in node.props) {
      if (JS_ONLY_PROPS.has(key)) continue;
      if (omitCustomViewClassProps && CUSTOM_VIEW_CLASS_PROPS.has(key)) continue;
      const value = node.props[key];
      if (value !== undefined) {
        this.enqueue({ type: 'set', node, key, value });
      }
    }
    if (this.hasVisibilityObserver(node)) {
      this.needsVisibilityObserver = true;
      this.observedVisibilityNodes.add(node);
      this.enqueue({ type: 'set', node, key: 'observeVisibility', value: true });
    }
    if (node === this.root) {
      this.enqueue({ type: 'root', node });
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.kind !== 'element') continue;
      this.materialize(child);
      this.enqueue({
        type: 'insert',
        node: child,
        parent: node,
        anchor: undefined,
      });
    }
  }

  private link(parent: NativeElement, node: NativeElement, anchor?: NativeElement): void {
    node.parent = parent;
    node.previousSibling = anchor ? anchor.previousSibling : parent.lastChild;
    node.nextSibling = anchor;
    if (node.previousSibling) {
      node.previousSibling.nextSibling = node;
    } else {
      parent.firstChild = node;
    }
    if (anchor) {
      anchor.previousSibling = node;
    } else {
      parent.lastChild = node;
    }
  }

  private unlink(node: NativeElement): void {
    const parent = node.parent;
    if (!parent) return;
    if (node.previousSibling) {
      node.previousSibling.nextSibling = node.nextSibling;
    } else {
      parent.firstChild = node.nextSibling;
    }
    if (node.nextSibling) {
      node.nextSibling.previousSibling = node.previousSibling;
    } else {
      parent.lastChild = node.previousSibling;
    }
    node.parent = undefined;
    node.previousSibling = undefined;
    node.nextSibling = undefined;
  }

  private nextMaterializedSibling(node: NativeElement): NativeElement | undefined {
    for (let cur = node.nextSibling; cur; cur = cur.nextSibling) {
      if (cur.kind === 'element' && this.materialized.has(cur)) {
        return cur;
      }
    }
    return undefined;
  }

  private enqueue(op: HostOp): void {
    this.operations.push(op);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || !this.alive) return;
    this.flushScheduled = true;
    scheduleMicrotask(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }
}
