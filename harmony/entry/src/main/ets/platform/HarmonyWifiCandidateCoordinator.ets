import { common, AbilityLifecycleCallback, ApplicationStateChangeCallback, UIAbility } from '@kit.AbilityKit';
import { wifiManager } from '@kit.ConnectivityKit';

/** An SDK callback can outlive off(). Retirement drops its runtime delivery path. */
export class HarmonyWifiEventSubscription {
  readonly kind: string;
  readonly callback: (state: number) => void;
  attemptedUnregister: number = -1;
  private delivery?: (state: number) => void;

  constructor(kind: string, delivery: (state: number) => void) {
    this.kind = kind;
    this.delivery = delivery;
    this.callback = (state: number): void => { this.delivery?.(state); };
  }

  retire(): boolean {
    if (this.delivery === undefined) return false;
    this.delivery = undefined;
    return true;
  }
}

/** SDK resource state only. Never stores Valdi hosts, event sinks or JS/NAPI callbacks. */
export class HarmonyWifiCandidateLease {
  readonly owner: number;
  id: number = -1;
  adding: boolean = true;
  retired: boolean = false;
  removing: boolean = false;
  attemptedRecovery: number = -1;

  constructor(owner: number) { this.owner = owner; }
}

/** Registration reservation; contains only SDK owner identity, never runtime callbacks. */
export class HarmonyWifiCandidateReadiness {
  readonly owner: number;
  readonly unregisterRecovery: number;
  constructor(owner: number, unregisterRecovery: number) {
    this.owner = owner;
    this.unregisterRecovery = unregisterRecovery;
  }
}

/**
 * Candidate IDs/configuration updates belong to the application in the Wi-Fi SDK.
 * Hold one app-wide lease until confirmed removal, including across RuntimeHosts.
 * A closed runtime contributes no callbacks; only unresolved SDK ownership survives.
 */
export class HarmonyWifiCandidateCoordinator {
  private static applications: Map<string, HarmonyWifiCandidateCoordinator> =
    new Map<string, HarmonyWifiCandidateCoordinator>();

  private readonly scope: string;
  private readonly application: common.ApplicationContext;
  private owners: Set<number> = new Set<number>();
  private foregroundOwners: Set<number> = new Set<number>();
  private nextOwner: number = 0;
  private lease?: HarmonyWifiCandidateLease;
  private foreground: boolean = false;
  private recovery: number = 0;
  private watchGeneration: number = 0;
  private lifecycleId: number = -1;
  private lifecycleCallback?: AbilityLifecycleCallback;
  private applicationCallback?: ApplicationStateChangeCallback;
  private wifiCallback?: (state: number) => void;
  private activeSubscriptions: number = 0;
  // Only retired SDK entries enter this set; their runtime delivery is cleared.
  private retiredSubscriptions: Set<HarmonyWifiEventSubscription> = new Set<HarmonyWifiEventSubscription>();
  private unregisterRecovery: number = 0;
  private unregisterScheduled: boolean = false;
  private wifiUnregisterAttempt: number = -1;
  private applicationUnregisterAttempt: number = -1;
  private lifecycleUnregisterAttempt: number = -1;
  private lifecycleRemoval?: Promise<void>;
  private preparations: Set<HarmonyWifiCandidateReadiness> = new Set<HarmonyWifiCandidateReadiness>();

  private constructor(context: common.UIAbilityContext, scope: string) {
    this.scope = scope;
    this.application = context.getApplicationContext();
  }

  private static scopeOf(context: common.UIAbilityContext): string {
    const info = context.applicationInfo;
    if (!Number.isInteger(info.uid) || info.uid < 0 || !info.name) {
      throw new Error('E_WIFI_SYSTEM_CONFIG:actual application UID and bundle identity required');
    }
    return `${info.uid}:${info.name}`;
  }

  static forContext(context: common.UIAbilityContext): HarmonyWifiCandidateCoordinator {
    const scope = HarmonyWifiCandidateCoordinator.scopeOf(context);
    let coordinator = HarmonyWifiCandidateCoordinator.applications.get(scope);
    if (coordinator === undefined) {
      coordinator = new HarmonyWifiCandidateCoordinator(context, scope);
      HarmonyWifiCandidateCoordinator.applications.set(scope, coordinator);
    }
    return coordinator;
  }

