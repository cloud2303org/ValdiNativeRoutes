import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type http from 'node:http';
import type net from 'node:net';
import test from 'node:test';
import { startHermesDevProxy, type HermesProxyBoundary } from './harmony-dev-cdp';

class FakeDuplex extends EventEmitter {
  destroyed = false;
  writes: (string | Buffer)[] = [];
  destination?: FakeDuplex;
  write(data: string | Buffer) { this.writes.push(data); return true; }
  end(data?: string) { if (data) this.write(data); this.destroy(); return this; }
  destroy() {
    if (!this.destroyed) { this.destroyed = true; this.emit('close'); }
    return this;
  }
  pipe(destination: FakeDuplex) { this.destination = destination; return destination; }
  input(bytes: Buffer) { this.destination?.write(bytes); }
}

class FakeServer extends EventEmitter {
  closed = false;
  failListen = false;
  constructor(readonly request: (req: any, res: any) => void) { super(); }
  listen(port: number, host: string, done: () => void) {
    assert.equal(port, 0, 'only the Node proxy requests an ephemeral port, not HDC');
    assert.equal(host, '127.0.0.1');
    if (this.failListen) this.emit('error', new Error('fake listen failure'));
    else done();
  }
  address() { return { port: 41000 }; }
  close(done?: () => void) { this.closed = true; done?.(); }
  get(url: string, method = 'GET') {
    const response = {
      status: 0, headers: {} as object, body: '',
      writeHead(status: number, headers: object = {}) { this.status = status; this.headers = headers; return this; },
      end(body = '') { this.body = body; return this; },
    };
    this.request({ url, method }, response);
    return response;
  }
}

function proxyBoundary(failListen = false) {
  let server!: FakeServer;
  const upstream = new FakeDuplex();
  const calls: [number, string][] = [];
  const boundary: HermesProxyBoundary = {
    createServer: ((handler: any) => {
      server = new FakeServer(handler);
      server.failListen = failListen;
      return server;
    }) as unknown as typeof http.createServer,
    connect: (port, host) => {
      calls.push([port, host]);
      return upstream as unknown as net.Socket;
    },
  };
  return { boundary, get server() { return server; }, upstream, calls };
}

test('real proxy handlers return local /json/list and /json with exact runtime IDs and no device localhost URLs', async () => {
  const h = proxyBoundary();
  const proxy = await startHermesDevProxy(30001, 49111, ['1', '23'], h.boundary);
  assert.equal(proxy.endpoint.jsonListUrl, 'http://127.0.0.1:41000/json/list');
  for (const route of ['/json/list', '/json']) {
    const response = h.server.get(route);
    assert.equal(response.status, 200);
    assert.equal((response.headers as any)['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(response.body), [
      { id: '1', webSocketDebuggerUrl: 'ws://127.0.0.1:41000/1', description: 'Valdi Hermes', title: 'Valdi Hermes', type: 'node' },
      { id: '23', webSocketDebuggerUrl: 'ws://127.0.0.1:41000/23', description: 'Valdi Hermes', title: 'Valdi Hermes', type: 'node' },
    ]);
    assert.ok(!response.body.includes('localhost:49111'));
  }
  assert.equal(h.server.get('/json/list?other').status, 404);
  assert.equal(h.server.get('/json/list', 'POST').status, 404);
  await proxy.close();
  assert.equal(h.server.closed, true);
  assert.equal(h.server.get('/json/list').status, 404);
});

test('real upgrade handler tunnels the exact runtime path, headers, handshake remainder and bidirectional bytes', async () => {
  const h = proxyBoundary();
  const proxy = await startHermesDevProxy(30001, 49111, ['23'], h.boundary);
  const client = new FakeDuplex();
  h.server.emit('connection', client);
  const request = {
    method: 'GET', url: '/23', httpVersion: '1.1',
    rawHeaders: ['Host', '127.0.0.1:41000', 'Upgrade', 'websocket', 'Connection', 'Upgrade', 'Sec-WebSocket-Key', 'test-key'],
  };
  const head = Buffer.from([0x81, 0x82, 1, 2, 3, 4]);
  h.server.emit('upgrade', request, client, head);
  assert.deepEqual(h.calls, [[30001, '127.0.0.1']]);
  h.upstream.emit('connect');
  assert.equal(h.upstream.writes[0],
    'GET /23 HTTP/1.1\r\nHost: 127.0.0.1:41000\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: test-key\r\n\r\n');
  assert.deepEqual(h.upstream.writes[1], head);
  const cdp = Buffer.from('{"id":900,"method":"Profiler.start"}');
  client.input(cdp);
  assert.deepEqual(h.upstream.writes.at(-1), cdp);
  const response = Buffer.from('{"id":900,"result":{}}');
  h.upstream.input(response);
  assert.deepEqual(client.writes.at(-1), response);
  await proxy.close();
  assert.equal(client.destroyed, true);
  assert.equal(h.upstream.destroyed, true);
  await proxy.close();
});

test('unknown/stale runtime URLs cannot fall back to the native server first-runtime behavior', async () => {
  const h = proxyBoundary();
  const proxy = await startHermesDevProxy(30001, 49111, ['23'], h.boundary);
  for (const url of ['/1', '/devtools/page/23', '/23?other', '/']) {
    const client = new FakeDuplex();
    h.server.emit('upgrade', { method: 'GET', url }, client, Buffer.alloc(0));
    assert.equal(client.destroyed, true);
    assert.match(client.writes[0] as string, /^HTTP\/1.1 404/);
  }
  assert.deepEqual(h.calls, []);
  await proxy.close();
});

test('proxy listener failure closes the created server; upstream close tears down its paired client', async () => {
  const broken = proxyBoundary(true);
  await assert.rejects(startHermesDevProxy(30001, 49111, ['1'], broken.boundary), /listen failure/);
  assert.equal(broken.server.closed, true);
  const h = proxyBoundary();
  const proxy = await startHermesDevProxy(30001, 49111, ['1'], h.boundary);
  const client = new FakeDuplex();
  h.server.emit('connection', client);
  h.server.emit('upgrade', { method: 'GET', url: '/1', httpVersion: '1.1', rawHeaders: [] }, client, Buffer.alloc(0));
  h.upstream.destroy();
  assert.equal(client.destroyed, true);
  await proxy.close();
});
