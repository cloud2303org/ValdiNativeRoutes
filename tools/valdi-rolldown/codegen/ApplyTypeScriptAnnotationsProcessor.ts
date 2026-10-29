// Processors/ParseTypeScriptAnnotationsProcessor.swift and Processors/ApplyTypeScriptAnnotationsProcessor.swift: the
// annotations in the dumped symbols' comments, registered, then applied: exported types and functions go to the
// NativeCodeGenerationManager, a .ts/.tsx file's @Component makes it a document bound to its view model and context.
import ts from 'typescript';
import { DocumentsIndexer, type ValdiAction } from './CompilationItems';
import type { TypeScriptItemAndSymbols } from './DumpTypeScriptSymbols';
import type { BundleInfo } from './Models';
import { NativeCodeGenerationManager, tsSymbolKey } from './NativeCodeGenerationManager';
import {
  documentError,
  parseAnnotationType,
  TypeScriptAnnotationsManager,
  TypeScriptCommentedFile,
  ValdiAnnotationType,
  type ParsedAnnotation,
  type TypeScriptAnnotatedSymbol,
  type ValdiTypeScriptAnnotation,
} from './TypeScriptAnnotation';
import { CompilerError, deletingPathExtension } from './Utils';
import type { AST, DumpedRootNode } from '../vendor/companion/AST';

/** ComponentBaseRegistry.swift: where valdi_core's Component base classes take their view model and context. */
const COMPONENT_BASE_SLOTS: Record<string, { vmSlot?: number; ctxSlot?: number }> = {
  Component: { vmSlot: 0, ctxSlot: 1 },
  StatefulComponent: { vmSlot: 0, ctxSlot: 2 },
};

const throwAnnotationError = (
  annotation: ValdiTypeScriptAnnotation,
  commentedFile: TypeScriptCommentedFile,
  message: string,
): never => {
  throw documentError(message, annotation.start, commentedFile.fileContent, commentedFile.src.compilationPath);
};

/** ParseTypeScriptAnnotationsProcessor: every file's annotations, registered; a file with a bad one is an error. */
function parseAnnotations(
  items: TypeScriptItemAndSymbols[],
  annotationsManager: TypeScriptAnnotationsManager,
  errors: Error[],
): void {
  for (const { typeScriptItem, dumpedSymbols } of items) {
    const { item: compilationItem, src } = typeScriptItem;
    try {
      const commentedFile = new TypeScriptCommentedFile(src, typeScriptItem.sourceFile.text, dumpedSymbols);
      const register = (
        annotation: ValdiTypeScriptAnnotation,
        symbol: TypeScriptAnnotatedSymbol,
        symbolIndex: number,
        memberIndex?: number,
      ) => {
        const type = parseAnnotationType(annotation.name);
        if (type === undefined) {
          const what = memberIndex === undefined ? 'annotation' : 'member annotation';
          throwAnnotationError(annotation, commentedFile, `Unrecognized ${what} '${annotation.name}'`);
        }
        const parsed: ParsedAnnotation = {
          type: type!,
          annotation,
          symbol,
          file: commentedFile,
          compilationItem,
          memberIndex,
        };
        annotationsManager.registerAnnotation(parsed, symbolIndex, compilationItem.sourceURL);
        // @NativeTemplateElement maps a JSX element to native views for templates, which native code generation
        // doesn't read.
      };
      commentedFile.annotatedSymbols.forEach((annotatedSymbol, symbolIndex) => {
        for (const annotation of annotatedSymbol.annotations) register(annotation, annotatedSymbol, symbolIndex);
        for (const [memberIndex, annotations] of [...annotatedSymbol.memberAnnotations].sort(([a], [b]) => a - b)) {
          for (const annotation of annotations) register(annotation, annotatedSymbol, symbolIndex, memberIndex);
        }
      });
    } catch (error) {
      errors.push(
        new Error(`Error parsing annotations in file ${src.compilationPath}: ${(error as Error).message}`, {
          cause: error,
        }),
      );
    }
  }
}

/**
 * Fails fast when the same native-export annotation is attached more than once to one symbol. Common cause: text such
 * as "due to @ExportModel limitations": any `@ExportModel` substring is a real tag.
 */
