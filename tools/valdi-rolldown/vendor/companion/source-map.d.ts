// Types for source-map 0.5.7, which has none: the part SourceMapUtils uses, as DefinitelyTyped's @types/source-map
// (which Valdi's companion builds with) declares it. Not a dependency here, so files type-checking the companion's code
// under --strict reference this.
declare module 'source-map' {
  namespace SourceMap {
    interface RawSourceMap {
      version: number;
      sources: string[];
      names: string[];
      sourceRoot?: string;
      sourcesContent?: string[];
      mappings: string;
      file: string;
    }

    interface Position {
      line: number;
      column: number;
    }

    interface MappedPosition extends Position {
      source: string;
      name?: string;
    }

    interface MappingItem {
      source: string;
      generatedLine: number;
      generatedColumn: number;
      originalLine: number;
      originalColumn: number;
      name: string;
    }

    interface Mapping {
      generated: Position;
      original: Position;
      source: string;
      name?: string;
    }

    class SourceMapConsumer {
      constructor(rawSourceMap: RawSourceMap | string);
      originalPositionFor(generatedPosition: Position & { bias?: number }): MappedPosition;
      generatedPositionFor(originalPosition: MappedPosition & { bias?: number }): Position;
      eachMapping(callback: (mapping: MappingItem) => void, context?: unknown, order?: number): void;
    }

    class SourceMapGenerator {
      constructor(startOfSourceMap?: { file?: string; sourceRoot?: string; skipValidation?: boolean });
      addMapping(mapping: Mapping): void;
      setSourceContent(sourceFile: string, sourceContent: string): void;
      toString(): string;
    }
  }

  export = SourceMap;
}
