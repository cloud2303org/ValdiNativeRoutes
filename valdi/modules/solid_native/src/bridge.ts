import {
  createContext,
  createSignal,
  getOwner,
  onCleanup,
  resetErrorHalt,
  untrack,
  useContext,
  type Accessor,
} from 'solid-js';
import type { IRenderedVirtualNodeData } from 'valdi_core/src/IRenderedVirtualNodeData';
import type { IRootComponentsManager } from 'valdi_core/src/IRootComponentsManager';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';
import { withLocalNativeRefs } from 'valdi_core/src/NativeReferences';
import { getDaemonClientManager } from 'valdi_core/src/Valdi';
import { getValdiRuntime } from 'valdi_core/src/ValdiRuntimeProvider';
import type {
  DaemonClientManager,
  IDaemonClientManagerListener,
  ReceivedDaemonClientMessage,
} from 'valdi_core/src/debugging/DaemonClientManager';
import type { DebugLevel, SubmitDebugMessageFunc } from 'valdi_core/src/debugging/DebugMessage';
import { Messages, type DaemonClientMessageType, type RemoteValdiContext } from 'valdi_core/src/debugging/Messages';
import { debugStringify } from 'valdi_core/src/utils/StringUtils';
import { NativeTree, type NativeElement } from './native-tree';
import { createComponent, render, RenderContext } from './renderer';
import { ValdiBinarySink, type BatchStats } from './transport';

export type PageShowReason = 'navigation' | 'tab' | 'foreground' | (string & {});
export type PageHideReason = 'covered' | 'tab' | 'background' | (string & {});
export type PageVisibleEffect = () => void | (() => void);

export interface SolidPageProps<ViewModel = any, Context = any> {
  /** Fixed initial route params snapshot captured on page mount. */
  readonly params: ViewModel extends { params: infer P } ? P : undefined;
  /** Reactive safe-area insets updated on orientation/safe-area changes (unchanged on keyboard show/hide). */
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
  readonly componentPath: string;
  readonly componentContext: any;
  readonly initialViewModel: any;
  latestViewModel: any;
  readonly tree: NativeTree;
  lifecycle: PageLifecycleController;
  setViewModel: (viewModel: any) => void;
  dispose: () => void;
  unsubscribeHotReload?: () => void;
  renderer: {
    onNextDraw(cb: () => void): void;
  };
}

function getObservingModule(): { path: string } {
  return typeof module !== 'undefined' && typeof module.path === 'string'
    ? module
    : { path: 'solid_native/src/bridge' };
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
  const loaded = getModuleLoader().load(modulePath, true, true);
  const comp = loaded?.[symbol];
  if (typeof comp !== 'function') {
    throw new Error(`Component "${symbol}" in "${modulePath}" is not a Solid function component`);
  }
  return comp as SolidPageComponent;
}

function mountPage(
  contextId: string,
  Page: SolidPageComponent,
  tree: NativeTree,
  viewModel: any,
  initialViewModel: any,
  componentContext: any,
): {
  lifecycle: PageLifecycleController;
  setViewModel: (viewModel: any) => void;
  dispose: () => void;
} {
  const lifecycle = new PageLifecycleController();
  const [vm, setVm] = createSignal<any>(viewModel);

  // Keep params fixed on mount while exposing fine-grained reactive getters on insets for orientation/safe-area changes.
  const rawInsets = viewModel?.insets ?? initialViewModel?.insets;
  let syncInsets: ((nextVm: any) => void) | undefined;
  let reactiveInsets: any;
  if (rawInsets && typeof rawInsets === 'object') {
    const [top, setTop] = createSignal<number>(rawInsets.top ?? 0);
    const [bottom, setBottom] = createSignal<number>(rawInsets.bottom ?? 0);
    const [left, setLeft] = createSignal<number>(rawInsets.left ?? 0);
    const [right, setRight] = createSignal<number>(rawInsets.right ?? 0);
    syncInsets = (nextVm: any) => {
      const next = nextVm?.insets;
      if (!next || typeof next !== 'object') return;
      if (typeof next.top === 'number') setTop(next.top);
      if (typeof next.bottom === 'number') setBottom(next.bottom);
      if (typeof next.left === 'number') setLeft(next.left);
      if (typeof next.right === 'number') setRight(next.right);
    };
    reactiveInsets = Object.freeze({
      get top() {
        return top();
      },
      get bottom() {
        return bottom();
      },
      get left() {
        return left();
      },
      get right() {
        return right();
      },
    });
  }
  const initialParams = viewModel?.params !== undefined ? viewModel.params : initialViewModel?.params;

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
                  insets: reactiveInsets,
                  initialViewModel,
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

  // Flush initial mount synchronously so native root views appear before create()/hotReload() completes.
  tree.flush();

  const updateViewModel = (nextViewModel: any): void => {
    syncInsets?.(nextViewModel);
    setVm(() => nextViewModel);
  };

  return { lifecycle, setViewModel: updateViewModel, dispose };
}