function throwIfDuplicateConflictingNativeExportAnnotations(allAnnotations: [string, ParsedAnnotation][]): void {
  const exportTypes = new Set<string>([
    'ExportModel',
    'GenerateNativeClass',
    'ExportProxy',
    'GenerateNativeInterface',
    'ExportEnum',
    'GenerateNativeEnum',
    'ExportFunction',
    'GenerateNativeFunction',
  ]);
  const buckets = new Map<string, { url: string; symbol: string; type: string; annotations: ParsedAnnotation[] }>();
  for (const [url, parsed] of allAnnotations) {
    if (!exportTypes.has(parsed.type)) continue;
    const key = JSON.stringify([url, parsed.symbol.symbol.text, parsed.type]);
    const bucket = buckets.get(key) ?? { url, symbol: parsed.symbol.symbol.text, type: parsed.type, annotations: [] };
    bucket.annotations.push(parsed);
    buckets.set(key, bucket);
  }
  for (const { url, symbol, type, annotations } of buckets.values()) {
    if (annotations.length <= 1) continue;
    const atTag = `@${type}`;
    const lines = annotations.map(
      (parsed, index) => `${index + 1}. ${parsed.annotation.content.replaceAll('\n', ' ')}`,
    );
    throw new CompilerError(
      `Multiple ${atTag} annotations have been detected for ${symbol} in file ${url}. Only one can be used and duplicates must be removed.\n` +
        `${lines.join('\n')}\n\n` +
        `Text in the same block that contains the substring "${atTag}" (for example, "due to ${atTag} limitations") is parsed as a second export and must be removed. Only one real ${atTag} annotation may apply to this symbol.`,
    );
  }
}

/**
 * A @Component's view model or context: the explicit annotation parameter (`viewModel: 'X'`, an identifier the file
 * references as a type or declares), else the type argument of valdi_core's Component/StatefulComponent base class.
 */
function resolveComponentBoundKey(
  paramName: 'viewModel' | 'context',
  commentedFile: TypeScriptCommentedFile,
  annotation: ValdiTypeScriptAnnotation,
  symbol: DumpedRootNode,
): string | undefined {
  const identifier = annotation.parameters?.[paramName];
  if (identifier) {
    const ref = commentedFile.references.find(reference => reference.name === identifier);
    if (ref) return tsSymbolKey(ref.fileName, ref.name);
    if (commentedFile.annotatedSymbols.some(annotated => annotated.symbol.text === identifier)) {
      return tsSymbolKey(commentedFile.src.compilationPath, identifier);
    }
    throwAnnotationError(
      annotation,
      commentedFile,
      `@Component ${paramName}: '${identifier}' — '${identifier}' is not visible in this file. Import '${identifier}' from another module, or declare it in this file with the appropriate annotation.`,
    );
  }

  const references = commentedFile.references;
  const inRange = (index: number | undefined): index is number =>
    index !== undefined && index >= 0 && index < references.length;
  const baseSupertype = symbol.interface?.supertypes?.[0];
  if (!baseSupertype || !inRange(baseSupertype.type.typeReferenceIndex)) return undefined;
  const slots = COMPONENT_BASE_SLOTS[references[baseSupertype.type.typeReferenceIndex].name];
  const slotIndex = paramName === 'viewModel' ? slots?.vmSlot : slots?.ctxSlot;
  if (slotIndex === undefined) return undefined;
  const argument: AST.Type | undefined = baseSupertype.type.typeArguments?.[slotIndex]?.type;
  // An inline type literal or unknown shape is skipped: explicit params remain the way out.
  if (!argument || !inRange(argument.typeReferenceIndex)) return undefined;
  const ref = references[argument.typeReferenceIndex];
  return tsSymbolKey(ref.fileName, ref.name);
}

