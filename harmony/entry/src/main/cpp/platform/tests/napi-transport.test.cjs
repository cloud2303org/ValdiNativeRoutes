const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require(process.env.PLATFORM_TEST_ADDON);

function graph(overrides = {}) {
  const children = {};
  for (const name of ['ble', 'permissions', 'wifi', 'nfc']) {
    const child = {
      marker: name,
      setEvents(events) { assert.equal(this, children[name]); this.events = events; },
      ...overrides[name],
    };
    children[name] = new Proxy(child, {
      get(target, name) { return name in target ? target[name] : async () => undefined; },
    });
  }
  return {
    version: 1,
    ...children,
    closed: 0,
    activity: [],
    setActive(active) { assert.equal(this.ble, children.ble); this.activity.push(active); },
    close() { assert.equal(this.nfc, children.nfc); this.closed++; },
  };
}

test('real Promise.then receivers, shared permission grant records and Unicode', async () => {
  let thenCalls = 0;
  const services = graph({ permissions: {
    requestMultiple(kinds) {
      assert.equal(this.marker, 'permissions');
      assert.deepEqual(kinds, ['bluetooth', '中文\n"quoted"']);
      const promise = Promise.resolve(kinds.map(permission => ({ permission, result: 'granted' })));
      promise.then = function(resolve, reject) {
        assert.equal(this, promise);
        thenCalls++;
        return Promise.prototype.then.call(this, resolve, reject);
      };
      return promise;
    },
    async check(kind) { assert.equal(this.marker, 'permissions'); return kind === 'bluetooth'; },
  } });
  const session = create(services);
  let terminal = false;
  const result = session.call('permissions', 'requestMultiple', [['bluetooth', '中文\n"quoted"']])
    .then(value => { terminal = true; return value; });
  assert.equal(terminal, false);
  assert.deepEqual(await result, [
    { permission: 'bluetooth', result: 'granted' },
    { permission: '中文\n"quoted"', result: 'granted' },
  ]);
  assert.equal(thenCalls, 1);
  assert.equal(await session.call('permissions', 'check', ['bluetooth']), true);
  session.setActive(false); session.setActive(true);
  assert.deepEqual(services.activity, [false, true]);
  session.close(); session.close();
  assert.equal(services.closed, 1);
});

test('typed-array subviews preserve exactly byteOffset/length on input and result', async () => {
  const storage = new Uint8Array([90, 91, 5, 6, 7, 92]);
  const services = graph({ nfc: {
    async transceive(handle, data) {
      assert.equal(this.marker, 'nfc');
      assert.deepEqual(handle, { tagHandle: 'tag', tech: 'NfcA' });
      assert.deepEqual([...data], [1, 2, 3]);
      assert.equal(data.byteOffset, 0);
      return new Uint8Array(storage.buffer, 2, 3);
    },
  } });
  const session = create(services);
  const original = new Uint8Array([99, 1, 2, 3, 98]);
  const result = await session.call('nfc', 'transceive', [
    { tagHandle: 'tag', tech: 'NfcA', unrelated: 'drop' }, original.subarray(1, 4),
  ]);
  assert.deepEqual([...result], [5, 6, 7]);
  storage[2] = 88;
  assert.deepEqual([...result], [5, 6, 7]);
  session.close();
});

test('real parameter schemas retain optional nulls and SDK numeric units', async () => {
  const services = graph({ ble: {
    async startBluetoothDevicesDiscovery(params) {
      assert.equal(this.marker, 'ble');
      assert.deepEqual(params, { services: ['180d'], allowDuplicatesKey: false, interval: 1000, powerLevel: null });
    },
    async setBLEMTU(deviceId, mtu) {
      assert.equal(deviceId, 'device');
      assert.equal(mtu, 517);
      return mtu;
    },
    async getBluetoothDevices() {
      return [{
        RSSI: -77.5, advertisData: new Uint8Array([1, 2]), advertisServiceUUIDs: ['180d'],
        deviceId: 'device', localName: 'name', name: '', connectable: true,
        serviceData: [{ uuid: '180d', data: new Uint8Array([3, 4]) }],
      }];
    },
  } });
  const session = create(services);
  assert.equal(await session.call('ble', 'startBluetoothDevicesDiscovery',
    [{ services: ['180d'], allowDuplicatesKey: false, interval: 1000, powerLevel: null }]), undefined);
  assert.equal(await session.call('ble', 'setBLEMTU', ['device', 517]), 517);
  const devices = await session.call('ble', 'getBluetoothDevices', []);
  assert.equal(devices[0].RSSI, -77.5);
  assert.deepEqual([...devices[0].serviceData[0].data], [3, 4]);
  session.close();
});

test('Wi-Fi exact maunal spelling, boolean and numeric optional fields', async () => {
  const services = graph({ wifi: {
    async connectWifi(params) {
      assert.equal(this.marker, 'wifi');
      assert.deepEqual(params, { SSID: 'network', BSSID: '', password: 'p', maunal: false, partialInfo: true });
      return { SSID: 'network', BSSID: null, secure: false, signalStrength: -62, frequency: 5180 };
    },
  } });
  const session = create(services);
  assert.deepEqual(await session.call('wifi', 'connectWifi',
    [{ SSID: 'network', BSSID: '', password: 'p', maunal: false, partialInfo: true }]),
  { SSID: 'network', BSSID: null, secure: false, signalStrength: -62, frequency: 5180 });
  session.close();
});

