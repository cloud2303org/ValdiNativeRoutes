/** Framework module IDs reserved for the shared runtime, never local application modules. */
export const RUNTIME_MODULE_IDS: readonly string[] = Object.freeze([
  'coreutils', 'drawing', 'jasmine', 'native_web', 'source_map', 'valdi_core', 'valdi_tsx',
]);
