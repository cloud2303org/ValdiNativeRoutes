// Processors/GenerateModelsProcessor.swift, with the generators it dispatches to (ViewModels/ValdiModelGenerator.swift,
// ViewModels/ExportedEnumGenerator.swift, Generation/ExportedFunctionGenerator.swift,
// Generation/ExportedModuleGenerator.swift): each exported model, enum, function and module in every language it has
// a native name in, and each document's view model once.
import type { DocumentsIndexer } from './CompilationItems';
import { CppEnumGenerator } from './cpp/CppEnumGenerator';
import { CppFunctionGenerator } from './cpp/CppFunctionGenerator';
import { CppModelGenerator } from './cpp/CppModelGenerator';
import { CppModuleGenerator } from './cpp/CppModuleGenerator';
import { KotlinEnumGenerator } from './kotlin/KotlinEnumGenerator';
import { KotlinFunctionGenerator } from './kotlin/KotlinFunctionGenerator';
import { KotlinModelGenerator } from './kotlin/KotlinModelGenerator';
import { KotlinModuleGenerator } from './kotlin/KotlinModuleGenerator';
import {
  generateNativeSources,
  type BundleInfo,
  type CppType,
  type ExportedEnum,
  type ExportedFunction,
  type ExportedModule,
  type ExportedType,
  type IOSType,
  type NativeSource,
  type NativeSourceAndPlatform,
  type NativeSourceGenerator,
  type NativeSourceParameters,
  type ValdiModel,
} from './Models';
import { ObjCEnumGenerator } from './objc/ObjCEnumGenerator';
import { ObjCFunctionGenerator } from './objc/ObjCFunctionGenerator';
import { ObjCModelGenerator } from './objc/ObjCModelGenerator';
import { ObjCModuleGenerator } from './objc/ObjCModuleGenerator';
import type { CompilationItem } from './TypeScriptAnnotation';
import { deletingPathExtension, type ComponentPath, type GeneratedSourceFilename } from './Utils';

class ValdiModelGenerator implements NativeSourceGenerator {
  constructor(private readonly model: ValdiModel) {}

  generateCppSources(parameters: NativeSourceParameters, type: CppType): NativeSource[] {
    const { model } = this;
    return new CppModelGenerator(
      type,
      parameters.bundleInfo,
      model.typeParameters,
      model.properties,
      parameters.sourceFileName,
      model.exportAsInterface,
      model.comments,
    ).write();
  }

  generateObjCSources(parameters: NativeSourceParameters, type: IOSType): NativeSource[] {
    const { model } = this;
    return new ObjCModelGenerator(
      type,
      parameters.bundleInfo,
      model.typeParameters,
      model.properties,
      parameters.sourceFileName,
      model.exportAsInterface,
      model.legacyConstructors,
      model.comments,
    ).write();
  }

  generateKotlinSources(parameters: NativeSourceParameters, fullTypeName: string): NativeSource[] {
    const { model } = this;
    return new KotlinModelGenerator(
      parameters.bundleInfo,
      fullTypeName,
      model.typeParameters,
      model.properties,
      parameters.sourceFileName,
      model.exportAsInterface,
      model.legacyConstructors,
      model.comments,
      model.usePublicFields,
    ).write();
  }
}

class ExportedFunctionGenerator implements NativeSourceGenerator {
  constructor(
    private readonly exportedFunction: ExportedFunction,
    private readonly modulePath: string,
  ) {}

  generateCppSources(parameters: NativeSourceParameters, type: CppType): NativeSource[] {
    return new CppFunctionGenerator(
      type,
      this.exportedFunction,
      parameters.sourceFileName,
      this.modulePath,
      parameters.bundleInfo,
    ).write();
  }

  generateObjCSources(parameters: NativeSourceParameters, type: IOSType): NativeSource[] {
    return new ObjCFunctionGenerator(
      type,
      this.exportedFunction,
      parameters.sourceFileName,
      parameters.bundleInfo.name,
      this.modulePath,
      parameters.bundleInfo,
    ).write();
  }

  generateKotlinSources(parameters: NativeSourceParameters, fullTypeName: string): NativeSource[] {
    return new KotlinFunctionGenerator(
      parameters.bundleInfo,
      fullTypeName,
      this.exportedFunction,
      parameters.sourceFileName,
      this.modulePath,
    ).write();
  }
}

class ExportedEnumGenerator implements NativeSourceGenerator {
  constructor(private readonly exportedEnum: ExportedEnum) {}

  generateObjCSources(parameters: NativeSourceParameters, type: IOSType): NativeSource[] {
    return new ObjCEnumGenerator(type, this.exportedEnum, parameters.sourceFileName, parameters.bundleInfo).write();
  }

  generateKotlinSources(parameters: NativeSourceParameters, fullTypeName: string): NativeSource[] {
    return new KotlinEnumGenerator(
      parameters.bundleInfo,
      fullTypeName,
      this.exportedEnum,
      parameters.sourceFileName,
    ).write();
  }

  generateCppSources(parameters: NativeSourceParameters, type: CppType): NativeSource[] {
    return new CppEnumGenerator(this.exportedEnum, type, parameters.bundleInfo, parameters.sourceFileName).write();
  }
}

