export type StructuredValue = string | number | boolean | null | StructuredValue[] | StructuredObject;
export type StructuredObject = { [key: string]: StructuredValue | undefined };

/** Snapshot only plain values supported by the native dictionary/list marshaller. No JSON conversion or coercion. */
export function snapshotStructuredValue(value: unknown, label = 'structured data'): StructuredValue {
  const ancestors = new Set<object>();
  const copy = (input: unknown, location: string): StructuredValue => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null) {
      throw new Error(`Invalid ${label} at ${location}: expected structured data`);
    }
    if (ancestors.has(input)) throw new Error(`Invalid ${label} at ${location}: cyclic value`);
    const array = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Invalid ${label} at ${location}: expected a plain object`);
    }
    if (Object.getOwnPropertySymbols(input).length) {
      throw new Error(`Invalid ${label} at ${location}: symbol keys are not supported`);
    }
    ancestors.add(input);
    try {
      if (array) {
        const result: StructuredValue[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (!descriptor || !('value' in descriptor)) {
            throw new Error(`Invalid ${label} at ${location}[${index}]: expected a data element`);
          }
          result.push(copy(descriptor.value, `${location}[${index}]`));
        }
        return result;
      }
      const result: StructuredObject = {};
      for (const key of Object.keys(input)) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        if (!('value' in descriptor)) {
          throw new Error(`Invalid ${label} at ${location}.${key}: accessors are not supported`);
        }
        if (descriptor.value === undefined) continue;
        Object.defineProperty(result, key, {
          value: copy(descriptor.value, `${location}.${key}`),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    } finally {
      ancestors.delete(input);
    }
  };
  return copy(value, '$');
}
