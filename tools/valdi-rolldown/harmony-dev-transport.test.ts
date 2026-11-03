import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type net from 'node:net';
import test from 'node:test';
import { DevPacketReader, encodeDevPacket, type DevResource } from './dev-protocol';
import {
  HarmonyDevForwards, harmonyDevSelection, harmonyTargetAttached, parseHdcForwards,
  type HdcForward, type RunHdc,
} from './harmony-dev-device';
import { hermesDevEndpoint, type HermesDevProxy } from './harmony-dev-cdp';
import { HarmonyDevTransport, type HarmonyDevEndpoint } from './harmony-dev-transport';

const selection = { deviceId: 'explicit-key', applicationId: 'org.example.expected', hdc: '/sdk/toolchains/hdc' };
const configure = (id = '001', changes: object = {}) => ({
  request: { request_id: id, configure: { application_id: selection.applicationId, platform: 'harmony', ...changes } },
});
const debugInfo = (port: number, ids = ['1', '2']) => ({
  event: { js_debugger_info: { port, websocket_targets: ids } },
});

class FakeSocket extends EventEmitter {
  destroyed = false;
  writes: Buffer[] = [];
  write(data: Buffer) { this.writes.push(data); return true; }
  destroy() {
    if (!this.destroyed) { this.destroyed = true; this.emit('close'); }
    return this;
  }
  receive(payload: object) { this.emit('data', encodeDevPacket(payload)); }
  get payloads(): any[] {
    const received: any[] = [];
    const reader = new DevPacketReader();
    for (const frame of this.writes) reader.receive(frame, payload => received.push(payload));
    return received;
  }
}

function fakeHdc() {
  const state = {
    targets: ['other-phone', selection.deviceId], rows: [] as HdcForward[],
    calls: [] as { executable: string; args: string[] }[],
    fail: undefined as ((args: string[]) => boolean) | undefined,
  };
  const run: RunHdc = async (executable, args) => {
    state.calls.push({ executable, args });
    assert.equal(executable, selection.hdc, 'Harmony must never invoke ADB');
    assert.ok(!args.includes('tcp:0'));
    if (state.fail?.(args)) throw new Error('fake process failure');
    if (args.join(' ') === 'list targets') return state.targets.join('\n') + '\n';
    assert.deepEqual(args.slice(0, 3), ['-t', selection.deviceId, 'fport']);
    if (args[3] === 'ls') {
      return state.rows.map(row => `${row.deviceId}    ${row.local} ${row.remote}    [${row.direction}]`).join('\n') || '[Empty]';
    }
    if (args[3] === 'rm') {
      state.rows = state.rows.filter(row =>
        !(row.deviceId === args[1] && row.local === args[4] && row.remote === args[5] && row.direction === 'Forward'));
      return 'Remove forward ruler success';
    }
    assert.match(args[3], /^tcp:[1-9]\d*$/);
    assert.match(args[4], /^tcp:[1-9]\d*$/);
    state.rows.push({ deviceId: args[1], local: args[3], remote: args[4], direction: 'Forward' });
    return 'Forwardport result:OK';
  };
  return { state, run };
}

function harness() {
  const hdc = fakeHdc();
  let nextPort = 30000;
  const sockets: FakeSocket[] = [];
  const proxies: { proxy: HermesDevProxy; closed: boolean; upstreamPort: number }[] = [];
  const endpoints: (HarmonyDevEndpoint | undefined)[] = [];
  const logs: string[] = [];
  const proxyAttempts: number[] = [];
  const resources: DevResource[] = [{ bundle: 'app_pages', file: 'src/app.js', data: Buffer.from('source\n//# sourceMappingURL=unchanged') }];
  let failProxy = false;
  let nextProxyFailures = 0;
  let failConnect = false;
  const transport = new HarmonyDevTransport(selection, () => resources, message => logs.push(message),
    endpoint => endpoints.push(endpoint), {
      run: hdc.run,
      allocatePort: async () => nextPort++,
      connect: (port, host) => {
        assert.equal(host, '127.0.0.1');
        assert.equal(hdc.state.rows.find(row => row.local === `tcp:${port}`)?.remote, 'tcp:13592');
        if (failConnect) throw new Error('fake connect failure');
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as net.Socket;
      },
      startProxy: async (upstreamPort, remotePort, ids) => {
        assert.equal(hdc.state.rows.find(row => row.local === `tcp:${upstreamPort}`)?.remote, `tcp:${remotePort}`);
        proxyAttempts.push(remotePort);
        if (nextProxyFailures) { nextProxyFailures--; throw new Error('fake one-time proxy failure'); }
        if (failProxy) throw new Error('fake proxy failure');
        const entry = {
          upstreamPort, closed: false,
          proxy: { endpoint: hermesDevEndpoint(remotePort, nextPort++, ids), close: async () => { entry.closed = true; } },
        };
        proxies.push(entry);
        return entry.proxy;
      },
    });
  return {
    ...hdc, transport, sockets, proxies, endpoints, logs, resources, proxyAttempts,
    failNextProxy: () => { nextProxyFailures++; },
    failProxy: () => { failProxy = true; }, failConnect: () => { failConnect = true; },
  };
}

