// Processors/CombineNativeSourcesProcessor.swift: single file codegen (every module has it, valdi_module() no longer
// allows anything else), the module's sources combined into one file per grouping identifier: `app_pages.kt`, for ObjC
// `app_pages.h`/`.m` and `../app_pagesTypes/app_pagesTypes.h`/`.m`, and for C++ `valdi_modules/app_pages/app_pages.hpp`
// and `.cpp`. Bazel declares those outputs whatever the module exports, so the files it has nothing for are made too.
import { CodeWriter } from './CodeWriter';
import {
  API_ONLY_MODULE_NAME_SUFFIX,
  makeIOSType,
  type BundleInfo,
  type NativeSource,
  type NativeSourceAndPlatform,
  type Platform,
} from './Models';
import { iosNativeSourcesFromGeneratedCode } from './objc/ObjCCodeGenerator';
import { CompilerError, componentsSeparatedByNewlines, deletingPathExtension, trimmingCharacters } from './Utils';

/**
 * Sources after the local sources they depend on (topologically), then by grouping priority and file name. Cycles go
 * last in that order.
 */
function resolveNativeSourcesOrdering(nativeSources: NativeSource[]): NativeSource[] {
  const sourceIndexByFilename = new Map<string, number>();
  nativeSources.forEach((source, index) => sourceIndexByFilename.set(source.filename, index));

  const inDegree = nativeSources.map(
    source => source.localFilenameDependencies.filter(dependency => sourceIndexByFilename.has(dependency)).length,
  );
  const dependentIndices = new Map<string, number[]>();
  nativeSources.forEach((source, index) => {
    for (const dependency of source.localFilenameDependencies)
      dependentIndices.set(dependency, [...(dependentIndices.get(dependency) ?? []), index]);
  });

  const isOrderedBefore = (leftIndex: number, rightIndex: number) => {
    const left = nativeSources[leftIndex];
    const right = nativeSources[rightIndex];
    if (left.groupingPriority !== right.groupingPriority) return left.groupingPriority < right.groupingPriority;
    return left.filename < right.filename;
  };
  const compare = (a: number, b: number) => (isOrderedBefore(a, b) ? -1 : isOrderedBefore(b, a) ? 1 : 0);

  const available = nativeSources
    .map((_, index) => index)
    .filter(index => inDegree[index] === 0)
    .sort(compare);
  const result: NativeSource[] = [];
  while (available.length) {
    const selectedIndex = available.shift()!;
    inDegree[selectedIndex] = -1;
    result.push(nativeSources[selectedIndex]);
    for (const dependentIndex of dependentIndices.get(nativeSources[selectedIndex].filename) ?? []) {
      if (inDegree[dependentIndex] <= 0) continue;
      inDegree[dependentIndex] -= 1;
      if (inDegree[dependentIndex] === 0) {
        let low = 0;
        let high = available.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (isOrderedBefore(available[mid], dependentIndex)) low = mid + 1;
          else high = mid;
        }
        available.splice(low, 0, dependentIndex);
      }
    }
  }
  if (result.length < nativeSources.length) {
    const remaining = nativeSources
      .map((_, index) => index)
      .filter(index => inDegree[index] >= 0)
      .sort(compare);
    result.push(...remaining.map(index => nativeSources[index]));
  }
  return result;
}

/**
 * The Kotlin files as one: their package and import lines, deduplicated, at the top (in the order first seen), then
 * each file's body after a `// <file name>` banner.
 */
function mergeKotlinSources(files: NativeSource[]): string {
  const writer = new CodeWriter();
  const headerStatements = new Set<string>();
  writer.appendBody('\n');
  for (const file of files) {
    let inBody = false;
    for (const line of componentsSeparatedByNewlines(file.content)) {
      if (!inBody) {
        if (line.startsWith('package ') || line.startsWith('import ') || !line) {
          if (!headerStatements.has(line)) {
            headerStatements.add(line);
            writer.appendHeader(line);
            writer.appendHeader('\n');
          }
        } else {
          inBody = true;
          writer.appendBody(`//\n// ${file.filename}\n//\n\n`);
        }
      }
      if (inBody) {
        writer.appendBody(line);
        writer.appendBody('\n');
      }
    }
  }
  return writer.content;
}

/** The headers one after the other, each after a `// <file name>` banner, under the one `#pragma once`. */
function mergeCppHeaders(files: NativeSource[]): string {
  const pragmaOnce = '#pragma once';
  let data = `${pragmaOnce}\n`;
  for (const file of files) {
    data += fileBanner(file.filename);
    for (const line of file.content.split('\n')) {
      if (line === pragmaOnce) continue;
      data += `${line}\n`;
    }
    data += '\n';
  }
  return data;
}

