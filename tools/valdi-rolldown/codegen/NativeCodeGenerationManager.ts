// Processors/NativeCodeGenerationManager.swift: collects the annotated types, functions and modules while annotations
// are processed, registering their native names, then exports them all (once every name is known) into the documents
// and exported-type items the generators read. A @ViewModel/@Context model goes to the documents of the components
// bound to it; a @Component's own @ExportModel becomes its view class.
import path from 'node:path';
import ts from 'typescript';
import type { DumpedRootNode } from '../vendor/companion/AST';
import type { DocumentsIndexer } from './CompilationItems';
import {
  applyImportPrefix,
  makeCppType,
  makeIOSType,
  parseCppTypeDeclaration,
  type BundleInfo,
  type CppSymbolType,
  type CppType,
  type ExportedType,
  type IOSType,
  type NativeTypeKind,
} from './Models';
import {
  documentError,
  type CompilationItem,
  type TypeScriptAnnotatedSymbol,
  type TypeScriptCommentedFile,
  type ValdiTypeScriptAnnotation,
} from './TypeScriptAnnotation';
import { TypeScriptNativeTypeExporter } from './TypeScriptNativeTypeExporter';
import { TypeScriptNativeTypeResolver, type TypeScriptNativeClass } from './TypeScriptNativeTypeResolver';
import { CompilerError, pascalCased, removingSuffixes, TYPESCRIPT_FILE_EXTENSIONS_DOTTED } from './Utils';

interface NativeClassToGenerate {
  annotation: ValdiTypeScriptAnnotation;
  commentedFile: TypeScriptCommentedFile;
  annotatedSymbol: TypeScriptAnnotatedSymbol;
  dumpedSymbol: DumpedRootNode;
  sourceURL: string;
  nativeClass: TypeScriptNativeClass;
  compilationItem: CompilationItem;
  kind: NativeTypeKind;
}

type NativeClassPurpose = 'unspecified' | 'viewModel' | 'context';

/** TSSymbolKey: a symbol by its file's compilation path without extension, and its name. */
export const tsSymbolKey = (fileName: string, symbolName: string) =>
  `${removingSuffixes(fileName, TYPESCRIPT_FILE_EXTENSIONS_DOTTED)}#${symbolName}`;

/** A @Component class, and the view model and context it's bound to. */
export interface ComponentBindingInfo {
  componentSourceURL: string;
  componentSymbolName: string;
  viewModelKey?: string;
  contextKey?: string;
}

interface NativeTypesToGenerate {
  iosType?: IOSType;
  androidClass?: string;
  cppType?: CppType;
}

interface NativeModuleToGenerate {
  annotation: ValdiTypeScriptAnnotation;
  commentedFile: TypeScriptCommentedFile;
  annotatedSymbol: TypeScriptAnnotatedSymbol;
  dumpedSymbol: DumpedRootNode;
  tsTypeName: string;
  nativeTypes: NativeTypesToGenerate;
  compilationItem: CompilationItem;
}

interface NativeFunctionToGenerate {
  annotation: ValdiTypeScriptAnnotation;
  commentedFile: TypeScriptCommentedFile;
  annotatedSymbol: TypeScriptAnnotatedSymbol;
  dumpedSymbol: DumpedRootNode;
  sourceURL: string;
  tsTypeName: string;
  nativeTypes: NativeTypesToGenerate;
  compilationItem: CompilationItem;
}

const throwAnnotationError = (
  annotation: ValdiTypeScriptAnnotation,
  commentedFile: TypeScriptCommentedFile,
  message: string,
): never => {
  throw documentError(message, annotation.start, commentedFile.fileContent, commentedFile.src.compilationPath);
};

const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => map.set(key, [...(map.get(key) ?? []), value]);

export class NativeCodeGenerationManager {
  readonly nativeTypeResolver = new TypeScriptNativeTypeResolver();

