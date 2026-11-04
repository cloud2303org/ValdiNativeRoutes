export const WECHAT_NFC_ERROR_CODES = {
  NOT_SUPPORTED: 13000,
  SYSTEM_SWITCH_OFF: 13001,
  UNKNOWN: 13010,
  INVALID_PARAMETER: 13011,
  PARSE_NDEF_FAILED: 13012,
  TAG_NOT_DISCOVERED: 13013,
  INVALID_TECH: 13014,
  UNAVAILABLE_TECH: 13015,
  CONNECT_FAILED: 13016,
  SYSTEM_ERROR: 13017,
  DISCOVERY_NOT_STARTED: 13018,
  NOT_AUTHORIZED: 13019,
  DISCOVERY_ALREADY_STARTED: 13021,
  TECH_ALREADY_CONNECTED: 13022,
  TECH_NOT_CONNECTED: 13023,
  FUNCTION_NOT_SUPPORTED: 13024,
} as const;

export type WechatNFCErrorCode = (typeof WECHAT_NFC_ERROR_CODES)[keyof typeof WECHAT_NFC_ERROR_CODES];

const messages: Record<WechatNFCErrorCode, string> = {
  13000: 'device does not support NFC',
  13001: 'system NFC switch is off',
  13010: 'unknown error',
  13011: 'invalid parameter',
  13012: 'parse NdefMessage failed',
  13013: 'NFC tag has not been discovered',
  13014: 'invalid tech',
  13015: 'unavailable tech',
  13016: 'connect fail',
  13017: 'system internal error',
  13018: 'NFC discovery has not started',
  13019: 'user is not authorized',
  13021: 'NFC discovery already started',
  13022: 'Tech already connected',
  13023: 'Tech has not connected',
  13024: 'function not support',
};

export class WechatNFCError extends Error {
  readonly errCode: WechatNFCErrorCode;
  readonly errno: WechatNFCErrorCode;
  readonly errMsg: string;
  readonly nativeCode: string;
  readonly detail: string;

  constructor(
    operation: string,
    errCode: WechatNFCErrorCode,
    detail = messages[errCode],
    nativeCode = `E_NFC_${errCode}`,
  ) {
    const errMsg = `${operation}:fail ${messages[errCode]}`;
    super(errMsg);
    this.name = 'WechatNFCError';
    this.errCode = errCode;
    this.errno = errCode;
    this.errMsg = errMsg;
    this.nativeCode = nativeCode;
    this.detail = detail;
  }
}

export const nfcError = (code: WechatNFCErrorCode, detail: string): Error => new Error(`E_NFC_${code}:${detail}`);

export const mapNFCError = (operation: string, original: unknown): WechatNFCError => {
  if (original instanceof WechatNFCError) return original;
  const detail = original instanceof Error ? original.message : String(original);
  const nativeCode = detail.match(/E_NFC_(?:\d{5}|SESSION_RELEASED)/)?.[0];
  const code =
    nativeCode === 'E_NFC_SESSION_RELEASED'
      ? WECHAT_NFC_ERROR_CODES.DISCOVERY_NOT_STARTED
      : Number(nativeCode?.slice('E_NFC_'.length));
  return new WechatNFCError(
    operation,
    code in messages ? (code as WechatNFCErrorCode) : WECHAT_NFC_ERROR_CODES.UNKNOWN,
    detail,
    nativeCode,
  );
};