  openOwner(context: common.UIAbilityContext): number {
    if (HarmonyWifiCandidateCoordinator.scopeOf(context) !== this.scope) {
      throw new Error('E_WIFI_SYSTEM_CONFIG:candidate coordinator belongs to a different application');
    }
    const current = HarmonyWifiCandidateCoordinator.applications.get(this.scope);
    if (current !== undefined && current !== this) {
      throw new Error('E_WIFI_CONNECTION_OWNED:another coordinator owns this application scope');
    }
    HarmonyWifiCandidateCoordinator.applications.set(this.scope, this);
    const owner = ++this.nextOwner;
    this.owners.add(owner);
    this.retryUnregistrations();
    return owner;
  }

  async ready(owner: number): Promise<HarmonyWifiCandidateReadiness> {
    if (!this.owners.has(owner)) throw new Error('E_WIFI_NOT_INITIALIZED:candidate owner closed');
    const readiness = new HarmonyWifiCandidateReadiness(owner, ++this.unregisterRecovery);
    // Reserve before awaiting: teardown cannot begin a second lifecycle off
    // between settlement, caller revalidation and synchronous SDK registration.
    this.preparations.add(readiness);
    this.scheduleUnregistrations();
    const removal = this.lifecycleRemoval;
    try {
      if (removal !== undefined) await removal;
      this.validateReadiness(readiness);
      return readiness;
    } catch (error) {
      this.preparations.delete(readiness);
      this.dropRegistryIfIdle();
      throw error as Error;
    }
  }

  releaseReadiness(readiness: HarmonyWifiCandidateReadiness): void {
    if (!this.preparations.delete(readiness)) return;
    // Release is not a new recovery signal. A failed off is not retried merely
    // because the caller unwound its readiness reservation.
    this.scheduleUnregistrations();
    this.dropRegistryIfIdle();
  }

  private validateReadiness(readiness: HarmonyWifiCandidateReadiness): void {
    if (!this.preparations.has(readiness) || !this.owners.has(readiness.owner)) {
      throw new Error('E_WIFI_NOT_INITIALIZED:candidate owner closed or readiness released');
    }
  }

  subscribe(readiness: HarmonyWifiCandidateReadiness, kind: string,
    delivery: (state: number) => void): HarmonyWifiEventSubscription {
    this.validateReadiness(readiness);
    // Reentry is a new retry signal. Do not register replacement callbacks of
    // this kind until the old SDK registration is confirmed removed.
    // The queued drain and registration share this operation's retry ticket.
    // Awaiting readiness must not cause two off attempts for one reentry.
    const recovery = readiness.unregisterRecovery;
    this.retiredSubscriptions.forEach((subscription: HarmonyWifiEventSubscription) => {
      if (subscription.kind === kind) this.unregisterSubscription(subscription, recovery);
    });
    if (Array.from(this.retiredSubscriptions).some((subscription: HarmonyWifiEventSubscription) => subscription.kind === kind)) {
      throw new Error('E_WIFI_SYSTEM_INTERNAL:previous SDK callback unregistration pending');
    }
    this.watch();
    const subscription = new HarmonyWifiEventSubscription(kind, delivery);
    try {
      switch (kind) {
        case 'wifiConnectionChange': wifiManager.on('wifiConnectionChange', subscription.callback); break;
        case 'wifiScanStateChange': wifiManager.on('wifiScanStateChange', subscription.callback); break;
        default: throw new Error('E_WIFI_SYSTEM_CONFIG:unsupported client subscription');
      }
      ++this.activeSubscriptions;
      return subscription;
    } catch (error) {
      subscription.retire();
      this.releaseIfIdle();
      throw error as Error;
    }
  }

  retireSubscription(subscription: HarmonyWifiEventSubscription): void {
    if (!subscription.retire()) return;
    --this.activeSubscriptions;
    this.retiredSubscriptions.add(subscription);
    this.retryUnregistrations();
  }

  setActive(owner: number, active: boolean): void {
    if (!this.owners.has(owner)) return;
    if (active) {
      this.foregroundOwners.add(owner);
      this.foreground = true;
      this.recover();
    } else {
      this.foregroundOwners.delete(owner);
      if (this.foregroundOwners.size === 0) this.foreground = false;
    }
  }