  private nativeClassesToGenerate: NativeClassToGenerate[] = [];
  private viewClassesToGenerate: NativeClassToGenerate[] = [];
  private nativeFunctionsToGenerate: NativeFunctionToGenerate[] = [];
  private nativeModulesToGenerate: NativeModuleToGenerate[] = [];
  /** By TSSymbolKey; the URL-keyed maps are the compiler's fallback for .vue scripts, kept for the same lookups. */
  private viewModelByTypeKey = new Map<string, string>();
  private contextByTypeKey = new Map<string, string>();
  private viewModelSymbolBySourceURL = new Map<string, string>();
  private contextSymbolBySourceURL = new Map<string, string>();
  /** Every Component binding a view model/context: one can back several. */
  private componentInfoByVMKey = new Map<string, ComponentBindingInfo[]>();
  private componentInfoByCtxKey = new Map<string, ComponentBindingInfo[]>();

  constructor(
    private readonly bundleInfo: BundleInfo,
    private readonly warn: (message: string) => void,
  ) {}

  addNativeTypeToGenerate(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    sourceURL: string,
    annotatedSymbol: TypeScriptAnnotatedSymbol,
    compilationItem: CompilationItem,
    kind: NativeTypeKind,
    isComponent: boolean,
  ): void {
    const nativeTypeToGenerate = this.makeNativeClassToGenerate(
      commentedFile,
      annotation,
      sourceURL,
      annotatedSymbol,
      compilationItem,
      kind,
      isComponent,
    );
    (isComponent ? this.viewClassesToGenerate : this.nativeClassesToGenerate).push(nativeTypeToGenerate);
  }

  private makeNativeTypesToGenerate(
    symbolName: string,
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
  ): NativeTypesToGenerate {
    const iosContainingTypeName = annotation.parameters?.ios ?? this.inferIOSClassName(symbolName);
    const swiftContainingTypeName = annotation.parameters?.swift ?? annotation.parameters?.ios ?? symbolName;
    const androidContainingClassName = annotation.parameters?.android ?? this.inferAndroidClassName(symbolName);
    return {
      iosType: this.bundleInfo.iosCodegenEnabled
        ? this.makeIOSType(iosContainingTypeName, swiftContainingTypeName, 'class', annotation)
        : undefined,
      androidClass: this.bundleInfo.androidCodegenEnabled ? androidContainingClassName : undefined,
      cppType: this.resolveGeneratedCppType(commentedFile, annotation, symbolName, 'class'),
    };
  }

  /**
   * The file's @ExportModule: the interface its exported functions and variables make, named after the file
   * (`Cpp.d.ts` → CppModule).
   */
  addNativeModuleToGenerate(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    annotatedSymbol: TypeScriptAnnotatedSymbol,
    compilationItem: CompilationItem,
  ): void {
    const fileNameWithoutExtension = path.posix
      .basename(removingSuffixes(commentedFile.src.compilationPath, TYPESCRIPT_FILE_EXTENSIONS_DOTTED))
      .replaceAll('.', '_');
    const symbolName = pascalCased(`${fileNameWithoutExtension}_Module`);
    this.nativeModulesToGenerate.push({
      annotation,
      commentedFile,
      annotatedSymbol,
      dumpedSymbol: annotatedSymbol.symbol,
      tsTypeName: symbolName,
      nativeTypes: this.makeNativeTypesToGenerate(symbolName, commentedFile, annotation),
      compilationItem,
    });
  }

  addNativeFuncToGenerate(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    sourceURL: string,
    annotatedSymbol: TypeScriptAnnotatedSymbol,
    compilationItem: CompilationItem,
  ): void {
    const symbol = annotatedSymbol.symbol;
    if (!symbol.function) throwAnnotationError(annotation, commentedFile, '@ExportFunction must be set on a function');
    if (!symbol.modifiers?.includes('export')) {
      throwAnnotationError(
        annotation,
        commentedFile,
        '@ExportFunction must be set on a function that is exported (please add export keyword)',
      );
    }
    const functionName = symbol.text;
    this.nativeFunctionsToGenerate.push({
      annotation,
      commentedFile,
      annotatedSymbol,
      dumpedSymbol: symbol,
      sourceURL,
      tsTypeName: functionName,
      nativeTypes: this.makeNativeTypesToGenerate(pascalCased(functionName), commentedFile, annotation),
      compilationItem,
    });
  }