test('ArkTS Promise rejections retain core error code strings', async () => {
  const services = graph({ wifi: {
    async startWifi() { throw new Error('E_WIFI_SYSTEM_NOT_SUPPORTED:kit unavailable'); },
    async stopWifi() { throw 'E_WIFI_SYSTEM_INTERNAL:string rejection'; },
  } });
  const session = create(services);
  await assert.rejects(session.call('wifi', 'startWifi', []), /E_WIFI_SYSTEM_NOT_SUPPORTED:kit unavailable/);
  await assert.rejects(session.call('wifi', 'stopWifi', []), /E_WIFI_SYSTEM_INTERNAL:string rejection/);
  session.close();
});

for (const [label, reason] of [['empty string', ''], ['empty Error.message', new Error('')]]) {
  test(`transport rejects openSettings for ${label}`, async () => {
    const session = create(graph({ permissions: {
      openSettings() { return Promise.reject(reason); },
    } }));
    try {
      await assert.rejects(session.call('permissions', 'openSettings', []),
        { message: 'E_PLATFORM_SERVICE:ArkTS service rejected' });
    } finally {
      session.close();
    }
  });
  test(`real native port void Promise rejects openSettings for ${label}`, async () => {
    const session = create(graph({ permissions: {
      openSettings() { return Promise.reject(reason); },
    } }));
    try {
      await assert.rejects(session.portCall('permissions', 'openSettings', []),
        /E_PLATFORM_SERVICE:ArkTS service rejected/);
    } finally {
      session.close();
    }
  });
}

test('invalid records and mismatched types are rejected by public typed codec', async () => {
  const services = graph({ permissions: { async check() { return 'true'; } } });
  const session = create(services);
  assert.throws(() => session.call('nfc', 'connect', [{ tagHandle: 'tag' }]), /E_PLATFORM_INVALID/);
  assert.throws(() => session.call('nfc', 'transceive',
    [{ tagHandle: 'tag', tech: 'NfcA' }, new Uint16Array([1, 2])]), /E_PLATFORM_INVALID/);
  assert.throws(() => session.call('wifi', 'getConnectedWifi', ['true']), /E_PLATFORM_INVALID/);
  await assert.rejects(session.call('permissions', 'check', ['bluetooth']), /E_PLATFORM_INVALID/);
  session.close();
});

test('non-Promise returns and synchronous exceptions cannot fulfill native requests', async () => {
  const services = graph({ permissions: {
    check() { return { then(resolve) { resolve(true); } }; },
    openSettings() { throw new Error('sync failure'); },
  } });
  const session = create(services);
  await assert.rejects(session.call('permissions', 'check', ['bluetooth']), /E_PLATFORM_TRANSPORT/);
  await assert.rejects(session.call('permissions', 'openSettings', []), /E_PLATFORM_TRANSPORT/);
  session.close();
});

test('native Promise callbacks ignore duplicate resolve/reject attempts', async () => {
  const services = graph({ permissions: {
    check() {
      const promise = Promise.resolve(true);
      promise.then = function(resolve, reject) {
        assert.equal(this, promise);
        resolve(true);
        resolve(false);
        reject(new Error('duplicate'));
        return Promise.resolve();
      };
      return promise;
    },
  } });
  const session = create(services);
  assert.equal(await session.call('permissions', 'check', ['bluetooth']), true);
  session.close();
});

test('NAPI native event callbacks decode nested NFC DTOs and ignore malformed/late events', () => {
  const services = graph();
  const session = create(services);
  const events = session.capture('nfc');
  const buffer = new Uint8Array([90, 1, 2, 3, 91]);
  services.nfc.events.discovered({
    tagHandle: 'tag', id: buffer.subarray(1, 3), techs: ['NfcA'],
    messages: [{ id: new Uint8Array([]), type: new Uint8Array([84]), payload: buffer.subarray(2, 4), tnf: 1 }],
  });
  buffer[1] = 88;
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'discovered');
  assert.deepEqual([...events[0].value.id], [1, 2]);
  assert.deepEqual([...events[0].value.messages[0].payload], [2, 3]);
  services.nfc.events.discovered({ tagHandle: 'invalid' });
  services.nfc.events.discoveryStateChange('true');
  assert.equal(events.length, 1);
  services.nfc.events.discoveryStateChange(false);
  assert.equal(events.length, 2);
  assert.equal(events[1].value, false);
  const stale = services.nfc.events;
  session.close();
  stale.discoveryStateChange(true);
  assert.equal(events.length, 2);
});

test('requires version 1 and actual callable service properties before mount', () => {
  assert.throws(() => create({ ...graph(), version: 2 }), /E_PLATFORM_INVALID/);
  const invalid = graph({ permissions: { check: true } });
  assert.throws(() => create(invalid), /E_PLATFORM_INVALID/);
});