export interface StashedPageHandle {
  readonly contextId: string;
  readonly componentPath: string;
  readonly componentContext: any;
  readonly initialViewModel: any;
  readonly latestViewModel: any;
}

export interface RootComponentsManagerOptions {
  readonly daemonClientManager?: DaemonClientManager;
  readonly submitDebugMessage?: SubmitDebugMessageFunc;
}

export interface SolidRootComponentsManager extends IRootComponentsManager {
  readonly rootComponents: Record<string, PageSession>;
  getBatchStats(contextId: string): BatchStats | undefined;
}

const DEBUG_LEVEL_DEBUG = 0 as DebugLevel;
const DEBUG_LEVEL_WARN = 2 as DebugLevel;
const DEBUG_LEVEL_ERROR = 3 as DebugLevel;

const DAEMON_LIST_CONTEXTS_REQUEST = 2 as DaemonClientMessageType.LIST_CONTEXTS_REQUEST;
const DAEMON_GET_CONTEXT_TREE_REQUEST = 3 as DaemonClientMessageType.GET_CONTEXT_TREE_REQUEST;
const DAEMON_TAKE_ELEMENT_SNAPSHOT_REQUEST = 4 as DaemonClientMessageType.TAKE_ELEMENT_SNAPSHOT_REQUEST;

function serializeElementNode(
  node: NativeElement,
  session: PageSession,
  includeComponentData: boolean,
  isRoot: boolean,
): IRenderedVirtualNodeData {
  const attributes: Record<string, string> = {};
  for (const attributeName in node.props) {
    const value = node.props[attributeName];
    if (value !== undefined) {
      attributes[attributeName] = debugStringify(value, 3, true);
    }
  }

  const children: IRenderedVirtualNodeData[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.kind === 'element') {
      children.push(serializeElementNode(child, session, includeComponentData, false));
    }
  }

  return {
    key: String(node.id),
    tag: node.tag,
    element: {
      id: node.id,
      frame: node.frame,
      attributes,
    },
    component: isRoot
      ? includeComponentData
        ? { viewModel: debugStringify(session.latestViewModel, 4, true) }
        : {}
      : undefined,
    children: children.length > 0 ? children : undefined,
  };
}

