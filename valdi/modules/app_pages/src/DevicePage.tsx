import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { api } from './api';
import { Button } from './Button';
import type { NFCDiscoveredCallback } from './nfc/adapter';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { PageHeader } from './PageHeader';
import { Router } from './routes';
import type { GetWifiListCallback } from './wifi/wechat';

interface State {
  log: string[];
  wifiStarted: boolean;
  discovering: boolean;
}

const hex = (buffer: ArrayBuffer) =>
  Array.prototype.map
    .call(new Uint8Array(buffer), (byte: number) => (byte < 16 ? '0' : '') + byte.toString(16))
    .join(':');

const errorText = (error: unknown) => (error as { errMsg?: string }).errMsg ?? String(error);

/**
 * The mini-program Wi-Fi and NFC APIs on `api`, after ExpoNativeRoutes' device examples. Both live as long as the
 * app: leaving the page stops what it started, but the API stays.
 *
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRDevicePage', android: 'io.valdiroutes.pages.DevicePage'})
 */
export class DevicePage extends Page<PageViewModel, State, PageContext> {
  state: State = { log: [], wifiStarted: false, discovering: false };

  private get router(): Router {
    return new Router(this.context);
  }

  onDestroy(): void {
    api.offGetWifiList(this.handleWifiList);
    api.getNFCAdapter().offDiscovered(this.handleTag);
    if (this.state.wifiStarted) api.stopWifi().catch(() => {});
    if (this.state.discovering)
      api
        .getNFCAdapter()
        .stopDiscovery()
        .catch(() => {});
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { log, wifiStarted, discovering } = this.state;

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
            onBack={this.viewModel.presentation === 'tab' ? undefined : this.handleBack}
          />

          <label style={styles.section} value="Wi-Fi" />
          <Button id="wifi-permission" title="requestWifiPermission（扫描）" secondary={true} onTap={this.handleTap} />
          <Button id="wifi-start" title={wifiStarted ? 'stopWifi' : 'startWifi'} onTap={this.handleTap} />
          <Button id="wifi-list" title="getWifiList" onTap={this.handleTap} />
          <Button id="wifi-connected" title="getConnectedWifi" onTap={this.handleTap} />

          <label style={styles.section} value="NFC（Android）" />
          <Button id="nfc" title={discovering ? 'stopDiscovery' : 'startDiscovery，贴近卡片'} onTap={this.handleTap} />

          <label style={styles.section} value="日志" />
          {log.forEach((line, index) => (
            <label key={`log-${index}`} style={styles.log} value={line} numberOfLines={0} />
          ))}
        </view>
      </scroll>
    </view>;
  }

  private append(line: string) {
    this.setState({ log: [line, ...this.state.log].slice(0, 40) });
  }

  private handleBack = () => {
    this.router.back();
  };

  private handleWifiList: GetWifiListCallback = ({ wifiList }) => {
    const rows = wifiList.slice(0, 8).map(wifi => `${wifi.SSID || '（隐藏）'} ${wifi.signalStrength ?? ''}`);
    this.append(`onGetWifiList ${wifiList.length} 个：${rows.join('，')}`);
  };

  private handleTag: NFCDiscoveredCallback = event => {
    this.append(`onDiscovered id ${hex(event.id)} · ${event.techs.join(', ')} · NDEF ${event.messages.length} 条`);
  };

  private handleTap = async (id: string) => {
    try {
      switch (id) {
        case 'wifi-permission':
          this.append(JSON.stringify(await api.requestWifiPermission({ operation: 'scan' })));
          break;
        case 'wifi-start':
          if (this.state.wifiStarted) {
            api.offGetWifiList(this.handleWifiList);
            this.append((await api.stopWifi()).errMsg);
            this.setState({ wifiStarted: false });
          } else {
            this.append((await api.startWifi()).errMsg);
            api.onGetWifiList(this.handleWifiList);
            this.setState({ wifiStarted: true });
          }
          break;
        case 'wifi-list':
          this.append((await api.getWifiList()).errMsg);
          break;
        case 'wifi-connected':
          this.append(JSON.stringify(await api.getConnectedWifi()));
          break;
        case 'nfc': {
          const adapter = api.getNFCAdapter();
          if (this.state.discovering) {
            adapter.offDiscovered(this.handleTag);
            this.append((await adapter.stopDiscovery()).errMsg);
            this.setState({ discovering: false });
          } else {
            adapter.onDiscovered(this.handleTag);
            this.append((await adapter.startDiscovery()).errMsg);
            this.setState({ discovering: true });
          }
          break;
        }
      }
    } catch (error) {
      this.append(errorText(error));
    }
  };
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  section: new Style<Label>({ color: '#6b7280', font: systemSemiboldFont(13), margin: '12 0 8 0' }),
  log: new Style<Label>({ color: '#374151', font: systemFont(12), marginBottom: 4 }),
};
