import {
  createContext,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
  useContext,
  type Accessor,
  type Setter,
} from 'solid-js';
import type { IRootComponentsManager } from 'valdi_core/src/IRootComponentsManager';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';
import { withLocalNativeRefs } from 'valdi_core/src/NativeReferences';
import { NativeTree } from './native-tree';
import { createComponent, render, RenderContext } from './renderer';
import { ValdiBinarySink, type BatchStats } from './transport';

export type PageShowReason = 'navigation' | 'tab' | 'foreground' | (string & {});
export type PageHideReason = 'covered' | 'tab' | 'background' | (string & {});
export type PageVisibleEffect = () => void | (() => void);

export interface SolidPageProps<ViewModel = any, Context = any> {
  /** Fixed initial route params snapshot captured on page mount. */
  readonly params: ViewModel extends { params: infer P } ? P : undefined;
  /** Fixed initial safe-area insets snapshot captured on page mount (never triggers re-layout on keyboard/insets updates). */
  readonly insets: ViewModel extends { insets: infer I } ? Readonly<I> : undefined;
  /** Fixed initial viewModel snapshot captured on page mount. */
  readonly initialViewModel: Readonly<ViewModel>;
  /** Reactive viewModel accessor for callers that explicitly opt into host updates. */
  readonly viewModel: Accessor<ViewModel>;
  readonly context: Context;
  readonly contextId: string;
  readonly tree: NativeTree;
}

export type SolidPageComponent<ViewModel = any, Context = any> = (
  props: SolidPageProps<ViewModel, Context>,
) => JSX.Element;

interface VisibleEffectEntry {
  run: PageVisibleEffect;
  stop?: () => void;
}

class PageLifecycleController {
  private shown = false;
  private readonly showListeners = new Set<(reason: PageShowReason) => void>();
  private readonly hideListeners = new Set<(reason: PageHideReason) => void>();
  private readonly visibleEffects = new Set<VisibleEffectEntry>();

  onShow(callback: (reason: PageShowReason) => void): () => void {
    this.showListeners.add(callback);
    const remove = () => {
      this.showListeners.delete(callback);
    };
    if (getOwner()) onCleanup(remove);
    return remove;
  }

  onHide(callback: (reason: PageHideReason) => void): () => void {
    this.hideListeners.add(callback);
    const remove = () => {
      this.hideListeners.delete(callback);
    };
    if (getOwner()) onCleanup(remove);
    return remove;
  }

  whileVisible(effect: PageVisibleEffect): () => void {
    const entry: VisibleEffectEntry = { run: effect };
    this.visibleEffects.add(entry);
    if (this.shown) {
      entry.stop = untrack(() => effect()) ?? undefined;
    }
    const remove = () => {
      if (!this.visibleEffects.delete(entry)) return;
      const stop = entry.stop;
      entry.stop = undefined;
      stop?.();
    };
    if (getOwner()) onCleanup(remove);
    return remove;
  }

  sync(viewModel: any): void {
    if (!viewModel || typeof viewModel.visible !== 'boolean') return;
    if (viewModel.visible === this.shown) return;
    this.shown = viewModel.visible;
    const reason = typeof viewModel.visibilityReason === 'string' ? viewModel.visibilityReason : '';

    if (this.shown) {
      const showReason = (reason || 'navigation') as PageShowReason;
      for (const listener of [...this.showListeners]) {
        untrack(() => listener(showReason));
      }
      for (const entry of [...this.visibleEffects]) {
        if (entry.stop === undefined) {
          entry.stop = untrack(() => entry.run()) ?? undefined;
        }
      }
    } else {
      this.stopEffects();
      const hideReason = (reason || 'covered') as PageHideReason;
      for (const listener of [...this.hideListeners]) {
        untrack(() => listener(hideReason));
      }
    }
  }

  dispose(): void {
    this.shown = false;
    this.stopEffects();
    this.showListeners.clear();
    this.hideListeners.clear();
    this.visibleEffects.clear();
  }

  private stopEffects(): void {
    for (const entry of [...this.visibleEffects]) {
      const stop = entry.stop;
      entry.stop = undefined;
      stop?.();
    }
  }
}

const PageLifecycleContext = createContext<PageLifecycleController>();

function activePageLifecycle(hookName: string): PageLifecycleController {
  const lifecycle = useContext(PageLifecycleContext);
  if (!lifecycle) {
    throw new Error(`${hookName} must be called inside a Solid page root`);
  }
  return lifecycle;
}

export function onPageShow(callback: (reason: PageShowReason) => void): () => void {
  return activePageLifecycle('onPageShow').onShow(callback);
}

