import { common } from '@kit.AbilityKit';
import { PlatformServices } from './PlatformServiceTypes';
import { HarmonyPermissionService } from './HarmonyPermissionService';
import { HarmonyBleService } from './HarmonyBleService';
import { HarmonyWifiService } from './HarmonyWifiService';
import { HarmonyNfcService } from './HarmonyNfcService';
import { HarmonyWifiCandidateCoordinator } from './HarmonyWifiCandidateCoordinator';

/** Construct once for each native RuntimeHost using that ability's actual context. */
export class HarmonySystemServices implements PlatformServices {
  readonly version: 1 = 1;
  readonly permissions: HarmonyPermissionService;
  readonly ble: HarmonyBleService;
  readonly wifi: HarmonyWifiService;
  readonly nfc: HarmonyNfcService;
  private closed: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.permissions = new HarmonyPermissionService(context);
    this.ble = new HarmonyBleService(context, this.permissions);
    this.wifi = new HarmonyWifiService(context, this.permissions, HarmonyWifiCandidateCoordinator.forContext(context));
    this.nfc = new HarmonyNfcService(context, this.permissions);
  }

  setActive(active: boolean): void {
    if (this.closed) return;
    this.permissions.setActive(active);
    this.ble.setActive(active);
    this.wifi.setActive(active);
    this.nfc.setActive(active);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Every child invalidates callbacks synchronously. Never await an OS permission dialog.
    this.permissions.close();
    try {
      this.ble.close();
    } finally {
      try { this.wifi.close(); }
      finally { this.nfc.dispose(); }
    }
  }
}
