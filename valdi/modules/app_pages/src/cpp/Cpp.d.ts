/**
 * Implemented in C++ (valdi/native/src/Cpp.cpp), which the export scripts link into the Valdi runtime; the C++
 * interface it implements is valdi/native/generated (tools/valdi-rolldown/codegen.ts --cpp-out). Calls are direct:
 * synchronous, on the JS thread.
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
