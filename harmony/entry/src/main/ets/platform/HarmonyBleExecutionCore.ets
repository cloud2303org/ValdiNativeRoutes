import { common } from '@kit.AbilityKit';
import { bleError } from './HarmonyBleHelpers';

/** Hardware admission identity only. Contains no runtime host/context/event sink. */
export class HarmonyBleExecutionSession {
  readonly owner: number;
  readonly generation: number;
  valid: boolean = true;
  error: Error = bleError('NOT_INITIALIZED', 'BLE execution session retired');
  constructor(owner: number, generation: number) { this.owner = owner; this.generation = generation; }
}

/**
 * A transient resource reservation. Admission continuations are cleared on
 * grant/cancel. Native completion accounting is independent of caller timeout.
 */
export class HarmonyBleExecutionTicket {
  readonly session: HarmonyBleExecutionSession;
  readonly resource: string;
  readonly ready: Promise<void>;
  admitted: boolean = false;
  finished: boolean = false;
  retired: boolean = false;
  cleaned: boolean = false;
  nativePending: number = 0;
  private resolve?: () => void;
  private reject?: (error: Error) => void;
  constructor(session: HarmonyBleExecutionSession, resource: string) {
    this.session = session;
    this.resource = resource;
    this.ready = new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
  }
  grant(): void {
    this.admitted = true;
    const resolve = this.resolve;
    this.resolve = undefined;
    this.reject = undefined;
    resolve?.();
  }
  cancel(error: Error): void {
    this.retired = true;
    const reject = this.reject;
    this.resolve = undefined;
    this.reject = undefined;
    reject?.(error);
  }
  validate(): void {
    if (this.retired || !this.session.valid) throw this.session.error;
  }
}

class HarmonyBleExecutionLane {
  active?: HarmonyBleExecutionTicket;
  waiting: HarmonyBleExecutionTicket[] = [];
  drainScheduled: boolean = false;
}

/**
 * The one app-resource admission authority. It stores leases/tickets only:
 * no SDK clients, dispatch closures, Bluetooth events, Ability contexts or hosts.
 * Actual SDK calls and timeout/callback ownership remain in HarmonyBleService.
 */
export class HarmonyBleExecutionCore {
  private static applications: Map<string, HarmonyBleExecutionCore> = new Map<string, HarmonyBleExecutionCore>();
  private readonly scope: string;
  private owners: Set<number> = new Set<number>();
  private sessions: Set<HarmonyBleExecutionSession> = new Set<HarmonyBleExecutionSession>();
  private tickets: Set<HarmonyBleExecutionTicket> = new Set<HarmonyBleExecutionTicket>();
  private lanes: Map<string, HarmonyBleExecutionLane> = new Map<string, HarmonyBleExecutionLane>();
  private nextOwner: number = 0;
  private nextGeneration: number = 0;

  private constructor(scope: string) { this.scope = scope; }

  static forContext(context: common.UIAbilityContext): HarmonyBleExecutionCore {
    const info = context.applicationInfo;
    if (!Number.isInteger(info.uid) || info.uid < 0 || !info.name) {
      throw bleError('INVALID_DATA', 'Actual application UID and name are required for BLE execution scope');
    }
    const scope = `${info.uid}:${info.name}`;
    let core = HarmonyBleExecutionCore.applications.get(scope);
    if (!core) {
      core = new HarmonyBleExecutionCore(scope);
      HarmonyBleExecutionCore.applications.set(scope, core);
    }
    return core;
  }

  openOwner(): number { const owner = ++this.nextOwner; this.owners.add(owner); return owner; }

  session(owner: number): HarmonyBleExecutionSession {
    if (!this.owners.has(owner)) throw bleError('NOT_INITIALIZED', 'BLE execution owner closed');
    const session = new HarmonyBleExecutionSession(owner, ++this.nextGeneration);
    this.sessions.add(session);
    return session;
  }

  acquire(session: HarmonyBleExecutionSession, resource: string): HarmonyBleExecutionTicket {
    if (!session.valid || !this.owners.has(session.owner)) throw session.error;
    const ticket = new HarmonyBleExecutionTicket(session, resource);
    this.tickets.add(ticket);
    let lane = this.lanes.get(resource);
    if (!lane) { lane = new HarmonyBleExecutionLane(); this.lanes.set(resource, lane); }
    lane.waiting.push(ticket);
    if (!lane.active && !lane.drainScheduled) this.drain(resource, lane);
    return ticket;
  }

