import { getOwner, onCleanup } from 'solid-js';
import type { NativeSink } from './transport';

export interface NativeFrame {
  x: number;
  y: number;
  width: number;
  height: number;
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
}

type HostOp =
  | { type: 'create'; node: NativeElement }
  | { type: 'root'; node: NativeElement }
  | { type: 'set'; node: NativeElement; key: string; value: unknown }
  | {
      type: 'insert';
      node: NativeElement;
      parent: NativeElement;
      index: number;
      anchor?: NativeElement;
    }
  | { type: 'detach'; node: NativeElement }
  | { type: 'nextDraw'; callback: () => void };

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
  private operations: HostOp[] = [];
  private flushScheduled = false;
  private flushing = false;
  private materialized = new Set<NativeElement>();
  private detachedInBatch = new Set<NativeElement>();
  private disposedNodes = new Set<NativeElement>();
  private elementsById = new Map<number, NativeElement>();
  private frameObserverRegistered = false;

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
    const node: NativeElement = {
      id,
      tag,
      kind: 'element',
      tree: this,
      props,
      frame: { x: 0, y: 0, width: 0, height: 0 },
      get children() {
        const list: NativeElement[] = [];
        for (let child = node.firstChild; child; child = child.nextSibling) {
          list.push(child);
        }
        return list;
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
    };
    return node;
  }

  set(node: NativeElement, key: string, value: unknown): void {
    if (!this.alive || node.kind !== 'element' || key === 'children') return;
    if (Object.is(node.props[key], value)) return;
    node.props[key] = value;
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
    this.detachedInBatch.delete(node);

    this.unlink(node);
    this.link(parent, node, anchor);

    const nativeAnchor = this.nextMaterializedSibling(node);
    const nativeIndex = this.sink.insertBefore ? 0 : this.countPrecedingMaterializedSiblings(node);
    this.enqueue({
      type: 'insert',
      node,
      parent,
      index: nativeIndex,
      anchor: nativeAnchor,
    });
  }

  remove(parent: NativeElement, node: NativeElement): void {
    if (!this.alive || node.parent !== parent) return;
    this.unlink(node);
    if (node.kind === 'sentinel') return;
    if (this.materialized.has(node)) {
      this.detachedInBatch.add(node);
      this.enqueue({ type: 'detach', node });
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

  onNextDraw(callback: () => void): void {
    if (!this.alive) return;
    this.operations.push({ type: 'nextDraw', callback });
    this.flush();
  }

  flush(): void {
    if (!this.alive || this.flushing) return;
    if (this.operations.length === 0 && this.disposedNodes.size === 0 && this.detachedInBatch.size === 0) return;

    this.flushing = true;
    const ops = this.operations;
    const detached = this.detachedInBatch;
    this.operations = [];
    this.detachedInBatch = new Set();

    try {
      this.sink.run(() => {
        this.sink.begin();
        if (!this.frameObserverRegistered && this.sink.observeFrames) {
          this.frameObserverRegistered = true;
          this.sink.observeFrames(updates => this.handleFrameUpdates(updates));
        }

        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          switch (op.type) {
            case 'create':
              this.sink.create(op.node.id, op.node.tag);
              break;
            case 'root':
              this.sink.setRoot(op.node.id);
              break;
            case 'set':
              this.sink.set(op.node.id, op.key, op.value);
              break;
            case 'insert':
              if (this.sink.insertBefore) {
                this.sink.insertBefore(op.node.id, op.parent.id, op.anchor ? op.anchor.id : 0);
              } else {
                this.sink.move(op.node.id, op.parent.id, op.index);
              }
              break;
            case 'detach':
              this.sink.detach(op.node.id);
              break;
            case 'nextDraw':
              this.sink.onNextDraw(op.callback);
              break;
          }
        }

        // Destroy nodes whose Solid owner was disposed and that are no longer attached,
        // or in compat mode release still-detached nodes at batch end so staging does not leak.
        const toDestroySet = new Set<NativeElement>();
        for (const node of this.disposedNodes) {
          if (this.materialized.has(node) && !this.isAttachedToRoot(node)) {
            toDestroySet.add(node);
          }
        }
        this.disposedNodes.clear();

        if (this.sink.mode === 'compat') {
          for (const node of detached) {
            if (this.materialized.has(node) && !this.isAttachedToRoot(node)) {
              toDestroySet.add(node);
            }
          }
        }

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
    this.detachedInBatch.clear();
    this.disposedNodes.clear();
    this.materialized.clear();
    this.elementsById.clear();
    this.sink.dispose();
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
      }
    });
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
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.kind === 'element') {
        this.unmaterializeSubtree(child);
      }
    }
  }

  private materialize(node: NativeElement): void {
    if (node.kind !== 'element' || this.materialized.has(node)) return;
    this.materialized.add(node);
    this.enqueue({ type: 'create', node });
    for (const key in node.props) {
      const value = node.props[key];
      if (value !== undefined) {
        this.enqueue({ type: 'set', node, key, value });
      }
    }
    if (node === this.root) {
      this.enqueue({ type: 'root', node });
    }
    let idx = 0;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.kind !== 'element') continue;
      this.materialize(child);
      this.enqueue({
        type: 'insert',
        node: child,
        parent: node,
        index: idx++,
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

  private countPrecedingMaterializedSiblings(node: NativeElement): number {
    let count = 0;
    for (let cur = node.previousSibling; cur; cur = cur.previousSibling) {
      if (cur.kind === 'element' && this.materialized.has(cur)) {
        count++;
      }
    }
    return count;
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
