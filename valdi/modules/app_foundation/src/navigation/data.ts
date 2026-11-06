/** Routes require an outer dictionary. The object itself is passed through to the native marshaller. */
export function snapshotRouteData(value: unknown): {} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid route data: expected a parameter/result dictionary');
  }
  return value;
}