  async allocate(readiness: HarmonyWifiCandidateReadiness,
    config: wifiManager.WifiDeviceConfig): Promise<HarmonyWifiCandidateLease> {
    this.validateReadiness(readiness);
    const owner = readiness.owner;
    if (this.lease !== undefined) {
      throw new Error('E_WIFI_CONNECTION_OWNED:application candidate allocation or lease cleanup pending');
    }
    this.watch();
    const lease = new HarmonyWifiCandidateLease(owner);
    this.lease = lease;
    try {
      const id = await wifiManager.addCandidateConfig(config);
      if (!Number.isInteger(id) || id < 0) throw new Error('E_WIFI_SYSTEM_CONFIG:candidate configuration rejected');
      lease.id = id;
      lease.adding = false;
      if (!this.owners.has(owner)) lease.retired = true;
      this.attemptRemoval(lease);
      return lease;
    } catch (error) {
      if (this.lease === lease) this.lease = undefined;
      this.releaseIfIdle();
      throw error as Error;
    }
  }

  retire(lease: HarmonyWifiCandidateLease): void {
    if (this.lease !== lease || lease.retired) return;
    lease.retired = true;
    this.recover();
  }

  stopOwner(owner: number): void {
    const lease = this.lease;
    if (lease !== undefined && lease.owner === owner) lease.retired = true;
    this.recover();
  }

  closeOwner(owner: number): void {
    if (!this.owners.delete(owner)) return;
    this.foregroundOwners.delete(owner);
    // Preserve the actual app foreground state until the SDK lifecycle says it
    // changed. Closing a runtime is not equivalent to backgrounding the app.
    this.stopOwner(owner);
    this.releaseIfIdle();
  }

  private eligible(): boolean {
    if (!this.foreground) return false;
    try { return wifiManager.isWifiActive(); } catch (_) { return false; }
  }

  recover(): void {
    this.retryUnregistrations();
    if (!this.eligible()) return;
    ++this.recovery;
    if (this.lease !== undefined) this.attemptRemoval(this.lease);
  }

  private attemptRemoval(lease: HarmonyWifiCandidateLease): void {
    if (this.lease !== lease || !lease.retired || lease.adding || lease.removing ||
      lease.attemptedRecovery >= this.recovery || !this.eligible()) return;
    lease.removing = true;
    lease.attemptedRecovery = this.recovery;
    Promise.resolve().then(async (): Promise<boolean> => {
      if (!this.eligible()) return false;
      // Signals before SDK dispatch are already reflected in this attempt's
      // eligibility check; only recovery during the actual pending SDK call
      // warrants a follow-up if that call fails.
      lease.attemptedRecovery = this.recovery;
      await wifiManager.removeCandidateConfig(lease.id);
      return true;
    }).then((removed: boolean) => {
      lease.removing = false;
      if (this.lease !== lease) return;
      if (removed) {
        this.lease = undefined;
        this.releaseIfIdle();
      } else this.attemptRemoval(lease);
    }, () => {
      lease.removing = false;
      // A recovery received during this attempt is coalesced into ONE follow-up.
      // That attempt consumes the latest generation; failure alone cannot loop.
      this.attemptRemoval(lease);
    });
  }

  private watch(): void {
    if (this.lifecycleId >= 0 && this.applicationCallback !== undefined && this.wifiCallback !== undefined) return;
    const generation = this.watchGeneration;
    const lifecycle: AbilityLifecycleCallback = {
      onAbilityCreate: (): void => {},
      onWindowStageCreate: (): void => {},
      onWindowStageActive: (): void => {},
      onWindowStageInactive: (): void => {},
      onWindowStageDestroy: (): void => {},
      onAbilityDestroy: (): void => {},
      onAbilityContinue: (): void => {},
      onAbilityBackground: (): void => {},
      onAbilityForeground: (_ability: UIAbility): void => {
        if (generation !== this.watchGeneration || this.lifecycleCallback !== lifecycle) return;
        this.foreground = true;
        this.recover();
      }
    };
    const state: ApplicationStateChangeCallback = {
      onApplicationForeground: (): void => {},
      onApplicationBackground: (): void => {
        if (generation !== this.watchGeneration || this.applicationCallback !== state) return;
        this.foreground = false;
        this.foregroundOwners.clear();
      }
    };
    const wifi = (value: number): void => {
      if (generation === this.watchGeneration && this.wifiCallback === wifi && value === 1) this.recover();
    };
    try {
      if (this.lifecycleId < 0) {
        this.lifecycleId = this.application.on('abilityLifecycle', lifecycle);
        this.lifecycleCallback = lifecycle;
      }
      if (this.applicationCallback === undefined) {
        this.application.on('applicationStateChange', state);
        this.applicationCallback = state;
      }
      if (this.wifiCallback === undefined) {
        wifiManager.on('wifiStateChange', wifi);
        this.wifiCallback = wifi;
      }
    } catch (error) {
      this.releaseIfIdle();
      throw error as Error;
    }
  }

