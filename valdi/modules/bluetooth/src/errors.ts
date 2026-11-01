export const WECHAT_BLE_ERROR_CODES = {
  ALREADY_CONNECTED: -1,
  NOT_INITIALIZED: 10000,
  NOT_AVAILABLE: 10001,
  DEVICE_NOT_FOUND: 10002,
  CONNECTION_FAILED: 10003,
  SERVICE_NOT_FOUND: 10004,
  CHARACTERISTIC_NOT_FOUND: 10005,
  NOT_CONNECTED: 10006,
  PROPERTY_NOT_SUPPORTED: 10007,
  SYSTEM_ERROR: 10008,
  SYSTEM_NOT_SUPPORTED: 10009,
  CONNECTION_TIMEOUT: 10012,
  INVALID_DATA: 10013,
} as const;

export type WechatBleErrorCode = (typeof WECHAT_BLE_ERROR_CODES)[keyof typeof WECHAT_BLE_ERROR_CODES];

export interface ClassifiedBleError {
  errCode: WechatBleErrorCode;
  message: string;
  nativeCode: string;
}

export class WechatBleError extends Error {
  readonly errCode: WechatBleErrorCode;
  readonly errno: WechatBleErrorCode;
  readonly errMsg: string;
  readonly nativeCode: string;

  constructor(operation: string, classified: ClassifiedBleError) {
    const errMsg = `${operation}:fail ${wechatBleErrorMessage(classified.errCode)}`;
    super(errMsg);
    this.name = 'WechatBleError';
    this.errCode = classified.errCode;
    this.errno = classified.errCode;
    this.errMsg = errMsg;
    this.nativeCode = classified.nativeCode;
  }
}

const WECHAT_BLE_ERROR_MESSAGES: Record<WechatBleErrorCode, string> = {
  [-1]: 'already connect',
  10000: 'not init',
  10001: 'not available',
  10002: 'no device',
  10003: 'connection fail',
  10004: 'no service',
  10005: 'no characteristic',
  10006: 'no connection',
  10007: 'property not support',
  10008: 'system error',
  10009: 'system not support',
  10012: 'operate time out',
  10013: 'invalid_data',
};

const NATIVE_CODE_PATTERN = /E_BLE_[A-Z_]+/;

const NATIVE_TO_WECHAT_ERROR: Record<string, WechatBleErrorCode> = {
  E_BLE_ALREADY_CONNECTED: WECHAT_BLE_ERROR_CODES.ALREADY_CONNECTED,
  E_BLE_NOT_INITIALIZED: WECHAT_BLE_ERROR_CODES.NOT_INITIALIZED,
  E_BLE_ADAPTER_NOT_AVAILABLE: WECHAT_BLE_ERROR_CODES.NOT_AVAILABLE,
  E_BLE_PERMISSION: WECHAT_BLE_ERROR_CODES.NOT_AVAILABLE,
  E_BLE_DEVICE_NOT_FOUND: WECHAT_BLE_ERROR_CODES.DEVICE_NOT_FOUND,
  E_BLE_CONNECTION_FAILED: WECHAT_BLE_ERROR_CODES.CONNECTION_FAILED,
  E_BLE_SERVICE_NOT_FOUND: WECHAT_BLE_ERROR_CODES.SERVICE_NOT_FOUND,
  E_BLE_CHARACTERISTIC_NOT_FOUND: WECHAT_BLE_ERROR_CODES.CHARACTERISTIC_NOT_FOUND,
  E_BLE_NOT_CONNECTED: WECHAT_BLE_ERROR_CODES.NOT_CONNECTED,
  E_BLE_PROPERTY_NOT_SUPPORTED: WECHAT_BLE_ERROR_CODES.PROPERTY_NOT_SUPPORTED,
  E_BLE_SYSTEM_NOT_SUPPORTED: WECHAT_BLE_ERROR_CODES.SYSTEM_NOT_SUPPORTED,
  E_BLE_CONNECTION_TIMEOUT: WECHAT_BLE_ERROR_CODES.CONNECTION_TIMEOUT,
  E_BLE_PAIR_TIMEOUT: WECHAT_BLE_ERROR_CODES.CONNECTION_TIMEOUT,
  E_BLE_INVALID_DATA: WECHAT_BLE_ERROR_CODES.INVALID_DATA,
  E_BLE_MTU_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_NOTIFY_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_NOT_PAIRED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_PAIR_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_READ_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_RSSI_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_WRITE_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
  E_BLE_OPERATE_FAILED: WECHAT_BLE_ERROR_CODES.SYSTEM_ERROR,
};

const stringProperty = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : undefined;
};

export const bleErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return stringProperty(error, 'message') ?? String(error);
};

const nativeErrorCode = (error: unknown, message: string): string | undefined => {
  const explicitCode = stringProperty(error, 'nativeCode') ?? stringProperty(error, 'code');
  return explicitCode?.match(NATIVE_CODE_PATTERN)?.[0] ?? message.match(NATIVE_CODE_PATTERN)?.[0];
};

export const classifyBleError = (error: unknown): ClassifiedBleError | undefined => {
  const message = bleErrorMessage(error);
  const nativeCode = nativeErrorCode(error, message);
  if (!nativeCode) return undefined;
  const mappedCode = NATIVE_TO_WECHAT_ERROR[nativeCode];
  if (mappedCode === undefined) return undefined;
  return {
    errCode: mappedCode,
    message,
    nativeCode,
  };
};

export const throwWechatBleError = (operation: string, error: unknown): never => {
  if (error instanceof WechatBleError) throw error;
  const classified = classifyBleError(error);
  if (!classified) throw error;
  throw new WechatBleError(operation, classified);
};

export const wechatBleErrorMessage = (code: WechatBleErrorCode): string => WECHAT_BLE_ERROR_MESSAGES[code];

export const invalidBleData = (message: string): Error => new Error(`E_BLE_INVALID_DATA:${message}`);
