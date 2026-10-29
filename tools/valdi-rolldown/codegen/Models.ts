// The compiler's models of what it exports (Parser/Models/ValdiRawDocument.swift, Models/NativeSource.swift,
// Generation/NativeSourceGenerator.swift, ExportedFunction in Generation/ExportedFunctionGenerator.swift, ExportedEnum
// in ViewModels/ExportedEnumGenerator.swift), with Swift's enums with associated values as unions tagged by `kind`.
import type { GeneratedSourceFilename } from './Utils';

export type NativeTypeKind = 'interface' | 'class' | 'enum' | 'stringEnum';

/** IOSLanguage: which language a module's iOS bindings are generated in (ios.language, default objc). */
export type IOSLanguage = 'objc' | 'swift' | 'both';

/**
 * An iOS type and the header declaring it. Every module has single file codegen, so a type made for a module is
 * declared in the module's combined headers: `<app_pagesTypes/app_pagesTypes.h>` (its API: classes and protocols) and
 * `<app_pages/app_pages.h>` (that and its utilities: marshall functions, views).
 */
export interface IOSType {
  name: string;
  swiftName: string;
  importPrefix?: string;
  importSuffix: string;
  isImportPrefixOverridden: boolean;
  fromSingleFileCodegen: boolean;
  kind: NativeTypeKind;
  iosLanguage: IOSLanguage;
}

/** IOSType's grouping priorities: the order of a combined file's sources, before their file name. */
export const IOS_GROUPING_PRIORITY = {
  enumType: 0,
  enumStringType: 1,
  classType: 2,
  interfaceType: 3,
  functionType: 4,
  idsType: 5,
  viewType: 6,
} as const;

/** IOSType.HeaderImportKind: the API header only, or the header also declaring the utilities. */
export type HeaderImportKind = 'apiOnly' | 'withUtilities';

/** HeaderImportKind.apiOnlyModuleNameSuffix. */
export const API_ONLY_MODULE_NAME_SUFFIX = 'Types';

/** IOSType.init(name:swiftName:bundleInfo:kind:iosLanguage:), with no import prefix yet. */
export function makeIOSType(
  name: string,
  swiftName: string | undefined,
  bundleInfo: BundleInfo | undefined,
  kind: NativeTypeKind,
  iosLanguage: IOSLanguage,
): IOSType {
  return {
    name,
    swiftName: swiftName ?? name,
    importSuffix: bundleInfo ? bundleInfo.iosModuleName : name,
    isImportPrefixOverridden: false,
    fromSingleFileCodegen: bundleInfo !== undefined,
    kind,
    iosLanguage,
  };
}

/** IOSType.applyImportPrefix: String.sanitizePathComponents, empty path components dropped. */
export function applyImportPrefix(type: IOSType, iosImportPrefix: string, isOverridden: boolean): void {
  const components = iosImportPrefix.split('/').filter(Boolean);
  type.importPrefix = components.length ? components.join('/') : undefined;
  type.isImportPrefixOverridden = isOverridden;
}

export function importHeaderFilename(type: IOSType, kind: HeaderImportKind): string {
  if (kind === 'apiOnly' && type.fromSingleFileCodegen) return `${type.importSuffix}${API_ONLY_MODULE_NAME_SUFFIX}.h`;
  return `${type.importSuffix}.h`;
}

/** IOSType.importHeaderStatement(kind:): what follows `#import `. */
export function importHeaderStatement(type: IOSType, kind: HeaderImportKind = 'apiOnly'): string {
  const filename = importHeaderFilename(type, kind);
  const { importPrefix } = type;
  if (importPrefix === undefined) return `"${filename}"`;
  if (type.isImportPrefixOverridden) {
    // A type of a single file codegen module with an explicit iosImportPrefix maps to an external native header named
    // after the type (<valdi_core/INavigator.h>), not the module's combined one.
    if (type.fromSingleFileCodegen) return `<${importPrefix}/${type.name}.h>`;
    return `<${importPrefix}/${filename}>`;
  }
  const suffix = kind === 'apiOnly' ? API_ONLY_MODULE_NAME_SUFFIX : '';
  return `<${importPrefix}${suffix}/${filename}>`;
}