  private releaseIfIdle(): void {
    if (this.lease === undefined) this.retryUnregistrations();
  }

  private retryUnregistrations(): void {
    ++this.unregisterRecovery;
    this.scheduleUnregistrations();
  }

  private scheduleUnregistrations(): void {
    if (this.unregisterScheduled) return;
    this.unregisterScheduled = true;
    Promise.resolve().then(() => {
      this.unregisterScheduled = false;
      this.drainUnregistrations();
    });
  }

  private drainUnregistrations(): void {
    const recovery = this.unregisterRecovery;
    this.retiredSubscriptions.forEach((subscription: HarmonyWifiEventSubscription) => {
      this.unregisterSubscription(subscription, recovery);
    });
    if (this.lease !== undefined || this.activeSubscriptions > 0 || this.retiredSubscriptions.size > 0 ||
      this.preparations.size > 0) return;
    if (this.wifiCallback !== undefined) {
      if (this.wifiUnregisterAttempt >= recovery) return;
      this.wifiUnregisterAttempt = recovery;
      try {
        wifiManager.off('wifiStateChange', this.wifiCallback);
        this.wifiCallback = undefined;
      } catch (_) { return; }
    }
    if (this.applicationCallback !== undefined) {
      if (this.applicationUnregisterAttempt >= recovery) return;
      this.applicationUnregisterAttempt = recovery;
      try {
        this.application.off('applicationStateChange', this.applicationCallback);
        this.applicationCallback = undefined;
      } catch (_) { return; }
    }
    if (this.lifecycleId >= 0) {
      if (this.lifecycleRemoval !== undefined || this.lifecycleUnregisterAttempt >= recovery) return;
      this.lifecycleUnregisterAttempt = recovery;
      const id = this.lifecycleId;
      try {
        this.lifecycleRemoval = this.application.off('abilityLifecycle', id).then(() => {
          this.lifecycleRemoval = undefined;
          this.lifecycleId = -1;
          this.lifecycleCallback = undefined;
          this.dropRegistryIfIdle();
        }, (_error: Error) => {
          this.lifecycleRemoval = undefined;
          if (this.unregisterRecovery > recovery) this.scheduleUnregistrations();
          // Awaiting callers receive the actual SDK failure; the ID/callback
          // stay owned for a future explicit retry or safe reuse.
          throw new Error('E_WIFI_SYSTEM_INTERNAL:SDK lifecycle callback unregistration failed');
        });
        // Teardown may have no waiting client. Observe rejection without
        // changing the settlement promise seen by ready().
        this.lifecycleRemoval.catch(() => {});
      } catch (_) {}
      return;
    }
    this.dropRegistryIfIdle();
  }

  private unregisterSubscription(subscription: HarmonyWifiEventSubscription, recovery: number): void {
    if (subscription.attemptedUnregister >= recovery) return;
    subscription.attemptedUnregister = recovery;
    try {
      switch (subscription.kind) {
        case 'wifiConnectionChange': wifiManager.off('wifiConnectionChange', subscription.callback); break;
        case 'wifiScanStateChange': wifiManager.off('wifiScanStateChange', subscription.callback); break;
      }
      this.retiredSubscriptions.delete(subscription);
    } catch (_) {} // Keep the exact handle. Failure never schedules another attempt.
  }

  private dropRegistryIfIdle(): void {
    if (this.lease !== undefined || this.activeSubscriptions > 0 || this.retiredSubscriptions.size > 0 ||
      this.preparations.size > 0 ||
      this.wifiCallback !== undefined || this.applicationCallback !== undefined || this.lifecycleId >= 0) return;
    ++this.watchGeneration;
    if (this.owners.size === 0 && HarmonyWifiCandidateCoordinator.applications.get(this.scope) === this) {
      HarmonyWifiCandidateCoordinator.applications.delete(this.scope);
    }
  }
}
