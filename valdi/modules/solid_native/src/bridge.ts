import { createSignal, type Accessor, type Setter } from 'solid-js';
import type { IRootComponentsManager } from 'valdi_core/src/IRootComponentsManager';
import { getModuleLoader } from 'valdi_core/src/ModuleLoaderGlobal';
import { withLocalNativeRefs } from 'valdi_core/src/NativeReferences';
import { NativeTree } from './native-tree';
import { createComponent, render, RenderContext } from './renderer';
import { ValdiBinarySink, type BatchStats } from './transport';

export interface SolidPageProps<ViewModel = any, Context = any> {
  viewModel: Accessor<ViewModel>;
  context: Context;
  contextId: string;
  tree: NativeTree;
}

export type SolidPageComponent<ViewModel = any, Context = any> = (
  props: SolidPageProps<ViewModel, Context>,
) => JSX.Element;

interface PageSession {
  tree: NativeTree;
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
      const [vm, setVm] = createSignal<any>(viewModel);

      // Each page gets its own disposable Solid root while sharing the single global solid_runtime.
      const dispose = withLocalNativeRefs(contextId, () =>
        render(
          () =>
            createComponent(RenderContext, {
              value: tree,
              get children() {
                return createComponent(Page, {
                  viewModel: vm,
                  context: componentContext,
                  contextId,
                  tree,
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
        setViewModel: setVm,
        dispose,
        renderer: {
          onNextDraw(cb: () => void) {
            tree.onNextDraw(cb);
          },
        },
      };
    },

    render(contextId: string, viewModel: any): void {
      const session = rootComponents[contextId];
      if (!session) return;
      session.setViewModel(() => viewModel);
    },

    destroy(contextId: string): void {
      const session = rootComponents[contextId];
      if (!session) return;
      delete rootComponents[contextId];
      try {
        session.dispose();
      } finally {
        session.tree.dispose();
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
