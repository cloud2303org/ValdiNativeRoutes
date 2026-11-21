import { createRenderer } from '@solidjs/universal';
import {
  createContext,
  createMemo,
  Errored,
  For,
  Loading,
  Match,
  Repeat,
  Reveal,
  Show,
  Switch,
  untrack,
  useContext,
} from 'solid-js';
import type { AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { NativeTree, type AnimationHandle, type NativeElement, type NativeFrame } from './native-tree';

export const RenderContext = createContext<NativeTree>();

function activeTree(): NativeTree {
  const tree = useContext(RenderContext);
  if (!tree) {
    throw new Error('Solid native JSX must be rendered inside a NativeTree context');
  }
  return tree;
}

export function useNativeTree(): NativeTree {
  return activeTree();
}

export function useAnimate(): (options: AnimationOptions, action: () => void) => AnimationHandle {
  const tree = activeTree();
  return (options, action) => tree.animate(options, action);
}

export function animate(tree: NativeTree, options: AnimationOptions, action: () => void): AnimationHandle {
  return tree.animate(options, action);
}

export function onNextLayoutComplete(tree: NativeTree, callback: () => void): void {
  tree.onLayoutComplete(callback);
}

export { NativeTree };
export type { AnimationHandle, NativeElement, NativeFrame };

const renderer = createRenderer<NativeElement>({
  createElement(tag, staticProps) {
    return activeTree().create(tag, staticProps);
  },
  createSentinel() {
    return activeTree().createSentinel();
  },
  createTextNode(value) {
    // @solidjs/universal's normalize() creates an empty string node as a fallback marker for multi-slot inserts.
    // Direct non-empty text children are intentionally unsupported (just like React Native); use <label value={...} />.
    if (String(value) === '') {
      return activeTree().createSentinel();
    }
    throw new Error(
      `Direct text children are not supported ("${String(value)}"). Render text via <label value={...} />.`,
    );
  },
  replaceText(node, value) {
    if (node.kind === 'sentinel' && String(value) === '') return;
    throw new Error(
      `Direct text children are not supported ("${String(value)}"). Render text via <label value={...} />.`,
    );
  },
  isTextNode(node) {
    return node.kind === 'sentinel';
  },
  setProperty(node, name, value) {
    node.tree.set(node, name, value);
  },
  insertNode(parent, node, anchor) {
    parent.tree.insert(parent, node, anchor);
  },
  removeNode(parent, node) {
    parent.tree.remove(parent, node);
  },
  cleanupNodes(parent, nodes) {
    parent.tree.cleanup(parent, nodes);
  },
  getParentNode(node) {
    return node.parent;
  },
  getFirstChild(node) {
    return node.firstChild;
  },
  getNextSibling(node) {
    return node.nextSibling;
  },
});

export const {
  effect,
  memo,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  applyRef,
  ref,
} = renderer;

export const createComponent = renderer.createComponent as unknown as <T>(
  Comp: (props: T) => JSX.Element,
  props: T,
) => JSX.Element;

export const render = renderer.render as unknown as (
  code: () => JSX.Element,
  node: NativeElement,
) => () => void;

export { Errored, For, Loading, Match, Repeat, Reveal, Show, Switch };

export function Dynamic<T extends Record<string, any>>(props: T & { component: any }) {
  const cached = createMemo(() => props.component);
  return createMemo(() => {
    const comp = cached();
    if (!comp) return undefined;
    if (typeof comp === 'string') {
      const el = createElement(comp);
      const { component: _, ...rest } = props;
      spread(el, rest as Record<string, any>, false);
      return el;
    }
    return untrack(() => {
      const { component: _, ...rest } = props;
      return createComponent(comp, rest);
    });
  }) as unknown as JSX.Element;
}
