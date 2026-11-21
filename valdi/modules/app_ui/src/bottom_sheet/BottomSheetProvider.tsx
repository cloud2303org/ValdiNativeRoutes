import { createContext, createSignal, For, useContext, type Accessor, type Setter } from 'solid-js';

export interface PortalEntry {
  readonly key: string;
  readonly element: JSX.Element;
  openOrder: number;
  readonly insertionOrder: number;
}

/**
 * Internal portal registry shared between `BottomSheetProvider` and `BottomSheet`.
 */
export class BottomSheetPortalRegistry {
  private readonly entryMap = new Map<string, PortalEntry>();
  private openOrderCounter = 0;
  private insertionCounter = 0;
  readonly entries: Accessor<PortalEntry[]>;
  private readonly setOrderedEntries: Setter<PortalEntry[]>;

  constructor() {
    const [orderedEntries, setOrderedEntries] = createSignal<PortalEntry[]>([]);
    this.entries = orderedEntries;
    this.setOrderedEntries = setOrderedEntries;
  }

  nextOpenOrder(): number {
    this.openOrderCounter += 1;
    return this.openOrderCounter;
  }

  upsert(key: string, element: JSX.Element, openOrder: number): void {
    const existing = this.entryMap.get(key);
    if (existing) {
      if (existing.element === element && existing.openOrder === openOrder) {
        return;
      }
      if (existing.element === element) {
        // Mutate openOrder in-place on the same entry reference so Solid <For> reorders
        // the existing native BottomSheetView in-place instead of destroying and recreating it.
        existing.openOrder = openOrder;
      } else {
        this.entryMap.set(key, {
          key,
          element,
          openOrder,
          insertionOrder: existing.insertionOrder,
        });
      }
    } else {
      this.insertionCounter += 1;
      this.entryMap.set(key, {
        key,
        element,
        openOrder,
        insertionOrder: this.insertionCounter,
      });
    }
    this.setOrderedEntries(() => this.getOrderedEntries());
  }

  unmount(key: string): void {
    if (this.entryMap.delete(key)) {
      this.setOrderedEntries(() => this.getOrderedEntries());
    }
  }

  getOrderedEntries(): PortalEntry[] {
    const list = Array.from(this.entryMap.values());
    list.sort((a, b) => {
      if (a.openOrder !== b.openOrder) {
        return a.openOrder - b.openOrder;
      }
      return a.insertionOrder - b.insertionOrder;
    });
    return list;
  }
}

export const BottomSheetPortalContext = createContext<BottomSheetPortalRegistry | null>(null);

export function resolveOptionalPortalRegistry(): BottomSheetPortalRegistry | undefined {
  return useContext(BottomSheetPortalContext) ?? undefined;
}

function BottomSheetPortalHost(props: { registry: BottomSheetPortalRegistry }) {
  return (
    <custom-view
      iosClass="VRBottomSheetPortalHostView"
      androidClass="io.valdiroutes.app.BottomSheetPortalHostView"
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
    >
      <For each={props.registry.entries()}>{entry => entry.element}</For>
    </custom-view>
  );
}

/** Props for {@link BottomSheetProvider}. */
export interface BottomSheetProviderProps {
  children?: JSX.Element;
}

/**
 * Provides the portal layer in which `ModalBottomSheet` instances render above
 * surrounding UI. Place a single `BottomSheetProvider` near the root of your
 * app (or inside any subtree whose bounds should scope modal presentation).
 */
export function BottomSheetProvider(props: BottomSheetProviderProps) {
  const registry = new BottomSheetPortalRegistry();
  return (
    <BottomSheetPortalContext value={registry}>
      <view flexGrow={1}>
        {props.children}
        <BottomSheetPortalHost registry={registry} />
      </view>
    </BottomSheetPortalContext>
  );
}
