// Native code generation from a Valdi module's annotated TypeScript (@ExportModel, @ExportProxy, @ExportEnum,
// @ExportFunction, @ExportModule, @Component, @ViewModel, @Context), ported from the Valdi compiler (beta-0.2.1, MIT,
// see LICENSE). The stages are the compiler's processors, in its order, mirroring its Swift names so the two can be
// compared: symbols dumped from the module's program, annotations parsed and applied, models / view classes / context
// factories generated per language (Kotlin, Objective-C, C++), then combined into one file per language and kind.

// valdiTs imports the companion's JSXProcessor, whose source-map has no types of its own.
/// <reference path="../vendor/companion/source-map.d.ts" />
import path from 'node:path';
import type ts from 'typescript';
import { appModules, moduleConfig } from '../pipeline';
import { valdiTs, type ValdiModule } from '../valdiTs';
import { processAnnotations } from './ApplyTypeScriptAnnotationsProcessor';
import { combineNativeSources } from './CombineNativeSourcesProcessor';
import { dumpAllSymbols } from './DumpTypeScriptSymbols';
import {
  generateDependencyInjectionData,
  generateIOSDependencyMetadata,
} from './GenerateDependencyInjectionDataProcessor';
import { generateModels } from './GenerateModelsProcessor';
import { generateViewClasses } from './GenerateViewClassesProcessor';
import type { BundleInfo, NativeSourceAndPlatform, Platform } from './Models';

export interface CodegenModule {
  module: ValdiModule;
  bundleInfo: BundleInfo;
  /** The module's program; by default valdiTs's, from the module's tsconfig.json. */
  program?: () => ts.Program;
}

/**
 * What modules read from the project config, Valdi's bzl/valdi/valdi_config.yaml.tpl, which every valdi_module() build
 * uses: codegen enabled for the three platforms, Android classes in `com.snap.modules.<module>`, C++ types in
 * `snap::valdi_modules::<module>` declared in `valdi_modules/<module>/<module>.hpp`.
 */
export const VALDI_PROJECT_CONFIG = {
  androidCodegenEnabled: true,
  iosCodegenEnabled: true,
  cppCodegenEnabled: true,
  androidDefaultClassPath: 'com.snap.modules',
  cppDefaultClassPrefix: 'snap::valdi_modules::',
  cppImportPathPrefix: 'valdi_modules/',
} satisfies Partial<BundleInfo>;

/** The app modules (pipeline.ts appModules), each configured as valdi_module() configures a module by default. */
export function codegenModules(): Record<string, CodegenModule> {
  return Object.fromEntries(
    appModules().map(module => [
      module.name,
      {
        module,
        bundleInfo: {
          ...VALDI_PROJECT_CONFIG,
          name: module.name,
          asyncStrictMode: false,
          iosModuleName: moduleConfig(module.name).iosModuleName ?? module.name,
          iosLanguage: 'objc',
        },
      },
    ]),
  );
}

export interface NativeCode {
  /**
   * Combined: one file per language and kind, named as in Valdi's outputs (`app_pages.kt`, `app_pagesTypes.h`,
   * `app_pages.hpp`).
   */
  sources: NativeSourceAndPlatform[];
  /** ios/metadata/dependencyData.json, when the module has @Context models. */
  iosDependencyMetadata?: string;
}

export function generateNativeCode(target: CodegenModule, warn: (message: string) => void = console.warn): NativeCode {
  const { module, bundleInfo } = target;
  const program = target.program ? target.program() : valdiTs(module).program();
  const items = processAnnotations(dumpAllSymbols(module, program, warn), bundleInfo, warn);
  if (items.errors.length) {
    throw new Error(
      `Native code generation for ${module.name} failed:\n${items.errors.map(error => `  ${error.message}`).join('\n')}`,
    );
  }
  const sources = combineNativeSources(
    [
      ...generateModels(items, bundleInfo),
      ...generateViewClasses(items, bundleInfo, warn),
      ...generateDependencyInjectionData(items, bundleInfo),
    ],
    bundleInfo,
  );
  return { sources, iosDependencyMetadata: generateIOSDependencyMetadata(items) };
}

/**
 * A platform's files by path in its output: in the srcjar for Android (Valdi's android/<debug|release>/src), in
 * ios/<debug|release>/src for iOS (whose sources are relative to `<iosModuleName>/`: `app_pages/app_pages.h`,
 * `app_pagesTypes/app_pagesTypes.h`), in cpp/<debug|release>/src for C++ (`valdi_modules/app_pages/app_pages.hpp`).
 */
export function nativeSourceFiles(target: CodegenModule, code: NativeCode, platform: Platform): Map<string, string> {
  const base = platform === 'ios' ? target.bundleInfo.iosModuleName : '';
  const files = new Map<string, string>();
  for (const { platform: sourcePlatform, source } of code.sources) {
    if (sourcePlatform !== platform) continue;
    const filename = path.posix.join(base, source.relativePath ?? '', source.filename);
    files.set(filename, source.content);
  }
  return files;
}