test('Harmony selection is opt-in, exact, requires application ID and ignores Android selections', async () => {
  assert.equal(harmonyDevSelection({ ANDROID_SERIAL: 'phone' }), undefined);
  for (const env of [
    { HARMONY_DEVICE: '' }, { HARMONY_DEVICE: 'key' }, { HARMONY_DEVICE: 'key other', HARMONY_APPLICATION_ID: 'app' },
    { HARMONY_DEVICE: '-key', HARMONY_APPLICATION_ID: 'app' },
    { HARMONY_DEVICE: 'key', HARMONY_APPLICATION_ID: ' app' },
  ]) assert.throws(() => harmonyDevSelection(env));
  const selected = harmonyDevSelection({
    HARMONY_DEVICE: selection.deviceId, HARMONY_APPLICATION_ID: selection.applicationId, HDC_PATH: selection.hdc,
    ANDROID_SERIAL: 'unrelated',
  })!;
  assert.deepEqual(selected, selection);
  const hdc = fakeHdc();
  assert.equal(await harmonyTargetAttached(selected, hdc.run), true);
  hdc.state.targets = ['other-phone', `${selected.deviceId}-suffix`];
  assert.equal(await harmonyTargetAttached(selected, hdc.run), false);
  assert.ok(hdc.state.calls.every(call => call.args.join(' ') === 'list targets'));
});

test('HDC global forward parser retains target, direction and both nodes; unknown rows fail closed', () => {
  assert.deepEqual(parseHdcForwards('key tcp:1111 tcp:2222 [Forward]\nother tcp:3333 tcp:4444 [Reverse]\n'), [
    { deviceId: 'key', local: 'tcp:1111', remote: 'tcp:2222', direction: 'Forward' },
    { deviceId: 'other', local: 'tcp:3333', remote: 'tcp:4444', direction: 'Reverse' },
  ]);
  assert.deepEqual(parseHdcForwards('[Empty]\n'), []);
  assert.throws(() => parseHdcForwards('tcp:1111 tcp:2222 [Forward]'));
});

test('HDC does not take over an existing global local-port mapping or remove unowned pairs', async () => {
  const hdc = fakeHdc();
  const existing: HdcForward = { deviceId: 'other', local: 'tcp:30000', remote: 'tcp:13592', direction: 'Forward' };
  hdc.state.rows.push(existing);
  const forwards = new HarmonyDevForwards(selection, hdc.run, async () => 30000);
  await assert.rejects(forwards.open(13592), /already forwarded/);
  await forwards.release(existing);
  await forwards.close();
  assert.deepEqual(hdc.state.rows, [existing]);
  assert.ok(hdc.state.calls.every(call => call.args[3] === 'ls'));
});

test('HDC retains failed cleanup for retry and never removes a replaced remote pair or target', async () => {
  const hdc = fakeHdc();
  const forwards = new HarmonyDevForwards(selection, hdc.run, async () => 30000, () => {});
  const own = await forwards.open(13592);
  hdc.state.fail = args => args[3] === 'rm';
  await forwards.release(own);
  assert.equal(hdc.state.rows.length, 1);
  assert.equal(await forwards.close(), false, 'close reports retained owned leases');
  hdc.state.fail = undefined;
  assert.equal(await forwards.close(), true);
  assert.deepEqual(hdc.state.rows, []);
  const next = await forwards.open(13592);
  hdc.state.rows = [{ ...next, remote: 'tcp:40000' }];
  const callsBefore = hdc.state.calls.length;
  assert.equal(await forwards.close(), true);
  assert.equal(hdc.state.rows[0].remote, 'tcp:40000');
  assert.ok(hdc.state.calls.slice(callsBefore).every(call => call.args[3] !== 'rm'));
});

