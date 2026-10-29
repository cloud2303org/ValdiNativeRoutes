// The annotations in a file's dumped comments: TypeScript/TypeScriptAnnotation.swift, TypeScript/JSDocs.swift,
// TypeScript/TypeScriptCommentedFile.swift, TypeScript/TypeScriptCommentedSymbol.swift and
// Processors/TypeScriptAnnotationsManager.swift (ValdiAnnotationType, validation).
import type { AST, DumpedRootNode } from '../vendor/companion/AST';
import { KotlinValidation } from './kotlin/KotlinValidation';
import { ObjCValidation } from './objc/ObjCValidation';
import {
  CompilerError,
  componentsSeparatedByNewlines,
  trimmed,
  trimmingCharacters,
  WHITESPACES_AND_NEWLINES,
  type TypeScriptItemSrc,
} from './Utils';

/** What the compiler's companion answers for a file: its annotated (or exported) root symbols and the types they use. */
export interface DumpSymbolsWithCommentsResponseBody {
  dumpedSymbols: DumpedRootNode[];
  references: AST.TypeReference[];
}

export const ValdiAnnotationType = {
  generateNativeClass: 'GenerateNativeClass', // Deprecated, use ExportModel
  generateNativeInterface: 'GenerateNativeInterface', // Deprecated, use ExportProxy
  generativeNativeEnum: 'GenerateNativeEnum', // Deprecated, use ExportEnum
  generativeNativeFunction: 'GenerateNativeFunction', // Deprecated, use ExportFunction
  exportModule: 'ExportModule',
  exportModel: 'ExportModel',
  exportProxy: 'ExportProxy',
  exportEnum: 'ExportEnum',
  exportFunction: 'ExportFunction',
  nativeTypeConverter: 'NativeTypeConverter',
  nativeClass: 'NativeClass',
  nativeInterface: 'NativeInterface',
  component: 'Component',
  action: 'Action',
  viewModel: 'ViewModel',
  context: 'Context',
  constructorOmitted: 'ConstructorOmitted',
  nativeTemplateElement: 'NativeTemplateElement',
  injectable: 'Injectable',
  singleCall: 'SingleCall',
  workerThread: 'WorkerThread',
  allowSyncCall: 'AllowSyncCall',
  untypedMap: 'UntypedMap',
  untyped: 'Untyped',
  version: 'Version',
} as const;

export type ValdiAnnotationType = (typeof ValdiAnnotationType)[keyof typeof ValdiAnnotationType];

const ANNOTATION_TYPES = new Set<string>(Object.values(ValdiAnnotationType));

export const parseAnnotationType = (name: string) =>
  ANNOTATION_TYPES.has(name) ? (name as ValdiAnnotationType) : undefined;

/** Annotation types whose ios/android parameters name native types. */
const NATIVE_EXPORT_PARAMETER_TYPES = new Set<ValdiAnnotationType>([
  'ExportModule',
  'GenerateNativeClass',
  'GenerateNativeInterface',
  'GenerateNativeEnum',
  'GenerateNativeFunction',
  'ExportModel',
  'ExportProxy',
  'ExportEnum',
  'ExportFunction',
  'NativeClass',
  'NativeTemplateElement',
  'NativeInterface',
]);

/** JSDocs.allSymbols: tags that look like annotations and aren't. */
const JSDOC_SYMBOLS = new Set([
  'abstract',
  'access',
  'alias',
  'async',
  'augments',
  'author',
  'borrows',
  'callback',
  'class',
  'classdesc',
  'constant',
  'constructs',
  'copyright',
  'default',
  'deprecated',
  'description',
  'enum',
  'event',
  'example',
  'exports',
  'external',
  'file',
  'fires',
  'function',
  'generator',
  'global',
  'hideconstructor',
  'ignore',
  'implements',
  'inheritdoc',
  'inner',
  'instance',
  'interface',
  'kind',
  'lends',
  'license',
  'listens',
  'member',
  'memberof',
  'mixes',
  'mixin',
  'module',
  'name',
  'namespace',
  'override',
  'package',
  'param',
  'private',
  'property',
  'protected',
  'public',
  'readonly',
  'requires',
  'returns',
  'see',
  'since',
  'static',
  'summary',
  'this',
  'throws',
  'todo',
  'tutorial',
  'type',
  'typedef',
  'variation',
  'version',
  'yields',
  'ts-ignore',
  'link',
  'extends',
  'nocollapse',
  'constructor',
  'return',
  'internal',
  'owner',
  'method',
]);

