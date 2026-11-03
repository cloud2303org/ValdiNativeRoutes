import net from 'node:net';
import { DEVICE_PORT, DevPacketReader, encodeDevPacket, record, updatedResources, type DevResource } from './dev-protocol';
import {
  forwardedPort, HarmonyDevForwards, harmonyTargetAttached, runHdc,
  type HdcForward, type HarmonyDevSelection, type RunHdc,
} from './harmony-dev-device';
import { startHermesDevProxy, type HermesDevEndpoint, type HermesDevProxy } from './harmony-dev-cdp';

export interface HarmonyDevEndpoint {
  readonly platform: 'harmony';
  readonly deviceId: string;
  readonly applicationId: string;
  /** Pass autoForward:false and port to an inspection client; this is already an HDC tunnel, never an ADB target. */
  readonly daemon: { readonly host: '127.0.0.1'; readonly port: number; readonly autoForward: false };
  readonly debugger?: HermesDevEndpoint;
}

export interface HarmonyDevBoundary {
  run: RunHdc;
  allocatePort: () => Promise<number>;
  connect: (port: number, host: string) => net.Socket;
  startProxy: typeof startHermesDevProxy;
}

interface Session {
  socket: net.Socket;
  forward: HdcForward;
  configured: boolean;
  hotReload: boolean;
  reader: DevPacketReader;
  desiredDebugger?: DebuggerDiscovery;
}

interface DebuggerDiscovery {
  readonly port: number;
  readonly ids: readonly string[];
}

/** No imports from pipeline.ts, no watcher, no shell configuration or credentials, and no ADB fallback. */
export class HarmonyDevTransport {
  private readonly forwards: HarmonyDevForwards;
  private readonly boundary: Pick<HarmonyDevBoundary, 'run' | 'connect' | 'startProxy'>;
  private session?: Session;
  private debuggerForward?: HdcForward;
  private proxy?: HermesDevProxy;
  private stopped = false;
  private work: Promise<void> = Promise.resolve();
  private polling?: Promise<void>;
  private published?: HarmonyDevEndpoint;

  constructor(
    readonly selection: HarmonyDevSelection,
    private readonly resources: () => DevResource[],
    private readonly log: (message: string) => void = console.log,
    private readonly onEndpoint: (endpoint: HarmonyDevEndpoint | undefined) => void = () => {},
    boundary: Partial<HarmonyDevBoundary> = {},
  ) {
    this.boundary = {
      run: boundary.run ?? runHdc,
      connect: boundary.connect ?? ((port, host) => net.connect(port, host)),
      startProxy: boundary.startProxy ?? startHermesDevProxy,
    };
    this.forwards = new HarmonyDevForwards(selection, this.boundary.run, boundary.allocatePort, log);
  }

