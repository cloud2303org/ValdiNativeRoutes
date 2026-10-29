// What annotation processing produces for the generators, as the compiler's CompilationItem kinds
// (Pipeline/CompilationItem.swift): component documents, exported types and dependency injection metadata; and
// DocumentsIndexer (Processors/TypeScriptProcessingUtils.swift), which finds a file's document.
import type { ExportedType, ValdiModel, ValdiNodeClassMapping } from './Models';
import type { CompilationItem } from './TypeScriptAnnotation';
import type { ComponentPath, GeneratedSourceFilename } from './Utils';

export interface ValdiAction {
  name: string;
  type: 'native' | 'javaScript';
}

/**
 * ValdiRawDocument, for documents made from TypeScript: they have no template, so their root node type is '' (the
 * key of the root's class mapping) and their only actions are @Action members.
 */
export interface ValdiRawDocument {
  viewModel?: ValdiModel;
  componentContext?: ValdiNodeClassMapping;
  additionalModels: ValdiModel[];
  /** ValdiClassMapping.nodeMappingByClass. */
  classMapping?: Map<string, ValdiNodeClassMapping>;
}

/** CompilationResult, with TemplateCompilerResult's actions. */
export interface CompilationResult {
  componentPath: ComponentPath;
  originalDocument: ValdiRawDocument;
  actions: ValdiAction[];
}

export type CompilationItemKind =
  | { kind: 'document'; result: CompilationResult }
  | { kind: 'exportedType'; exportedType: ExportedType; sourceFilename: GeneratedSourceFilename }
  | { kind: 'exportedDependencyMetadata'; model: ValdiModel; sourceFilename: GeneratedSourceFilename };

export type Item = { item: CompilationItem } & CompilationItemKind;

export class DocumentsIndexer {
  readonly items: Item[] = [];
  /** The errors annotation processing injected; any fails the generation. */
  readonly errors: Error[] = [];
  private documentBySourceURL = new Map<string, CompilationResult>();

  append(item: Item): void {
    if (item.kind === 'document') this.documentBySourceURL.set(item.item.sourceURL, item.result);
    this.items.push(item);
  }

  findDocument(sourceURL: string): CompilationResult | undefined {
    return this.documentBySourceURL.get(sourceURL);
  }

  /** The file's document, made up if it has none: a .ts/.tsx file's @Component or @Action makes one. */
  findOrCreateDocument(sourceURL: string, compilationItem: CompilationItem): CompilationResult {
    const found = this.findDocument(sourceURL);
    if (found) return found;
    const result: CompilationResult = {
      componentPath: {
        fileName: `__TMP__(${compilationItem.relativeProjectPath})`,
        exportedMember: '__EXPORTED_MEMBER__',
      },
      originalDocument: { additionalModels: [] },
      actions: [],
    };
    this.append({ item: compilationItem, kind: 'document', result });
    return result;
  }

  injectError(error: Error, relatedItem: CompilationItem): void {
    this.errors.push(new Error(`${relatedItem.relativeProjectPath}: ${error.message}`, { cause: error }));
  }
}