/** CharacterSet.whitespaces: Zs and tab, no newlines. */
const WHITESPACES = '\\t \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000';

const fileBanner = (filename: string) => `//\n// ${filename}\n//\n\n`;

/**
 * Each ObjC header imports the module's own combined headers by their canonical names (IOSType.importHeaderStatement):
 * merged into that very file, the import refers to itself, which breaks clang module builds for Swift interop. The
 * lines importing the output file, in any of the three spellings, are dropped.
 */
function filterSelfImports(content: string, outputFilename: string): string {
  const stem = deletingPathExtension(outputFilename);
  const selfImports = new Set([
    `#import <${outputFilename}>`,
    `#import "${outputFilename}"`,
    `#import <${stem}/${outputFilename}>`,
  ]);
  return content
    .split('\n')
    .filter(line => !selfImports.has(trimmingCharacters(line, WHITESPACES)))
    .join('\n');
}

/** The files one after the other, each after a `// <file name>` banner (and without imports of the output). */
function mergeAnySources(files: NativeSource[], outputFilename: string): string {
  return files.map(file => `${fileBanner(file.filename)}${filterSelfImports(file.content, outputFilename)}\n`).join('');
}

/** If the line opens a trampoline function definition (`static id SCValdiBlockCreateOOD_v(…`), its name. */
function trampolineFunctionName(line: string): string | undefined {
  for (const prefix of ['static SCValdiFieldValue ', 'static id ']) {
    if (!line.startsWith(prefix)) continue;
    const afterPrefix = line.slice(prefix.length);
    for (const marker of ['SCValdiFunctionInvoke', 'SCValdiBlockCreate']) {
      if (!afterPrefix.startsWith(marker)) continue;
      // Character.isLetter, isNumber, or '_'.
      const identifier = /^[\p{L}\p{N}_]*/u.exec(afterPrefix)![0];
      if (identifier) return identifier;
    }
  }
  return undefined;
}

/** The content without the trampoline functions already emitted (by name), the brace-balanced lines of each. */
function deduplicateTrampolines(content: string, emitted: Set<string>): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    const name = trampolineFunctionName(line);
    if (name === undefined) {
      result.push(line);
      lineIndex += 1;
      continue;
    }
    const blockLines: string[] = [];
    let depth = 0;
    let j = lineIndex;
    while (j < lines.length) {
      const current = lines[j];
      blockLines.push(current);
      for (const ch of current) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      j += 1;
      if (depth === 0) break;
    }
    if (!emitted.has(name)) {
      emitted.add(name);
      result.push(...blockLines);
    }
    lineIndex = j;
  }
  return result.join('\n');
}

/**
 * The .m files one after the other, each after a `// <file name>` banner, with the static trampoline functions each
 * type emits (`SCValdiFunctionInvoke*`, `SCValdiBlockCreate*`) only once: the first definition of each is kept.
 */
function mergeObjcSources(files: NativeSource[]): string {
  const emittedTrampolineNames = new Set<string>();
  return files
    .map(file => `${fileBanner(file.filename)}${deduplicateTrampolines(file.content, emittedTrampolineNames)}\n`)
    .join('');
}

/** A file as the processor outputs it: its own group. */
const outputSource = (filename: string, content: string, relativePath?: string): NativeSource => ({
  relativePath,
  filename,
  content,
  groupingIdentifier: filename,
  groupingPriority: 0,
  localFilenameDependencies: [],
});

function doCombineNativeSources(filename: string, nativeSources: NativeSource[]): NativeSource {
  const sorted = resolveNativeSourcesOrdering(nativeSources);
  let relativePath: string | undefined;
  for (const source of sorted) {
    if (source.relativePath === relativePath) continue;
    if (relativePath !== undefined) {
      throw new CompilerError(
        `Modules with single_file_codegen enabled must have generated files output to the same directory or package. Found '${relativePath}' vs '${source.relativePath}' from '${source.filename}'`,
      );
    }
    relativePath = source.relativePath;
  }
  // The combined Kotlin is at the root of the srcjar, whatever its package.
  if (sorted.some(source => source.filename.endsWith('.kt'))) return outputSource(filename, mergeKotlinSources(sorted));
  if (sorted.some(source => source.filename.endsWith('.hpp'))) {
    return outputSource(filename, mergeCppHeaders(sorted), relativePath);
  }
  if (filename.endsWith('.m')) return outputSource(filename, mergeObjcSources(sorted), relativePath);
  return outputSource(filename, mergeAnySources(sorted, filename), relativePath);
}

/**
 * For ObjC, Bazel declares the Types files alongside the main ones: when the module only emits main ones (views), they
 * are placeholders.
 */
