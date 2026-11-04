import * as v from 'valibot';
import type { WifiCredentialModel } from './WifiHost';

/**
 * The arguments of wechat.ts' public methods, checked here once, with their defaults filled in. Nothing after this
 * checks them again, and the core's replies and events aren't checked at all. A message is the `E_WIFI_…:reason` that
 * wifiFailure makes, so errors.ts turns a failure into the same errCode and errMsg as a native one.
 */

const failure = (nativeCode: string, reason: string) => `${nativeCode}:${reason}`;
/** A field the rules don't look at: passed on as given. */
const unchecked = <T>() => v.custom<T>(() => true);

const ssidMessage = failure('E_WIFI_INVALID_SSID', 'SSID must be a nonempty string');
const bssidMessage = failure('E_WIFI_SYSTEM_CONFIG', 'Invalid BSSID');
export const connectWifiOptions = v.pipe(
  v.object(
    {
      SSID: v.pipe(
        v.string(ssidMessage),
        v.nonEmpty(ssidMessage),
        v.check(SSID => !SSID.includes('\0'), ssidMessage),
      ),
      password: v.optional(v.string(failure('E_WIFI_INVALID_PASSWORD', 'Invalid password')), ''),
      BSSID: v.optional(v.pipe(v.string(bssidMessage), v.regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i, bssidMessage))),
      maunal: v.nullish(unchecked<boolean>(), false),
      partialInfo: v.nullish(unchecked<boolean>(), false),
    },
    ssidMessage,
  ),
  // Not a default: valibot would check that against the BSSID rule, which '' fails.
  v.transform(params => ({ ...params, BSSID: params.BSSID ?? '' })),
);

export const getConnectedWifiOptions = v.nullish(
  v.object(
    { partialInfo: v.nullish(unchecked<boolean>(), false) },
    failure('E_WIFI_SYSTEM_CONFIG', 'options must be an object'),
  ),
  {},
);

const wifiListMessage = failure('E_WIFI_SYSTEM_CONFIG', 'wifiList must be an array');
export const setWifiListOptions = v.object(
  { wifiList: v.array(unchecked<WifiCredentialModel>(), wifiListMessage) },
  wifiListMessage,
);

const operationMessage = failure('E_WIFI_SYSTEM_INTERNAL', 'Permission operation must be connect, scan or info');
export const wifiPermissionOptions = v.object(
  {
    operation: v.picklist(['connect', 'scan', 'info'], operationMessage),
    partialInfo: v.nullish(unchecked<boolean>(), false),
  },
  operationMessage,
);

/** Not a Wi-Fi failure: a listener that isn't a function is a TypeError. */
export const callback = v.function('callback must be a function');

/** Runs `schema` on a public method's argument; a failure throws its first issue's message as `Failure`. */
export function parseOptions<TSchema extends v.GenericSchema>(
  schema: TSchema,
  input: unknown,
  Failure: new (message: string) => Error = Error,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) throw new Failure(result.issues[0].message);
  return result.output;
}
