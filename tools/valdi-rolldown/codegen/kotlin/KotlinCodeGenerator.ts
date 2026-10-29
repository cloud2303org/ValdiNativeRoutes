// Generation/Kotlin/KotlinCodeGenerator.swift, with what it uses from the same directory (JVMClass.swift,
// KotlinEmittedTypeReferences.swift, KotlinSchemaWriter.swift): a Kotlin file's writer, which imports the classes it
// names, maps Valdi types to Kotlin ones and writes the @ValdiClass-style descriptor annotations.
import { CodeWriter, contentOf, EmittedIdentifiers, type CodeWriterContent } from '../CodeWriter';
import {
  isOptional,
  unwrappingOptional,
  type BundleInfo,
  type NativeSource,
  type ValdiModelProperty,
  type ValdiModelPropertyType,
  type ValdiNodeClassMapping,
  type ValdiTypeParameter,
} from '../Models';
import type { PropertyName, PropertyNameAllocator } from '../PropertyNameAllocator';
import { SchemaWriter, type SchemaWriterListener } from '../SchemaWriter';
import { CompilerError } from '../Utils';

export class JVMClass {
  readonly name: string;
  readonly package?: string;

  constructor(readonly fullClassName: string) {
    // Swift's split(separator:) drops empty components.
    const components = fullClassName.split('.').filter(Boolean);
    if (components.length > 1) {
      this.name = components[components.length - 1];
      this.package = components.slice(0, -1).join('.');
    } else {
      this.name = fullClassName;
    }
  }

  get filePath(): string {
    return this.fullClassName.split('.').filter(Boolean).slice(0, -1).join('/');
  }
}

export class KotlinTypeParser {
  readonly fullTypeName: string;

  constructor(
    readonly typeName: string,
    readonly functionTypeParser?: KotlinFunctionTypeParser,
    readonly typeArguments?: KotlinTypeParser[],
  ) {
    this.fullTypeName = KotlinTypeParser.getFullTypeName(typeName, typeArguments);
  }

  private static getFullTypeName(typeName: string, typeArguments: KotlinTypeParser[] | undefined): string {
    if (!typeArguments) return typeName;
    const optional = typeName.endsWith('?');
    const withoutOptionalMark = optional ? typeName.slice(0, -1) : typeName;
    return `${withoutOptionalMark}<${typeArguments.map(argument => argument.fullTypeName).join(', ')}>${optional ? '?' : ''}`;
  }
}

export class KotlinFunctionTypeParser {
  constructor(
    readonly parameterNames: PropertyName[],
    readonly parameterTypes: KotlinTypeParser[],
    readonly returnType: KotlinTypeParser,
  ) {}

  get parametersString(): string {
    return this.parameterNames
      .map((name, index) => `${name.name}: ${this.parameterTypes[index].fullTypeName}`)
      .join(', ');
  }

  get lambdaTypeName(): string {
    return `(${this.parametersString}) -> ${this.returnType.fullTypeName}`;
  }

  get methodTypeName(): string {
    return `(${this.parametersString}): ${this.returnType.fullTypeName}`;
  }
}

/** The file's imports, sorted; filled while the file is written, after this section's place in it is taken. */
class KotlinImportSection {
  readonly importedClasses = new Set<string>();

  addImport(fullClassName: string): void {
    this.importedClasses.add(fullClassName);
  }

  get content(): string {
    if (!this.importedClasses.size) return '';
    return (
      [...this.importedClasses]
        .sort()
        .map(name => `import ${name}\n`)
        .join('') + '\n'
    );
  }
}

export class KotlinEmittedTypeReferences extends EmittedIdentifiers {
  // An index used anywhere other than a deferrable function return position is "eager" and must always be walked.
  // The lazy set is the deferrable-return candidates minus eager: references reachable ONLY through deferred returns.
  private eagerIndices = new Set<number>();
  private deferrableReturnIndices = new Set<number>();

  recordUsage(index: number, inDeferrableReturnType: boolean): void {
    (inDeferrableReturnType ? this.deferrableReturnIndices : this.eagerIndices).add(index);
  }

  get lazyReturnIndices(): number[] {
    return [...this.deferrableReturnIndices].filter(index => !this.eagerIndices.has(index)).sort((a, b) => a - b);
  }