test('configure uses exact ID, replies to the original string request ID and only then publishes unchanged sources', async () => {
  const h = harness();
  await h.transport.poll();
  const socket = h.sockets[0];
  h.transport.send(h.resources);
  assert.equal(socket.payloads.length, 0);
  assert.equal(h.transport.endpoint, undefined);
  socket.receive(configure('00017'));
  assert.deepEqual(socket.payloads[0], { response: { request_id: '00017', configure: {} } });
  assert.equal(socket.payloads[1].event.updated_resources.resources[0].data_string, h.resources[0].data.toString());
  assert.deepEqual(h.transport.endpoint, {
    platform: 'harmony', deviceId: selection.deviceId, applicationId: selection.applicationId,
    daemon: { host: '127.0.0.1', port: 30000, autoForward: false },
  });
  socket.receive({ request: { request_id: 'other-req', unsupported: {} } });
  const unsupported = socket.payloads.at(-1)!;
  assert.equal(unsupported.response.request_id, 'other-req');
  assert.ok(unsupported.response.error.error_message);
  await h.transport.close();
  assert.deepEqual(h.state.rows, []);
});

for (const changes of [
  { application_id: 'org.example.expected.suffix' }, { application_id: '' },
  { application_id: 'org.example.other' }, { platform: 'android' }, { platform: 'ios' }, { platform: undefined },
]) {
  test(`Harmony rejects configure ${JSON.stringify(changes)} without a resource or debugger publication`, async () => {
    const h = harness();
    await h.transport.poll();
    h.sockets[0].receive(configure('bad', changes));
    assert.equal(h.sockets[0].destroyed, true);
    h.transport.send(h.resources);
    assert.equal(h.sockets[0].payloads.length, 1);
    assert.equal(h.sockets[0].payloads[0].response.request_id, 'bad');
    assert.ok(h.sockets[0].payloads[0].response.error);
    assert.equal(h.transport.endpoint, undefined);
    await h.transport.close();
    assert.deepEqual(h.state.rows, []);
  });
}

test('disable_hot_reload keeps the inspection endpoint but sends neither initial nor changed resources', async () => {
  const h = harness();
  await h.transport.poll();
  h.sockets[0].receive(configure('no-reload', { disable_hot_reload: true }));
  h.transport.send(h.resources);
  assert.equal(h.sockets[0].payloads.length, 1);
  assert.ok(h.transport.endpoint?.daemon);
  await h.transport.close();
});

test('single debugger discovery before configure attaches after verified identity without a second event', async () => {
  const h = harness();
  try {
    await h.transport.poll();
    h.sockets[0].receive(debugInfo(49000, ['1', '23']));
    await h.transport.poll();
    assert.equal(h.proxies.length, 0);
    assert.equal(Boolean(h.transport.endpoint), false);
    assert.deepEqual(h.state.rows.map(row => row.remote), ['tcp:13592']);
    h.sockets[0].receive(configure());
    await h.transport.poll();
    assert.equal(h.transport.endpoint?.debugger?.remotePort, 49000);
    assert.deepEqual(h.transport.endpoint?.debugger?.targets.map(target => target.id), ['1', '23']);
    assert.equal(h.proxies.length, 1);
  } finally {
    await h.transport.close();
  }
  assert.deepEqual(h.state.rows, []);
});

for (const failure of ['forward', 'proxy'] as const) {
  test(`single debugger event recovers after one ${failure} failure on the next coalesced poll`, async () => {
    const h = harness();
    const unrelated: HdcForward = {
      deviceId: 'unrelated', local: 'tcp:25000', remote: 'tcp:49000', direction: 'Forward',
    };
    h.state.rows.push(unrelated);
    let failures = 0;
    const forwardAttempts = () => h.state.calls.filter(call =>
      call.args[2] === 'fport' && call.args[3].startsWith('tcp:') && call.args[4] === 'tcp:49000').length;
    try {
      await h.transport.poll();
      h.sockets[0].receive(configure());
      if (failure === 'proxy') h.failNextProxy();
      else h.state.fail = args => {
        if (!failures && args[2] === 'fport' && args[3].startsWith('tcp:') && args[4] === 'tcp:49000') {
          failures++;
          return true;
        }
        return false;
      };
      h.sockets[0].receive(debugInfo(49000, ['23']));
      await h.transport.poll();
      assert.equal(Boolean(h.transport.endpoint?.debugger), false);
      assert.equal(forwardAttempts(), 1, 'a failed setup does not retry within its own poll');
      assert.deepEqual(h.state.rows.filter(row => row !== unrelated).map(row => row.remote), ['tcp:13592']);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(forwardAttempts(), 1, 'there is no autonomous retry loop');
      const retry = h.transport.poll();
      for (let i = 0; i < 8; i++) assert.equal(h.transport.poll(), retry);
      await retry;
      assert.equal(h.transport.endpoint?.debugger?.remotePort, 49000, 'no second native event is required');
      assert.equal(forwardAttempts(), 2);
      assert.equal(h.proxies.length, 1);
      assert.equal(h.proxyAttempts.length, failure === 'proxy' ? 2 : 1);
      for (let i = 0; i < 3; i++) await h.transport.poll();
      assert.equal(forwardAttempts(), 2, 'a satisfied desired discovery is not forwarded again');
      assert.equal(h.state.rows.filter(row => row.deviceId === selection.deviceId).length, 2);
    } finally {
      await h.transport.close();
    }
    assert.deepEqual(h.state.rows, [unrelated]);
    assert.ok(h.proxies.every(entry => entry.closed));
  });
}