/** IOSType.typeDeclaration: how a value of the type is declared. */
export function typeDeclaration(type: IOSType): string {
  switch (type.kind) {
    case 'class':
      return `${type.name} *`;
    case 'interface':
      return `id<${type.name}>`;
    case 'enum':
    case 'stringEnum':
      return type.name;
  }
}

export interface ValdiNodeClassMapping {
  tsType: string;
  iosType?: IOSType;
  androidClassName?: string;
  cppType?: CppType;
  kind: NativeTypeKind;
  isGenerated: boolean;
  marshallAsUntyped: boolean;
  converter?: string;
}

export interface OmitConstructorParams {
  ios?: boolean;
  android?: boolean;
}

/** InjectableParams.Compatibility. */
export interface InjectableParams {
  ios: boolean;
  android: boolean;
}

export const EMPTY_INJECTABLE_PARAMS: InjectableParams = { ios: false, android: false };

export interface ValdiModelProperty {
  name: string;
  type: ValdiModelPropertyType;
  comments?: string;
  omitConstructor?: OmitConstructorParams;
  injectableParams: InjectableParams;
  declaredVersion?: string;
}

export type ValdiModelPropertyType =
  | { kind: 'string' }
  | { kind: 'double' }
  | { kind: 'bool' }
  | { kind: 'long' }
  | { kind: 'array'; elementType: ValdiModelPropertyType }
  | { kind: 'bytes' }
  | { kind: 'map'; keyType: ValdiModelPropertyType; valueType: ValdiModelPropertyType }
  | { kind: 'any' }
  | { kind: 'void' }
  | {
      kind: 'function';
      parameters: ValdiModelProperty[];
      returnType: ValdiModelPropertyType;
      isSingleCall: boolean;
      shouldCallOnWorkerThread: boolean;
      allowSyncCall: boolean;
    }
  | { kind: 'object'; mapping: ValdiNodeClassMapping }
  | { kind: 'genericTypeParameter'; name: string }
  | { kind: 'genericObject'; mapping: ValdiNodeClassMapping; typeArguments: ValdiModelPropertyType[] }
  | { kind: 'promise'; typeArgument: ValdiModelPropertyType }
  | { kind: 'enum'; mapping: ValdiNodeClassMapping }
  | { kind: 'nullable'; type: ValdiModelPropertyType };

export const isOptional = (type: ValdiModelPropertyType) => type.kind === 'nullable';

export const isVoid = (type: ValdiModelPropertyType) => type.kind === 'void';

export function unwrappingOptional(type: ValdiModelPropertyType): ValdiModelPropertyType {
  return type.kind === 'nullable' ? unwrappingOptional(type.type) : type;
}

export const isFunction = (type: ValdiModelPropertyType) => unwrappingOptional(type).kind === 'function';

/** Whether the type refers to a type parameter or a generic type, which ObjC typedefs can't name. */
export function includesGenericType(type: ValdiModelPropertyType): boolean {
  switch (type.kind) {
    case 'array':
      return includesGenericType(type.elementType);
    case 'function':
      return (
        type.parameters.some(parameter => includesGenericType(parameter.type)) || includesGenericType(type.returnType)
      );
    case 'genericTypeParameter':
    case 'genericObject':
    case 'promise':
      return true;
    case 'nullable':
      return includesGenericType(type.type);
    default:
      return false;
  }
}

/** The Swift enum's case constructors for the payload-less cases. */
export const STRING: ValdiModelPropertyType = { kind: 'string' };
export const DOUBLE: ValdiModelPropertyType = { kind: 'double' };
export const ANY: ValdiModelPropertyType = { kind: 'any' };
export const UNTYPED_MAP: ValdiModelPropertyType = { kind: 'map', keyType: STRING, valueType: ANY };

export interface ValdiTypeParameter {
  name: string;
}

export interface ValdiModel {
  tsType: string;
  iosType?: IOSType;
  androidClassName?: string;
  cppType?: CppType;
  typeParameters?: ValdiTypeParameter[];
  exportAsInterface: boolean;
  legacyConstructors: boolean;
  usePublicFields: boolean;
  comments?: string;
  properties: ValdiModelProperty[];
  declaredVersion?: string;
  isNativeApi: boolean;
}

