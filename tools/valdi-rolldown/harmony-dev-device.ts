import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

export interface HarmonyDevSelection {
  readonly deviceId: string;
  readonly applicationId: string;
  readonly hdc: string;
}

/** Presence of HARMONY_DEVICE selects Harmony exclusively; never infer a phone from discovery. */
export function harmonyDevSelection(env: NodeJS.ProcessEnv): HarmonyDevSelection | undefined {
  if (env.HARMONY_DEVICE === undefined) return undefined;
  const deviceId = env.HARMONY_DEVICE;
  const applicationId = env.HARMONY_APPLICATION_ID;
  if (!deviceId || /[\s\0]/.test(deviceId) || deviceId.startsWith('-')) {
    throw new Error('HARMONY_DEVICE must be one exact HDC connect key');
  }
  if (!applicationId || applicationId.trim() !== applicationId || /[\s\0]/.test(applicationId)) {
    throw new Error('HARMONY_APPLICATION_ID must name the exact expected configure.application_id');
  }
  return { deviceId, applicationId, hdc: env.HDC_PATH || 'hdc' };
}

export type RunHdc = (executable: string, args: string[]) => Promise<string>;
const exec = promisify(execFile);
export const runHdc: RunHdc = async (executable, args) => {
  const { stdout } = await exec(executable, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  if (/\[Fail\]|\[E\d+\]|^error:/im.test(stdout)) throw new Error(`HDC ${args.join(' ')} failed: ${stdout.trim()}`);
  return stdout;
};

export async function harmonyTargetAttached(selection: HarmonyDevSelection, run: RunHdc): Promise<boolean> {
  const output = await run(selection.hdc, ['list', 'targets']);
  return output.split(/\r?\n/).some(line => line.trim() === selection.deviceId);
}

export interface HdcForward {
  readonly deviceId: string;
  readonly local: string;
  readonly remote: string;
  readonly direction: 'Forward' | 'Reverse';
}

/** Current HDC server's BuildForwardVisableLine: connectKey, task pair, direction. Fail closed on unknown output. */
export function parseHdcForwards(output: string): HdcForward[] {
  return output.split(/\r?\n/).flatMap(line => {
    if (!line.trim() || line.trim() === '[Empty]') return [];
    const match = /^\s*(\S+)\s+(\S+)\s+(\S+)\s+\[(Forward|Reverse)\]\s*$/.exec(line);
    if (!match) throw new Error(`Unrecognized HDC fport ls row: ${line}`);
    return [{ deviceId: match[1], local: match[2], remote: match[3], direction: match[4] as HdcForward['direction'] }];
  });
}

export function unusedLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

/** Owns only newly created, explicit positive-port pairs, including cleanup pending after a transient HDC error. */
export class HarmonyDevForwards {
  private readonly owned = new Set<HdcForward>();

  constructor(
    readonly selection: HarmonyDevSelection,
    private readonly run: RunHdc = runHdc,
    private readonly allocatePort: () => Promise<number> = unusedLoopbackPort,
    private readonly report: (message: string) => void = console.error,
  ) {}

  private async list() {
    return parseHdcForwards(await this.run(this.selection.hdc, ['-t', this.selection.deviceId, 'fport', 'ls']));
  }

  async open(remotePort: number): Promise<HdcForward> {
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('Invalid HDC remote port');
    const localPort = await this.allocatePort();
    if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) throw new Error('Invalid HDC local port');
    const forward: HdcForward = {
      deviceId: this.selection.deviceId, local: `tcp:${localPort}`, remote: `tcp:${remotePort}`, direction: 'Forward',
    };
    // fport ls is global even with -t. Never take over another target's port or a pending owned lease.
    if ((await this.list()).some(item => item.direction === 'Forward' && item.local === forward.local)
      || [...this.owned].some(item => item.local === forward.local)) {
      throw new Error(`HDC local port already forwarded: ${forward.local}`);
    }
    const output = await this.run(this.selection.hdc,
      ['-t', forward.deviceId, 'fport', forward.local, forward.remote]);
    if (/\[Fail\]|\[E\d+\]|^error:/im.test(output)) throw new Error(`HDC forward failed: ${output.trim()}`);
    this.owned.add(forward);
    try {
      if (!(await this.list()).some(item => this.matches(item, forward))) throw new Error('HDC forward was not installed');
      return forward;
    } catch (error) {
      await this.release(forward);
      throw error;
    }
  }

  private matches(a: HdcForward, b: HdcForward) {
    return a.deviceId === b.deviceId && a.direction === b.direction && a.local === b.local && a.remote === b.remote;
  }

  async release(forward: HdcForward) {
    if (!this.owned.has(forward)) return;
    try {
      if ((await this.list()).some(item => this.matches(item, forward))) {
        const output = await this.run(this.selection.hdc,
          ['-t', forward.deviceId, 'fport', 'rm', forward.local, forward.remote]);
        if (/\[Fail\]|\[E\d+\]|^error:/im.test(output)) throw new Error(output.trim());
        if ((await this.list()).some(item => this.matches(item, forward))) throw new Error('HDC forward still installed');
      }
      this.owned.delete(forward);
    } catch (error) {
      this.report(`HDC cleanup pending for ${forward.deviceId} ${forward.local} ${forward.remote}: ${String(error)}`);
    }
  }

  /** Retry unused owned leases while preserving active ones; false blocks setup until pending cleanup succeeds. */
  async releaseUnused(keep: readonly HdcForward[]): Promise<boolean> {
    for (const forward of [...this.owned]) if (!keep.includes(forward)) await this.release(forward);
    return [...this.owned].every(forward => keep.includes(forward));
  }

  async close(): Promise<boolean> {
    return this.releaseUnused([]);
  }
}

export function forwardedPort(forward: HdcForward): number {
  return Number(forward.local.slice(4));
}
