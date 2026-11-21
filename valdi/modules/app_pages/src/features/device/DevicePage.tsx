import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import type { NFCDiscoveredCallback } from 'nfc/src/adapter';
import { createSignal, For, onCleanup } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { GetWifiListCallback } from 'wifi/src/wechat';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router } from '../../router';
import { api } from '../../services/api';

const hex = (buffer: ArrayBuffer) =>
  Array.prototype.map
    .call(new Uint8Array(buffer), (byte: number) => (byte < 16 ? '0' : '') + byte.toString(16))
    .join(':');

const errorText = (error: unknown) => (error as { errMsg?: string }).errMsg ?? String(error);

/**
 * The mini-program Wi-Fi and NFC APIs on `api`, after ExpoNativeRoutes' device examples. Both live as long as the
 * app: leaving the page stops what it started, but the API stays.
 */
export function DevicePage(props: SolidPageProps<PageViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const [log, setLog] = createSignal<string[]>([]);
  const [wifiStarted, setWifiStarted] = createSignal(false);
  const [discovering, setDiscovering] = createSignal(false);

  let alive = true;

  const append = (line: string) => {
    if (!alive) return;
    setLog(prev => [line, ...prev].slice(0, 40));
  };

  const handleWifiList: GetWifiListCallback = ({ wifiList }) => {
    const rows = wifiList.slice(0, 8).map(wifi => `${wifi.SSID || '（隐藏）'} ${wifi.signalStrength ?? ''}`);
    append(`onGetWifiList ${wifiList.length} 个：${rows.join('，')}`);
  };

  const handleTag: NFCDiscoveredCallback = event => {
    append(`onDiscovered id ${hex(event.id)} · ${event.techs.join(', ')} · NDEF ${event.messages.length} 条`);
  };

  onCleanup(() => {
    alive = false;
    api.offGetWifiList(handleWifiList);
    api.getNFCAdapter().offDiscovered(handleTag);
    if (wifiStarted()) api.stopWifi().catch(() => {});
    if (discovering()) {
      api
        .getNFCAdapter()
        .stopDiscovery()
        .catch(() => {});
    }
  });

  const handleTap = async (id: string) => {
    try {
      switch (id) {
        case 'wifi-permission':
          append(JSON.stringify(await api.requestWifiPermission({ operation: 'scan' })));
          break;
        case 'wifi-start':
          if (wifiStarted()) {
            api.offGetWifiList(handleWifiList);
            append((await api.stopWifi()).errMsg);
            setWifiStarted(false);
          } else {
            append((await api.startWifi()).errMsg);
            api.onGetWifiList(handleWifiList);
            setWifiStarted(true);
          }
          break;
        case 'wifi-list':
          append((await api.getWifiList()).errMsg);
          break;
        case 'wifi-connected':
          append(JSON.stringify(await api.getConnectedWifi()));
          break;
        case 'nfc': {
          const adapter = api.getNFCAdapter();
          if (discovering()) {
            adapter.offDiscovered(handleTag);
            append((await adapter.stopDiscovery()).errMsg);
            setDiscovering(false);
          } else {
            adapter.onDiscovered(handleTag);
            append((await adapter.startDiscovery()).errMsg);
            setDiscovering(true);
          }
          break;
        }
      }
    } catch (error) {
      append(errorText(error));
    }
  };

  const { insets } = props;
  const isTab = props.initialViewModel.presentation === 'tab';

  return (
    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          paddingTop={insets.top + 12}
          paddingBottom={insets.bottom + 32}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <PageHeader
            title="Wi-Fi 与 NFC"
            subtitle="api.startWifi / getWifiList / getNFCAdapter …"
            onBack={isTab ? undefined : () => router.back()}
          />

          <label style={styles.section} value="Wi-Fi" />
          <Button id="wifi-permission" title="requestWifiPermission（扫描）" secondary={true} onTap={handleTap} />
          <Button id="wifi-start" title={wifiStarted() ? 'stopWifi' : 'startWifi'} onTap={handleTap} />
          <Button id="wifi-list" title="getWifiList" onTap={handleTap} />
          <Button id="wifi-connected" title="getConnectedWifi" onTap={handleTap} />

          <label style={styles.section} value="NFC（Android）" />
          <Button id="nfc" title={discovering() ? 'stopDiscovery' : 'startDiscovery，贴近卡片'} onTap={handleTap} />

          <label style={styles.section} value="日志" />
          <For each={log()}>
            {line => <label style={styles.log} value={line} numberOfLines={0} />}
          </For>
        </view>
      </scroll>
    </view>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  section: new Style<Label>({ color: color.muted, font: systemSemiboldFont(tokens.font.section), margin: '12 0 8 0' }),
  log: new Style<Label>({ color: color.text, font: systemFont(tokens.font.body), marginBottom: tokens.space.xs }),
};