export interface ExportedFunction {
  containingIosType?: IOSType;
  containingAndroidTypeName?: string;
  containingCppType?: CppType;
  functionName: string;
  parameters: ValdiModelProperty[];
  returnType: ValdiModelPropertyType;
  allowSyncCall: boolean;
  comments?: string;
  declaredVersion?: string;
}

/** A file's @ExportModule: its exported functions and variables as an interface's members, and its import path. */
export interface ExportedModule {
  model: ValdiModel;
  /** The file's compilation path without extension: `app_pages/src/cpp/Cpp`. */
  modulePath: string;
}

export interface EnumCase<T extends string | number> {
  name: string;
  value: T;
  comments?: string;
  declaredVersion?: string;
}

/** ViewModels/ExportedEnumGenerator.swift's ExportedEnum: an @ExportEnum's cases, all int or all string. */
export interface ExportedEnum {
  iosType?: IOSType;
  androidTypeName?: string;
  cppType?: CppType;
  cases: { kind: 'enum'; cases: EnumCase<number>[] } | { kind: 'stringEnum'; cases: EnumCase<string>[] };
  comments?: string;
  declaredVersion?: string;
}

/** TypeScriptNativeTypeExporter.swift's ExportedType. */
export type ExportedType =
  | { kind: 'valdiModel'; model: ValdiModel }
  | { kind: 'enum'; exportedEnum: ExportedEnum }
  | { kind: 'function'; exportedFunction: ExportedFunction }
  | { kind: 'module'; exportedModule: ExportedModule };

/**
 * CompilationItem.BundleInfo: the module's settings (valdi_module() attributes, module.yaml) and what it reads from the
 * project config (valdi_config.yaml).
 */
export interface BundleInfo {
  name: string;
  /** valdi_module(async_strict_mode), default False. */
  asyncStrictMode: boolean;
  androidCodegenEnabled: boolean;
  iosCodegenEnabled: boolean;
  /** The project's cpp.codegen_enabled, unless module.yaml's cpp.codegen_enabled says otherwise. */
  cppCodegenEnabled: boolean;
  /** module.yaml's cpp.class_prefix (valdi_module() has no attribute for it): what inferred C++ names start with. */
  cppClassPrefix?: string;
  /** The project's cpp.default_class_prefix, used as `<it><module>::` when the module has no class prefix. */
  cppDefaultClassPrefix?: string;
  /** The project's cpp.import_path_prefix: what include paths (and the C++ output directory) start with. */
  cppImportPathPrefix?: string;
  /** valdi_module(android_class_path): the package of classes whose annotation doesn't name one. */
  androidClassPath?: string;
  /** The project's android.class_path, used as `<it>.<module>` when the module has no class path. */
  androidDefaultClassPath?: string;
  /** valdi_module(ios_class_prefix): what inferred iOS class names start with, instead of the iOS module name. */
  iosClassPrefix?: string;
  /** valdi_module(ios_module_name), the module's name by default: its headers' (`app_pages.h`) and directories'. */
  iosModuleName: string;
  /** valdi_module(ios_language). The Swift generator isn't ported: only the Objective-C of objc and both is made. */
  iosLanguage: IOSLanguage;
}

export type Platform = 'android' | 'ios' | 'cpp';

/** CPPNamespace: `snap::valdi_modules::app_pages`, as its components. */
export class CppNamespace {
  static readonly root = new CppNamespace([]);

  constructor(readonly components: readonly string[]) {}

  /** This namespace as named from `other`: without the leading components the two share. */
  resolve(other: CppNamespace): CppNamespace {
    const outComponents = [...this.components];
    for (const component of other.components) {
      if (outComponents[0] !== component) break;
      outComponents.shift();
    }
    return new CppNamespace(outComponents);
  }

  get description(): string {
    return this.components.join('::');
  }

  appending(component: string): CppNamespace {
    return new CppNamespace([...this.components, component]);
  }
}

/** CPPTypeDeclaration.SymbolType. */
export type CppSymbolType = 'class' | 'enum';

export const cppDeclarationString = (symbolType: CppSymbolType) => (symbolType === 'class' ? 'class' : 'enum class');

/** CPPTypeDeclaration: a type's namespace and name, and whether it's a class or an enum. */
export interface CppTypeDeclaration {
  namespace: CppNamespace;
  name: string;
  symbolType: CppSymbolType;
}

