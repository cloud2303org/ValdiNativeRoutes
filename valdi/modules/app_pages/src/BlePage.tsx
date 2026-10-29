import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { api } from './api';
import { Button } from './Button';
import type { BLEPeripheralServer, BluetoothDevice } from './ble/wechat';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { PageHeader } from './PageHeader';
import { Router } from './routes';

/** The service this page publishes in peripheral mode, so a phone or computer can connect to it as a central. */
const DEMO_SERVICE = '0000feed-0000-1000-8000-00805f9b34fb';
const DEMO_CHARACTERISTIC = '0000beef-0000-1000-8000-00805f9b34fb';

interface CharacteristicRow {
  serviceId: string;
  uuid: string;
  flags: string;
  readable: boolean;
  notifiable: boolean;
  writable: boolean;
  value?: string;
}

interface State {
  log: string[];
  scanning: boolean;
  devices: BluetoothDevice[];
  connectedId?: string;
  characteristics: CharacteristicRow[];
  advertising: boolean;
  notifyCount: number;
  /** Hex bytes written when a writable characteristic is tapped. */
  writeHex: string;
}

const hex = (buffer: ArrayBuffer) =>
  Array.prototype.map
    .call(new Uint8Array(buffer), (byte: number) => (byte < 16 ? '0' : '') + byte.toString(16))
    .join(' ');

/** "5d 5b 01" or "5d5b01" -> bytes; undefined when it is not whole hex bytes. */
const parseHex = (text: string): ArrayBuffer | undefined => {
  const digits = text.replace(/\s+/g, '');
  if (digits.length === 0 || digits.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(digits)) return undefined;
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(digits.substr(i * 2, 2), 16);
  return bytes.buffer;
};

const errorText = (error: unknown) => (error as { errMsg?: string }).errMsg ?? String(error);

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRBlePage', android: 'io.valdiroutes.pages.BlePage'})
 */
export class BlePage extends Page<PageViewModel, State, PageContext> {
  state: State = {
    log: [],
    scanning: false,
    devices: [],
    characteristics: [],
    advertising: false,
    notifyCount: 0,
    writeHex: '5d5b010101fe3055000101522a5d5d',
  };

  private server?: BLEPeripheralServer;

  private get router(): Router {
    return new Router(this.context);
  }