  addNativeTypeConverter(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    annotatedSymbol: TypeScriptAnnotatedSymbol,
  ): void {
    const symbol = annotatedSymbol.symbol;
    const fn = symbol.function;
    if (!fn) return throwAnnotationError(annotation, commentedFile, '@NativeTypeConverter must be set on a function');
    if (!symbol.modifiers?.includes('export')) {
      throwAnnotationError(
        annotation,
        commentedFile,
        '@NativeTypeConverter must be set on a function that is exported (please add export keyword)',
      );
    }
    const typeArguments = fn.type.returnValue.typeArguments;
    if (!typeArguments || typeArguments.length !== 2) {
      return throwAnnotationError(
        annotation,
        commentedFile,
        '@NativeTypeConverter must be set on a function that returns a generic type with two parameters',
      );
    }
    const [from, to] = typeArguments.map(argument => argument.type.typeReferenceIndex);
    if (from === undefined || to === undefined) {
      return throwAnnotationError(
        annotation,
        commentedFile,
        'Expecting type references on the return value generic type',
      );
    }
    const references = commentedFile.references;
    for (const index of [from, to]) {
      if (index < 0 || index >= references.length) throw new CompilerError(`Out of bounds type reference ${from}`);
    }
    this.nativeTypeResolver.registerTypeConverter(
      commentedFile.src,
      this.bundleInfo.name,
      symbol.text,
      references[from].fileName,
      references[from].name,
      references[to].fileName,
      references[to].name,
    );
  }

  addViewModelSymbol(sourceURL: string, compilationPath: string, symbol: string): void {
    this.viewModelByTypeKey.set(tsSymbolKey(compilationPath, symbol), symbol);
    this.viewModelSymbolBySourceURL.set(sourceURL, symbol);
  }

  private isRegisteredViewModel(sourceURL: string, symbolName: string, key: string): boolean {
    return this.viewModelSymbolBySourceURL.get(sourceURL) === symbolName || this.viewModelByTypeKey.has(key);
  }

  addContextSymbol(sourceURL: string, compilationPath: string, symbol: string): void {
    this.contextByTypeKey.set(tsSymbolKey(compilationPath, symbol), symbol);
    this.contextSymbolBySourceURL.set(sourceURL, symbol);
  }

  private isRegisteredContext(sourceURL: string, symbolName: string, key: string): boolean {
    return this.contextSymbolBySourceURL.get(sourceURL) === symbolName || this.contextByTypeKey.has(key);
  }

  registerComponentBinding(info: ComponentBindingInfo): void {
    if (info.viewModelKey !== undefined) pushTo(this.componentInfoByVMKey, info.viewModelKey, info);
    if (info.contextKey !== undefined) pushTo(this.componentInfoByCtxKey, info.contextKey, info);
  }

  private inferIOSClassName(symbolName: string): string {
    return `${this.bundleInfo.iosClassPrefix ?? this.bundleInfo.iosModuleName}${symbolName}`;
  }

  /** `<cpp.class_prefix><Name>`, else `<the project's cpp.default_class_prefix><module>::<Name>`. */
  private inferCppType(symbolName: string): string | undefined {
    if (this.bundleInfo.cppClassPrefix !== undefined)
      return `${this.bundleInfo.cppClassPrefix}${pascalCased(symbolName)}`;
    if (this.bundleInfo.cppDefaultClassPrefix !== undefined) {
      return `${this.bundleInfo.cppDefaultClassPrefix}${this.bundleInfo.name}::${pascalCased(symbolName)}`;
    }
    return undefined;
  }

