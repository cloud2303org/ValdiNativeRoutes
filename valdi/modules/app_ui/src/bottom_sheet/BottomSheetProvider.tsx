import { Component, StatefulComponent } from 'valdi_core/src/Component';
import { createProviderComponentWithKeyName } from 'valdi_core/src/provider/createProvider';
import { resolveProviderSource } from 'valdi_core/src/provider/resolveProviderSource';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';

export interface PortalEntry {
  readonly key: string;
  readonly slot: DetachedSlot;
  openOrder: number;
  readonly insertionOrder: number;
}

/**
 * Internal portal registry shared between `BottomSheetProvider` and `BottomSheet`.
 */
export class BottomSheetPortalRegistry {
  private entries = new Map<string, PortalEntry>();
  private openOrderCounter = 0;
  private insertionCounter = 0;
  private listener?: () => void;

  nextOpenOrder(): number {
    this.openOrderCounter += 1;
    return this.openOrderCounter;
  }

  setListener(listener: (() => void) | undefined): void {
    this.listener = listener;
  }

  upsert(key: string, slot: DetachedSlot, openOrder: number): void {
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.slot === slot && existing.openOrder === openOrder) {
        return;
      }
      existing.openOrder = openOrder;
      this.entries.set(key, {
        key,
        slot,
        openOrder,
        insertionOrder: existing.insertionOrder,
      });
    } else {
      this.insertionCounter += 1;
      this.entries.set(key, {
        key,
        slot,
        openOrder,
        insertionOrder: this.insertionCounter,
      });
    }
    this.listener?.();
  }

  unmount(key: string): void {
    if (this.entries.delete(key)) {
      this.listener?.();
    }
  }

  getOrderedEntries(): PortalEntry[] {
    const list = Array.from(this.entries.values());
    list.sort((a, b) => {
      if (a.openOrder !== b.openOrder) {
        return a.openOrder - b.openOrder;
      }
      return a.insertionOrder - b.insertionOrder;
    });
    return list;
  }
}

const PortalRegistryProvider =
  createProviderComponentWithKeyName<BottomSheetPortalRegistry>('BottomSheetPortalRegistry');

export function resolveOptionalPortalRegistry(): BottomSheetPortalRegistry | undefined {
  const source = resolveProviderSource();
  const key = PortalRegistryProvider.getProviderKey();
  if (!source || !source.hasValue(key)) {
    return undefined;
  }
  return source.getValue(key);
}

interface PortalHostViewModel {
  registry: BottomSheetPortalRegistry;
}

interface PortalHostState {
  entries: PortalEntry[];
}

class BottomSheetPortalHost extends StatefulComponent<PortalHostViewModel, PortalHostState> {
  state: PortalHostState = {
    entries: [],
  };

  private readonly handleRegistryChange = (): void => {
    this.setState({
      entries: this.viewModel.registry.getOrderedEntries(),
    });
  };

  override onCreate(): void {
    this.viewModel.registry.setListener(this.handleRegistryChange);
    this.state = {
      entries: this.viewModel.registry.getOrderedEntries(),
    };
  }

  override onViewModelUpdate(previousViewModel?: PortalHostViewModel): void {
    if (previousViewModel && previousViewModel.registry !== this.viewModel.registry) {
      previousViewModel.registry.setListener(undefined);
      this.viewModel.registry.setListener(this.handleRegistryChange);
      this.setState({
        entries: this.viewModel.registry.getOrderedEntries(),
      });
    }
  }

  override onDestroy(): void {
    this.viewModel.registry.setListener(undefined);
  }

  override onRender(): void {
    <custom-view
      iosClass="VRBottomSheetPortalHostView"
      androidClass="io.valdiroutes.app.BottomSheetPortalHostView"
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
    >
      {this.state.entries.map(entry => {
        <DetachedSlotRenderer key={entry.key} detachedSlot={entry.slot} />;
      })}
    </custom-view>;
  }
}

/** Props for {@link BottomSheetProvider}. */
export interface BottomSheetProviderProps {
  children?: unknown;
}

/**
 * Provides the portal layer in which `ModalBottomSheet` instances render above
 * surrounding UI. Place a single `BottomSheetProvider` near the root of your
 * app (or inside any subtree whose bounds should scope modal presentation).
 */
export class BottomSheetProvider extends Component<BottomSheetProviderProps> {
  private readonly registry = new BottomSheetPortalRegistry();

  override onRender(): void {
    <PortalRegistryProvider value={this.registry}>
      <view flexGrow={1}>
        <slot />
        <BottomSheetPortalHost registry={this.registry} />
      </view>
    </PortalRegistryProvider>;
  }
}
