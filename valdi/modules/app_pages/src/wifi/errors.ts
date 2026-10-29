export const WECHAT_WIFI_ERROR_CODES = {
  NOT_INITIALIZED: 12000,
  SYSTEM_NOT_SUPPORTED: 12001,
  PASSWORD_ERROR: 12002,
  CONNECTION_TIMEOUT: 12003,
  DUPLICATE_REQUEST: 12004,
  WIFI_DISABLED: 12005,
  LOCATION_DISABLED: 12006,
  USER_DENIED: 12007,
  INVALID_SSID: 12008,
  SYSTEM_CONFIG: 12009,
  SYSTEM_INTERNAL: 12010,
  BACKGROUND: 12011,
  CONFIG_EXPIRED: 12013,
  INVALID_PASSWORD: 12014,
} as const;

export type WechatWifiErrorCode = (typeof WECHAT_WIFI_ERROR_CODES)[keyof typeof WECHAT_WIFI_ERROR_CODES];
const messages: Record<WechatWifiErrorCode, string> = {
  12000: 'not init',
  12001: 'system not support',
  12002: 'password error Wi-Fi',
  12003: 'connection timeout',
  12004: 'duplicate request',
  12005: 'wifi not turned on',
  12006: 'gps not turned on',
  12007: 'user denied',
  12008: 'invalid SSID',
  12009: 'system config err',
  12010: 'system internal error',
  12011: 'weapp in background',
  12013: 'wifi config may be expired',
  12014: 'invalid WEP / WPA password',
};
const nativeCodes: Record<string, WechatWifiErrorCode> = {
  E_WIFI_NOT_INITIALIZED: 12000,
  E_WIFI_SYSTEM_NOT_SUPPORTED: 12001,
  E_WIFI_SET_WIFI_LIST_UNSUPPORTED: 12001,
  E_WIFI_PASSWORD_ERROR: 12002,
  E_WIFI_CONNECTION_TIMEOUT: 12003,
  E_WIFI_DUPLICATE_REQUEST: 12004,
  E_WIFI_CONNECTION_OWNED: 12004,
  E_WIFI_DISABLED: 12005,
  E_WIFI_WIFI_DISABLED: 12005,
  E_WIFI_LOCATION_DISABLED: 12006,
  E_WIFI_PERMISSION_DENIED: 12007,
  E_WIFI_LOCATION_PERMISSION_REQUIRED: 12007,
  E_WIFI_USER_DENIED: 12007,
  E_WIFI_INVALID_SSID: 12008,
  E_WIFI_SYSTEM_CONFIG: 12009,
  E_WIFI_BACKGROUND: 12011,
  E_WIFI_CONFIG_EXPIRED: 12013,
  E_WIFI_INVALID_PASSWORD: 12014,
};

export class WechatWifiError extends Error {
  readonly errCode: WechatWifiErrorCode;
  readonly errno: WechatWifiErrorCode;
  readonly errMsg: string;
  readonly nativeCode: string;
  constructor(operation: string, code: WechatWifiErrorCode, nativeCode: string, detail?: string) {
    const errMsg = `${operation}:fail ${messages[code]}${detail ? ` (${detail})` : ''}`;
    super(errMsg);
    this.name = 'WechatWifiError';
    this.errCode = code;
    this.errno = code;
    this.errMsg = errMsg;
    this.nativeCode = nativeCode;
  }
}

export function wifiNativeErrorCode(error: unknown): string | undefined {
  if (error instanceof WechatWifiError) return error.nativeCode;
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;
    for (const property of ['nativeCode', 'code', 'message']) {
      const text = value[property];
      // Valdi's TypeScript doesn't narrow the indexed access itself.
      if (typeof text === 'string') {
        const match = text.match(/E_WIFI_[A-Z_]+/);
        if (match) return match[0];
      }
    }
  }
  return String(error).match(/E_WIFI_[A-Z_]+/)?.[0];
}

export function toWechatWifiError(
  operation: string,
  error: unknown,
  credentials: readonly string[] = [],
): WechatWifiError {
  if (error instanceof WechatWifiError && !credentials.some(value => value && error.errMsg.includes(value)))
    return error;
  const nativeCode = wifiNativeErrorCode(error) ?? 'E_WIFI_SYSTEM_INTERNAL';
  const code =
    error instanceof WechatWifiError
      ? error.errCode
      : (nativeCodes[nativeCode] ?? WECHAT_WIFI_ERROR_CODES.SYSTEM_INTERNAL);
  // Native failures contain operation reasons only; credentials are never used in errors.
  let message = error instanceof Error ? error.message : String(error);
  for (const credential of credentials) if (credential) message = message.replaceAll(credential, '[redacted]');
  return new WechatWifiError(operation, code, nativeCode, code === 12010 ? message : undefined);
}

export const wifiFailure = (nativeCode: string, reason: string): Error => new Error(`${nativeCode}:${reason}`);