test('pre-configure discovery is not reused after identity rejection or daemon reconnection', async () => {
  const h = harness();
  try {
    await h.transport.poll();
    const rejected = h.sockets[0];
    rejected.receive(debugInfo(49000));
    rejected.receive(configure('wrong-app', { application_id: 'another-app' }));
    assert.equal(rejected.destroyed, true);
    assert.equal(h.proxies.length, 0);
    assert.equal(Boolean(h.transport.endpoint), false);
    await h.transport.poll();
    const accepted = h.sockets[1];
    accepted.receive(configure());
    rejected.receive(debugInfo(49001));
    await h.transport.poll();
    assert.ok(h.transport.endpoint?.daemon);
    assert.equal(h.transport.endpoint?.debugger, undefined);
    assert.equal(h.proxies.length, 0);
    assert.deepEqual(h.state.rows.map(row => row.remote), ['tcp:13592']);
  } finally {
    await h.transport.close();
  }
});

test('persistent debugger setup failure is bounded to one attempt per coalesced poll and stops with its session', async () => {
  const h = harness();
  try {
    await h.transport.poll();
    h.sockets[0].receive(configure());
    h.failProxy();
    h.sockets[0].receive(debugInfo(49000));
    await h.transport.poll();
    for (let attempt = 1; attempt <= 4; attempt++) {
      assert.equal(h.proxyAttempts.length, attempt);
      assert.deepEqual(h.state.rows.map(row => row.remote), ['tcp:13592']);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(h.proxyAttempts.length, attempt, 'failed setup cannot enqueue itself');
      if (attempt < 4) {
        const poll = h.transport.poll();
        assert.equal(h.transport.poll(), poll);
        await poll;
      }
    }
    h.sockets[0].destroy();
    await h.transport.poll();
    h.sockets[1].receive(configure('new-session'));
    await h.transport.poll();
    assert.equal(h.proxyAttempts.length, 4, 'a new session cannot retry the old desired discovery');
    assert.equal(h.transport.endpoint?.debugger, undefined);
  } finally {
    await h.transport.close();
  }
  assert.deepEqual(h.state.rows, []);
});

test('debugger retry waits for pending owned-forward cleanup instead of accumulating forwards', async () => {
  const h = harness();
  const forwardAttempts = () => h.state.calls.filter(call =>
    call.args[3]?.startsWith('tcp:') && call.args[4] === 'tcp:49000').length;
  try {
    await h.transport.poll();
    h.sockets[0].receive(configure());
    h.failNextProxy();
    h.state.fail = args => args[3] === 'rm' && args[5] === 'tcp:49000';
    h.sockets[0].receive(debugInfo(49000));
    await h.transport.poll();
    assert.equal(h.state.rows.filter(row => row.remote === 'tcp:49000').length, 1);
    await h.transport.poll();
    assert.equal(forwardAttempts(), 1, 'pending cleanup must block a replacement forward');
    assert.equal(h.proxyAttempts.length, 1);
    assert.equal(h.proxies.length, 0);
    assert.equal(Boolean(h.transport.endpoint?.debugger), false);
    h.state.fail = undefined;
    await h.transport.poll();
    assert.equal(h.transport.endpoint?.debugger?.remotePort, 49000);
    assert.equal(forwardAttempts(), 2);
    assert.equal(h.state.rows.filter(row => row.remote === 'tcp:49000').length, 1);
  } finally {
    h.state.fail = undefined;
    await h.transport.close();
  }
  assert.deepEqual(h.state.rows, []);
});

