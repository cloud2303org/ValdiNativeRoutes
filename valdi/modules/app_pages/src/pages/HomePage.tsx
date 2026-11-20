import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { systemBoldFont, systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { router } from '../router';
import { accentColor, cycleAccent, globalCount, setGlobalCount } from '../sharedState';

interface ListItem {
  id: number;
  label: string;
}

function describeJsEngine(): string {
  const hermes = (globalThis as any).HermesInternal;
  if (!hermes) return 'QuickJS / JS';
  const version = hermes.getRuntimeProperties?.()?.['OSS Release Version'];
  return version ? `Hermes ${version}` : 'Hermes';
}

const JS_ENGINE = describeJsEngine();

function ActionButton(props: {
  title: string;
  backgroundColor?: string;
  textColor?: string;
  flexGrow?: number;
  marginRight?: number;
  onTap: () => void;
}) {
  return (
    <view
      flexGrow={props.flexGrow}
      marginRight={props.marginRight}
      marginBottom={8}
      paddingTop={10}
      paddingBottom={10}
      paddingLeft={12}
      paddingRight={12}
      borderRadius={10}
      backgroundColor={props.backgroundColor ?? '#E8EEF9'}
      alignItems="center"
      justifyContent="center"
      onTap={props.onTap}
    >
      <label
        value={props.title}
        font={systemSemiboldFont(13)}
        color={props.textColor ?? '#1E3A8A'}
        numberOfLines={1}
      />
    </view>
  );
}

export function HomePage(props: SolidPageProps<PageViewModel, PageContext>) {
  const [localCount, setLocalCount] = createSignal(0);
  const [showPanel, setShowPanel] = createSignal(true);
  const [nextItemId, setNextItemId] = createSignal(4);
  const [items, setItems] = createSignal<ListItem[]>([
    { id: 1, label: 'Alpha signal row' },
    { id: 2, label: 'Beta signal row' },
    { id: 3, label: 'Gamma signal row' },
  ]);
  const [statsTick, setStatsTick] = createSignal(0);

  let statsTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (statsTimer !== undefined) clearTimeout(statsTimer);
  });

  const refreshStats = () => {
    if (statsTimer !== undefined) clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
      statsTimer = undefined;
      setStatsTick(t => t + 1);
    }, 0);
  };

  const sum = createMemo(() => localCount() + globalCount());
  const batchStatsSummary = createMemo(() => {
    statsTick();
    const s = props.tree.sink.stats;
    return `Batches: ${s.batches} · Last ops: ${s.lastBatchOps} · Total ops: ${s.totalOps}`;
  });

  const appendItem = () => {
    const id = nextItemId();
    setNextItemId(id + 1);
    setItems(list => [...list, { id, label: `Item #${id} (appended)` }]);
    refreshStats();
  };

  const prependItem = () => {
    const id = nextItemId();
    setNextItemId(id + 1);
    setItems(list => [{ id, label: `Item #${id} (prepended)` }, ...list]);
    refreshStats();
  };

  const reverseItems = () => {
    setItems(list => [...list].reverse());
    refreshStats();
  };

  const rotateItems = () => {
    setItems(list => (list.length <= 1 ? list : [...list.slice(1), list[0]]));
    refreshStats();
  };

  const clearItems = () => {
    setItems([]);
    refreshStats();
  };

  return (
    <scroll flexGrow={1} backgroundColor="#F3F6FA" showsVerticalScrollIndicator={true}>
      <view
        paddingTop={Math.max(props.viewModel().insets.top, 20) + 12}
        paddingBottom={Math.max(props.viewModel().insets.bottom, 16) + 24}
        paddingLeft={16}
        paddingRight={16}
        flexDirection="column"
      >
        <view
          padding={16}
          borderRadius={16}
          backgroundColor="#0F172A"
          marginBottom={14}
          flexDirection="column"
        >
          <label
            value="Solid 2.0 Universal + Valdi"
            font={systemBoldFont(20)}
            color="#FFFFFF"
            marginBottom={6}
          />
          <label
            value={`Engine: ${JS_ENGINE} · Mode: ${props.tree.sink.mode} · Root #${props.contextId}`}
            font={systemFont(12)}
            color="#94A3B8"
            marginBottom={6}
          />
          <label
            value={batchStatsSummary()}
            font={systemSemiboldFont(12)}
            color="#38BDF8"
          />
        </view>

        <view
          padding={14}
          borderRadius={14}
          backgroundColor="#FFFFFF"
          borderWidth={1}
          borderColor="#E2E8F0"
          marginBottom={14}
          flexDirection="column"
        >
          <view flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={10}>
            <label value="Fine-Grained Signals & Auto-Batch" font={systemSemiboldFont(15)} color="#0F172A" />
            <view
              width={18}
              height={18}
              borderRadius={9}
              backgroundColor={accentColor()}
            />
          </view>

          <label
            value={`Local: ${localCount()}   ·   Global: ${globalCount()}   ·   Sum: ${sum()}`}
            font={systemFont(14)}
            color="#334155"
            marginBottom={12}
          />

          <view flexDirection="row" flexWrap="wrap">
            <ActionButton
              title="+1 Local"
              flexGrow={1}
              marginRight={8}
              onTap={() => {
                setLocalCount(c => c + 1);
                refreshStats();
              }}
            />
            <ActionButton
              title="+1 Global"
              flexGrow={1}
              marginRight={8}
              onTap={() => {
                setGlobalCount(c => c + 1);
                refreshStats();
              }}
            />
            <ActionButton
              title="Burst x3 (1 Batch)"
              backgroundColor={accentColor()}
              textColor="#FFFFFF"
              flexGrow={1}
              onTap={() => {
                setLocalCount(c => c + 1);
                setGlobalCount(c => c + 1);
                cycleAccent();
                refreshStats();
              }}
            />
          </view>
        </view>

        <view
          padding={14}
          borderRadius={14}
          backgroundColor="#FFFFFF"
          borderWidth={1}
          borderColor="#E2E8F0"
          marginBottom={14}
          flexDirection="column"
        >
          <view flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={10}>
            <label value="<Show> Conditional Subtree" font={systemSemiboldFont(15)} color="#0F172A" />
            <ActionButton
              title={showPanel() ? 'Hide' : 'Show'}
              backgroundColor="#EEF2FF"
              textColor="#3730A3"
              onTap={() => {
                setShowPanel(v => !v);
                refreshStats();
              }}
            />
          </view>

          <Show
            when={showPanel()}
            fallback={
              <view padding={10} borderRadius={10} backgroundColor="#F8FAFC">
                <label value="Panel unmounted cleanly (fallback shown)." font={systemFont(13)} color="#64748B" />
              </view>
            }
          >
            <view padding={12} borderRadius={10} backgroundColor="#ECFDF5" borderWidth={1} borderColor="#A7F3D0">
              <label
                value={`Mounted panel · Accent: ${accentColor()} · Sum: ${sum()}`}
                font={systemSemiboldFont(13)}
                color="#065F46"
              />
            </view>
          </Show>
        </view>

        <view
          padding={14}
          borderRadius={14}
          backgroundColor="#FFFFFF"
          borderWidth={1}
          borderColor="#E2E8F0"
          marginBottom={16}
          flexDirection="column"
        >
          <label
            value={`<For> Keyed List (${items().length} items)`}
            font={systemSemiboldFont(15)}
            color="#0F172A"
            marginBottom={10}
          />

          <view flexDirection="row" flexWrap="wrap" marginBottom={8}>
            <ActionButton title="+ Append" marginRight={6} onTap={appendItem} />
            <ActionButton title="+ Prepend" marginRight={6} onTap={prependItem} />
            <ActionButton title="Reverse" marginRight={6} onTap={reverseItems} />
            <ActionButton title="Rotate" marginRight={6} onTap={rotateItems} />
            <ActionButton title="Clear" backgroundColor="#FEE2E2" textColor="#991B1B" onTap={clearItems} />
          </view>

          <For
            each={items()}
            fallback={
              <view padding={10} borderRadius={10} backgroundColor="#F8FAFC">
                <label value="List is empty. Tap + Append or + Prepend." font={systemFont(13)} color="#64748B" />
              </view>
            }
          >
            {(item, index) => (
              <view
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                paddingTop={8}
                paddingBottom={8}
                paddingLeft={12}
                paddingRight={12}
                borderRadius={10}
                backgroundColor="#F8FAFC"
                marginBottom={6}
              >
                <label
                  value={`[${index()}] #${item.id} · ${item.label}`}
                  font={systemFont(13)}
                  color="#1E293B"
                  flexShrink={1}
                />
                <view
                  paddingTop={4}
                  paddingBottom={4}
                  paddingLeft={10}
                  paddingRight={10}
                  borderRadius={8}
                  backgroundColor="#FEE2E2"
                  marginLeft={8}
                  onTap={() => {
                    setItems(list => list.filter(candidate => candidate.id !== item.id));
                    refreshStats();
                  }}
                >
                  <label value="×" font={systemBoldFont(14)} color="#B91C1C" />
                </view>
              </view>
            )}
          </For>
        </view>

        <view
          padding={14}
          borderRadius={14}
          backgroundColor={accentColor()}
          alignItems="center"
          justifyContent="center"
          onTap={() => router.push('shared')}
        >
          <label
            value="Open Page 2 (New Solid Root) →"
            font={systemBoldFont(15)}
            color="#FFFFFF"
          />
        </view>
      </view>
    </scroll>
  );
}
