import * as v from 'valibot';
import { nfcError, WECHAT_NFC_ERROR_CODES } from './errors';

// The arguments of adapter.ts' public methods, checked here once; outgoing bytes are copied. Nothing after this checks
// them again, and tags and replies from native aren't checked at all. A failure is INVALID_PARAMETER.

/** An object, not an array, whose fields are all read: a missing one fails with its own message, not the object's. */
const fields = <TEntries extends v.ObjectEntries>(entries: TEntries, message: string) =>
  v.pipe(
    v.custom<Record<string, unknown>>(
      value => typeof value === 'object' && value !== null && !Array.isArray(value),
      message,
    ),
    v.transform(value => Object.fromEntries(Object.keys(entries).map(key => [key, value[key]]))),
    v.object(entries),
  );
const bytes = (field: string) =>
  v.pipe(
    v.instance(ArrayBuffer, `${field} must be an ArrayBuffer`),
    v.transform(value => value.slice(0)),
  );
const strings = (field: string) =>
  v.optional(v.array(v.string(`${field} must be a string array`), `${field} must be a string array`), []);

export const transceiveOptions = fields(
  {
    data: v.pipe(
      bytes('data'),
      v.check(data => data.byteLength > 0, 'data cannot be empty'),
    ),
  },
  'options must be an object',
);

const timeoutMessage = 'timeout must be a positive integer in milliseconds';
export const setTimeoutOptions = fields(
  {
    timeout: v.pipe(
      v.number(timeoutMessage),
      v.safeInteger(timeoutMessage),
      v.minValue(1, timeoutMessage),
      v.maxValue(2_147_483_647, timeoutMessage),
    ),
  },
  'options must be an object',
);

const tnfMessage = 'tnf must be an integer from 0 to 7';
const record = fields(
  {
    tnf: v.nullish(
      v.pipe(v.number(tnfMessage), v.safeInteger(tnfMessage), v.minValue(0, tnfMessage), v.maxValue(7, tnfMessage)),
      1,
    ),
    id: bytes('record.id'),
    type: bytes('record.type'),
    payload: bytes('record.payload'),
  },
  'record must be an object',
);
export const writeNdefMessageOptions = v.pipe(
  fields(
    {
      records: v.optional(v.array(record, 'records must be an array'), []),
      uris: strings('uris'),
      texts: strings('texts'),
    },
    'options must be an object',
  ),
  v.check(
    ({ records, uris, texts }) => records.length > 0 || uris.length > 0 || texts.length > 0,
    'NDEF message cannot be empty',
  ),
);

export const listener = v.function('listener must be a function');

/** Runs `schema` on a public method's argument; a failure throws INVALID_PARAMETER with the first issue's message. */
export function parseOptions<TSchema extends v.GenericSchema>(schema: TSchema, input: unknown): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) throw nfcError(WECHAT_NFC_ERROR_CODES.INVALID_PARAMETER, result.issues[0].message);
  return result.output;
}