  get content(): string {
    return `[${this.identifiers.map(identifier => `${identifier}::class`).join(', ')}]`;
  }
}

/** The `lazyReturnTypeReferences` value; empty (so the parameter is omitted) when there are no lazy-only returns. */
class KotlinLazyReturnTypeReferences {
  constructor(private readonly typeReferences: KotlinEmittedTypeReferences) {}

  get content(): string {
    const indices = this.typeReferences.lazyReturnIndices;
    return indices.length ? `[${indices.join(', ')}]` : '';
  }
}

class KotlinSchemaWriterListener implements SchemaWriterListener {
  // Nesting depth of deferrable-return positions being written: > 0 means the reference being emitted is reachable
  // only via a lazily-resolved return.
  private deferrableReturnDepth = 0;

  constructor(
    private readonly codeGenerator: KotlinCodeGenerator,
    private readonly emittedTypeReferences: KotlinEmittedTypeReferences,
  ) {}

  getClassName(nodeMapping: ValdiNodeClassMapping): string {
    if (nodeMapping.androidClassName === undefined) throw new CompilerError('No Android type declared');
    const jvmClass = this.codeGenerator.importClass(nodeMapping.androidClassName);
    const identifierIndex = this.emittedTypeReferences.getIdentifierIndex(jvmClass.name);
    this.emittedTypeReferences.recordUsage(identifierIndex, this.deferrableReturnDepth > 0);
    return `[${identifierIndex}]`;
  }

  enterDeferrableReturnType(): void {
    this.deferrableReturnDepth += 1;
  }

  exitDeferrableReturnType(): void {
    this.deferrableReturnDepth -= 1;
  }
}

/** `@Name(a = v1, b = v2)`, rendered late; parameters rendering empty are left out. */
class KotlinAnnotationContent {
  constructor(
    private readonly name: string,
    private readonly parameters: [string, CodeWriterContent][],
  ) {}

  get content(): string {
    const rendered = this.parameters
      .map(([name, content]) => [name, contentOf(content)] as const)
      .filter(([, value]) => value !== '');
    let out = `@${this.name}`;
    if (rendered.length === 1) {
      out += `(${rendered[0][0]} = ${rendered[0][1]})`;
    } else if (rendered.length > 1) {
      out += '(' + rendered.map(([name, value]) => `\n    ${name} = ${value}`).join(',') + '\n)';
    }
    return out;
  }
}

class KotlinPropertyReplacements {
  readonly replacements: [number, string][] = [];

  get content(): string {
    return `"${this.replacements.map(([index, name]) => `${index}:'${name}'`).join(',')}"`;
  }
}

/** KotlinSchemaWriter.swift: function parameters and return values are always boxed, int enums never. */
class KotlinSchemaWriter extends SchemaWriter {
  constructor(typeParameters: ValdiTypeParameter[] | undefined, listener: SchemaWriterListener) {
    super(typeParameters, listener, true, false);
  }
}

class KotlinSchema {
  readonly schemaWriter: KotlinSchemaWriter;

  constructor(typeParameters: ValdiTypeParameter[] | undefined, listener: SchemaWriterListener) {
    this.schemaWriter = new KotlinSchemaWriter(typeParameters, listener);
  }

  get content(): string {
    return `"${this.schemaWriter.str}"`;
  }
}

export type KotlinDescriptorObjectType = 'valdiClass' | 'valdiInterface' | 'stringEnum' | 'intEnum' | 'valdiFunction';

/** A class's descriptor annotation, whose schema and type references grow as its fields are appended. */
export class KotlinMarshallableObjectDescriptorAnnotation extends CodeWriter {
  private readonly schema: KotlinSchema;
  private readonly emittedTypeReferences = new KotlinEmittedTypeReferences();
  private readonly propertyReplacements = new KotlinPropertyReplacements();