for (const boundary of ['forward', 'proxy'] as const) {
  for (const interruption of ['replacement', 'disconnect', 'stop'] as const) {
    test(`${interruption} during debugger ${boundary} setup disposes stale owned resources without publishing them`, async () => {
      const hdc = fakeHdc();
      const unrelated: HdcForward = {
        deviceId: 'unrelated', local: 'tcp:25000', remote: 'tcp:49000', direction: 'Forward',
      };
      hdc.state.rows.push(unrelated);
      let nextPort = 30000;
      let unblock!: () => void;
      let markStarted!: () => void;
      const blocked = new Promise<void>(resolve => { unblock = resolve; });
      const started = new Promise<void>(resolve => { markStarted = resolve; });
      const sockets: FakeSocket[] = [];
      const proxies: { port: number; closed: boolean }[] = [];
      const endpoints: (HarmonyDevEndpoint | undefined)[] = [];
      const transport = new HarmonyDevTransport(selection, () => [], () => {}, endpoint => endpoints.push(endpoint), {
        run: async (executable, args) => {
          const output = await hdc.run(executable, args);
          if (boundary === 'forward' && args[3]?.startsWith('tcp:') && args[4] === 'tcp:49000') {
            markStarted();
            await blocked;
          }
          return output;
        },
        allocatePort: async () => nextPort++,
        connect: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket as unknown as net.Socket;
        },
        startProxy: async (_localPort, remotePort, ids) => {
          const entry = { port: remotePort, closed: false };
          proxies.push(entry);
          if (boundary === 'proxy' && remotePort === 49000) {
            markStarted();
            await blocked;
          }
          return {
            endpoint: hermesDevEndpoint(remotePort, nextPort++, ids),
            close: async () => { entry.closed = true; },
          };
        },
      });
      try {
        await transport.poll();
        sockets[0].receive(configure());
        sockets[0].receive(debugInfo(49000));
        const inFlight = transport.poll();
        await started;
        let closing: Promise<void> | undefined;
        if (interruption === 'replacement') {
          sockets[0].receive(debugInfo(49111, ['9']));
          sockets[0].receive(debugInfo(49111, ['9']));
          assert.equal(transport.poll(), inFlight, 'replacement events do not queue duplicate attempts');
        } else if (interruption === 'disconnect') sockets[0].destroy();
        else closing = transport.close();
        unblock();
        await inFlight;
        await closing;
        assert.ok(!endpoints.some(endpoint => endpoint?.debugger?.remotePort === 49000));
        assert.ok(!hdc.state.rows.some(row => row.deviceId === selection.deviceId && row.remote === 'tcp:49000'));
        assert.ok(proxies.filter(proxy => proxy.port === 49000).every(proxy => proxy.closed));
        if (interruption === 'replacement') {
          await transport.poll();
          assert.equal(transport.endpoint?.debugger?.remotePort, 49111);
          assert.deepEqual(transport.endpoint?.debugger?.targets.map(target => target.id), ['9']);
          assert.equal(proxies.filter(proxy => proxy.port === 49111).length, 1);
        } else if (interruption === 'disconnect') {
          await transport.poll();
          sockets[1].receive(configure('replacement-session'));
          await transport.poll();
          assert.equal(transport.endpoint?.debugger, undefined);
          assert.equal(proxies.filter(proxy => proxy.port === 49000).length, boundary === 'proxy' ? 1 : 0);
        } else {
          const calls = hdc.state.calls.length;
          await transport.poll();
          assert.equal(hdc.state.calls.length, calls, 'stop cannot retry retained discovery');
        }
      } finally {
        unblock();
        await transport.close();
      }
      assert.deepEqual(hdc.state.rows, [unrelated]);
      assert.ok(proxies.every(proxy => proxy.closed));
    });
  }
}

test('debugger info uses event fields, serves local paths, replaces old port and removes both owned forwards on disconnect/reconnect', async () => {
  const h = harness();
  const unrelated: HdcForward = { deviceId: 'unrelated', local: 'tcp:25000', remote: 'tcp:13592', direction: 'Forward' };
  h.state.rows.push(unrelated);
  await h.transport.poll();
  const socket = h.sockets[0];
  socket.receive(debugInfo(49000, ['1', '23']));
  await h.transport.poll();
  assert.equal(h.proxies.length, 0, 'pre-configure events do not open a port');
  socket.receive(configure());
  await h.transport.poll();
  const endpoint = h.transport.endpoint!.debugger!;
  assert.equal(endpoint.remotePort, 49000);
  assert.match(endpoint.jsonListUrl, /^http:\/\/127\.0\.0\.1:30002\/json\/list$/);
  assert.deepEqual(endpoint.targets, [
    { id: '1', webSocketDebuggerUrl: 'ws://127.0.0.1:30002/1' },
    { id: '23', webSocketDebuggerUrl: 'ws://127.0.0.1:30002/23' },
  ]);
  socket.receive(debugInfo(49000, ['1', '23']));
  await h.transport.poll();
  assert.equal(h.proxies.length, 1, 'identical discovery retains ownership');
  socket.receive(debugInfo(49111, ['24']));
  await h.transport.poll();
  assert.equal(h.proxies[0].closed, true);
  assert.equal(h.transport.endpoint!.debugger!.remotePort, 49111);
  assert.ok(!h.state.rows.some(row => row.remote === 'tcp:49000'));
  socket.destroy();
  assert.equal(h.transport.endpoint, undefined);
  await h.transport.poll();
  assert.equal(h.proxies[1].closed, true);
  assert.equal(h.sockets.length, 2);
  h.sockets[1].receive(configure('reconnected'));
  assert.notEqual(h.transport.endpoint!.daemon.port, 30000);
  assert.equal(h.transport.endpoint!.debugger, undefined);
  h.sockets[1].receive(debugInfo(49222, ['25']));
  await h.transport.poll();
  await h.transport.close();
  assert.deepEqual(h.state.rows, [unrelated]);
  assert.ok(h.proxies.every(proxy => proxy.closed));
});