  private resolveGeneratedCppType(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    symbolName: string,
    symbolType: CppSymbolType,
  ): CppType | undefined {
    if (!this.bundleInfo.cppCodegenEnabled) return undefined;
    const typeName = annotation.parameters?.cpp ?? this.inferCppType(symbolName);
    if (typeName === undefined) {
      throwAnnotationError(
        annotation,
        commentedFile,
        `Cannot infer the generated C++ class type for ${symbolName} as the 'cpp.default_class_prefrix' value was not set in the valdi_config.yaml or module.yaml.`,
      );
    }
    return makeCppType(
      parseCppTypeDeclaration(typeName!, symbolType),
      this.bundleInfo,
      this.bundleInfo.cppImportPathPrefix,
    );
  }

  /** A type of this module: in its headers, unless the annotation's iosImportPrefix says it's declared elsewhere. */
  private makeIOSType(
    name: string,
    swiftName: string,
    kind: NativeTypeKind,
    annotation: ValdiTypeScriptAnnotation,
  ): IOSType {
    const iosType = makeIOSType(name, swiftName, this.bundleInfo, kind, this.bundleInfo.iosLanguage);
    const overriddenIosImport = annotation.parameters?.iosImportPrefix;
    if (overriddenIosImport !== undefined) applyImportPrefix(iosType, overriddenIosImport, true);
    else applyImportPrefix(iosType, this.bundleInfo.iosModuleName, false);
    return iosType;
  }

  private inferAndroidClassName(symbolName: string): string | undefined {
    if (this.bundleInfo.androidClassPath !== undefined) return `${this.bundleInfo.androidClassPath}.${symbolName}`;
    if (this.bundleInfo.androidDefaultClassPath !== undefined) {
      return `${this.bundleInfo.androidDefaultClassPath}.${this.bundleInfo.name}.${symbolName}`;
    }
    return undefined;
  }

  private resolveGeneratedAndroidClassName(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    symbolName: string,
  ): string | undefined {
    if (!this.bundleInfo.androidCodegenEnabled) return undefined;
    const typeName = annotation.parameters?.android ?? this.inferAndroidClassName(symbolName);
    if (typeName === undefined) {
      throwAnnotationError(
        annotation,
        commentedFile,
        `Cannot infer the generated Android class path for ${symbolName} as the 'android.class_path' value was not set in the valdi_config.yaml or module.yaml.`,
      );
    }
    return typeName;
  }

  registerNativeClass(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    symbol: DumpedRootNode,
    kind: NativeTypeKind,
    isGenerated: boolean,
  ): TypeScriptNativeClass {
    const parameters = annotation.parameters;
    const iosType = this.bundleInfo.iosCodegenEnabled
      ? this.makeIOSType(
          parameters?.ios ?? this.inferIOSClassName(symbol.text),
          parameters?.swift ?? parameters?.ios ?? symbol.text,
          kind,
          annotation,
        )
      : undefined;
    const androidClassName = this.resolveGeneratedAndroidClassName(commentedFile, annotation, symbol.text);
    const cppType = this.resolveGeneratedCppType(
      commentedFile,
      annotation,
      symbol.text,
      kind === 'enum' || kind === 'stringEnum' ? 'enum' : 'class',
    );
    const marshallAsUntyped = parameters?.marshallAsUntyped === 'true';
    const marshallAsUntypedMap = parameters?.marshallAsUntypedMap === 'true';
    if (isGenerated && marshallAsUntyped) {
      throwAnnotationError(annotation, commentedFile, 'Generated types are never marshalled as untyped');
    }
    return this.nativeTypeResolver.register(
      commentedFile.src,
      this.bundleInfo.name,
      symbol.text,
      iosType,
      androidClassName,
      kind,
      isGenerated,
      marshallAsUntyped,
      marshallAsUntypedMap,
      cppType,
    );
  }