  constructor(
    readonly type: KotlinDescriptorObjectType,
    private readonly generator: KotlinCodeGenerator,
    typeParameters: ValdiTypeParameter[] | undefined,
    additionalParameters: [string, CodeWriterContent][],
  ) {
    super();
    this.schema = new KotlinSchema(
      typeParameters,
      new KotlinSchemaWriterListener(generator, this.emittedTypeReferences),
    );

    const allParameters: [string, CodeWriterContent][] = [['schema', this.schema]];
    // Rendered after the schema is written (left out when empty). Only classes with typeReferences have lazy returns.
    const lazyReturnTypeReferences = new KotlinLazyReturnTypeReferences(this.emittedTypeReferences);
    let annotationName: string;
    switch (type) {
      case 'valdiClass':
      case 'valdiInterface':
      case 'valdiFunction':
        annotationName = {
          valdiClass: 'ValdiClass',
          valdiInterface: 'ValdiInterface',
          valdiFunction: 'ValdiFunctionClass',
        }[type];
        allParameters.push(
          ['typeReferences', this.emittedTypeReferences],
          ['propertyReplacements', this.propertyReplacements],
          ['lazyReturnTypeReferences', lazyReturnTypeReferences],
        );
        break;
      case 'stringEnum':
      case 'intEnum':
        annotationName = 'ValdiEnum';
        allParameters.push(['propertyReplacements', this.propertyReplacements]);
        break;
    }
    allParameters.push(...additionalParameters);

    this.appendBody(generator.getJavaAnnotationContent(`com.snap.valdi.schema.${annotationName}`, allParameters));
  }

  appendField(
    propertyIndex: number,
    propertyName: string,
    kotlinFieldName: string,
    expectedKotlinFieldName: string,
    schemaBuilder: (schemaWriter: SchemaWriter) => void,
  ): CodeWriterContent {
    if (propertyIndex > 0) this.schema.schemaWriter.appendComma();
    // Kotlin field name cannot be inferred, add an entry in the mapping array.
    if (kotlinFieldName !== expectedKotlinFieldName)
      this.propertyReplacements.replacements.push([propertyIndex, kotlinFieldName]);
    this.schema.schemaWriter.appendPropertyName(propertyName);
    schemaBuilder(this.schema.schemaWriter);
    return this.generator.getJavaAnnotationContent('com.snap.valdi.schema.ValdiField');
  }
}

export class KotlinCodeGenerator extends CodeWriter {
  static readonly maxFunctionParametersCount = 16;

  private readonly importSection = new KotlinImportSection();

  constructor(private readonly package_?: string) {
    super();
    if (package_ !== undefined) this.appendHeader(`package ${package_}\n\n`);
    this.appendHeader(this.importSection);
  }

  private importClassIfNeeded(jvmClass: JVMClass): void {
    if (this.package_ !== undefined && jvmClass.package === this.package_) return;
    this.importSection.addImport(jvmClass.fullClassName);
  }

  importClass(className: string): JVMClass {
    if (!className) throw new CompilerError('No class defined');
    const jvmClass = new JVMClass(className);
    this.importClassIfNeeded(jvmClass);
    return jvmClass;
  }

  private resolveTypeName(typeName: string, optional: boolean): string {
    return optional ? `${typeName}?` : typeName;
  }

  private getPrimitiveTypeParser(primitiveType: string, optional: boolean): KotlinTypeParser {
    return new KotlinTypeParser(this.resolveTypeName(primitiveType, optional));
  }

  getJavaAnnotationContent(annotationType: string, parameters: [string, CodeWriterContent][] = []): CodeWriterContent {
    const annotationClassType = this.importClass(annotationType);
    const output = new CodeWriter();
    // Rendered late (after the schema is written) so params only known then are included.
    output.appendBody(new KotlinAnnotationContent(annotationClassType.name, parameters));
    output.appendBody('\n');
    return output;
  }

  getDescriptorAnnotation(
    type: KotlinDescriptorObjectType,
    typeParameters: ValdiTypeParameter[] | undefined,
    additionalParameters: [string, CodeWriterContent][],
  ): KotlinMarshallableObjectDescriptorAnnotation {
    return new KotlinMarshallableObjectDescriptorAnnotation(type, this, typeParameters, additionalParameters);
  }