test('empty debugger discovery clears the previous proxy and forward but keeps daemon inspection', async () => {
  const h = harness();
  await h.transport.poll();
  h.sockets[0].receive(configure());
  h.sockets[0].receive(debugInfo(49000));
  await h.transport.poll();
  h.sockets[0].receive(debugInfo(0, []));
  await h.transport.poll();
  assert.equal(h.proxies[0].closed, true);
  assert.equal(h.transport.endpoint!.debugger, undefined);
  assert.deepEqual(h.state.rows.map(row => row.remote), ['tcp:13592']);
  await h.transport.close();
});

test('cleanup review 2: repeated daemon closes cannot acquire forwards until fport rm recovers', async () => {
  const h = harness();
  const unrelated: HdcForward[] = [
    { deviceId: selection.deviceId, local: 'tcp:25000', remote: 'tcp:13592', direction: 'Forward' },
    { deviceId: 'other-phone', local: 'tcp:25001', remote: 'tcp:13592', direction: 'Forward' },
  ];
  h.state.rows.push(...unrelated);
  const daemonCreates = () => h.state.calls.filter(call =>
    call.args[3]?.startsWith('tcp:') && call.args[4] === 'tcp:13592').length;
  try {
    await h.transport.poll();
    h.sockets[0].receive(configure());
    const own = h.state.rows.find(row => !unrelated.includes(row))!;
    h.state.fail = args => args[2] === 'fport' && args[3] === 'rm';
    for (let attempt = 0; attempt < 4; attempt++) {
      h.sockets.at(-1)!.destroy();
      const poll = h.transport.poll();
      assert.equal(h.transport.poll(), poll);
      await poll;
    }
    assert.equal(daemonCreates(), 1, 'successful create/list cannot bypass a failed removal');
    assert.equal(h.sockets.length, 1);
    assert.deepEqual(h.state.rows, [...unrelated, own]);
    assert.equal(Boolean(h.transport.endpoint), false);
    const removals = h.state.calls.filter(call => call.args[3] === 'rm');
    assert.ok(removals.length >= 4);
    assert.ok(removals.every(call => call.args[1] === selection.deviceId
      && call.args[4] === own.local && call.args[5] === own.remote));
    h.state.fail = undefined;
    await h.transport.poll();
    assert.equal(daemonCreates(), 2);
    assert.equal(h.sockets.length, 2);
    assert.ok(!h.state.rows.includes(own), 'recovery removes the original exact owned mapping first');
    h.sockets[1].receive(configure('after-cleanup'));
    assert.ok(h.transport.endpoint?.daemon);
    assert.equal(h.state.rows.length, unrelated.length + 1);
  } finally {
    h.state.fail = undefined;
    await h.transport.close();
  }
  assert.deepEqual(h.state.rows, unrelated);
});

test('cleanup review 2: one empty discovery retries a failed CDP removal on a later poll without reinjection', async () => {
  const h = harness();
  const unrelated: HdcForward = {
    deviceId: selection.deviceId, local: 'tcp:25000', remote: 'tcp:49000', direction: 'Forward',
  };
  h.state.rows.push(unrelated);
  const debuggerCreates = () => h.state.calls.filter(call =>
    call.args[3]?.startsWith('tcp:') && call.args[4] === 'tcp:49000').length;
  try {
    await h.transport.poll();
    h.sockets[0].receive(configure());
    h.sockets[0].receive(debugInfo(49000));
    await h.transport.poll();
    const daemon = h.transport.endpoint!.daemon;
    let removalFailures = 0;
    h.state.fail = args => {
      if (args[3] === 'rm' && args[5] === 'tcp:49000' && !removalFailures) {
        removalFailures++;
        return true;
      }
      return false;
    };
    h.sockets[0].receive(debugInfo(0, []));
    await h.transport.poll();
    assert.equal(removalFailures, 1);
    assert.equal(h.proxies[0].closed, true);
    assert.equal(h.transport.endpoint!.debugger, undefined);
    assert.deepEqual(h.transport.endpoint!.daemon, daemon);
    assert.equal(h.state.rows.filter(row => row !== unrelated && row.remote === 'tcp:49000').length, 1);
    h.state.fail = undefined;
    const cleanup = h.transport.poll();
    assert.equal(h.transport.poll(), cleanup);
    await cleanup;
    assert.equal(h.state.rows.filter(row => row !== unrelated && row.remote === 'tcp:49000').length, 0);
    assert.deepEqual(h.transport.endpoint!.daemon, daemon);
    assert.equal(h.transport.endpoint!.debugger, undefined);
    for (let i = 0; i < 3; i++) await h.transport.poll();
    assert.equal(debuggerCreates(), 1, 'withdrawal must never acquire a replacement debugger forward');
    assert.equal(h.proxyAttempts.length, 1);
    assert.equal(h.sockets.length, 1);
  } finally {
    h.state.fail = undefined;
    await h.transport.close();
  }
  assert.deepEqual(h.state.rows, [unrelated]);
});