class ExportedModuleGenerator implements NativeSourceGenerator {
  constructor(private readonly exportedModule: ExportedModule) {}

  generateObjCSources(parameters: NativeSourceParameters, type: IOSType): NativeSource[] {
    return new ObjCModuleGenerator(type, this.exportedModule, parameters.bundleInfo, parameters.sourceFileName).write();
  }

  generateKotlinSources(parameters: NativeSourceParameters, fullTypeName: string): NativeSource[] {
    return new KotlinModuleGenerator(
      parameters.bundleInfo,
      fullTypeName,
      this.exportedModule,
      parameters.sourceFileName,
    ).write();
  }

  generateCppSources(parameters: NativeSourceParameters, type: CppType): NativeSource[] {
    return new CppModuleGenerator(parameters.bundleInfo, type, this.exportedModule, parameters.sourceFileName).write();
  }
}

/** The native identity a shared view model is emitted once for (not its TypeScript name, which may repeat). */
const viewModelIdentity = (model: ValdiModel) =>
  [model.iosType?.name ?? '', model.androidClassName ?? '', model.cppType?.declaration.name ?? ''].join('|');

const isBefore = (a: ComponentPath, b: ComponentPath) =>
  a.fileName < b.fileName || (a.fileName === b.fileName && a.exportedMember < b.exportedMember);

/**
 * A view model bound by several components is in each one's document; it's attributed to the same one whatever the
 * order: the smallest (fileName, exportedMember).
 */
function attributionRepresentatives(identityAndPaths: [string, ComponentPath][]): Map<string, ComponentPath> {
  const chosen = new Map<string, ComponentPath>();
  for (const [identity, componentPath] of identityAndPaths) {
    const existing = chosen.get(identity);
    if (!existing || isBefore(componentPath, existing)) chosen.set(identity, componentPath);
  }
  return chosen;
}

function generate(
  item: CompilationItem,
  bundleInfo: BundleInfo,
  sourceFileName: GeneratedSourceFilename,
  exportedType: ExportedType,
) {
  switch (exportedType.kind) {
    case 'valdiModel': {
      const { model } = exportedType;
      return generateNativeSources(new ValdiModelGenerator(model), {
        bundleInfo,
        sourceFileName,
        iosType: model.iosType,
        androidTypeName: model.androidClassName,
        cppType: model.cppType,
      });
    }
    case 'enum': {
      const { exportedEnum } = exportedType;
      return generateNativeSources(new ExportedEnumGenerator(exportedEnum), {
        bundleInfo,
        sourceFileName,
        iosType: exportedEnum.iosType,
        androidTypeName: exportedEnum.androidTypeName,
        cppType: exportedEnum.cppType,
      });
    }
    case 'function': {
      const { exportedFunction } = exportedType;
      const modulePath = deletingPathExtension(item.relativeBundlePath);
      return generateNativeSources(new ExportedFunctionGenerator(exportedFunction, modulePath), {
        bundleInfo,
        sourceFileName,
        iosType: exportedFunction.containingIosType,
        androidTypeName: exportedFunction.containingAndroidTypeName,
        cppType: exportedFunction.containingCppType,
      });
    }
    case 'module': {
      const { model } = exportedType.exportedModule;
      return generateNativeSources(new ExportedModuleGenerator(exportedType.exportedModule), {
        bundleInfo,
        sourceFileName,
        iosType: model.iosType,
        androidTypeName: model.androidClassName,
        cppType: model.cppType,
      });
    }
  }
}

export function generateModels(items: DocumentsIndexer, bundleInfo: BundleInfo): NativeSourceAndPlatform[] {
  const out: NativeSourceAndPlatform[] = [];
  const identityAndPaths: [string, ComponentPath][] = [];
  for (const item of items.items) {
    const viewModel = item.kind === 'document' ? item.result.originalDocument.viewModel : undefined;
    if (item.kind === 'document' && viewModel)
      identityAndPaths.push([viewModelIdentity(viewModel), item.result.componentPath]);
  }
  const representatives = attributionRepresentatives(identityAndPaths);
  const emittedViewModelIdentities = new Set<string>();

  for (const item of items.items) {
    if (item.kind === 'document') {
      const { componentPath, originalDocument } = item.result;
      const sourceFileName = {
        filename: componentPath.fileName,
        symbolName: componentPath.exportedMember,
        src: { compilationPath: item.item.relativeProjectPath, sourceURL: item.item.sourceURL },
      };
      const viewModel = originalDocument.viewModel;
      if (viewModel) {
        const identity = viewModelIdentity(viewModel);
        if (representatives.get(identity) === componentPath && !emittedViewModelIdentities.has(identity)) {
          emittedViewModelIdentities.add(identity);
          out.push(...generate(item.item, bundleInfo, sourceFileName, { kind: 'valdiModel', model: viewModel }));
        }
      }
      for (const childModel of originalDocument.additionalModels) {
        out.push(...generate(item.item, bundleInfo, sourceFileName, { kind: 'valdiModel', model: childModel }));
      }
    } else if (item.kind === 'exportedType') {
      out.push(...generate(item.item, bundleInfo, item.sourceFilename, item.exportedType));
    }
  }
  return out;
}