  /** Exports what was collected, once every native type is registered. */
  createCompilationItems(existingItems: DocumentsIndexer): void {
    for (const nativeClass of this.nativeClassesToGenerate) {
      const symbolName = nativeClass.dumpedSymbol.text;
      const classKey = tsSymbolKey(nativeClass.commentedFile.src.compilationPath, symbolName);
      const isViewModel = this.isRegisteredViewModel(nativeClass.sourceURL, symbolName, classKey);
      const isContext = this.isRegisteredContext(nativeClass.sourceURL, symbolName, classKey);
      if (isContext && isViewModel) {
        existingItems.injectError(
          new CompilerError('Cannot put @ViewModel and @Context on the same symbol'),
          nativeClass.compilationItem,
        );
        continue;
      }
      const purpose: NativeClassPurpose = isViewModel ? 'viewModel' : isContext ? 'context' : 'unspecified';
      try {
        this.generateNativeClass(nativeClass, purpose, existingItems);
      } catch (error) {
        existingItems.injectError(error as Error, nativeClass.compilationItem);
      }
    }

    for (const nativeFunction of this.nativeFunctionsToGenerate) {
      try {
        this.generateNativeFunction(nativeFunction, existingItems);
      } catch (error) {
        existingItems.injectError(error as Error, nativeFunction.compilationItem);
      }
    }

    for (const nativeModule of this.nativeModulesToGenerate) {
      try {
        this.generateNativeModule(nativeModule, existingItems);
      } catch (error) {
        existingItems.injectError(error as Error, nativeModule.compilationItem);
      }
    }

    // After the generated types: they may have put their models in the documents.
    for (const nativeClass of this.viewClassesToGenerate)
      this.updateCompilationItemsForGeneratedViewClass(nativeClass, existingItems);
  }

  private generateNativeModule(nativeModuleToGenerate: NativeModuleToGenerate, items: DocumentsIndexer): void {
    const { commentedFile, compilationItem, nativeTypes } = nativeModuleToGenerate;
    const exporter = new TypeScriptNativeTypeExporter(
      nativeTypes.iosType,
      nativeTypes.androidClass,
      commentedFile,
      nativeModuleToGenerate.annotatedSymbol,
      nativeModuleToGenerate.dumpedSymbol,
      this.nativeTypeResolver,
      nativeTypes.cppType,
    );
    items.append({
      item: compilationItem,
      kind: 'exportedType',
      exportedType: { kind: 'module', exportedModule: exporter.exportModule() },
      sourceFilename: {
        filename: compilationItem.relativeProjectPath,
        symbolName: nativeModuleToGenerate.tsTypeName,
        src: commentedFile.src,
      },
    });
  }

  /** As if the document's class mapping named a class for its root node. */
  private updateCompilationItemsForGeneratedViewClass(
    nativeClassToGenerate: NativeClassToGenerate,
    items: DocumentsIndexer,
  ): void {
    const document = items.findDocument(nativeClassToGenerate.sourceURL);
    if (!document) return;
    const originalDocument = document.originalDocument;
    originalDocument.classMapping ??= new Map();
    originalDocument.classMapping.set('', {
      tsType: nativeClassToGenerate.dumpedSymbol.text,
      iosType: nativeClassToGenerate.nativeClass.iosType,
      androidClassName: nativeClassToGenerate.nativeClass.androidClass,
      cppType: nativeClassToGenerate.nativeClass.cppType,
      kind: 'class',
      isGenerated: false,
      marshallAsUntyped: false,
    });
  }