for (const loss of ['target-absent', 'discovery-error'] as const) {
  test(`cleanup audit: ${loss} retains failed removals and gates reattachment until cleanup recovers`, async () => {
    const h = harness();
    const unrelated: HdcForward = {
      deviceId: 'other-phone', local: 'tcp:25000', remote: 'tcp:49000', direction: 'Forward',
    };
    h.state.rows.push(unrelated);
    const creates = () => h.state.calls.filter(call => call.args[3]?.startsWith('tcp:')).length;
    try {
      await h.transport.poll();
      h.sockets[0].receive(configure());
      h.sockets[0].receive(debugInfo(49000));
      await h.transport.poll();
      const own = h.state.rows.filter(row => row !== unrelated);
      let discoveryFailed = loss === 'discovery-error';
      h.state.fail = args => args[3] === 'rm' || (discoveryFailed && args.join(' ') === 'list targets');
      if (loss === 'target-absent') h.state.targets = ['other-phone'];
      for (let i = 0; i < 3; i++) await h.transport.poll();
      assert.equal(h.sockets[0].destroyed, true);
      assert.equal(Boolean(h.transport.endpoint), false);
      assert.ok(h.proxies.every(proxy => proxy.closed));
      assert.deepEqual(h.state.rows, [unrelated, ...own]);
      discoveryFailed = false;
      h.state.targets = [selection.deviceId];
      await h.transport.poll();
      assert.equal(creates(), 2, 'reattachment cannot bypass pending daemon or CDP leases');
      assert.equal(h.sockets.length, 1);
      h.state.fail = undefined;
      await h.transport.poll();
      assert.equal(creates(), 3);
      assert.ok(own.every(row => !h.state.rows.includes(row)));
      h.sockets[1].receive(configure('reattached'));
      assert.ok(h.transport.endpoint?.daemon);
      assert.equal(h.transport.endpoint?.debugger, undefined);
    } finally {
      h.state.fail = undefined;
      await h.transport.close();
    }
    assert.deepEqual(h.state.rows, [unrelated]);
  });
}

test('cleanup audit: terminal stop retains failed removals for explicit close retry and cannot acquire new resources', async () => {
  const h = harness();
  const unrelated: HdcForward = {
    deviceId: selection.deviceId, local: 'tcp:25000', remote: 'tcp:49000', direction: 'Forward',
  };
  h.state.rows.push(unrelated);
  try {
    await h.transport.poll();
    h.sockets[0].receive(configure());
    h.sockets[0].receive(debugInfo(49000));
    await h.transport.poll();
    const before = [...h.state.rows];
    h.state.fail = args => args[3] === 'rm';
    await h.transport.close();
    assert.deepEqual(h.state.rows, before, 'failed leases remain owned after terminal cleanup');
    assert.equal(h.transport.endpoint, undefined);
    assert.equal(h.sockets[0].destroyed, true);
    assert.ok(h.proxies.every(proxy => proxy.closed));
    assert.ok(h.logs.some(log => log.includes('cleanup pending')));
    const calls = h.state.calls.length;
    for (let i = 0; i < 3; i++) await h.transport.poll();
    assert.equal(h.state.calls.length, calls, 'stopped polls neither retry nor acquire');
    h.state.fail = undefined;
    await h.transport.close();
    assert.deepEqual(h.state.rows, [unrelated]);
    const cleanedCalls = h.state.calls.length;
    await h.transport.close();
    assert.equal(h.state.calls.length, cleanedCalls, 'successful terminal cleanup is idempotent');
  } finally {
    h.state.fail = undefined;
    await h.transport.close();
  }
});

