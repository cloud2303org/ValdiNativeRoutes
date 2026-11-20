import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createSignal, onCleanup } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { systemBoldFont, systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { accentColor, cycleAccent, globalCount, setGlobalCount } from '../sharedState';

export function SharedPage(props: SolidPageProps<PageViewModel, PageContext>) {
  const [aliveSeconds, setAliveSeconds] = createSignal(0);

  const timer = setInterval(() => {
    setAliveSeconds(s => s + 1);
  }, 1000);
  onCleanup(() => clearInterval(timer));

  return (
    <scroll flexGrow={1} backgroundColor="#F3F6FA" showsVerticalScrollIndicator={true}>
      <view
        paddingTop={Math.max(props.viewModel().insets.top, 20) + 12}
        paddingBottom={Math.max(props.viewModel().insets.bottom, 16) + 24}
        paddingLeft={16}
        paddingRight={16}
        flexDirection="column"
      >
        <view padding={16} borderRadius={16} backgroundColor="#0F172A" marginBottom={14} flexDirection="column">
          <label value="Page 2 — Independent Solid Root" font={systemBoldFont(18)} color="#FFFFFF" marginBottom={6} />
          <label
            value={`Root #${props.contextId} · Transport: ${props.tree.sink.mode}`}
            font={systemFont(12)}
            color="#94A3B8"
          />
        </view>

        <view
          padding={16}
          borderRadius={14}
          backgroundColor="#FFFFFF"
          borderWidth={1}
          borderColor="#E2E8F0"
          marginBottom={14}
          flexDirection="column"
        >
          <view flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={10}>
            <label value="Shared Runtime State" font={systemSemiboldFont(15)} color="#0F172A" />
            <view width={18} height={18} borderRadius={9} backgroundColor={accentColor()} />
          </view>
          <label
            value={`Global Counter: ${globalCount()} · Accent: ${accentColor()}`}
            font={systemFont(14)}
            color="#334155"
            marginBottom={6}
          />
          <label
            value={`Root #${props.contextId} uptime: ${aliveSeconds()}s (cleaned up via onCleanup on back)`}
            font={systemFont(12)}
            color="#64748B"
            marginBottom={14}
          />

          <view flexDirection="row">
            <view
              flexGrow={1}
              marginRight={8}
              padding={12}
              borderRadius={10}
              backgroundColor="#E8EEF9"
              alignItems="center"
              onTap={() => setGlobalCount(c => c + 10)}
            >
              <label value="+10 Global" font={systemSemiboldFont(13)} color="#1E3A8A" />
            </view>
            <view
              flexGrow={1}
              padding={12}
              borderRadius={10}
              backgroundColor={accentColor()}
              alignItems="center"
              onTap={cycleAccent}
            >
              <label value="Switch Accent" font={systemSemiboldFont(13)} color="#FFFFFF" />
            </view>
          </view>
        </view>

        <view
          padding={14}
          borderRadius={14}
          backgroundColor="#1E293B"
          alignItems="center"
          onTap={() => props.context.back()}
        >
          <label value="← Back to Page 1" font={systemBoldFont(15)} color="#FFFFFF" />
        </view>
      </view>
    </scroll>
  );
}