export function createRootComponentsManager(options?: RootComponentsManagerOptions): SolidRootComponentsManager {
  const rootComponents: Record<string, PageSession> = {};
  let reloadedContextIds: string[] | undefined;
  let reloadMessageTimer: ReturnType<typeof setTimeout> | undefined;

  const runtime = getValdiRuntime();
  const submitDebugMessage: SubmitDebugMessageFunc =
    options?.submitDebugMessage ??
    ((level, message) => {
      runtime.submitDebugMessage?.(level, message);
    });
  const daemonClientManager =
    options && 'daemonClientManager' in options
      ? options.daemonClientManager
      : runtime.isDebugEnabled
        ? getDaemonClientManager()
        : undefined;

  const showHotReloadedMessage = (): void => {
    reloadMessageTimer = undefined;
    const ids = reloadedContextIds;
    if (!ids) return;
    reloadedContextIds = undefined;

    const reloadedPaths = new Set<string>();
    for (const contextId of ids) {
      const session = rootComponents[contextId];
      if (session) {
        reloadedPaths.add(session.componentPath);
      }
    }

    submitDebugMessage(DEBUG_LEVEL_DEBUG, `Reloaded ${ids.length} from ${[...reloadedPaths].join(', ')}`);
  };

  const onHotReloaded = (contextId: string): void => {
    if (!reloadedContextIds) {
      reloadedContextIds = [];
      reloadMessageTimer = setTimeout(showHotReloadedMessage, 0);
    }
    reloadedContextIds.push(contextId);
  };

  const hotReload = (contextId: string): void => {
    const session = rootComponents[contextId];
    if (!session || !session.tree.alive) return;

    let Page: SolidPageComponent;
    try {
      Page = resolvePageComponent(session.componentPath);
    } catch (error) {
      const msg = `[HotReload] Failed to load ${session.componentPath} (${contextId}):`;
      console.error(msg, error);
      submitDebugMessage(DEBUG_LEVEL_ERROR, `${msg} ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const prevDispose = session.dispose;
    const prevLifecycle = session.lifecycle;
    session.dispose = () => {};

    try {
      withLocalNativeRefs(contextId, () => {
        try {
          prevDispose();
        } finally {
          prevLifecycle.dispose();
        }
        const remaining = session.tree.root.children;
        if (remaining.length > 0) {
          session.tree.cleanup(session.tree.root, remaining);
        }
        session.tree.flush();
      });

      if (rootComponents[contextId] !== session || !session.tree.alive) {
        return;
      }

      // Clear any halt left by an earlier render error before mounting the reloaded page.
      resetErrorHalt();
      const mounted = mountPage(
        contextId,
        Page,
        session.tree,
        session.latestViewModel,
        session.initialViewModel,
        session.componentContext,
      );
      session.lifecycle = mounted.lifecycle;
      session.setViewModel = mounted.setViewModel;
      session.dispose = mounted.dispose;

      withLocalNativeRefs(contextId, () => mounted.lifecycle.sync(session.latestViewModel));
      onHotReloaded(contextId);
      console.log(`[HotReload] Reloaded ${session.componentPath} (${contextId})`);
    } catch (error) {
      resetErrorHalt();
      const msg = `[HotReload] Failed to render ${session.componentPath} (${contextId}):`;
      console.error(msg, error);
      submitDebugMessage(DEBUG_LEVEL_ERROR, `${msg} ${error instanceof Error ? error.message : String(error)}`);
      try {
        withLocalNativeRefs(contextId, () => {
          const remaining = session.tree.root.children;
          if (remaining.length > 0) {
            session.tree.cleanup(session.tree.root, remaining);
          }
          session.tree.flush();
        });
      } catch {
        // Ignore secondary cleanup errors so the hot reload listener stays active.
      }
    }
  };

  const createSession = (
    contextId: string,
    componentPath: string,
    initialViewModel: any,
    latestViewModel: any,
    componentContext: any,
  ): void => {
    const { modulePath } = parseComponentPath(componentPath);
    const Page = resolvePageComponent(componentPath);
    const sink = new ValdiBinarySink(contextId);
    const tree = new NativeTree(sink);
    const mounted = mountPage(contextId, Page, tree, latestViewModel, initialViewModel, componentContext);

    const loader = getModuleLoader();
    const unsubscribeHotReload =
      typeof loader.onHotReload === 'function'
        ? loader.onHotReload(getObservingModule(), modulePath, () => hotReload(contextId))
        : undefined;

    rootComponents[contextId] = {
      componentPath,
      componentContext,
      initialViewModel,
      latestViewModel,
      tree,
      lifecycle: mounted.lifecycle,
      setViewModel: mounted.setViewModel,
      dispose: mounted.dispose,
      unsubscribeHotReload,
      renderer: {
        onNextDraw(cb: () => void) {
          tree.onNextDraw(cb);
        },
      },
    };

    withLocalNativeRefs(contextId, () => mounted.lifecycle.sync(latestViewModel));
  };

  let daemonListener: IDaemonClientManagerListener | undefined;
  if (daemonClientManager) {
    daemonListener = {
      onMessage(message: ReceivedDaemonClientMessage) {
        const msg = message.message;
        if (msg.type === DAEMON_LIST_CONTEXTS_REQUEST) {
          const contexts: RemoteValdiContext[] = [];
          for (const treeId of Object.keys(rootComponents)) {
            const session = rootComponents[treeId];
            if (!session) continue;
            contexts.push({
              id: treeId,
              rootComponentName: parseComponentPath(session.componentPath).symbol,
            });
          }
          message.respond(requestId => Messages.listContextsResponse(requestId, contexts));
        } else if (msg.type === DAEMON_GET_CONTEXT_TREE_REQUEST) {
          const contextId = msg.body.id;
          const session = rootComponents[contextId];
          if (!session) {
            message.respond(requestId => Messages.errorResponse(requestId, `No context with id ${contextId}`));
            return;
          }
          const includeComponentData = msg.body.includeComponentData === true;
          const treeData = serializeElementNode(session.tree.root, session, includeComponentData, true);
          message.respond(requestId => Messages.getContextTreeResponse(requestId, treeData));
        } else if (msg.type === DAEMON_TAKE_ELEMENT_SNAPSHOT_REQUEST) {
          const { contextId, elementId } = msg.body;
          const session = rootComponents[contextId];
          if (!session) {
            message.respond(requestId => Messages.errorResponse(requestId, `No context with id ${contextId}`));
            return;
          }
          const element = session.tree.getElementById(elementId);
          if (!element) {
            message.respond(requestId => Messages.errorResponse(requestId, `No node with id ${elementId}`));
            return;
          }
          void element.takeSnapshot().then(snapshot => {
            message.respond(requestId => Messages.takeElementSnapshotResponse(requestId, snapshot ?? ''));
          });
        }
      },
    };
    daemonClientManager.addListener(daemonListener);
  }

  return {
    rootComponents,

    getBatchStats(contextId: string): BatchStats | undefined {
      return rootComponents[contextId]?.tree.sink.stats;
    },

    create(contextId: string, componentPath: string, viewModel: any, componentContext: any): void {
      createSession(contextId, componentPath, viewModel, viewModel, componentContext);
    },

    render(contextId: string, viewModel: any): void {
      const session = rootComponents[contextId];
      if (!session) return;
      session.latestViewModel = viewModel;
      withLocalNativeRefs(contextId, () => {
        session.lifecycle.sync(viewModel);
        session.setViewModel(viewModel);
      });
    },

    destroy(contextId: string): void {
      const session = rootComponents[contextId];
      if (!session) return;
      delete rootComponents[contextId];
      try {
        session.unsubscribeHotReload?.();
      } finally {
        try {
          session.dispose();
        } finally {
          try {
            session.lifecycle.dispose();
          } finally {
            session.tree.dispose();
          }
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
      const formatted = `[Valdi:${contextId}] ${message}`;
      if (isError) {
        console.error(formatted);
        submitDebugMessage(DEBUG_LEVEL_ERROR, formatted);
      } else {
        console.warn(formatted);
        submitDebugMessage(DEBUG_LEVEL_WARN, formatted);
      }
    },

    stashData(): StashedPageHandle[] {
      if (reloadMessageTimer !== undefined) {
        clearTimeout(reloadMessageTimer);
        reloadMessageTimer = undefined;
      }
      reloadedContextIds = undefined;

      const handles: StashedPageHandle[] = [];
      for (const contextId of Object.keys(rootComponents)) {
        const session = rootComponents[contextId];
        if (!session) continue;

        handles.push({
          contextId,
          componentPath: session.componentPath,
          componentContext: session.componentContext,
          initialViewModel: session.initialViewModel,
          latestViewModel: session.latestViewModel,
        });

        delete rootComponents[contextId];
        withLocalNativeRefs(contextId, () => {
          try {
            session.unsubscribeHotReload?.();
          } catch (error) {
            console.error(`Error while unsubscribing hot reload before stashing (${contextId}):`, error);
          }
          try {
            try {
              session.dispose();
            } finally {
              session.lifecycle.dispose();
            }
            const remaining = session.tree.root.children;
            if (remaining.length > 0) {
              session.tree.cleanup(session.tree.root, remaining);
            }
            session.tree.flush();
          } catch (error) {
            console.error(`Error while disposing Solid root before hot reloading (${contextId}):`, error);
          } finally {
            session.tree.dispose();
          }
        });
      }

      if (daemonClientManager && daemonListener) {
        daemonClientManager.removeListener(daemonListener);
      }

      return handles;
    },

    restoreData(data: any): void {
      if (!Array.isArray(data)) return;
      resetErrorHalt();
      for (const rawHandle of data) {
        if (!rawHandle || typeof rawHandle.contextId !== 'string' || typeof rawHandle.componentPath !== 'string') {
          continue;
        }
        const handle = rawHandle as StashedPageHandle;
        if (rootComponents[handle.contextId]) {
          continue;
        }
        withLocalNativeRefs(handle.contextId, () => {
          createSession(
            handle.contextId,
            handle.componentPath,
            handle.initialViewModel,
            handle.latestViewModel,
            handle.componentContext,
          );
          onHotReloaded(handle.contextId);
        });
      }
    },
  };
}