test('explicit target disappearance and HDC discovery errors close owned ports without ADB fallback', async () => {
  for (const failure of ['absent', 'process-error']) {
    const h = harness();
    await h.transport.poll();
    h.sockets[0].receive(configure());
    h.sockets[0].receive(debugInfo(49000));
    await h.transport.poll();
    if (failure === 'absent') h.state.targets = ['other-phone'];
    else h.state.fail = args => args.join(' ') === 'list targets';
    await h.transport.poll();
    assert.equal(h.sockets[0].destroyed, true);
    assert.equal(h.transport.endpoint, undefined);
    assert.ok(h.proxies.every(proxy => proxy.closed));
    assert.deepEqual(h.state.rows, []);
    assert.ok(h.state.calls.every(call => call.executable === selection.hdc));
    await h.transport.close();
  }
});

test('proxy startup and synchronous socket failure clean up acquired forwards', async () => {
  const h = harness();
  await h.transport.poll();
  h.sockets[0].receive(configure());
  h.failProxy();
  h.sockets[0].receive(debugInfo(49000));
  await h.transport.poll();
  assert.equal(h.transport.endpoint?.debugger, undefined);
  assert.deepEqual(h.state.rows.map(row => row.remote), ['tcp:13592']);
  await h.transport.close();
  const broken = harness();
  broken.failConnect();
  await broken.transport.poll();
  assert.deepEqual(broken.state.rows, []);
  await broken.transport.close();
});

test('a process rejection during forward verification releases the successfully created owned pair', async () => {
  const hdc = fakeHdc();
  let failed = false;
  const run: RunHdc = async (executable, args) => {
    if (!failed && args[3] === 'ls' && hdc.state.rows.length) {
      failed = true;
      throw new Error('verification process failed');
    }
    return hdc.run(executable, args);
  };
  const forwards = new HarmonyDevForwards(selection, run, async () => 30000);
  await assert.rejects(forwards.open(13592), /verification process failed/);
  assert.deepEqual(hdc.state.rows, []);
});

test('stop during proxy creation withdraws endpoints and closes the newly created proxy and both forwards', async () => {
  const hdc = fakeHdc();
  const socket = new FakeSocket();
  let nextPort = 30000;
  let resolveProxy!: (proxy: HermesDevProxy) => void;
  let started!: () => void;
  const proxyStarted = new Promise<void>(resolve => { started = resolve; });
  const proxyReady = new Promise<HermesDevProxy>(resolve => { resolveProxy = resolve; });
  let proxyClosed = false;
  const transport = new HarmonyDevTransport(selection, () => [], () => {}, () => {}, {
    run: hdc.run, allocatePort: async () => nextPort++,
    connect: () => socket as unknown as net.Socket,
    startProxy: async () => { started(); return proxyReady; },
  });
  await transport.poll();
  socket.receive(configure());
  socket.receive(debugInfo(49000));
  await proxyStarted;
  const closing = transport.close();
  assert.equal(transport.endpoint, undefined);
  resolveProxy({
    endpoint: hermesDevEndpoint(49000, 41000, ['1', '2']),
    close: async () => { proxyClosed = true; },
  });
  await closing;
  assert.equal(proxyClosed, true);
  assert.equal(socket.destroyed, true);
  assert.equal(transport.endpoint, undefined);
  assert.deepEqual(hdc.state.rows, []);
});

test('bad frames and stale/reconfigured identities revoke publication and cannot push after close', async () => {
  const h = harness();
  await h.transport.poll();
  const socket = h.sockets[0];
  socket.receive(configure());
  socket.receive(debugInfo(49000));
  await h.transport.poll();
  socket.receive(configure('swapped', { application_id: 'different' }));
  assert.equal(h.transport.endpoint, undefined);
  const count = socket.writes.length;
  h.transport.send(h.resources);
  socket.receive(configure('stale'));
  assert.equal(socket.writes.length, count);
  await h.transport.close();
  assert.deepEqual(h.state.rows, []);
  const malformed = harness();
  await malformed.transport.poll();
  malformed.sockets[0].emit('data', Buffer.alloc(8));
  assert.equal(malformed.sockets[0].destroyed, true);
  await malformed.transport.close();
  assert.deepEqual(malformed.state.rows, []);
});

test('stop during asynchronous forward acquisition never connects or leaks, and repeated polls coalesce', async () => {
  const hdc = fakeHdc();
  let resolvePort!: (port: number) => void;
  const pendingPort = new Promise<number>(resolve => { resolvePort = resolve; });
  const transport = new HarmonyDevTransport(selection, () => [], () => {}, () => {}, {
    run: hdc.run, allocatePort: () => pendingPort,
    connect: () => { assert.fail('must not connect after stop'); },
  });
  const poll = transport.poll();
  assert.equal(transport.poll(), poll);
  // Let discovery reach port allocation without opening a socket.
  await Promise.resolve();
  await Promise.resolve();
  const close = transport.close();
  resolvePort(30000);
  await Promise.all([poll, close]);
  assert.equal(transport.endpoint, undefined);
  assert.deepEqual(hdc.state.rows, []);
});
