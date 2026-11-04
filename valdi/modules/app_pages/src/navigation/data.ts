import type { JsonObject } from './config';
import { snapshotStructuredValue } from 'native_common/src/structuredData';

/** Routes require an outer dictionary; nested values use the same strict snapshot as other native bridges. */
export function snapshotRouteData(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid route data: expected a parameter/result dictionary');
  }
  return snapshotStructuredValue(value, 'route data') as JsonObject;
}
