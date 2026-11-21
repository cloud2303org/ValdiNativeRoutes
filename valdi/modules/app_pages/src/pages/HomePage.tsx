import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { appUIApi, BottomSheetProvider, ModalBottomSheet } from 'app_ui/src/index';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Lazy } from 'solid_native/src/Lazy';
import { useAnimate } from 'solid_native/src/renderer';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { router } from '../router';
import { accentColor, cycleAccent, globalCount, setGlobalCount } from '../sharedState';

const parityCardStyle = new Style<View>({
  padding: 14,
  borderRadius: 14,
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E2E8F0',
  marginBottom: 14,
  flexDirection: 'column',
});

const chipStyle = new Style<View>({
  paddingTop: 6,
  paddingBottom: 6,
  paddingLeft: 12,
  paddingRight: 12,
  borderRadius: 999,
  backgroundColor: '#F1F5F9',
  borderWidth: 1,
  borderColor: '#CBD5E1',
  marginRight: 8,
});

const PARITY_CHIPS = ['Style CSS', 'Native Animate', 'Horizontal Scroll', 'onLayout', 'Visibility'];

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
  minWidth?: number;
  marginRight?: number;
  onTap: () => void;
}) {
  return (
    <view
      flexGrow={props.flexGrow}
      minWidth={props.minWidth}
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
  const animate = useAnimate();
  const ui = appUIApi();
  const topInset = Math.max(props.insets.top, 20) + 12;
  const bottomInset = Math.max(props.insets.bottom, 16) + 24;
  const [localCount, setLocalCount] = createSignal(0);
  const [showPanel, setShowPanel] = createSignal(true);
  const [barExpanded, setBarExpanded] = createSignal(false);
  const [cardWidth, setCardWidth] = createSignal(0);
  const [cardVisible, setCardVisible] = createSignal(false);
  const [sheetIndex, setSheetIndex] = createSignal(-1);
  const [uiStatus, setUiStatus] = createSignal(
    `Fixed insets: top=${Math.round(props.insets.top)} · bottom=${Math.round(props.insets.bottom)}`,
  );
  const [noteText, setNoteText] = createSignal('');
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

  const openNativeDialog = async () => {
    try {
      const res = await ui.showModal({
        title: 'Solid 2.0 Modal',
        content: 'Window-level Solid AppModalOverlay with native keyboard avoidance.',
        editable: true,
        placeholderText: 'Type something...',
      });
      setUiStatus(res.confirm ? `Dialog confirmed: ${res.content || '(empty)'}` : 'Dialog canceled');
    } catch (error) {
      setUiStatus(`Dialog error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openNativeActionSheet = async () => {
    try {
      const res = await ui.showActionSheet({
        alertText: 'Solid AppSheetOverlay',
        itemList: ['Option A', 'Option B', 'Option C'],
      });
      setUiStatus(`ActionSheet picked #${res.tapIndex}`);
    } catch {
      setUiStatus('ActionSheet canceled');
    }
  };

  const openNativePicker = async () => {
    try {
      const res = await ui.showPicker({
        title: 'Pick City',
        options: [
          { value: 'sh', label: 'Shanghai' },
          { value: 'hz', label: 'Hangzhou' },
          { value: 'sz', label: 'Shenzhen' },
        ],
        value: 'sh',
      });
      setUiStatus(res.confirm ? `Picker confirmed: ${res.value}` : 'Picker canceled');
    } catch (error) {
      setUiStatus(`Picker error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <BottomSheetProvider>
      <scroll
        flexGrow={1}
        backgroundColor="#F3F6FA"
        showsVerticalScrollIndicator={true}
        viewportExtensionTop={200}
        viewportExtensionBottom={200}
      >
      <view
        paddingTop={topInset}
        paddingBottom={bottomInset}
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
            value={`Engine: ${JS_ENGINE} · Root #${props.contextId}`}
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
          style={parityCardStyle}
          onLayout={frame => setCardWidth(Math.round(frame.width))}
          onVisibilityChanged={visible => setCardVisible(visible)}
        >
          <view flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={10}>
            <label value="Style, Animate & Scroll" font={systemSemiboldFont(15)} color="#0F172A" />
            <ActionButton
              title={barExpanded() ? 'Collapse Box' : 'Animate Box'}
              minWidth={116}
              backgroundColor="#EEF2FF"
              textColor="#3730A3"
              onTap={() => {
                animate({ duration: 0.25, curve: AnimationCurve.EaseInOut }, () => {
                  setBarExpanded(expanded => !expanded);
                });
                refreshStats();
              }}
            />
          </view>

          <view
            height={12}
            width={barExpanded() ? 240 : 100}
            borderRadius={6}
            backgroundColor={accentColor()}
            marginBottom={8}
          />

          <label
            value={`Measured width: ${cardWidth()}pt · Visible: ${cardVisible() ? 'yes' : 'no'}`}
            font={systemFont(12)}
            color="#64748B"
            marginBottom={10}
          />

          <scroll horizontal={true} showsHorizontalScrollIndicator={false}>
            <view flexDirection="row" alignItems="center">
              <For each={PARITY_CHIPS}>
                {chip => (
                  <view style={chipStyle}>
                    <label value={chip} font={systemSemiboldFont(12)} color="#334155" />
                  </view>
                )}
              </For>
            </view>
          </scroll>

          <Lazy estimatedHeight={36} marginTop={10}>
            <view padding={10} borderRadius={10} backgroundColor="#F8FAFC">
              <label value="Lazy slot (viewport-mounted, recyclable)" font={systemFont(12)} color="#475569" />
            </view>
          </Lazy>
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
          <label value="Native UI, BottomSheet & Keyboard" font={systemSemiboldFont(15)} color="#0F172A" marginBottom={6} />
          <label value={uiStatus()} font={systemFont(12)} color="#475569" marginBottom={10} />
          <view flexDirection="row" flexWrap="wrap" marginBottom={8}>
            <ActionButton
              title={sheetIndex() >= 0 ? 'Close Sheet' : 'Open Sheet'}
              marginRight={8}
              onTap={() => setSheetIndex(sheetIndex() >= 0 ? -1 : 0)}
            />
            <ActionButton title="Show Dialog" marginRight={8} onTap={openNativeDialog} />
            <ActionButton title="ActionSheet" marginRight={8} onTap={openNativeActionSheet} />
            <ActionButton title="Picker" onTap={openNativePicker} />
          </view>
          <view
            paddingLeft={12}
            paddingRight={12}
            paddingTop={8}
            paddingBottom={8}
            borderRadius={10}
            backgroundColor="#F8FAFC"
            borderWidth={1}
            borderColor="#CBD5E1"
          >
            <textfield
              height={28}
              font={systemFont(14)}
              color="#0F172A"
              placeholderColor="#94A3B8"
              placeholder="Tap to test native keyboard lift (insets fixed)..."
              value={noteText()}
              onChange={event => {
                setNoteText(event.text);
                setUiStatus(`Input: ${event.text}`);
              }}
            />
          </view>
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

      <ModalBottomSheet
        index={sheetIndex()}
        detents={['content', '65%']}
        surfaceStyle={{
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        onIndexChange={setSheetIndex}
        onCloseRequest={() => setSheetIndex(-1)}
      >
        <view padding={24} paddingBottom={Math.max(props.insets.bottom, 16) + 16} flexDirection="column">
          <view alignItems="center" marginBottom={14}>
            <view width={36} height={4} borderRadius={2} backgroundColor="#CBD5E1" />
          </view>
          <label value="Solid 2.0 ModalBottomSheet" font={systemBoldFont(18)} color="#0F172A" marginBottom={6} />
          <label
            value={`Rendered via Solid BottomSheetPortalHost · Sum: ${sum()}`}
            font={systemFont(14)}
            color="#475569"
            marginBottom={16}
          />
          <view flexDirection="row">
            <ActionButton
              title="Expand 65%"
              flexGrow={1}
              marginRight={8}
              onTap={() => setSheetIndex(1)}
            />
            <ActionButton
              title="Dismiss"
              backgroundColor="#0F172A"
              textColor="#FFFFFF"
              flexGrow={1}
              onTap={() => setSheetIndex(-1)}
            />
          </view>
        </view>
      </ModalBottomSheet>
    </BottomSheetProvider>
  );
}
