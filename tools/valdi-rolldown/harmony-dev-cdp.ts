import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';

export interface HermesDevTarget {
  readonly id: string;
  readonly webSocketDebuggerUrl: string;
}

export interface HermesDevEndpoint {
  readonly remotePort: number;
  readonly jsonListUrl: string;
  readonly targets: readonly HermesDevTarget[];
}

export interface HermesDevProxy {
  readonly endpoint: HermesDevEndpoint;
  close(): Promise<void>;
}

export interface HermesProxyBoundary {
  createServer: typeof http.createServer;
  connect: (port: number, host: string) => net.Socket;
}

export function hermesDevEndpoint(remotePort: number, localPort: number, ids: readonly string[]): HermesDevEndpoint {
  return {
    remotePort, jsonListUrl: `http://127.0.0.1:${localPort}/json/list`,
    targets: ids.map(id => ({ id, webSocketDebuggerUrl: `ws://127.0.0.1:${localPort}/${id}` })),
  };
}

/** Synthesize the pinned Hermes /json/list with local URLs and tunnel the exact /<runtime-id> upgrade unmodified. */
export async function startHermesDevProxy(
  upstreamPort: number, remotePort: number, ids: readonly string[],
  boundary: HermesProxyBoundary = { createServer: http.createServer, connect: (port, host) => net.connect(port, host) },
): Promise<HermesDevProxy> {
  let endpoint: HermesDevEndpoint;
  let closed = false;
  const sockets = new Set<Duplex>();
  const track = (socket: Duplex) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
  };
  const server = boundary.createServer((request, response) => {
    if (closed || request.method !== 'GET' || (request.url !== '/json' && request.url !== '/json/list')) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(endpoint.targets.map(target => ({
      ...target, description: 'Valdi Hermes', title: 'Valdi Hermes', type: 'node',
    }))));
  });
  server.on('connection', track);
  server.on('upgrade', (request, client, head) => {
    // Hermes falls back to the first runtime for unknown paths; do not let a stale URL attach to the wrong runtime.
    if (closed || request.method !== 'GET' || !ids.some(id => request.url === `/${id}`)) {
      client.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    let upstream: net.Socket;
    try {
      upstream = boundary.connect(upstreamPort, '127.0.0.1');
    } catch {
      client.destroy();
      return;
    }
    track(upstream);
    const closeBoth = () => { client.destroy(); upstream.destroy(); };
    client.once('close', closeBoth);
    upstream.once('close', closeBoth);
    upstream.once('connect', () => {
      if (closed || client.destroyed) return closeBoth();
      const headers: string[] = [];
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        headers.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`);
      }
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        endpoint = hermesDevEndpoint(remotePort, (server.address() as net.AddressInfo).port, ids);
        resolve();
      });
    });
  } catch (error) {
    server.close();
    throw error;
  }
  // Handle errors after listen too; close() owns both HTTP keepalive and upgraded sockets.
  server.on('error', () => { for (const socket of sockets) socket.destroy(); });
  return {
    endpoint: endpoint!,
    async close() {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