  private getFunctionTypeParser(
    returnType: ValdiModelPropertyType,
    parameters: ValdiModelProperty[],
    nameAllocator: PropertyNameAllocator,
  ): KotlinFunctionTypeParser {
    if (parameters.length > KotlinCodeGenerator.maxFunctionParametersCount) {
      throw new CompilerError(
        `Exported functions to Kotlin can only support up to ${KotlinCodeGenerator.maxFunctionParametersCount} parameters.`,
      );
    }
    const parameterNames = parameters.map(parameter => nameAllocator.allocate(parameter.name));
    const parameterParsers = parameters.map(parameter =>
      this.getTypeParser(unwrappingOptional(parameter.type), isOptional(parameter.type), undefined, nameAllocator),
    );
    const returnParser = this.getTypeParser(
      unwrappingOptional(returnType),
      isOptional(returnType),
      undefined,
      nameAllocator,
    );
    return new KotlinFunctionTypeParser(parameterNames, parameterParsers, returnParser);
  }

  getTypeParser(
    type: ValdiModelPropertyType,
    optional: boolean,
    propertyName: string | undefined,
    nameAllocator: PropertyNameAllocator,
  ): KotlinTypeParser {
    switch (type.kind) {
      case 'string':
        return this.getPrimitiveTypeParser('String', optional);
      case 'double':
        return this.getPrimitiveTypeParser('Double', optional);
      case 'bool':
        return this.getPrimitiveTypeParser('Boolean', optional);
      case 'long':
        return this.getPrimitiveTypeParser('Long', optional);
      case 'array': {
        const element = type.elementType;
        const childParser = this.getTypeParser(
          unwrappingOptional(element),
          isOptional(element),
          undefined,
          nameAllocator,
        );
        return new KotlinTypeParser(this.resolveTypeName(`List<${childParser.fullTypeName}>`, optional));
      }
      case 'bytes':
        return this.getPrimitiveTypeParser('ByteArray', optional);
      case 'map':
        return new KotlinTypeParser(this.resolveTypeName('Map<String, Any?>', optional));
      case 'any':
        return new KotlinTypeParser(this.resolveTypeName('Any', true));
      case 'void':
        return new KotlinTypeParser('Unit');
      case 'function': {
        const functionTypeParser = this.getFunctionTypeParser(type.returnType, type.parameters, nameAllocator);
        const typeName = functionTypeParser.lambdaTypeName;
        return new KotlinTypeParser(optional ? `(${typeName})?` : typeName, functionTypeParser);
      }
      case 'enum':
      case 'object': {
        if (type.mapping.androidClassName === undefined) {
          throw new CompilerError(type.kind === 'enum' ? 'No android type declared' : 'No android class declared');
        }
        return new KotlinTypeParser(
          this.resolveTypeName(this.importClass(type.mapping.androidClassName).name, optional),
        );
      }
      case 'genericTypeParameter':
        // Properties with generic parameter types have to always accept optional values.
        return new KotlinTypeParser(this.resolveTypeName(type.name, propertyName !== undefined || optional));
      case 'genericObject': {
        if (type.mapping.androidClassName === undefined) throw new CompilerError('No android class declared');
        const typeArgumentsTypeParsers = type.typeArguments.map(argument =>
          this.getTypeParser(argument, false, undefined, nameAllocator),
        );
        const typeName = this.importClass(type.mapping.androidClassName).name;
        return new KotlinTypeParser(this.resolveTypeName(typeName, optional), undefined, typeArgumentsTypeParsers);
      }
      case 'promise': {
        const promiseTypeName = this.importClass('com.snap.valdi.promise.Promise').name;
        const argument = type.typeArgument;
        const childParser = this.getTypeParser(
          unwrappingOptional(argument),
          isOptional(argument),
          undefined,
          nameAllocator,
        );
        return this.getPrimitiveTypeParser(`${promiseTypeName}<${childParser.fullTypeName}>`, optional);
      }
      case 'nullable':
        return this.getTypeParser(type.type, true, propertyName, nameAllocator);
    }
  }

  static makeNativeSource(
    bundleInfo: BundleInfo,
    jvmClass: JVMClass,
    content: string,
    fileNameOverride?: string,
  ): NativeSource {
    return {
      relativePath: jvmClass.filePath,
      filename: fileNameOverride ?? `${jvmClass.name}.kt`,
      content,
      groupingIdentifier: `${bundleInfo.name}.kt`,
      groupingPriority: 0,
      localFilenameDependencies: [],
    };
  }
}