function emitMissingSingleFileCodegenIosNativeOutputs(
  bundleInfo: BundleInfo,
  sources: NativeSourceAndPlatform[],
  combinedOutput: NativeSourceAndPlatform[],
): NativeSourceAndPlatform[] {
  if (!bundleInfo.iosCodegenEnabled || bundleInfo.iosLanguage === 'swift') return [];
  const moduleName = bundleInfo.iosModuleName;
  const typesHeaderFilename = `${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}.h`;
  const typesImplFilename = `${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}.m`;
  const hasOutput = (filename: string) =>
    combinedOutput.some(({ platform, source }) => platform === 'ios' && source.filename === filename);
  const hasTypesHeader = hasOutput(typesHeaderFilename);
  const hasTypesImpl = hasOutput(typesImplFilename);
  if (hasTypesHeader && hasTypesImpl) return [];
  const hadObjcInputs = sources.some(({ platform, source }) => platform === 'ios' && source.filename.endsWith('.m'));
  if (!hasOutput(`${moduleName}.m`) && !hadObjcInputs) return [];

  const relativePath = `../${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}`;
  const guardMacro = `${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}_h`;
  const extras: NativeSourceAndPlatform[] = [];
  if (!hasTypesHeader) {
    const headerBody =
      '// Placeholder: single_file_codegen module emitted no Types (API) sources; satisfies declared outputs.\n' +
      `#ifndef ${guardMacro}\n#define ${guardMacro}\n#endif`;
    extras.push({ platform: 'ios', source: outputSource(typesHeaderFilename, headerBody, relativePath) });
  }
  if (!hasTypesImpl) {
    extras.push({
      platform: 'ios',
      source: outputSource(typesImplFilename, `#import "${typesHeaderFilename}"`, relativePath),
    });
  }
  return extras;
}

/**
 * generateEmptySourcesIfNeeded, for the module the compiler is told to generate native code for: an empty Kotlin file
 * when there's no Kotlin, an ObjC type's four files with no type in them when there's no ObjC, and empty C++ files when
 * there's no C++. (The empty Swift files of swift and both modules aren't made: Swift isn't generated here.)
 */
function generateEmptySourcesIfNeeded(
  bundleInfo: BundleInfo,
  sources: NativeSourceAndPlatform[],
): NativeSourceAndPlatform[] {
  const output: NativeSourceAndPlatform[] = [];
  const has = (extension: string) => sources.some(({ source }) => source.filename.endsWith(extension));
  if (bundleInfo.androidCodegenEnabled && !has('.kt')) {
    output.push({ platform: 'android', source: outputSource(`${bundleInfo.name}.kt`, '') });
  }
  if (bundleInfo.iosCodegenEnabled && bundleInfo.iosLanguage === 'objc' && !has('.m')) {
    const iosType = makeIOSType('Empty', undefined, bundleInfo, 'class', 'objc');
    const empty = () => new CodeWriter();
    const generatedCode = { apiHeader: empty(), apiImpl: empty(), header: empty(), impl: empty() };
    for (const source of iosNativeSourcesFromGeneratedCode(generatedCode, iosType, bundleInfo)) {
      output.push({
        platform: 'ios',
        source: outputSource(source.groupingIdentifier, source.content, source.relativePath),
      });
    }
  }
  if (bundleInfo.cppCodegenEnabled && !has('.cpp')) {
    const relativePath = `${bundleInfo.cppImportPathPrefix ?? ''}${bundleInfo.name}`;
    output.push({ platform: 'cpp', source: outputSource(`${bundleInfo.name}.cpp`, '', relativePath) });
    output.push({ platform: 'cpp', source: outputSource(`${bundleInfo.name}.hpp`, '', relativePath) });
  }
  return output;
}

/** The module's sources combined by platform and grouping identifier, with the files Bazel expects and has none of. */
export function combineNativeSources(
  sources: NativeSourceAndPlatform[],
  bundleInfo: BundleInfo,
): NativeSourceAndPlatform[] {
  const groups = new Map<string, { platform: Platform; groupingIdentifier: string; sources: NativeSource[] }>();
  for (const { source, platform } of sources) {
    const key = `${platform}\0${source.groupingIdentifier}`;
    const group = groups.get(key) ?? { platform, groupingIdentifier: source.groupingIdentifier, sources: [] };
    group.sources.push(source);
    groups.set(key, group);
  }
  const output = [...groups.values()].map(group => ({
    source: doCombineNativeSources(group.groupingIdentifier, group.sources),
    platform: group.platform,
  }));
  output.push(...emitMissingSingleFileCodegenIosNativeOutputs(bundleInfo, sources, output));
  output.push(...generateEmptySourcesIfNeeded(bundleInfo, sources));
  return output;
}