/** The module's annotations, applied: the documents and exported types native code is generated from. */
export function processAnnotations(
  items: TypeScriptItemAndSymbols[],
  bundleInfo: BundleInfo,
  warn: (message: string) => void,
): DocumentsIndexer {
  const out = new DocumentsIndexer();
  const annotationsManager = new TypeScriptAnnotationsManager();
  parseAnnotations(items, annotationsManager, out.errors);

  const manager = new NativeCodeGenerationManager(bundleInfo, warn);
  const allAnnotations = annotationsManager.listAllAnnotations();
  throwIfDuplicateConflictingNativeExportAnnotations(allAnnotations);

  for (const [sourceURL, parsedAnnotation] of allAnnotations) {
    const { file: commentedFile, symbol: annotatedSymbol, annotation, compilationItem } = parsedAnnotation;
    const symbol = annotatedSymbol.symbol;
    const isTSorTSX = !/\.vue\.tsx?$/.test(sourceURL) && /\.tsx?$/.test(sourceURL);

    try {
      switch (parsedAnnotation.type) {
        case 'ExportModule':
          manager.addNativeModuleToGenerate(commentedFile, annotation, annotatedSymbol, compilationItem);
          break;
        case 'ExportModel':
        case 'GenerateNativeClass': {
          const isComponent = annotatedSymbol.annotations.some(item => item.name === ValdiAnnotationType.component);
          manager.addNativeTypeToGenerate(
            commentedFile,
            annotation,
            sourceURL,
            annotatedSymbol,
            compilationItem,
            'class',
            isComponent,
          );
          break;
        }
        case 'ExportProxy':
        case 'GenerateNativeInterface':
          manager.addNativeTypeToGenerate(
            commentedFile,
            annotation,
            sourceURL,
            annotatedSymbol,
            compilationItem,
            'interface',
            false,
          );
          break;
        case 'ExportEnum':
        case 'GenerateNativeEnum': {
          if (!symbol.enum) {
            throwAnnotationError(
              annotation,
              commentedFile,
              "[Shouldn't happen] Processing a @GenerateNativeEnum annotation, but there is no enum information",
            );
          }
          const members = symbol.enum!.members;
          const stringMembers = members.filter(member => member.stringValue !== undefined);
          const anyContainQuotes = stringMembers.length > 0;
          const allContainQuotes = stringMembers.length === members.length;
          if (anyContainQuotes !== allContainQuotes) {
            throwAnnotationError(
              annotation,
              commentedFile,
              `Invalid enum '${symbol.text}' - Can't mix String and Int cases`,
            );
          }
          manager.addNativeTypeToGenerate(
            commentedFile,
            annotation,
            sourceURL,
            annotatedSymbol,
            compilationItem,
            anyContainQuotes ? 'stringEnum' : 'enum',
            false,
          );
          break;
        }
        case 'ExportFunction':
        case 'GenerateNativeFunction':
          manager.addNativeFuncToGenerate(commentedFile, annotation, sourceURL, annotatedSymbol, compilationItem);
          break;
        case 'NativeTypeConverter':
          manager.addNativeTypeConverter(commentedFile, annotation, annotatedSymbol);
          break;
        case 'NativeClass':
        case 'NativeInterface':
          // Only registered: types other exported types refer to, which the native code declares itself.
          manager.registerNativeClass(
            commentedFile,
            annotation,
            symbol,
            parsedAnnotation.type === 'NativeClass' ? 'class' : 'interface',
            false,
          );
          break;
        case 'Component': {
          if (!isTSorTSX)
            throwAnnotationError(annotation, commentedFile, '@Component must be set in a .vue, .ts, or .tsx file');
          if (!symbol.text)
            throwAnnotationError(annotation, commentedFile, "Couldn't get the JS symbol name for @Component");
          // Hacking support for @Component in .tsx files
          const document = out.findOrCreateDocument(sourceURL, compilationItem);
          document.componentPath = {
            fileName: deletingPathExtension(compilationItem.relativeProjectPath),
            exportedMember: symbol.text,
          };
          if (symbol.kind !== ts.SyntaxKind.ClassDeclaration)
            throwAnnotationError(annotation, commentedFile, '@Component must be set on a class');
          if (!symbol.modifiers?.includes('export')) {
            throwAnnotationError(annotation, commentedFile, '@Component must be set on a class that is exported');
          }
          manager.registerComponentBinding({
            componentSourceURL: sourceURL,
            componentSymbolName: symbol.text,
            viewModelKey: resolveComponentBoundKey('viewModel', commentedFile, annotation, symbol),
            contextKey: resolveComponentBoundKey('context', commentedFile, annotation, symbol),
          });
          break;
        }
        case 'Action': {
          if (!isTSorTSX)
            throwAnnotationError(annotation, commentedFile, '@Action must be set in a .vue, .ts, or .tsx file');
          const document = out.findOrCreateDocument(sourceURL, compilationItem);
          if (!symbol.interface)
            throwAnnotationError(annotation, commentedFile, '@Action must be set on a class member function');
          const member =
            parsedAnnotation.memberIndex === undefined
              ? undefined
              : symbol.interface!.members[parsedAnnotation.memberIndex];
          if (!member)
            throwAnnotationError(
              annotation,
              commentedFile,
              "Couldn't find the method member for the @Action annotation",
            );
          const action: ValdiAction = { name: member!.name, type: 'javaScript' };
          if (!document.actions.some(item => item.name === action.name && item.type === action.type))
            document.actions.push(action);
          break;
        }
        case 'ViewModel':
        case 'Context': {
          const name = `@${parsedAnnotation.type}`;
          if (!isTSorTSX)
            throwAnnotationError(annotation, commentedFile, `${name} must be set in a .vue, .ts, or .tsx file`);
          if (symbol.kind !== ts.SyntaxKind.InterfaceDeclaration) {
            throwAnnotationError(annotation, commentedFile, `${name} must be on a TypeScript interface`);
          }
          const register =
            parsedAnnotation.type === 'ViewModel' ? manager.addViewModelSymbol : manager.addContextSymbol;
          register.call(manager, sourceURL, commentedFile.src.compilationPath, symbol.text);
          break;
        }
        // The rest are read where they apply (ConstructorOmitted, Injectable: by the model; SingleCall, WorkerThread,
        // AllowSyncCall, Untyped, UntypedMap: by TypeScriptNativeTypeExporter; Version: by the companion's validator).
      }
    } catch (error) {
      out.injectError(error as Error, compilationItem);
    }
  }

  // The compiler then lists each document's exported symbols for the TypeScript it generates from templates, which
  // documents made from .ts/.tsx don't have.

  manager.createCompilationItems(out);
  return out;
}
