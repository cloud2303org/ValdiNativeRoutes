/**
 * App-owned C++ example implemented in valdi/modules/app_pages/cpp/src/Cpp.cpp, linked into the shared Valdi
 * runtime by //modules/app_pages/cpp:native. Its interface is generated in valdi/modules/app_pages/cpp/generated
 * by tools/valdi-rolldown/codegen.ts --cpp-modules-out ../../valdi/modules. Calls are direct and synchronous on the
 * JS thread.
 *
 * @ExportModule({ios: 'VRCpp', android: 'io.valdiroutes.pages.CppModule'})
 */

/** @ExportModel({ios: 'VRCppStats', android: 'io.valdiroutes.pages.CppStats'}) */
export interface CppStats {
  count: number;
  mean: number;
  min: number;
  max: number;
}

/** The compiler and C++ standard library the runtime was built with. */
export const BUILD_INFO: string;

/** SHA-256 of the text's UTF-8 bytes, as lowercase hex. */
export function sha256(text: string): string;

/** Count, mean, minimum and maximum of `values`; all zero when it's empty. */
export function stats(values: number[]): CppStats;
