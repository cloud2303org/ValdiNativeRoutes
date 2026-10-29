// TypeScript/TypeScriptNativeTypeResolver.swift: the native types TypeScript types map to, by the file declaring them
// (compilation path without extension) and name. Annotation processing registers them all before any is resolved.
import type { CppType, IOSType, NativeTypeKind } from './Models';
import { removingSuffixes, TYPESCRIPT_FILE_EXTENSIONS_DOTTED, type TypeScriptItemSrc } from './Utils';

export interface TypeScriptNativeClass {
  tsTypeName: string;
  iosType?: IOSType;
  androidClass?: string;
  cppType?: CppType;
  kind: NativeTypeKind;
  isGenerated: boolean;
  marshallAsUntyped: boolean;
  marshallAsUntypedMap: boolean;
  convertedFromFunctionPath?: string;
}

interface TypeScriptNativeConvertedClass {
  convertFunctionPath: string;
  toCompilationPath: string;
  toTypeName: string;
}

type TypeScriptNativeTypeKind = { cls: TypeScriptNativeClass } | { convertedClass: TypeScriptNativeConvertedClass };

interface TypeScriptNativeType {
  emittingBundleName: string;
  kind: TypeScriptNativeTypeKind;
}

const withoutExtension = (compilationPath: string) =>
  removingSuffixes(compilationPath, TYPESCRIPT_FILE_EXTENSIONS_DOTTED);

export class TypeScriptNativeTypeResolver {
  private typesByPath = new Map<string, Map<string, TypeScriptNativeType>>();

  private set(compilationPath: string, tsTypeName: string, type: TypeScriptNativeType): void {
    const types = this.typesByPath.get(compilationPath) ?? new Map<string, TypeScriptNativeType>();
    types.set(tsTypeName, type);
    this.typesByPath.set(compilationPath, types);
  }

  register(
    src: TypeScriptItemSrc,
    emittingBundleName: string,
    tsTypeName: string,
    iosType: IOSType | undefined,
    androidClass: string | undefined,
    kind: NativeTypeKind,
    isGenerated: boolean,
    marshallAsUntyped: boolean,
    marshallAsUntypedMap: boolean,
    cppType?: CppType,
  ): TypeScriptNativeClass {
    const nativeClass: TypeScriptNativeClass = {
      tsTypeName,
      iosType,
      androidClass,
      cppType,
      kind,
      isGenerated,
      marshallAsUntyped,
      marshallAsUntypedMap,
    };
    this.set(withoutExtension(src.compilationPath), tsTypeName, { emittingBundleName, kind: { cls: nativeClass } });
    return nativeClass;
  }

  registerTypeConverter(
    src: TypeScriptItemSrc,
    emittingBundleName: string,
    tsTypeName: string,
    fromTypePath: string,
    tsFromTypeName: string,
    toTypePath: string,
    tsToTypeName: string,
  ): void {
    const convertedClass = {
      convertFunctionPath: `${tsTypeName}@${withoutExtension(src.compilationPath)}`,
      toCompilationPath: withoutExtension(toTypePath),
      toTypeName: tsToTypeName,
    };
    this.set(withoutExtension(fromTypePath), tsFromTypeName, { emittingBundleName, kind: { convertedClass } });
  }

  private lockFreeResolve(compilationPath: string, tsTypeName: string): TypeScriptNativeClass | undefined {
    const type = this.typesByPath.get(compilationPath)?.get(tsTypeName);
    if (!type) return undefined;
    if ('cls' in type.kind) return type.kind.cls;
    const { convertedClass } = type.kind;
    const nativeClass = this.lockFreeResolve(convertedClass.toCompilationPath, convertedClass.toTypeName);
    return nativeClass && { ...nativeClass, convertedFromFunctionPath: convertedClass.convertFunctionPath };
  }

  /** The type `tsTypeName` declared in `filePath` (a compilation path, as type references name files). */
  resolve(filePath: string, tsTypeName: string): TypeScriptNativeClass | undefined {
    return this.lockFreeResolve(withoutExtension(filePath), tsTypeName);
  }
}