  onDestroy(): void {
    // Listeners are this page's; the adapter, connections and the server are the app's and stay until closed.
    api.offBluetoothDeviceFound(this.handleFound);
    api.offBLECharacteristicValueChange(this.handleValue);
    api.offBLEConnectionStateChange(this.handleConnection);
    if (this.state.scanning) {
      api.stopBluetoothDevicesDiscovery().catch(() => undefined);
    }
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { log, scanning, devices, connectedId, characteristics, advertising, notifyCount, writeHex } = this.state;

    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          paddingTop={insets.top + 12}
          paddingBottom={insets.bottom + 24}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <PageHeader
            title="蓝牙 api"
            subtitle="mini-program 风格接口，底层是共用的原生 BleCore"
            onBack={this.handleBack}
          />

          <label style={styles.section} value="适配器" />
          <Button id="open" title="openBluetoothAdapter" onTap={this.handleOpen} />
          <Button id="state" title="getBluetoothAdapterState" secondary={true} onTap={this.handleState} />

          <label style={styles.section} value="扫描与连接（主机）" />
          <Button
            id="scan"
            title={scanning ? 'stopBluetoothDevicesDiscovery' : 'startBluetoothDevicesDiscovery'}
            onTap={this.handleScan}
          />
          {devices.forEach(device => (
            <view key={device.deviceId} style={styles.row} onTap={() => this.handleConnect(device.deviceId)}>
              <label style={styles.rowTitle} value={device.name || device.localName || '（无名称）'} />
              <label style={styles.rowDetail} value={`${device.deviceId} · RSSI ${device.RSSI}`} />
            </view>
          ))}
          {connectedId && (
            <view key="connected">
              <label style={styles.result} value={`已连接 ${connectedId}，${characteristics.length} 个特征`} />
              <label style={styles.rowDetail} value="点可写特征时写入（hex）：" />
              <view style={styles.inputBox}>
                <textfield
                  style={styles.input}
                  value={writeHex}
                  placeholder="5d 5b 01 …"
                  limitToViewport={false}
                  onChange={this.handleWriteHex}
                />
              </view>
              {characteristics.forEach(row => (
                <view
                  key={`${row.serviceId}/${row.uuid}`}
                  style={styles.row}
                  onTap={() => this.handleCharacteristic(row)}
                >
                  <label style={styles.rowTitle} value={`${row.uuid.slice(0, 8)} · ${row.flags}`} />
                  <label
                    style={styles.rowDetail}
                    value={
                      row.value ??
                      (row.writable ? '点一下写入上面的 hex' : row.readable || row.notifiable ? '点一下读取/订阅' : '')
                    }
                  />
                </view>
              ))}
              <Button id="close" title="closeBLEConnection" secondary={true} onTap={this.handleDisconnect} />
            </view>
          )}

          <label style={styles.section} value="从机广播" />
          <Button
            id="advertise"
            title={advertising ? '关闭从机 server' : '开始从机广播（服务 FEED）'}
            onTap={this.handleAdvertise}
          />
          {advertising && (
            <Button id="notify" title={`发送通知 #${notifyCount + 1}`} secondary={true} onTap={this.handleNotify} />
          )}

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

  private handleOpen = async () => {
    try {
      const result = await api.openBluetoothAdapter();
      this.append(result.errMsg);
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleState = async () => {
    try {
      const state = await api.getBluetoothAdapterState();
      this.append(`available ${state.available} · discovering ${state.discovering}`);
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleFound = (result: { devices: BluetoothDevice[] }) => {
    const byId: Record<string, BluetoothDevice> = {};
    this.state.devices.forEach(device => (byId[device.deviceId] = device));
    result.devices.forEach(device => (byId[device.deviceId] = device));
    const devices = Object.keys(byId)
      .map(id => byId[id])
      // Named devices first: anonymous beacons would bury the ones to connect to.
      .sort((a, b) => Number(!(a.name || a.localName)) - Number(!(b.name || b.localName)) || b.RSSI - a.RSSI);
    this.setState({ devices });
  };

  private handleScan = async () => {
    try {
      if (this.state.scanning) {
        api.offBluetoothDeviceFound(this.handleFound);
        this.append((await api.stopBluetoothDevicesDiscovery()).errMsg);
        this.setState({ scanning: false });
      } else {
        api.onBluetoothDeviceFound(this.handleFound);
        this.setState({ devices: [] });
        // Already-connected devices stop advertising; the adapter still lists them (they may be from before this page).
        // Optional: if it fails (adapter not open), the scan below reports the error.
        await api.getBluetoothDevices().then(this.handleFound, () => undefined);
        this.append((await api.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false })).errMsg);
        this.setState({ scanning: true });
      }
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleConnection = (event: { deviceId: string; connected: boolean }) => {
    this.append(`${event.deviceId} ${event.connected ? '已连接' : '已断开'}`);
    if (!event.connected && event.deviceId === this.state.connectedId) {
      this.setState({ connectedId: undefined, characteristics: [] });
    }
  };

  private handleValue = (event: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    value: ArrayBuffer;
  }) => {
    this.append(`收到 ${event.characteristicId.slice(4, 8)}: ${hex(event.value)}`);
    const characteristics = this.state.characteristics.map(row =>
      row.uuid.toLowerCase() === event.characteristicId.toLowerCase() ? { ...row, value: hex(event.value) } : row,
    );
    this.setState({ characteristics });
  };

  private handleConnect = async (deviceId: string) => {
    try {
      api.onBLEConnectionStateChange(this.handleConnection);
      api.onBLECharacteristicValueChange(this.handleValue);
      this.append(`连接 ${deviceId}…`);
      try {
        await api.createBLEConnection({ deviceId, timeout: 10000 });
      } catch (error) {
        // Connections belong to the app, not the page: one made before this page opened is reused.
        if ((error as { errCode?: number }).errCode !== -1) throw error;
        this.append(`${deviceId} 已经连着，直接用`);
      }
      const { services } = await api.getBLEDeviceServices({ deviceId });
      const rows: CharacteristicRow[] = [];
      for (const service of services) {
        const { characteristics } = await api.getBLEDeviceCharacteristics({ deviceId, serviceId: service.uuid });
        characteristics.forEach(characteristic => {
          const p = characteristic.properties;
          const flags = [
            p.read && 'read',
            p.write && 'write',
            p.writeNoResponse && 'writeNoResponse',
            p.notify && 'notify',
            p.indicate && 'indicate',
          ]
            .filter(Boolean)
            .join(' ');
          rows.push({
            serviceId: service.uuid,
            uuid: characteristic.uuid,
            flags,
            readable: p.read,
            notifiable: p.notify || p.indicate,
            writable: p.write || p.writeNoResponse,
          });
        });
      }
      this.setState({ connectedId: deviceId, characteristics: rows });
      this.append(`${services.length} 个服务，${rows.length} 个特征`);
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleCharacteristic = async (row: CharacteristicRow) => {
    const deviceId = this.state.connectedId;
    if (!deviceId) return;
    try {
      if (row.notifiable) {
        await api.notifyBLECharacteristicValueChange({
          deviceId,
          serviceId: row.serviceId,
          characteristicId: row.uuid,
          state: true,
        });
        this.append(`已订阅 ${row.uuid.slice(0, 8)}`);
      }
      if (row.readable) {
        await api.readBLECharacteristicValue({ deviceId, serviceId: row.serviceId, characteristicId: row.uuid });
      }
      if (row.writable) {
        const value = parseHex(this.state.writeHex);
        if (!value) return this.append('hex 格式不对');
        const writeType = row.flags.split(' ').includes('write') ? 'write' : 'writeNoResponse';
        await api.writeBLECharacteristicValue({
          deviceId,
          serviceId: row.serviceId,
          characteristicId: row.uuid,
          value,
          writeType,
        });
        this.append(`已写入 ${row.uuid.slice(4, 8)}: ${hex(value)}`);
      }
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleWriteHex = (event: { text: string }) => {
    this.setState({ writeHex: event.text });
  };

  private handleDisconnect = async () => {
    const deviceId = this.state.connectedId;
    if (!deviceId) return;
    try {
      this.append((await api.closeBLEConnection({ deviceId })).errMsg);
      this.setState({ connectedId: undefined, characteristics: [] });
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleAdvertise = async () => {
    try {
      if (this.server) {
        await this.server.close();
        this.server = undefined;
        this.setState({ advertising: false });
        this.append('从机 server 已关闭');
        return;
      }
      await api.openBluetoothAdapter({ mode: 'peripheral' });
      const { server } = await api.createBLEPeripheralServer();
      this.server = server;
      let current = new Uint8Array([0x48, 0x69]).buffer;
      server.onCharacteristicReadRequest(({ serviceId, characteristicId, callbackId }) => {
        this.append('收到读请求');
        server
          .writeCharacteristicValue({ serviceId, characteristicId, callbackId, value: current, needNotify: false })
          .catch(error => this.append(errorText(error)));
      });
      server.onCharacteristicWriteRequest(({ serviceId, characteristicId, callbackId, value }) => {
        this.append(`收到写入 ${hex(value)}`);
        server
          .writeCharacteristicValue({ serviceId, characteristicId, callbackId, value, needNotify: false })
          .then(() => {
            current = value;
          })
          .catch(error => this.append(errorText(error)));
      });
      await server.addService({
        service: {
          uuid: DEMO_SERVICE,
          characteristics: [
            {
              uuid: DEMO_CHARACTERISTIC,
              properties: { read: true, write: true, notify: true },
              permission: { readable: true, writeable: true },
            },
          ],
        },
      });
      await server.startAdvertising({ advertiseRequest: { serviceUuids: [DEMO_SERVICE] } });
      this.setState({ advertising: true });
      this.append('正在广播服务 FEED，特征 BEEF 可读写、可通知');
    } catch (error) {
      this.append(errorText(error));
    }
  };

  private handleNotify = async () => {
    if (!this.server) return;
    const count = this.state.notifyCount + 1;
    try {
      await this.server.writeCharacteristicValue({
        serviceId: DEMO_SERVICE,
        characteristicId: DEMO_CHARACTERISTIC,
        value: new Uint8Array([count]).buffer,
        needNotify: true,
      });
      this.setState({ notifyCount: count });
      this.append(`通知 #${count} 已提交`);
    } catch (error) {
      this.append(errorText(error));
    }
  };
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  section: new Style<Label>({ color: '#6b7280', font: systemSemiboldFont(13), margin: '12 0 8 0' }),
  row: new Style<View>({ backgroundColor: '#ffffff', borderRadius: 12, padding: '10 14', marginBottom: 8 }),
  rowTitle: new Style<Label>({ color: '#111827', font: systemSemiboldFont(15) }),
  rowDetail: new Style<Label>({ color: '#6b7280', font: systemFont(12), marginTop: 2 }),
  result: new Style<Label>({ color: '#059669', font: systemFont(14), marginBottom: 8 }),
  inputBox: new Style<View>({ backgroundColor: '#ffffff', borderRadius: 12, padding: '0 14', marginBottom: 8 }),
  input: new Style<TextField>({ width: '100%', height: 44, font: systemFont(14), color: '#111827' }),
  log: new Style<Label>({ color: '#374151', font: systemFont(12), marginBottom: 4 }),
};
