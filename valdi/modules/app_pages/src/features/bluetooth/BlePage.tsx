import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import type { BLEPeripheralServer, BluetoothDevice } from 'bluetooth/src/index';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, ScrollView, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router } from '../../router';
import { api } from '../../services/api';

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

export function BlePage(props: SolidPageProps<PageViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const [log, setLog] = createSignal<string[]>([]);
  const [scanning, setScanning] = createSignal(false);
  const [devices, setDevices] = createSignal<BluetoothDevice[]>([]);
  const [connectedId, setConnectedId] = createSignal<string | undefined>(undefined);
  const [characteristics, setCharacteristics] = createSignal<CharacteristicRow[]>([]);
  const [advertising, setAdvertising] = createSignal(false);
  const [notifyCount, setNotifyCount] = createSignal(0);
  /** Hex bytes written when a writable characteristic is tapped. */
  const [writeHex, setWriteHex] = createSignal('5d5b010101fe3055000101522a5d5d');

  let alive = true;
  let server: BLEPeripheralServer | undefined;

  const append = (line: string) => {
    if (!alive) return;
    setLog(prev => [line, ...prev].slice(0, 40));
  };

  const handleFound = (result: { devices: BluetoothDevice[] }) => {
    if (!alive) return;
    const byId: Record<string, BluetoothDevice> = {};
    devices().forEach(device => (byId[device.deviceId] = device));
    result.devices.forEach(device => (byId[device.deviceId] = device));
    const nextDevices = Object.keys(byId)
      .map(id => byId[id])
      // Named devices first: anonymous beacons would bury the ones to connect to.
      .sort((a, b) => Number(!(a.name || a.localName)) - Number(!(b.name || b.localName)) || b.RSSI - a.RSSI);
    setDevices(nextDevices);
  };

  const handleConnection = (event: { deviceId: string; connected: boolean }) => {
    if (!alive) return;
    append(`${event.deviceId} ${event.connected ? '已连接' : '已断开'}`);
    if (!event.connected && event.deviceId === connectedId()) {
      setConnectedId(undefined);
      setCharacteristics([]);
    }
  };

  const handleValue = (event: {
    deviceId: string;
    serviceId: string;
    characteristicId: string;
    value: ArrayBuffer;
  }) => {
    if (!alive) return;
    append(`收到 ${event.characteristicId.slice(4, 8)}: ${hex(event.value)}`);
    setCharacteristics(prev =>
      prev.map(row =>
        row.uuid.toLowerCase() === event.characteristicId.toLowerCase() ? { ...row, value: hex(event.value) } : row,
      ),
    );
  };

  onCleanup(() => {
    // Listeners are this page's; the adapter, connections and the server are the app's and stay until closed.
    alive = false;
    api.offBluetoothDeviceFound(handleFound);
    api.offBLECharacteristicValueChange(handleValue);
    api.offBLEConnectionStateChange(handleConnection);
    if (scanning()) {
      api.stopBluetoothDevicesDiscovery().catch(() => undefined);
    }
  });

  const handleOpen = async () => {
    try {
      const result = await api.openBluetoothAdapter();
      append(result.errMsg);
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleState = async () => {
    try {
      const state = await api.getBluetoothAdapterState();
      append(`available ${state.available} · discovering ${state.discovering}`);
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleScan = async () => {
    try {
      if (scanning()) {
        api.offBluetoothDeviceFound(handleFound);
        append((await api.stopBluetoothDevicesDiscovery()).errMsg);
        setScanning(false);
      } else {
        api.onBluetoothDeviceFound(handleFound);
        setDevices([]);
        // Already-connected devices stop advertising; the adapter still lists them (they may be from before this page).
        // Optional: if it fails (adapter not open), the scan below reports the error.
        await api.getBluetoothDevices().then(handleFound, () => undefined);
        append((await api.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false })).errMsg);
        setScanning(true);
      }
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleConnect = async (deviceId: string) => {
    try {
      api.onBLEConnectionStateChange(handleConnection);
      api.onBLECharacteristicValueChange(handleValue);
      append(`连接 ${deviceId}…`);
      try {
        await api.createBLEConnection({ deviceId, timeout: 10000 });
      } catch (error) {
        // Connections belong to the app, not the page: one made before this page opened is reused.
        if ((error as { errCode?: number }).errCode !== -1) throw error;
        append(`${deviceId} 已经连着，直接用`);
      }
      const { services } = await api.getBLEDeviceServices({ deviceId });
      const rows: CharacteristicRow[] = [];
      for (const service of services) {
        const { characteristics: chars } = await api.getBLEDeviceCharacteristics({ deviceId, serviceId: service.uuid });
        chars.forEach(characteristic => {
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
      if (!alive) return;
      setConnectedId(deviceId);
      setCharacteristics(rows);
      append(`${services.length} 个服务，${rows.length} 个特征`);
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleCharacteristic = async (row: CharacteristicRow) => {
    const deviceId = connectedId();
    if (!deviceId) return;
    try {
      if (row.notifiable) {
        await api.notifyBLECharacteristicValueChange({
          deviceId,
          serviceId: row.serviceId,
          characteristicId: row.uuid,
          state: true,
        });
        append(`已订阅 ${row.uuid.slice(0, 8)}`);
      }
      if (row.readable) {
        await api.readBLECharacteristicValue({ deviceId, serviceId: row.serviceId, characteristicId: row.uuid });
      }
      if (row.writable) {
        const value = parseHex(writeHex());
        if (!value) return append('hex 格式不对');
        const writeType = row.flags.split(' ').includes('write') ? 'write' : 'writeNoResponse';
        await api.writeBLECharacteristicValue({
          deviceId,
          serviceId: row.serviceId,
          characteristicId: row.uuid,
          value,
          writeType,
        });
        append(`已写入 ${row.uuid.slice(4, 8)}: ${hex(value)}`);
      }
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleDisconnect = async () => {
    const deviceId = connectedId();
    if (!deviceId) return;
    try {
      append((await api.closeBLEConnection({ deviceId })).errMsg);
      setConnectedId(undefined);
      setCharacteristics([]);
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleAdvertise = async () => {
    try {
      if (server) {
        await server.close();
        server = undefined;
        setAdvertising(false);
        append('从机 server 已关闭');
        return;
      }
      await api.openBluetoothAdapter({ mode: 'peripheral' });
      const created = await api.createBLEPeripheralServer();
      server = created.server;
      let current = new Uint8Array([0x48, 0x69]).buffer;
      server.onCharacteristicReadRequest(({ serviceId, characteristicId, callbackId }) => {
        append('收到读请求');
        server
          ?.writeCharacteristicValue({ serviceId, characteristicId, callbackId, value: current, needNotify: false })
          .catch(error => append(errorText(error)));
      });
      server.onCharacteristicWriteRequest(({ serviceId, characteristicId, callbackId, value }) => {
        append(`收到写入 ${hex(value)}`);
        server
          ?.writeCharacteristicValue({ serviceId, characteristicId, callbackId, value, needNotify: false })
          .then(() => {
            current = value;
          })
          .catch(error => append(errorText(error)));
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
      setAdvertising(true);
      append('正在广播服务 FEED，特征 BEEF 可读写、可通知');
    } catch (error) {
      append(errorText(error));
    }
  };

  const handleNotify = async () => {
    if (!server) return;
    const count = notifyCount() + 1;
    try {
      await server.writeCharacteristicValue({
        serviceId: DEMO_SERVICE,
        characteristicId: DEMO_CHARACTERISTIC,
        value: new Uint8Array([count]).buffer,
        needNotify: true,
      });
      setNotifyCount(count);
      append(`通知 #${count} 已提交`);
    } catch (error) {
      append(errorText(error));
    }
  };

  const { insets } = props;

  return (
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
            onBack={() => router.back()}
          />

          <label style={styles.section} value="适配器" />
          <Button id="open" title="openBluetoothAdapter" onTap={handleOpen} />
          <Button id="state" title="getBluetoothAdapterState" secondary={true} onTap={handleState} />

          <label style={styles.section} value="扫描与连接（主机）" />
          <Button
            id="scan"
            title={scanning() ? 'stopBluetoothDevicesDiscovery' : 'startBluetoothDevicesDiscovery'}
            onTap={handleScan}
          />
          <For each={devices()}>
            {device => (
              <view style={styles.row} onTap={() => handleConnect(device.deviceId)}>
                <label style={styles.rowTitle} value={device.name || device.localName || '（无名称）'} />
                <label style={styles.rowDetail} value={`${device.deviceId} · RSSI ${device.RSSI}`} />
              </view>
            )}
          </For>
          <Show when={connectedId()}>
            {id => (
              <view>
                <label style={styles.result} value={`已连接 ${id()}，${characteristics().length} 个特征`} />
                <label style={styles.rowDetail} value="点可写特征时写入（hex）：" />
                <view style={styles.inputBox}>
                  <textfield
                    style={styles.input}
                    value={writeHex()}
                    placeholder="5d 5b 01 …"
                    limitToViewport={false}
                    onChange={event => setWriteHex(event.text)}
                  />
                </view>
                <For each={characteristics()}>
                  {row => (
                    <view style={styles.row} onTap={() => handleCharacteristic(row)}>
                      <label style={styles.rowTitle} value={`${row.uuid.slice(0, 8)} · ${row.flags}`} />
                      <label
                        style={styles.rowDetail}
                        value={
                          row.value ??
                          (row.writable ? '点一下写入上面的 hex' : row.readable || row.notifiable ? '点一下读取/订阅' : '')
                        }
                      />
                    </view>
                  )}
                </For>
                <Button id="close" title="closeBLEConnection" secondary={true} onTap={handleDisconnect} />
              </view>
            )}
          </Show>

          <label style={styles.section} value="从机广播" />
          <Button
            id="advertise"
            title={advertising() ? '关闭从机 server' : '开始从机广播（服务 FEED）'}
            onTap={handleAdvertise}
          />
          <Show when={advertising()}>
            <Button id="notify" title={`发送通知 #${notifyCount() + 1}`} secondary={true} onTap={handleNotify} />
          </Show>

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
  row: new Style<View>({ backgroundColor: color.surface, borderRadius: tokens.radius.control, padding: '10 14', marginBottom: tokens.space.sm }),
  rowTitle: new Style<Label>({ color: color.ink, font: systemSemiboldFont(tokens.font.title) }),
  rowDetail: new Style<Label>({ color: color.muted, font: systemFont(tokens.font.body), marginTop: 2 }),
  result: new Style<Label>({ color: color.success, font: systemFont(tokens.font.segment), marginBottom: tokens.space.sm }),
  inputBox: new Style<View>({ backgroundColor: color.surface, borderRadius: tokens.radius.control, padding: '0 14', marginBottom: tokens.space.sm }),
  input: new Style<TextField>({ width: '100%', height: 44, font: systemFont(tokens.font.segment), color: color.ink }),
  log: new Style<Label>({ color: color.text, font: systemFont(tokens.font.body), marginBottom: tokens.space.xs }),
};