/** CPPTypeDeclaration.init(name:symbolType:): `a::b::C` is C in namespace a::b. */
export function parseCppTypeDeclaration(name: string, symbolType: CppSymbolType): CppTypeDeclaration {
  const components = name.split('::');
  if (components.length === 1) return { namespace: CppNamespace.root, name, symbolType };
  return { namespace: new CppNamespace(components.slice(0, -1)), name: components[components.length - 1], symbolType };
}

/** CPPTypeDeclaration.resolveTypeName(inNamespace:): the type as named from `namespace`. */
export function resolveCppTypeName(declaration: CppTypeDeclaration, namespace: CppNamespace): string {
  const resolved = declaration.namespace.resolve(namespace);
  return resolved.components.length ? `${resolved.description}::${declaration.name}` : declaration.name;
}

/** CPPTypeDeclaration.fullTypeName. */
export const cppFullTypeName = (declaration: CppTypeDeclaration) => resolveCppTypeName(declaration, CppNamespace.root);

/** CPPType: a type's declaration, and the header declaring it (with single file codegen, the module's). */
export interface CppType {
  declaration: CppTypeDeclaration;
  /** `valdi_modules/app_pages/app_pages.hpp`. */
  includePath: string;
  includePrefix?: string;
}

/** CPPType.init(declaration:module:includePrefix:), for single file codegen modules (all of them). */
export function makeCppType(declaration: CppTypeDeclaration, bundleInfo: BundleInfo, includePrefix?: string): CppType {
  const resolvedIncludePrefix = includePrefix !== undefined ? `${includePrefix}${bundleInfo.name}` : bundleInfo.name;
  return { declaration, includePath: `${resolvedIncludePrefix}/${bundleInfo.name}.hpp`, includePrefix };
}

/** CPPType.includeDir: the include path's directory, where the type's sources go. */
export function cppIncludeDir(type: CppType): string {
  const index = type.includePath.lastIndexOf('/');
  return index < 0 ? '' : type.includePath.slice(0, index);
}

export interface NativeSource {
  /** Relative to the platform's output directory (iOS: `src/<iosModuleName>`, so the Types are `../app_pagesTypes`). */
  relativePath?: string;
  filename: string;
  content: string;
  /** Which sources single file codegen combines into one file (`app_pages.kt`). */
  groupingIdentifier: string;
  /** Orders sources inside the combined file, before their file name. */
  groupingPriority: number;
  /** Other sources' file names this one must come after in the combined file. */
  localFilenameDependencies: string[];
}

export interface NativeSourceAndPlatform {
  source: NativeSource;
  platform: Platform;
}

export interface NativeSourceParameters {
  bundleInfo: BundleInfo;
  sourceFileName: GeneratedSourceFilename;
  iosType?: IOSType;
  androidTypeName?: string;
  cppType?: CppType;
}

/** One exported type's generator, one method per language (Swift's isn't ported). */
export interface NativeSourceGenerator {
  generateObjCSources(parameters: NativeSourceParameters, type: IOSType): NativeSource[];
  generateKotlinSources(parameters: NativeSourceParameters, fullTypeName: string): NativeSource[];
  generateCppSources(parameters: NativeSourceParameters, type: CppType): NativeSource[];
}

/**
 * NativeSourceGenerator.generate(parameters:): every language the type has a native name in. For iOS, that's the
 * Objective-C of objc and both modules: Swift sources, of swift and both modules, aren't generated here.
 */
export function generateNativeSources(
  generator: NativeSourceGenerator,
  parameters: NativeSourceParameters,
): NativeSourceAndPlatform[] {
  const sources: NativeSourceAndPlatform[] = [];
  if (parameters.iosType !== undefined && parameters.bundleInfo.iosLanguage !== 'swift') {
    for (const source of generator.generateObjCSources(parameters, parameters.iosType)) {
      sources.push({ source, platform: 'ios' });
    }
  }
  if (parameters.androidTypeName !== undefined) {
    for (const source of generator.generateKotlinSources(parameters, parameters.androidTypeName)) {
      sources.push({ source, platform: 'android' });
    }
  }
  if (parameters.cppType !== undefined) {
    for (const source of generator.generateCppSources(parameters, parameters.cppType)) {
      sources.push({ source, platform: 'cpp' });
    }
  }
  return sources;
}
