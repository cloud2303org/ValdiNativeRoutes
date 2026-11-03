import { abilityAccessCtrl, common, Permissions, PermissionRequestResult } from '@kit.AbilityKit';
import { settings } from '@kit.BasicServicesKit';
import { PermissionGrant, PermissionHost } from './PlatformServiceTypes';
import { HarmonyBlePermission } from './HarmonyBleService';

/**
 * One UIAbility's authorization authority. Normal system_grant permissions are checked,
 * never sent to the user_grant dialog. Invalid/undeclared permissions are errors.
 */
export class HarmonyPermissionService implements PermissionHost, HarmonyBlePermission {
  private readonly manager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
  private active: boolean = false;
  private closed: boolean = false;
  private requesting: boolean = false;
  private cancelRequest?: (error: Error) => void;
  private readonly context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  private permission(name: string): Permissions {
    switch (name) {
      case 'bluetooth':
      case 'ohos.permission.ACCESS_BLUETOOTH': return 'ohos.permission.ACCESS_BLUETOOTH';
      case 'ohos.permission.GET_WIFI_INFO': return 'ohos.permission.GET_WIFI_INFO';
      case 'ohos.permission.SET_WIFI_INFO': return 'ohos.permission.SET_WIFI_INFO';
      case 'ohos.permission.NFC_TAG': return 'ohos.permission.NFC_TAG';
      case 'ohos.permission.LOCATION': return 'ohos.permission.LOCATION';
      case 'ohos.permission.APPROXIMATELY_LOCATION': return 'ohos.permission.APPROXIMATELY_LOCATION';
      default: throw new Error('E_PERMISSION_INVALID:unsupported permission name');
    }
  }

  private state(permission: Permissions): abilityAccessCtrl.PermissionStatus {
    this.ensureOpen();
    const status = this.manager.getSelfPermissionStatus(permission);
    if (status === abilityAccessCtrl.PermissionStatus.INVALID) {
      throw new Error('E_PERMISSION_INVALID:permission undeclared or request prerequisites not met');
    }
    return status;
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('E_PERMISSION_SESSION_RELEASED:host closed');
  }

  async check(permission: string): Promise<boolean> {
    return this.state(this.permission(permission)) === abilityAccessCtrl.PermissionStatus.GRANTED;
  }

  async requestPermission(kind: string): Promise<boolean> {
    const grants = await this.requestMultiple([kind]);
    return grants[0].result === 'granted';
  }

  async requestMultiple(names: string[]): Promise<PermissionGrant[]> {
    this.ensureOpen();
    const permissions: Permissions[] = names.map((name: string) => this.permission(name));
    const prompt: Permissions[] = [];
    const results: PermissionGrant[] = [];
    permissions.forEach((permission: Permissions, index: number) => {
      const status = this.state(permission);
      const normal = permission === 'ohos.permission.GET_WIFI_INFO' ||
        permission === 'ohos.permission.SET_WIFI_INFO' || permission === 'ohos.permission.NFC_TAG';
      results.push({
        permission: names[index],
        result: status === abilityAccessCtrl.PermissionStatus.GRANTED ? 'granted' :
          status === abilityAccessCtrl.PermissionStatus.RESTRICTED || normal ? 'never_ask_again' : 'denied'
      });
      if (!normal && status !== abilityAccessCtrl.PermissionStatus.GRANTED &&
        status !== abilityAccessCtrl.PermissionStatus.RESTRICTED && !prompt.includes(permission)) prompt.push(permission);
    });
    if (prompt.length === 0) return results;
    if (!this.active) throw new Error('E_PERMISSION_BACKGROUND:permission dialog requires foreground ability');
    if (this.requesting) throw new Error('E_PERMISSION_DUPLICATE_REQUEST:permission dialog already pending');
    this.requesting = true;
    // Do not make graph close wait for a system-owned dialog that cannot be cancelled.
    return new Promise<PermissionGrant[]>((resolve, reject) => {
      this.cancelRequest = reject;
      Promise.resolve().then(() => {
        this.ensureOpen();
        if (!this.active) throw new Error('E_PERMISSION_BACKGROUND:ability left foreground before permission request');
        return this.manager.requestPermissionsFromUser(this.context, prompt);
      }).then((response: PermissionRequestResult) => {
        if (this.closed) return;
        try {
          prompt.forEach((permission: Permissions) => {
            const index = response.permissions.indexOf(permission);
            if (index < 0) throw new Error('E_PERMISSION_INVALID:missing authorization result');
            const auth = response.authResults[index];
            const reason = response.errorReasons === undefined ? 0 : response.errorReasons[index];
            if (auth === 2 || reason === 1 || reason === 2 || reason === 3) {
              throw new Error('E_PERMISSION_INVALID:permission name, declaration or prerequisites invalid');
            }
            if (reason === 12) throw new Error('E_PERMISSION_SYSTEM:authorization service exception');
            if (auth !== 0 && auth !== -1) throw new Error('E_PERMISSION_SYSTEM:unexpected authorization result');
            const shown = response.dialogShownResults;
            const result = auth === 0 ? 'granted' :
              (shown !== undefined && shown[index] === false) || reason === 5 || reason === 6 ?
                'never_ask_again' : 'denied';
            permissions.forEach((candidate: Permissions, target: number) => {
              if (candidate === permission) results[target].result = result;
            });
          });
          resolve(results);
        } catch (error) {
          reject(error);
        } finally {
          this.requesting = false;
          this.cancelRequest = undefined;
        }
      }, (error: Error) => {
        this.requesting = false;
        this.cancelRequest = undefined;
        reject(error);
      });
    });
  }

  async openSettings(): Promise<void> {
    this.ensureOpen();
    if (!this.active) throw new Error('E_PERMISSION_BACKGROUND:settings requires foreground ability');
    settings.openAppDetailSettingsPage(this.context, this.context.applicationInfo.name);
  }

  setActive(active: boolean): void {
    if (!this.closed) this.active = active;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.active = false;
    this.cancelRequest?.(new Error('E_PERMISSION_SESSION_RELEASED:host closed'));
    this.cancelRequest = undefined;
  }
}