  get endpoint() { return this.published; }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.work.then(action);
    this.work = next.catch(error => this.log(`[${this.selection.deviceId}] ${String(error)}`));
    return this.work;
  }

  /** Serializes port replacement, disconnect and stop; polling callers cannot accumulate reconnect attempts. */
  poll(): Promise<void> {
    if (this.stopped) return this.work;
    if (this.polling) return this.polling;
    this.polling = this.enqueue(async () => {
      if (this.stopped) return;
      let attached: boolean;
      try {
        attached = await harmonyTargetAttached(this.selection, this.boundary.run);
      } catch (error) {
        await this.disconnect();
        await this.forwards.close();
        throw error;
      }
      if (!attached) {
        await this.disconnect();
        await this.forwards.close();
        return;
      }
      if (this.session) {
        await this.reconcileDebugger(this.session);
        return;
      }
      if (!await this.forwards.close() || this.stopped) return;
      const forward = await this.forwards.open(DEVICE_PORT);
      if (this.stopped) { await this.forwards.release(forward); return; }
      try {
        const socket = this.boundary.connect(forwardedPort(forward), '127.0.0.1');
        const session: Session = { socket, forward, configured: false, hotReload: false, reader: new DevPacketReader() };
        this.session = session;
        socket.on('data', (data: Buffer) => {
          if (this.stopped || this.session !== session || socket.destroyed) return;
          try {
            session.reader.receive(data, payload => {
              if (!socket.destroyed) this.handle(session, payload);
            });
          } catch (error) {
            session.configured = false;
            this.publish(undefined);
            this.log(`[${this.selection.deviceId}] ${String(error)}`);
            socket.destroy();
          }
        });
        socket.on('error', () => {});
        socket.once('close', () => {
          session.configured = false;
          if (this.session === session) this.publish(undefined);
          void this.enqueue(async () => { if (this.session === session) await this.disconnect(); });
        });
      } catch (error) {
        await this.forwards.release(forward);
        throw error;
      }
    }).finally(() => { this.polling = undefined; });
    return this.polling;
  }

  private publish(endpoint: HarmonyDevEndpoint | undefined) {
    this.published = endpoint;
    this.onEndpoint(endpoint);
    if (endpoint) this.log(`[${this.selection.deviceId}] Harmony dev endpoint ${JSON.stringify(endpoint)}`);
  }

  private publishSession() {
    if (!this.session?.configured || this.stopped) return;
    this.publish({
      platform: 'harmony', deviceId: this.selection.deviceId, applicationId: this.selection.applicationId,
      daemon: { host: '127.0.0.1', port: forwardedPort(this.session.forward), autoForward: false },
      ...(this.proxy ? { debugger: this.proxy.endpoint } : {}),
    });
  }

  private write(session: Session, payload: object) { session.socket.write(encodeDevPacket(payload)); }

  send(resources: DevResource[]) {
    const session = this.session;
    if (this.stopped || !session?.configured || !session.hotReload || session.socket.destroyed || !resources.length) return;
    this.write(session, updatedResources(resources));
    this.log(`[${this.selection.deviceId}] Sent ${resources.map(({ bundle, file }) => `${bundle}:${file}`).join(', ')}`);
  }

  private handle(session: Session, payload: Record<string, any>) {
    if (record(payload.request)) {
      const request = payload.request;
      if (typeof request.request_id !== 'string' || !request.request_id) throw new Error('Missing daemon request_id');
      if (record(request.configure)) {
        session.configured = false;
        const config = request.configure;
        if (config.application_id !== this.selection.applicationId || config.platform !== 'harmony') {
          this.write(session, { response: { request_id: request.request_id, error: {
            error_message: `Expected Harmony application ${this.selection.applicationId}`,
          } } });
          throw new Error('Harmony configure identity/platform mismatch; no resources published');
        }
        this.write(session, { response: { request_id: request.request_id, configure: {} } });
        session.configured = true;
        session.hotReload = config.disable_hot_reload !== true;
        this.publishSession();
        this.send(this.resources());
        if (session.desiredDebugger) void this.poll();
      } else {
        this.write(session, { response: { request_id: request.request_id, error: {
          error_message: 'Not supported by this dev resource connection; use a separate inspection connection',
        } } });
      }
      return;
    }
    if (!record(payload.event)) return;
    const event = payload.event;
    for (const entry of session.configured && Array.isArray(event.new_logs) ? event.new_logs : []) {
      if (record(entry)) this.log(`[${this.selection.deviceId}] ${entry.severity}: ${entry.log}`);
    }
    if (event.js_debugger_info !== undefined) {
      const info = event.js_debugger_info;
      if (!record(info) || !Number.isInteger(info.port) || info.port < 0 || info.port > 65535
        || !Array.isArray(info.websocket_targets)
        || info.websocket_targets.some((id: unknown) => typeof id !== 'string' || !/^[a-zA-Z0-9._~-]+$/.test(id))) {
        throw new Error('Invalid js_debugger_info');
      }
      const port: number = info.port;
      const ids: string[] = [...new Set<string>(info.websocket_targets)];
      // Native listeners may emit this before configure. Retain it on this session only, without opening any ports.
      if (session.desiredDebugger?.port !== port || JSON.stringify(session.desiredDebugger.ids) !== JSON.stringify(ids)) {
        session.desiredDebugger = { port, ids };
      }
      if (session.configured) void this.poll();
    }
  }

  private isCurrentDiscovery(session: Session, discovery: DebuggerDiscovery): boolean {
    return !this.stopped && this.session === session && !session.socket.destroyed
      && session.configured && session.desiredDebugger === discovery;
  }

  /** One attempt per coalesced poll; a failure retains desired state for the next poll, never self-enqueues retries. */
  private async reconcileDebugger(session: Session) {
    const discovery = session.desiredDebugger;
    if (!discovery || !this.isCurrentDiscovery(session, discovery)) return;
    const { port, ids } = discovery;
    if (this.proxy?.endpoint.remotePort === port
      && JSON.stringify(this.proxy.endpoint.targets.map(target => target.id)) === JSON.stringify(ids)) return;
    if ((!port || !ids.length) && !this.proxy && !this.debuggerForward) {
      await this.forwards.releaseUnused([session.forward]);
      return;
    }
    await this.clearDebugger();
    this.publishSession();
    if (!this.isCurrentDiscovery(session, discovery) || !port || !ids.length) return;
    if (!await this.forwards.releaseUnused([session.forward])) return;
    if (!this.isCurrentDiscovery(session, discovery)) return;
    const forward = await this.forwards.open(port);
    this.debuggerForward = forward;
    // Stop, disconnect or a newer event can arrive during either asynchronous setup boundary.
    if (!this.isCurrentDiscovery(session, discovery)) {
      await this.clearDebugger();
      return;
    }
    try {
      this.proxy = await this.boundary.startProxy(forwardedPort(forward), port, ids);
      if (!this.isCurrentDiscovery(session, discovery)) {
        await this.clearDebugger();
        return;
      }
      this.publishSession();
    } catch (error) {
      await this.clearDebugger();
      throw error;
    }
  }

  private async clearDebugger() {
    const proxy = this.proxy;
    this.proxy = undefined;
    try {
      await proxy?.close();
    } finally {
      if (this.debuggerForward) await this.forwards.release(this.debuggerForward);
      this.debuggerForward = undefined;
    }
  }

  private async disconnect() {
    const session = this.session;
    this.session = undefined;
    if (session) { session.configured = false; session.socket.destroy(); }
    this.publish(undefined);
    try {
      await this.clearDebugger();
    } finally {
      if (session) await this.forwards.release(session.forward);
    }
  }

  async close() {
    this.stopped = true;
    if (this.session) this.session.configured = false;
    this.publish(undefined);
    await this.enqueue(async () => {
      try { await this.disconnect(); } finally { await this.forwards.close(); }
    });
  }
}