  private generateNativeClass(
    nativeClassToGenerate: NativeClassToGenerate,
    nativeClassPurpose: NativeClassPurpose,
    items: DocumentsIndexer,
  ): void {
    const { commentedFile, compilationItem, dumpedSymbol, nativeClass, annotation, sourceURL } = nativeClassToGenerate;
    const exporter = new TypeScriptNativeTypeExporter(
      nativeClass.iosType,
      nativeClass.androidClass,
      commentedFile,
      nativeClassToGenerate.annotatedSymbol,
      dumpedSymbol,
      this.nativeTypeResolver,
      nativeClass.cppType,
    );
    let nativeTypeToExport: ExportedType;
    try {
      nativeTypeToExport = exporter.export();
    } catch (error) {
      throw documentError(
        `Failed to export native class '${dumpedSymbol.text}': ${(error as Error).message}`,
        dumpedSymbol.start,
        commentedFile.fileContent,
        commentedFile.src.compilationPath,
      );
    }
    const generatedSourceFilename = {
      filename: compilationItem.relativeProjectPath,
      symbolName: nativeClass.tsTypeName,
      src: commentedFile.src,
    };

    if (nativeTypeToExport.kind === 'enum') {
      items.append({
        item: compilationItem,
        kind: 'exportedType',
        exportedType: nativeTypeToExport,
        sourceFilename: generatedSourceFilename,
      });
      return;
    }
    if (nativeTypeToExport.kind !== 'valdiModel') return;
    const { model } = nativeTypeToExport;

    if (annotation.parameters?.emitConstructors === 'legacy') {
      model.legacyConstructors = true;
    } else {
      for (const property of model.properties) {
        if (property.omitConstructor) {
          throw new CompilerError(
            `${nativeClass.tsTypeName}.${property.name} - Using @ConstructorOmitted is deprecated when not using legacy constructors.`,
          );
        }
      }
    }

    if (nativeClassToGenerate.kind === 'interface') {
      model.exportAsInterface = true;
      for (const property of model.properties) {
        if (property.omitConstructor) {
          const hint =
            property.type.kind === 'nullable'
              ? ''
              : " Did you mean to make the property optional with a '?' in the TypeScript interface?";
          throw new CompilerError(
            `${nativeClass.tsTypeName}.${property.name} - Using @ConstructorOmitted on a @GenerateProxy does not do anything.${hint}`,
          );
        }
      }
    }

    // A view model or context goes to the documents of the components bound to it, wherever they are, and to its own
    // file's document when that file has a component using it by convention.
    const classKey = tsSymbolKey(commentedFile.src.compilationPath, dumpedSymbol.text);
    const exportedType = () =>
      items.append({
        item: compilationItem,
        kind: 'exportedType',
        exportedType: { kind: 'valdiModel', model },
        sourceFilename: generatedSourceFilename,
      });

    switch (nativeClassPurpose) {
      case 'unspecified':
        exportedType();
        break;
      case 'viewModel': {
        const attachURLs = (this.componentInfoByVMKey.get(classKey) ?? []).map(info => info.componentSourceURL);
        const sameFile = this.viewModelSymbolBySourceURL.get(sourceURL) === dumpedSymbol.text;
        if (sameFile && !attachURLs.includes(sourceURL)) attachURLs.push(sourceURL);
        let attached = false;
        for (const attachURL of attachURLs) {
          const document = items.findDocument(attachURL);
          if (!document) continue;
          // An earlier attach in this same view model's iteration already wrote here: don't overwrite.
          if (!document.originalDocument.viewModel) document.originalDocument.viewModel = model;
          attached = true;
        }
        if (!attached) exportedType();
        break;
      }
      case 'context': {
        const attachURLs = (this.componentInfoByCtxKey.get(classKey) ?? []).map(info => info.componentSourceURL);
        const sameFile = this.contextSymbolBySourceURL.get(sourceURL) === dumpedSymbol.text;
        if (sameFile && !attachURLs.includes(sourceURL)) attachURLs.push(sourceURL);
        for (const attachURL of attachURLs) {
          const document = items.findDocument(attachURL);
          if (!document || document.originalDocument.componentContext) continue;
          document.originalDocument.componentContext = {
            tsType: model.tsType,
            iosType: model.iosType,
            androidClassName: model.androidClassName,
            cppType: model.cppType,
            kind: 'class',
            isGenerated: false,
            marshallAsUntyped: false,
          };
        }
        exportedType();
        if (!model.exportAsInterface) {
          items.append({
            item: compilationItem,
            kind: 'exportedDependencyMetadata',
            model,
            sourceFilename: generatedSourceFilename,
          });
        }
        break;
      }
    }
  }