export function onPageHide(callback: (reason: PageHideReason) => void): () => void {
  return activePageLifecycle('onPageHide').onHide(callback);
}

export function whilePageVisible(effect: PageVisibleEffect): () => void {
  return activePageLifecycle('whilePageVisible').whileVisible(effect);
}

interface PageSession {
  tree: NativeTree;
  lifecycle: PageLifecycleController;
  setViewModel: Setter<any>;
  dispose: () => void;
  renderer: {
    onNextDraw(cb: () => void): void;
  };
}

function parseComponentPath(componentPath: string): { modulePath: string; symbol: string } {
  const atIndex = componentPath.indexOf('@');
  if (atIndex <= 0) {
    throw new Error(`Invalid component path: "${componentPath}"`);
  }
  return {
    symbol: componentPath.slice(0, atIndex),
    modulePath: componentPath.slice(atIndex + 1),
  };
}

function resolvePageComponent(componentPath: string): SolidPageComponent {
  const { modulePath, symbol } = parseComponentPath(componentPath);
  const loaded = getModuleLoader().load(modulePath, true);
  const comp = loaded?.[symbol];
  if (typeof comp !== 'function') {
    throw new Error(`Component "${symbol}" in "${modulePath}" is not a Solid function component`);
  }
  return comp as SolidPageComponent;
}

export interface SolidRootComponentsManager extends IRootComponentsManager {
  readonly rootComponents: Record<string, PageSession>;
  getBatchStats(contextId: string): BatchStats | undefined;
}

export function createRootComponentsManager(): SolidRootComponentsManager {
  const rootComponents: Record<string, PageSession> = {};

  return {
    rootComponents,

    getBatchStats(contextId: string): BatchStats | undefined {
      return rootComponents[contextId]?.tree.sink.stats;
    },

    create(contextId: string, componentPath: string, viewModel: any, componentContext: any): void {
      const Page = resolvePageComponent(componentPath);
      const sink = new ValdiBinarySink(contextId);
      const tree = new NativeTree(sink);
      const lifecycle = new PageLifecycleController();
      const [vm, setVm] = createSignal<any>(viewModel);

      // Capture fixed initial snapshots so keyboard/insets churn does not re-layout normal pages.
      const initialInsets = viewModel?.insets ? Object.freeze({ ...viewModel.insets }) : undefined;
      const initialParams = viewModel?.params;

      // Each page gets its own disposable Solid root while sharing the single global solid_runtime.
      const dispose = withLocalNativeRefs(contextId, () =>
        render(
          () =>
            createComponent(RenderContext, {
              value: tree,
              get children() {
                return createComponent(PageLifecycleContext, {
                  value: lifecycle,
                  get children() {
                    return createComponent(Page, {
                      params: initialParams,
                      insets: initialInsets,
                      initialViewModel: viewModel,
                      viewModel: vm,
                      context: componentContext,
                      contextId,
                      tree,
                    });
                  },
                });
              },
            }),
          tree.root,
        ),
      );

      // Flush initial mount synchronously so native root views appear before create() completes.
      tree.flush();

      rootComponents[contextId] = {
        tree,
        lifecycle,
        setViewModel: setVm,
        dispose,
        renderer: {
          onNextDraw(cb: () => void) {
            tree.onNextDraw(cb);
          },
        },
      };

      withLocalNativeRefs(contextId, () => lifecycle.sync(viewModel));
    },

    render(contextId: string, viewModel: any): void {
      const session = rootComponents[contextId];
      if (!session) return;
      withLocalNativeRefs(contextId, () => session.lifecycle.sync(viewModel));
      session.setViewModel(() => viewModel);
    },

    destroy(contextId: string): void {
      const session = rootComponents[contextId];
      if (!session) return;
      delete rootComponents[contextId];
      try {
        session.dispose();
      } finally {
        try {
          session.lifecycle.dispose();
        } finally {
          session.tree.dispose();
        }
      }
    },

    attributeChanged(contextId: string, nodeId: number, attributeName: string, attributeValue: any): void {
      const session = rootComponents[contextId];
      if (!session) return;
      session.tree.adoptNativeAttribute(nodeId, attributeName, attributeValue);
    },

    callComponentFunction(): any {
      return undefined;
    },

    onRuntimeIssue(contextId: string, isError: boolean, message: string): void {
      if (isError) {
        console.error(`[Valdi:${contextId}] ${message}`);
      } else {
        console.warn(`[Valdi:${contextId}] ${message}`);
      }
    },

    stashData(): any {
      return undefined;
    },

    restoreData(): void {},
  };
}