  /** Observe the REAL terminal signal, never a service's timeout Promise. */
  track<T>(ticket: HarmonyBleExecutionTicket, native: Promise<T>): void {
    // The SDK may synchronously deliver a disconnect during the call that
    // returns this Promise. Observe its terminal result even if that callback
    // retired the session; admission was validated before invoking the SDK.
    if (ticket.cleaned) { native.then(() => {}, () => {}); return; }
    ticket.nativePending++;
    native.then(() => this.nativeFinished(ticket), () => this.nativeFinished(ticket));
  }

  finish(ticket: HarmonyBleExecutionTicket): void {
    ticket.finished = true;
    this.releaseIfTerminal(ticket);
  }

  isCurrent(ticket: HarmonyBleExecutionTicket): boolean {
    return ticket.admitted && !ticket.finished && !ticket.retired && ticket.session.valid &&
      this.lanes.get(ticket.resource)?.active === ticket;
  }

  cancel(session: HarmonyBleExecutionSession, error: Error): void {
    session.valid = false;
    session.error = error;
    this.sessions.delete(session);
    Array.from(this.tickets).forEach((ticket) => {
      if (ticket.session !== session) return;
      ticket.cancel(error);
      if (!ticket.admitted) this.tickets.delete(ticket);
    });
    // Removal of queued entries is immediate: no closed-runtime continuation
    // remains retained behind another owner's long-running native call.
    this.lanes.forEach((lane, key) => {
      lane.waiting = lane.waiting.filter((ticket) => ticket.session !== session);
      if (!lane.active && lane.waiting.length === 0 && !lane.drainScheduled) this.lanes.delete(key);
    });
    this.dropIfIdle();
  }

  /** Only proven native termination/SDK resource close breaks a fence. */
  cleaned(session: HarmonyBleExecutionSession): void {
    Array.from(this.tickets).forEach((ticket) => {
      if (ticket.session !== session) return;
      ticket.nativePending = 0;
      ticket.cleaned = true;
      ticket.finished = true;
      this.releaseIfTerminal(ticket);
    });
  }

  cancelOwner(owner: number, error: Error): void {
    Array.from(this.sessions).forEach((session) => { if (session.owner === owner) this.cancel(session, error); });
  }

  closeOwner(owner: number, error: Error): void {
    this.cancelOwner(owner, error);
    this.owners.delete(owner);
    this.dropIfIdle();
  }

  /** Unavailable/transitional state cancels delivery without inventing termination. */
  unavailable(error: Error): void {
    const sessions = Array.from(this.sessions);
    sessions.forEach((session) => this.cancel(session, error));
  }

  /** Caller must have observed SDK STATE_OFF, not a turning/BLE transition. */
  powerOff(error: Error): void {
    this.unavailable(error);
    // A native operation retained after a business timeout can belong to an
    // already retired session, so include the remaining lease set as well.
    Array.from(this.tickets).forEach((ticket) => {
      ticket.session.valid = false;
      ticket.session.error = error;
      ticket.cancel(error);
      ticket.nativePending = 0;
      ticket.cleaned = true;
      ticket.finished = true;
      this.releaseIfTerminal(ticket);
    });
  }

  private nativeFinished(ticket: HarmonyBleExecutionTicket): void {
    if (ticket.nativePending > 0) ticket.nativePending--;
    this.releaseIfTerminal(ticket);
  }

  private releaseIfTerminal(ticket: HarmonyBleExecutionTicket): void {
    if (!ticket.finished || ticket.nativePending !== 0) return;
    const lane = this.lanes.get(ticket.resource);
    this.tickets.delete(ticket);
    if (!lane || lane.active !== ticket) { this.dropIfIdle(); return; }
    lane.active = undefined;
    if (!lane.drainScheduled) {
      lane.drainScheduled = true;
      Promise.resolve().then(() => {
        lane.drainScheduled = false;
        if (this.lanes.get(ticket.resource) === lane) this.drain(ticket.resource, lane);
      });
    }
  }

  private drain(resource: string, lane: HarmonyBleExecutionLane): void {
    if (lane.active) return;
    while (lane.waiting.length > 0) {
      const ticket = lane.waiting.shift();
      if (!ticket) continue;
      if (!ticket.session.valid || ticket.retired || !this.owners.has(ticket.session.owner)) {
        ticket.cancel(ticket.session.error);
        this.tickets.delete(ticket);
        continue;
      }
      lane.active = ticket;
      ticket.grant();
      return;
    }
    this.lanes.delete(resource);
    this.dropIfIdle();
  }

  private dropIfIdle(): void {
    if (this.owners.size === 0 && this.tickets.size === 0 && this.lanes.size === 0 &&
      HarmonyBleExecutionCore.applications.get(this.scope) === this) {
      HarmonyBleExecutionCore.applications.delete(this.scope);
    }
  }
}
