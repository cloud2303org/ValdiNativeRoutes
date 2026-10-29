// Generation/CodeWriter.swift and Generation/EmittedIdentifiers.swift. Generators build their output from content
// rendered late: an annotation's schema and type references are filled in while the class body is written after it.

/** CodeWriterContent: a String, or anything rendering one when the writer's content is read. */
export type CodeWriterContent = string | { readonly content: string };

export const contentOf = (content: CodeWriterContent) => (typeof content === 'string' ? content : content.content);

/** Contents joined by a separator. */
export class JoinedContent {
  private items: CodeWriterContent[] = [];

  constructor(private readonly separator: string) {}

  append(content: CodeWriterContent): void {
    this.items.push(content);
  }

  get content(): string {
    return this.items.map(contentOf).join(this.separator);
  }
}

export class CodeWriter {
  /** A terminator string to add if the content was not empty. */
  nonEmptyTerminator = '';

  private headers: CodeWriterContent[] = [];
  private body: CodeWriterContent[] = [];

  get content(): string {
    let output = [...this.headers, ...this.body].map(contentOf).join('');
    if (output) output += this.nonEmptyTerminator;
    return output;
  }

  appendHeader(str: CodeWriterContent): void {
    this.headers.push(str);
  }

  prependHeader(str: CodeWriterContent): void {
    this.headers.unshift(str);
  }

  prependBody(str: CodeWriterContent): void {
    this.body.unshift(str);
  }

  appendBody(str: CodeWriterContent): void {
    this.body.push(str);
  }
}

export class EmittedIdentifiers {
  private _identifiers: string[] = [];
  private indexByIdentifier = new Map<string, number>();

  get isEmpty(): boolean {
    return this.indexByIdentifier.size === 0;
  }

  get identifiers(): readonly string[] {
    return this._identifiers;
  }

  getIdentifierIndex(identifier: string): number {
    const existing = this.indexByIdentifier.get(identifier);
    if (existing !== undefined) return existing;
    const index = this._identifiers.length;
    this.indexByIdentifier.set(identifier, index);
    this._identifiers.push(identifier);
    return index;
  }
}