/** Contents of code comments are trimmed of whitespace and a leading `*`. */
const TRIM_CHARACTERS = `${WHITESPACES_AND_NEWLINES}*`;
const QUOTES = /['"«»‘’‚‛”„‟〝〞＂]/u;

const ANNOTATION_REGEX = /@([A-z-]+) *(?:\((?:\{(.*?)\}|\s*(\d+|__PLACEHOLDER__)\s*)\))?/gs;

/** An error pointing at `offset` (UTF-16, as NSRange) in `fileContent`, as CompilerError(range:inDocument:) does. */
export function documentError(message: string, offset: number, fileContent: string, fileName = ''): CompilerError {
  const before = fileContent.slice(0, offset).split('\n');
  return new CompilerError(`${fileName}:${before.length}:${before[before.length - 1].length + 1}: ${message}`);
}

const unquote = (str: string) =>
  (str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"')) ? str.slice(1, -1) : str;

export class ValdiTypeScriptAnnotation {
  constructor(
    readonly name: string,
    readonly parameters: Record<string, string> | undefined,
    readonly positionalPayload: string | undefined,
    /** Where the name is in the file. */
    readonly start: number,
    /** The whole annotation as written, which the comments copied into the native code leave out. */
    readonly content: string,
  ) {}

  /**
   * dropUnrecognized: when true, `@`-tokens whose name is not a known ValdiAnnotationType are skipped before their
   * payload is parsed (enum-case comments are prose).
   */
  static extractAnnotations(
    comments: AST.Comments,
    fileContent: string,
    dropUnrecognized = false,
  ): ValdiTypeScriptAnnotation[] {
    const annotations: ValdiTypeScriptAnnotation[] = [];
    for (const match of comments.text.matchAll(ANNOTATION_REGEX)) {
      const annotationName = match[1];
      // Make sure we aren't parsing jsDocs tags as annotations.
      if (JSDOC_SYMBOLS.has(annotationName)) continue;
      if (dropUnrecognized && parseAnnotationType(annotationName) === undefined) continue;

      const location = comments.start + match.index!;
      let parameters: Record<string, string> | undefined;
      if (match[2] !== undefined) {
        parameters = {};
        // Swift's split(separator:) drops empty pieces.
        for (const property of match[2].split(',').filter(Boolean)) {
          const separatorIndex = property.indexOf(':');
          if (separatorIndex < 0) {
            throw documentError('Cannot parse annotation - missing column separator', location, fileContent);
          }
          const key = unquote(trimmingCharacters(property.slice(0, separatorIndex), TRIM_CHARACTERS));
          const value = unquote(trimmingCharacters(property.slice(separatorIndex + 1), TRIM_CHARACTERS));
          if (QUOTES.test(key) || QUOTES.test(value)) {
            throw documentError(
              'Cannot parse annotation - maybe missing/extra/invalid quote character (\' or ")?',
              location,
              fileContent,
            );
          }
          parameters[key] = value;
        }
      }
      if (match[3] !== undefined && annotationName !== ValdiAnnotationType.version) {
        throw documentError('Only @Version supports a positional annotation payload', location, fileContent);
      }
      annotations.push(new ValdiTypeScriptAnnotation(annotationName, parameters, match[3], location + 1, match[0]));
    }
    return annotations;
  }
}

export class TypeScriptAnnotatedSymbol {
  /** All the annotations found in the leading comments. */
  readonly annotations: ValdiTypeScriptAnnotation[] = [];
  /** All the annotations found on members, by member index. */
  readonly memberAnnotations = new Map<number, ValdiTypeScriptAnnotation[]>();

  constructor(readonly symbol: DumpedRootNode) {}

  addAnnotations(annotations: ValdiTypeScriptAnnotation[]): void {
    this.annotations.push(...annotations);
  }

  addMemberAnnotations(memberAnnotations: ValdiTypeScriptAnnotation[], index: number): void {
    this.memberAnnotations.set(index, [...(this.memberAnnotations.get(index) ?? []), ...memberAnnotations]);
  }

  getAnnotation(annotation: string): ValdiTypeScriptAnnotation | undefined {
    return this.annotations.find(item => item.name === annotation);
  }

  mergedCommentsWithoutAnnotations(): string {
    return TypeScriptAnnotatedSymbol.mergedCommentsWithoutAnnotations(
      this.symbol.leadingComments?.text ?? '',
      this.annotations,
    );
  }

  /** The comment as the native code repeats it: without the annotations, and without the comment markers. */
  static mergedCommentsWithoutAnnotations(fullComments: string, annotations: ValdiTypeScriptAnnotation[]): string {
    let commentsString = fullComments;
    for (const annotation of annotations) commentsString = commentsString.split(annotation.content).join('');
    return TypeScriptAnnotatedSymbol.cleanCommentString(commentsString);
  }

  static cleanCommentString(comment: string): string {
    const characters = `${WHITESPACES_AND_NEWLINES}*/`;
    return trimmed(
      componentsSeparatedByNewlines(comment)
        .map(line => trimmingCharacters(line, characters))
        .join('\n'),
    );
  }
}

export class TypeScriptCommentedFile {
  readonly annotatedSymbols: TypeScriptAnnotatedSymbol[];
  private _references: AST.TypeReference[];

  constructor(
    readonly src: TypeScriptItemSrc,
    readonly fileContent: string,
    dumpedSymbolsResult: DumpSymbolsWithCommentsResponseBody,
  ) {
    this._references = dumpedSymbolsResult.references;
    this.annotatedSymbols = TypeScriptCommentedFile.resolveSymbolsAndAnnotations(
      dumpedSymbolsResult.dumpedSymbols,
      fileContent,
    );
  }

  get references(): readonly AST.TypeReference[] {
    return this._references;
  }

  /** Appends `ref` to the file's reference table if it's not already present, returning its index. */
  appendReferenceIfNeeded(ref: AST.TypeReference): number {
    const index = this._references.findIndex(item => item.name === ref.name && item.fileName === ref.fileName);
    if (index >= 0) return index;
    this._references.push(ref);
    return this._references.length - 1;
  }

  private static resolveSymbolsAndAnnotations(
    dumpedSymbols: DumpedRootNode[],
    fileContent: string,
  ): TypeScriptAnnotatedSymbol[] {
    return dumpedSymbols.map(dumpedSymbol => {
      const annotatedSymbol = new TypeScriptAnnotatedSymbol(dumpedSymbol);
      if (dumpedSymbol.leadingComments) {
        annotatedSymbol.addAnnotations(
          ValdiTypeScriptAnnotation.extractAnnotations(dumpedSymbol.leadingComments, fileContent),
        );

        dumpedSymbol.interface?.members.forEach((member, index) => {
          if (!member.leadingComments) return;
          const memberAnnotations = ValdiTypeScriptAnnotation.extractAnnotations(member.leadingComments, fileContent);
          if (memberAnnotations.length) annotatedSymbol.addMemberAnnotations(memberAnnotations, index);
        });

        dumpedSymbol.enum?.members.forEach((member, index) => {
          if (!member.leadingComments) return;
          const memberAnnotations = ValdiTypeScriptAnnotation.extractAnnotations(
            member.leadingComments,
            fileContent,
            true,
          );
          if (memberAnnotations.length) annotatedSymbol.addMemberAnnotations(memberAnnotations, index);
        });
      }
      return annotatedSymbol;
    });
  }
}

/** The compilation item a TypeScript file is: CompilationItem's fields the annotation processing reads. */
export interface CompilationItem {
  /** The file on disk. */
  sourceURL: string;
  /** `<module>/<path in the module>`: `app_pages/src/Page.ts`. */
  relativeProjectPath: string;
  /** The path in the module: `src/Page.ts`. */
  relativeBundlePath: string;
}

export interface ParsedAnnotation {
  type: ValdiAnnotationType;
  annotation: ValdiTypeScriptAnnotation;
  symbol: TypeScriptAnnotatedSymbol;
  file: TypeScriptCommentedFile;
  compilationItem: CompilationItem;
  memberIndex?: number;
}

export class TypeScriptAnnotationsManager {
  /** By source file, in the order the files were parsed (Swift keeps a dictionary; nothing depends on its order). */
  private records = new Map<string, ParsedAnnotation[]>();

  registerAnnotation(parsedAnnotation: ParsedAnnotation, symbolIndex: number, sourceURL: string): void {
    TypeScriptAnnotationsManager.validateAnnotation(parsedAnnotation, symbolIndex);
    this.records.set(sourceURL, [...(this.records.get(sourceURL) ?? []), parsedAnnotation]);
  }

  listAllAnnotations(): [string, ParsedAnnotation][] {
    return [...this.records].flatMap(([url, annotations]) =>
      annotations.map(annotation => [url, annotation] as [string, ParsedAnnotation]),
    );
  }

  clear(): void {
    this.records.clear();
  }

  /** Throws if the iOS/Android type names in the annotation's parameters contain disallowed characters. */
  static validateAnnotation(parsedAnnotation: ParsedAnnotation, symbolIndex: number): void {
    if (parsedAnnotation.type === ValdiAnnotationType.exportModule && symbolIndex !== 0) {
      throw new CompilerError('@ExportModule must be placed at the top of the file');
    }
    if (NATIVE_EXPORT_PARAMETER_TYPES.has(parsedAnnotation.type)) {
      const ios = parsedAnnotation.annotation.parameters?.ios;
      if (ios !== undefined && !ObjCValidation.isValidIOSTypeName(ios)) {
        throw new CompilerError(`Invalid iOS type name: ${ios}`);
      }
      const android = parsedAnnotation.annotation.parameters?.android;
      if (android !== undefined && !KotlinValidation.isValidAndroidTypeName(android)) {
        throw new CompilerError(`Invalid Android type name: ${android}`);
      }
    }
  }
}
