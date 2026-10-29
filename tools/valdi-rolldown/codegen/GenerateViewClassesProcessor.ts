// Processors/GenerateViewClassesProcessor.swift and Template/ViewClassGenerator.swift: the view class of each document
// whose root node has a native class, which a .ts/.tsx @Component gets from its @ExportModel.
import type { CompilationResult, DocumentsIndexer } from './CompilationItems';
import { KotlinViewClassGenerator, type LanguageSpecificViewClassGenerator } from './kotlin/KotlinViewClassGenerator';
import type { BundleInfo, NativeSourceAndPlatform } from './Models';
import { ObjCViewClassGenerator } from './objc/ObjCViewClassGenerator';
import type { CompilationItem } from './TypeScriptAnnotation';
import { CompilerError, componentPathString } from './Utils';

function generateViewClass(
  item: CompilationItem,
  result: CompilationResult,
  bundleInfo: BundleInfo,
): NativeSourceAndPlatform[] {
  const rawDocument = result.originalDocument;
  // Documents made from TypeScript have no template: their root node type is ''.
  const classMapping = rawDocument.classMapping?.get('');
  if (!classMapping) return [];
  const sourceFilename = {
    filename: item.relativeProjectPath,
    symbolName: result.componentPath.exportedMember,
    src: { compilationPath: item.relativeProjectPath, sourceURL: item.sourceURL },
  };

  const generators: LanguageSpecificViewClassGenerator[] = [];
  if (classMapping.iosType) {
    if (bundleInfo.iosLanguage !== 'objc') {
      throw new CompilerError(`ios.language ${bundleInfo.iosLanguage}: only objc is supported`);
    }
    generators.push(
      new ObjCViewClassGenerator(
        bundleInfo,
        classMapping.iosType,
        componentPathString(result.componentPath),
        sourceFilename,
        rawDocument.viewModel?.iosType,
        rawDocument.componentContext?.iosType,
      ),
    );
  }
  if (classMapping.androidClassName !== undefined) {
    generators.push(
      new KotlinViewClassGenerator(
        bundleInfo,
        classMapping.androidClassName,
        componentPathString(result.componentPath),
        sourceFilename,
        rawDocument.viewModel?.androidClassName,
        rawDocument.componentContext?.androidClassName,
      ),
    );
  }

  // No accessors: those are for a template's nodes with ids.
  const nativeActions = result.actions.filter(action => action.type === 'native').map(action => action.name);
  const emitActions = result.actions.filter(action => action.type === 'javaScript').map(action => action.name);
  const nativeSources: NativeSourceAndPlatform[] = [];
  for (const generator of generators) {
    generator.start();
    generator.appendConstructor();
    generator.appendNativeActions(nativeActions);
    generator.appendEmitActions(emitActions);
    generator.finish();
    nativeSources.push(...generator.write().map(source => ({ source, platform: generator.platform })));
  }
  return nativeSources;
}

export function generateViewClasses(
  items: DocumentsIndexer,
  bundleInfo: BundleInfo,
  warn: (message: string) => void,
): NativeSourceAndPlatform[] {
  return items.items.flatMap(item => {
    if (item.kind !== 'document') return [];
    try {
      return generateViewClass(item.item, item.result, bundleInfo);
    } catch (error) {
      // The compiler only logs these.
      warn(`Failed to generate View class for ${item.item.sourceURL}: ${(error as Error).message}`);
      return [];
    }
  });
}