  private generateNativeFunction(nativeFuncToGenerate: NativeFunctionToGenerate, items: DocumentsIndexer): void {
    const { commentedFile, compilationItem, dumpedSymbol, nativeTypes, annotation } = nativeFuncToGenerate;
    const exporter = new TypeScriptNativeTypeExporter(
      nativeTypes.iosType,
      nativeTypes.androidClass,
      commentedFile,
      nativeFuncToGenerate.annotatedSymbol,
      dumpedSymbol,
      this.nativeTypeResolver,
      nativeTypes.cppType,
    );
    let exportedFunction;
    try {
      exportedFunction = exporter.exportFunction();
    } catch (error) {
      throwAnnotationError(
        annotation,
        commentedFile,
        `Failed to export native function '${dumpedSymbol.text}': ${(error as Error).message}`,
      );
    }
    items.append({
      item: compilationItem,
      kind: 'exportedType',
      exportedType: { kind: 'function', exportedFunction: exportedFunction! },
      sourceFilename: {
        filename: compilationItem.relativeProjectPath,
        symbolName: nativeFuncToGenerate.tsTypeName,
        src: commentedFile.src,
      },
    });
  }

  private makeNativeClassToGenerate(
    commentedFile: TypeScriptCommentedFile,
    annotation: ValdiTypeScriptAnnotation,
    sourceURL: string,
    annotatedSymbol: TypeScriptAnnotatedSymbol,
    compilationItem: CompilationItem,
    kind: NativeTypeKind,
    isComponent: boolean,
  ): NativeClassToGenerate {
    const symbol = annotatedSymbol.symbol;
    if (kind === 'class' || kind === 'interface') {
      if (symbol.kind !== ts.SyntaxKind.InterfaceDeclaration && symbol.kind !== ts.SyntaxKind.ClassDeclaration) {
        throwAnnotationError(
          annotation,
          commentedFile,
          '@ExportModel or @ExportProxy must be set on an interface or class',
        );
      }
      const hasSupertypes = (symbol.interface?.supertypes?.length ?? 0) > 0;
      const ignoreInheritance = annotation.parameters?.ignoreInheritance === 'true';
      if (ignoreInheritance) {
        this.warn(
          "`ignoreInheritance` on @ExportModel / @ExportProxy is deprecated. Interface inheritance is now flattened automatically; remove the parameter (and `extends` if the parent's members should not appear in the generated native class).",
        );
      }
      if (hasSupertypes && !ignoreInheritance) {
        if (symbol.kind === ts.SyntaxKind.InterfaceDeclaration) {
          // The compiler flattens an interface's `extends` chain into its members (InterfaceFlattener.swift).
          throwAnnotationError(
            annotation,
            commentedFile,
            `'${symbol.text}' extends another interface: InterfaceFlattener isn't ported to tools/valdi-rolldown/codegen yet`,
          );
        } else if (!isComponent) {
          // Classes can't be flattened (they carry runtime behavior); components legitimately extend
          // Component<VM, Ctx>.
          throwAnnotationError(
            annotation,
            commentedFile,
            '@ExportModel or @ExportProxy on a class cannot use inheritance (except when the class is a @Component).',
          );
        }
      }
    } else if (symbol.kind !== ts.SyntaxKind.EnumDeclaration) {
      throwAnnotationError(annotation, commentedFile, '@ExportEnum must be set on an enum');
    }

    const nativeClass = this.registerNativeClass(commentedFile, annotation, symbol, kind, true);
    return {
      annotation,
      commentedFile,
      annotatedSymbol,
      dumpedSymbol: symbol,
      sourceURL,
      nativeClass,
      compilationItem,
      kind,
    };
  }
}
