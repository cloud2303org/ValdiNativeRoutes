/**
 * Routes require a plain dictionary of strings, booleans, null, finite numbers, dense lists and plain dictionaries.
 * Undefined dictionary fields remain permitted for optional params; undefined list entries are not route values.
 * Validate before native dispatch without copying: the marshaller still receives the original object.
 */
export function snapshotRouteData(value: unknown): {} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid route data: expected a parameter/result dictionary');
  }
  const ancestors = new Set<object>();

  function invalid(reason: string): never {
    throw new Error(`Invalid route data: ${reason}`);
  }

  function property(container: object, key: string, optional: boolean): void {
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (!descriptor || !('value' in descriptor)) {
      invalid('expected data properties, without accessors or list holes');
    }
    if (optional && descriptor.value === undefined) return;
    validate(descriptor.value);
  }

  function validate(item: unknown): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) invalid('numbers must be finite');
      return;
    }
    if (typeof item !== 'object') invalid('expected dictionaries, lists and JSON scalar values');
    const list = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (!list && prototype !== Object.prototype && prototype !== null) {
      invalid('expected a plain dictionary');
    }
    if (Object.getOwnPropertySymbols(item).length) invalid('dictionary keys must be strings');
    if (ancestors.has(item)) invalid('cycles are not supported');
    ancestors.add(item);
    try {
      if (list) {
        for (let index = 0; index < item.length; index++) {
          property(item, String(index), false);
        }
        // Named enumerable properties would be silently dropped by the list marshaller.
        if (Object.keys(item).some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) {
          invalid('lists must contain only indexed values');
        }
      } else {
        for (const key of Object.keys(item)) property(item, key, true);
      }
    } finally {
      ancestors.delete(item);
    }
  }

  validate(value);
  return value;
}
