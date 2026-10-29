// Generation/Cpp/CppCodeGenerator.swift: what the C++ generators share. A type is written as a header and an
// implementation (CppFileGenerator), each with its includes and forward declarations collected while the types are
// parsed: Valdi types map to C++ ones (CppTypeParser), and the generated types they reference are counted for the
// schema's type references. Type names are resolved late, relative to the namespace they're written in.
import { CodeWriter } from '../CodeWriter';
import {
  cppDeclarationString,
  cppFullTypeName,
  CppNamespace,
  resolveCppTypeName,
  type CppType,
  type CppTypeDeclaration,
  type ValdiModelProperty,
  type ValdiModelPropertyType,
} from '../Models';
import type { PropertyNameAllocator } from '../PropertyNameAllocator';
import { CompilerError, pascalCased } from '../Utils';

export interface CppMethodParameter {
  name: string;
  typeNameResolver: CppTypeNameResolver;
}

export interface CppMethod {
  returnTypeNameResolver: CppTypeNameResolver;
  parameters: CppMethodParameter[];
}

/** CPPTypeReference: a type, with the type arguments of a generic one. */
export interface CppTypeReference {
  declaration: CppTypeDeclaration;
  typeArguments?: string[];
}

/** What tells CPPTypeReferences apart (Swift's Hashable). */
const typeReferenceKey = ({ declaration, typeArguments }: CppTypeReference) =>
  JSON.stringify([declaration.namespace.components, declaration.name, declaration.symbolType, typeArguments ?? null]);

export function resolveCppTypeReferenceName(typeReference: CppTypeReference, namespace: CppNamespace): string {
  const name = resolveCppTypeName(typeReference.declaration, namespace);
  return typeReference.typeArguments ? `${name}<${typeReference.typeArguments.join(',')}>` : name;
}

export type CppTypeSpecifier = 'const' | 'ref' | 'rValueRef' | 'ptr';

export const CONST_REF: CppTypeSpecifier[] = ['const', 'ref'];

/** CPPTypeNameResolver: a type's name, as written in a given namespace. */
export class CppTypeNameResolver {
  constructor(readonly resolve: (namespace: CppNamespace) => string) {}

  get description(): string {
    return this.resolve(CppNamespace.root);
  }

  static withTemplateType(templateType: CppTypeNameResolver, typeArguments: CppTypeNameResolver[]) {
    return new CppTypeNameResolver(namespace => {
      const typeArgumentsStr = typeArguments.map(typeArgument => typeArgument.resolve(namespace)).join(', ');
      return `${templateType.resolve(namespace)}<${typeArgumentsStr}>`;
    });
  }

  static withTypeName(typeName: string) {
    return new CppTypeNameResolver(() => typeName);
  }

  static withTypeDeclaration(typeDeclaration: CppTypeDeclaration) {
    return new CppTypeNameResolver(namespace => resolveCppTypeName(typeDeclaration, namespace));
  }

  static withSpecifiers(specifiers: CppTypeSpecifier[], typeNameResolver: CppTypeNameResolver) {
    return new CppTypeNameResolver(namespace => {
      let output = '';
      if (specifiers.includes('const')) output += 'const ';
      output += typeNameResolver.resolve(namespace);
      if (specifiers.includes('ref')) output += ' &';
      else if (specifiers.includes('ptr')) output += ' *';
      else if (specifiers.includes('rValueRef')) output += ' &&';
      return output;
    });
  }
}

export interface CppTypeParser {
  typeNameResolver: CppTypeNameResolver;
  /** For a function property: the interface method it is. */
  method?: CppMethod;
  isMovable: boolean;
  isIntrinsicallyNullable: boolean;
  defaultInitializationString?: string;
}

/** The file's includes, sorted; filled while the file is written. */
export class CppIncludeSection {
  private includedFiles = new Set<string>();

  addInclude(path: string): boolean {
    return this.insert(`"${path}"`);
  }

  addSystemInclude(path: string): boolean {
    return this.insert(`<${path}>`);
  }

  private insert(file: string): boolean {
    if (this.includedFiles.has(file)) return false;
    this.includedFiles.add(file);
    return true;
  }

  get content(): string {
    return [...this.includedFiles]
      .sort()
      .map(file => `#include ${file}\n`)
      .join('');
  }
}

/** The types the file names without including their header, by namespace. */
export class CppForwardDeclarationSection {
  private includedTypes = new Map<string, CppTypeReference>();

  addForwardDeclaration(typeReference: CppTypeReference): void {
    this.includedTypes.set(typeReferenceKey(typeReference), typeReference);
  }

  get content(): string {
    if (!this.includedTypes.size) return '';
    const typeDeclarationsByNamespace = new Map<string, CppTypeReference[]>();
    for (const typeReference of this.includedTypes.values()) {
      const namespace = typeReference.declaration.namespace.description;
      typeDeclarationsByNamespace.set(namespace, [
        ...(typeDeclarationsByNamespace.get(namespace) ?? []),
        typeReference,
      ]);
    }

    const body = new CodeWriter();
    for (const namespace of [...typeDeclarationsByNamespace.keys()].sort()) {
      body.appendBody(`namespace ${namespace} {\n`);
      const types = typeDeclarationsByNamespace
        .get(namespace)!
        .map(({ declaration, typeArguments }) => {
          const declarationString = `${cppDeclarationString(declaration.symbolType)} ${declaration.name};\n`;
          if (!typeArguments) return declarationString;
          return `template<${typeArguments.map(typeArgument => `typename ${typeArgument}`).join(', ')}>\n${declarationString}`;
        })
        .sort();
      for (const type of types) body.appendBody(type);
      body.appendBody('}\n\n');
    }
    return body.content;
  }
}

/** CPPFunctionArgument: `const Valdi::Value &value`. */
export class CppFunctionArgument {
  constructor(
    readonly typeResolver: CppTypeNameResolver,
    readonly name: string,
  ) {}

  resolve(namespace: CppNamespace): string {
    const output = this.typeResolver.resolve(namespace);
    return output.endsWith('*') || output.endsWith('&') ? `${output}${this.name}` : `${output} ${this.name}`;
  }
}

export type CppMethodSpecifiers = 'none' | 'const' | 'static';

/**
 * Writes a class's methods and constructors: declared in the header and defined in the implementation, or defined in
 * the header (templates).
 */
export class CppClassWriter {
  private readonly headerNamespace: CppNamespace;

  constructor(
    readonly namespace: CppNamespace,
    readonly className: string,
    readonly header: CodeWriter,
    readonly impl: CodeWriter,
    readonly inlineImplementation: boolean,
  ) {
    this.headerNamespace = namespace.appending(className);
  }

  private resolveMethodReturnType(namespace: CppNamespace, returnTypeResolver: CppTypeNameResolver): string {
    const returnType = returnTypeResolver.resolve(namespace);
    return returnType.endsWith('*') || returnType.endsWith('&') ? returnType : `${returnType} `;
  }

  private resolveArguments(namespace: CppNamespace, args: CppFunctionArgument[]): string {
    return args.map(argument => argument.resolve(namespace)).join(', ');
  }

  writeMethod(
    name: string,
    args: CppFunctionArgument[],
    returnType: CppTypeNameResolver,
    specifiers: CppMethodSpecifiers,
    writeBody: (writer: CodeWriter) => void,
  ): void {
    if (specifiers === 'static') this.header.appendBody('static ');

    const methodPrefixHeader = this.resolveMethodReturnType(this.headerNamespace, returnType);
    this.header.appendBody(`${methodPrefixHeader}${name}(${this.resolveArguments(this.headerNamespace, args)})`);
    if (specifiers === 'const') this.header.appendBody(' const');
    if (this.inlineImplementation) {
      this.writeMethodImpl(this.header, writeBody);
    } else {
      this.header.appendBody(';\n\n');
      const methodPrefixImpl = this.resolveMethodReturnType(this.namespace, returnType);
      this.impl.appendBody(
        `${methodPrefixImpl}${this.className}::${name}(${this.resolveArguments(this.namespace, args)})`,
      );
      if (specifiers === 'const') this.impl.appendBody(' const');
      this.writeMethodImpl(this.impl, writeBody);
    }
  }

  writeConstructor(
    args: CppFunctionArgument[],
    memberInitializerList: string,
    writeBody: (writer: CodeWriter) => void,
  ): void {
    if (this.inlineImplementation) {
      this.header.appendBody(`${this.className}(${this.resolveArguments(this.headerNamespace, args)})`);
      if (memberInitializerList) this.header.appendBody(`: ${memberInitializerList}`);
      this.writeMethodImpl(this.header, writeBody);
    } else {
      this.header.appendBody(`${this.className}(${this.resolveArguments(this.headerNamespace, args)});\n\n`);
      this.impl.appendBody(`${this.className}::${this.className}(${this.resolveArguments(this.namespace, args)})`);
      if (memberInitializerList) this.impl.appendBody(`: ${memberInitializerList}`);
      this.writeMethodImpl(this.impl, writeBody);
    }
  }

  private writeMethodImpl(writer: CodeWriter, writeBody: (writer: CodeWriter) => void): void {
    writer.appendBody(' {\n');
    writeBody(writer);
    writer.appendBody('}\n\n');
  }
}

const VALDI_NAMESPACE = new CppNamespace(['Valdi']);

/** A header or an implementation: its includes, then its forward declarations and its body in the type's namespace. */
export class CppFileGenerator {
  readonly includeSection = new CppIncludeSection();
  readonly forwardDeclarations = new CppForwardDeclarationSection();
  readonly body = new CodeWriter();

  private readonly writer = new CodeWriter();

  constructor(namespace: CppNamespace, isHeader: boolean) {
    if (isHeader) this.writer.appendHeader('#pragma once\n');
    this.writer.appendHeader(this.includeSection);
    this.writer.appendHeader('\n');

    this.writer.appendBody(this.forwardDeclarations);
    if (!namespace.components.length) {
      this.writer.appendBody(this.body);
    } else {
      this.writer.appendBody(`namespace ${namespace.description} {\n\n`);
      this.writer.appendBody(this.body);
      this.writer.appendBody('\n}');
    }
  }

  get content(): string {
    return this.writer.content;
  }

  static getValdiTypeDeclaration(typeName: string): CppTypeDeclaration {
    return { namespace: VALDI_NAMESPACE, name: typeName, symbolType: 'class' };
  }
}

export interface CppTypeAlias {
  statement: CppTypeNameResolver;
  /** Whether it's a method's (an interface's function property, at the top level). */
  isOnMethod: boolean;
}

/** Where a type alias is declared, so its name is resolved from there. */
export interface CppCodeGeneratorNamespaceResolver {
  getNamespace(typeAlias: CppTypeAlias): CppNamespace;
}

export class CppCodeGeneratorSingleNamespaceResolver implements CppCodeGeneratorNamespaceResolver {
  constructor(private readonly classNamespace: CppNamespace) {}

  getNamespace(): CppNamespace {
    return this.classNamespace;
  }
}

export class CppCodeGenerator {
  readonly header: CppFileGenerator;
  readonly impl: CppFileGenerator;

  private referencedTypesIndex = new Set<string>();
  readonly referencedTypes: CppTypeReference[] = [];
  readonly referenceTypeKeys: string[] = [];
  readonly typealiases: CppTypeAlias[] = [];
  /** The types of the module this one needs defined before it in the combined header. */
  readonly dependenciesInSameHeaderFile: string[] = [];

  constructor(
    namespace: CppNamespace,
    private readonly selfIncludePath: string,
    private readonly namespaceResolver: CppCodeGeneratorNamespaceResolver,
  ) {
    this.header = new CppFileGenerator(namespace, true);
    this.impl = new CppFileGenerator(namespace, false);
  }

  static getValdiTypeName(typeName: string): CppTypeNameResolver {
    return CppTypeNameResolver.withTypeDeclaration(CppFileGenerator.getValdiTypeDeclaration(typeName));
  }

  static makeRefType(typeName: CppTypeNameResolver): CppTypeNameResolver {
    return CppTypeNameResolver.withTemplateType(CppCodeGenerator.getValdiTypeName('Ref'), [typeName]);
  }

  private static resolveGetRegisteredClassExpression(namespace: CppNamespace, typeReference: CppTypeReference): string {
    const resolvedTypeName = resolveCppTypeReferenceName(typeReference, namespace);
    switch (typeReference.declaration.symbolType) {
      case 'class':
        return `${resolvedTypeName}::getRegisteredClass()`;
      case 'enum':
        return `::${typeReference.declaration.namespace.description}::getRegisteredEnumClass(static_cast<const ${resolvedTypeName} *>(nullptr))`;
    }
  }

  /** The lambda returning the registered classes of the referenced types, in their schema order. */
  getTypeReferencesVecExpression(namespace: CppNamespace): string {
    const typeReferencesVecString = this.referencedTypes
      .map(typeReference => CppCodeGenerator.resolveGetRegisteredClassExpression(namespace, typeReference))
      .join(', ');
    return `[]() -> Valdi::TypeReferencesVec {\n    return {${typeReferencesVecString}};\n }`;
  }

  private getPrimitiveTypeParser(
    primitiveType: string,
    isMovable: boolean,
    isIntrinsicallyNullable: boolean,
    defaultInitializationString: string | undefined,
  ): CppTypeParser {
    return {
      typeNameResolver: CppTypeNameResolver.withTypeName(primitiveType),
      isMovable,
      isIntrinsicallyNullable,
      defaultInitializationString,
    };
  }

  private static elementTypeIsObject(elementType: ValdiModelPropertyType): boolean {
    return elementType.kind === 'object' || elementType.kind === 'genericObject';
  }

  private toOptionalTypeParser(elementType: ValdiModelPropertyType, typeParser: CppTypeParser): CppTypeParser {
    if (typeParser.isIntrinsicallyNullable) return typeParser;
    if (CppCodeGenerator.elementTypeIsObject(elementType)) {
      // For optional of object references, we turn them into Ref<> so that we can support circular type references.
      return {
        typeNameResolver: CppCodeGenerator.makeRefType(typeParser.typeNameResolver),
        method: typeParser.method,
        isMovable: true,
        isIntrinsicallyNullable: true,
      };
    }
    return {
      typeNameResolver: CppTypeNameResolver.withTemplateType(CppTypeNameResolver.withTypeName('std::optional'), [
        typeParser.typeNameResolver,
      ]),
      method: typeParser.method,
      isMovable: typeParser.isMovable,
      isIntrinsicallyNullable: true,
    };
  }

  private getArrayTypeParser(
    elementType: ValdiModelPropertyType,
    namePaths: string[],
    nameAllocator: PropertyNameAllocator,
  ): CppTypeParser {
    const elementTypeParser = this.getTypeParser(elementType, [...namePaths, 'Element'], nameAllocator);
    return {
      typeNameResolver: CppTypeNameResolver.withTemplateType(CppTypeNameResolver.withTypeName('std::vector'), [
        elementTypeParser.typeNameResolver,
      ]),
      isMovable: true,
      isIntrinsicallyNullable: false,
    };
  }

  private appendReferencedType(
    referencedType: CppTypeReference,
    propertyType: ValdiModelPropertyType,
    includePath: string,
    isRefType: boolean,
  ): void {
    const fromSameIncludePath = includePath === this.selfIncludePath;
    if (!fromSameIncludePath) this.header.includeSection.addInclude(includePath);

    if (referencedType.typeArguments) {
      const forwardDeclaredTypeArguments = referencedType.typeArguments.map((_, index) => `T${index}`);
      this.header.forwardDeclarations.addForwardDeclaration({
        declaration: referencedType.declaration,
        typeArguments: forwardDeclaredTypeArguments,
      });
    } else {
      this.header.forwardDeclarations.addForwardDeclaration(referencedType);
    }

    const key = typeReferenceKey(referencedType);
    if (this.referencedTypesIndex.has(key)) return;
    this.referencedTypesIndex.add(key);
    if (fromSameIncludePath && !isRefType) {
      // If we are depending on a file in the same header and that the type is not boxed in a Ref, then we have a hard
      // dependency on that type and the referenced type definition needs to appear before our type when using single
      // file codegen.
      this.dependenciesInSameHeaderFile.push(`${referencedType.declaration.name}.hpp`);
    }
    this.referencedTypes.push(referencedType);
    this.referenceTypeKeys.push(CppCodeGenerator.makeCanonicalTypeKey(propertyType));
  }

  private getTypeReferenceTypeParser(
    referencedType: CppType,
    referencedPropertyType: ValdiModelPropertyType,
    isObject: boolean,
    isRefType: boolean,
  ): CppTypeParser {
    this.appendReferencedType(
      { declaration: referencedType.declaration },
      referencedPropertyType,
      referencedType.includePath,
      isRefType,
    );
    const typeNameResolver = CppTypeNameResolver.withTypeDeclaration(referencedType.declaration);
    return {
      typeNameResolver: isRefType ? CppCodeGenerator.makeRefType(typeNameResolver) : typeNameResolver,
      isMovable: isObject,
      isIntrinsicallyNullable: isRefType,
    };
  }

  private getGenericTypeReferenceTypeParser(
    referencedType: CppType,
    referencedPropertyType: ValdiModelPropertyType,
    referenceTypeIsInterface: boolean,
    typeParsers: CppTypeParser[],
  ): CppTypeParser {
    const typeReference: CppTypeReference = {
      declaration: referencedType.declaration,
      typeArguments: typeParsers.map(typeParser => typeParser.typeNameResolver.resolve(CppNamespace.root)),
    };
    this.appendReferencedType(typeReference, referencedPropertyType, referencedType.includePath, false);

    const typeNameResolver = CppTypeNameResolver.withTemplateType(
      CppTypeNameResolver.withTypeDeclaration(referencedType.declaration),
      typeParsers.map(typeParser => typeParser.typeNameResolver),
    );
    return {
      typeNameResolver: referenceTypeIsInterface ? CppCodeGenerator.makeRefType(typeNameResolver) : typeNameResolver,
      isMovable: true,
      isIntrinsicallyNullable: referenceTypeIsInterface,
    };
  }

  private getUntypedTypeParser(): CppTypeParser {
    this.header.includeSection.addInclude('valdi_core/cpp/Utils/Value.hpp');
    return {
      typeNameResolver: CppCodeGenerator.getValdiTypeName('Value'),
      isMovable: true,
      isIntrinsicallyNullable: true,
    };
  }

  private getPromiseTypeParser(valueTypeParser: CppTypeParser): CppTypeParser {
    this.header.includeSection.addInclude('valdi_core/cpp/Utils/Future.hpp');
    return {
      typeNameResolver: CppTypeNameResolver.withTemplateType(CppCodeGenerator.getValdiTypeName('Future'), [
        valueTypeParser.typeNameResolver,
      ]),
      isMovable: true,
      isIntrinsicallyNullable: false,
    };
  }

  /**
   * A function type, as a type alias of a Valdi::Function named after where it is (`OnChangeFn`); at the top level
   * (a property), also the method an interface declares for it.
   */
  private getFunctionTypeParser(
    parameters: ValdiModelProperty[],
    returnType: ValdiModelPropertyType,
    namePaths: string[],
    nameAllocator: PropertyNameAllocator,
  ): CppTypeParser {
    this.header.includeSection.addInclude('valdi_core/cpp/Utils/Function.hpp');

    const returnTypeParser = this.getTypeParser(returnType, [...namePaths, 'Return'], nameAllocator);
    const parameterTypeParsers = parameters.map(
      parameter =>
        [parameter.name, this.getTypeParser(parameter.type, [...namePaths, parameter.name], nameAllocator)] as const,
    );
    const parameterTypeNameResolvers = parameterTypeParsers.map(([, typeParser]) => typeParser.typeNameResolver);
    const typealiasFunctionName = nameAllocator.allocate([...namePaths, 'Fn'].map(pascalCased).join('')).name;

    const functionType = CppCodeGenerator.getValdiTypeName('Function');
    const returnTypeNameResolver = returnTypeParser.typeNameResolver;
    const realTypeNameResolver = CppTypeNameResolver.withTemplateType(functionType, [
      new CppTypeNameResolver(namespace => {
        const returnTypeName = returnTypeNameResolver.resolve(namespace);
        const parameterTypeNames = parameterTypeNameResolvers.map(resolver => resolver.resolve(namespace)).join(', ');
        return `${returnTypeName}(${parameterTypeNames})`;
      }),
    ]);

    const cppMethod: CppMethod | undefined =
      namePaths.length === 1
        ? {
            returnTypeNameResolver,
            parameters: parameterTypeParsers.map(([name, typeParser]) => ({
              name,
              typeNameResolver: typeParser.typeNameResolver,
            })),
          }
        : undefined;

    const typeAlias: CppTypeAlias = {
      statement: new CppTypeNameResolver(
        namespace => `using ${typealiasFunctionName} = ${realTypeNameResolver.resolve(namespace)};\n`,
      ),
      isOnMethod: cppMethod !== undefined,
    };
    this.typealiases.push(typeAlias);

    const namespace = this.namespaceResolver.getNamespace(typeAlias);
    return {
      typeNameResolver: CppTypeNameResolver.withTypeDeclaration({
        namespace,
        name: typealiasFunctionName,
        symbolType: 'class',
      }),
      method: cppMethod,
      isMovable: true,
      isIntrinsicallyNullable: false,
    };
  }

  /** What identifies a referenced type in the schema's type references. */
  static makeCanonicalTypeKey(type: ValdiModelPropertyType): string {
    switch (type.kind) {
      case 'string':
      case 'double':
      case 'bool':
      case 'long':
      case 'bytes':
      case 'map':
      case 'any':
      case 'void':
        return type.kind;
      case 'array':
        return `[${CppCodeGenerator.makeCanonicalTypeKey(type.elementType)}]`;
      case 'function': {
        const parameterStrings = type.parameters
          .map(parameter => CppCodeGenerator.makeCanonicalTypeKey(parameter.type))
          .join(', ');
        return `(${parameterStrings}): ${CppCodeGenerator.makeCanonicalTypeKey(type.returnType)}`;
      }
      case 'object':
      case 'enum':
        if (!type.mapping.isGenerated) return 'any';
        return type.mapping.cppType ? cppFullTypeName(type.mapping.cppType.declaration) : 'any';
      case 'genericTypeParameter':
        return type.name;
      case 'genericObject': {
        if (!type.mapping.isGenerated) return 'any';
        const objectType = type.mapping.cppType ? cppFullTypeName(type.mapping.cppType.declaration) : 'any';
        const str = type.typeArguments
          .map(typeArgument => CppCodeGenerator.makeCanonicalTypeKey(typeArgument))
          .join(', ');
        return `${objectType}<${str}>`;
      }
      case 'promise':
        return `promise<${CppCodeGenerator.makeCanonicalTypeKey(type.typeArgument)}>`;
      case 'nullable':
        return `${CppCodeGenerator.makeCanonicalTypeKey(type.type)}?`;
    }
  }

  getTypeParser(
    type: ValdiModelPropertyType,
    namePaths: string[],
    nameAllocator: PropertyNameAllocator,
  ): CppTypeParser {
    switch (type.kind) {
      case 'string':
        this.header.includeSection.addInclude('valdi_core/cpp/Utils/StringBox.hpp');
        return {
          typeNameResolver: CppCodeGenerator.getValdiTypeName('StringBox'),
          isMovable: true,
          isIntrinsicallyNullable: false,
        };
      case 'double':
        return this.getPrimitiveTypeParser('double', false, false, '0.0');
      case 'bool':
        return this.getPrimitiveTypeParser('bool', false, false, 'false');
      case 'long':
        return this.getPrimitiveTypeParser('int64_t', false, false, '0');
      case 'array':
        return this.getArrayTypeParser(type.elementType, namePaths, nameAllocator);
      case 'bytes':
        this.header.includeSection.addInclude('valdi_core/cpp/Utils/Bytes.hpp');
        return {
          typeNameResolver: CppCodeGenerator.getValdiTypeName('BytesView'),
          isMovable: true,
          isIntrinsicallyNullable: false,
        };
      case 'map':
        this.header.includeSection.addInclude('valdi_core/cpp/Utils/ValueMap.hpp');
        return {
          typeNameResolver: CppCodeGenerator.makeRefType(CppCodeGenerator.getValdiTypeName('ValueMap')),
          isMovable: true,
          isIntrinsicallyNullable: true,
        };
      case 'any':
        return this.getUntypedTypeParser();
      case 'void':
        return {
          typeNameResolver: CppTypeNameResolver.withTypeName('void'),
          isMovable: false,
          isIntrinsicallyNullable: false,
        };
      case 'function':
        return this.getFunctionTypeParser(type.parameters, type.returnType, namePaths, nameAllocator);
      case 'object': {
        const objectType = type.mapping;
        // No support for @NativeClass and @NativeInterface for now: they're exported as untyped.
        if (!objectType.isGenerated) return this.getUntypedTypeParser();
        if (!objectType.cppType)
          throw new CompilerError(`No C++ type declared for referenced type ${objectType.tsType}`);
        return this.getTypeReferenceTypeParser(objectType.cppType, type, true, objectType.kind === 'interface');
      }
      case 'genericTypeParameter':
        return {
          typeNameResolver: CppTypeNameResolver.withTypeName(type.name),
          isMovable: true,
          isIntrinsicallyNullable: false,
          defaultInitializationString: '{}',
        };
      case 'genericObject': {
        const objectType = type.mapping;
        // No support for @NativeClass and @NativeInterface for now: they're exported as untyped.
        if (!objectType.isGenerated) return this.getUntypedTypeParser();
        if (!objectType.cppType)
          throw new CompilerError(`No C++ type declared for referenced type ${objectType.tsType}`);
        const typeParsers = type.typeArguments.map(typeArgument =>
          this.getTypeParser(typeArgument, namePaths, nameAllocator),
        );
        return this.getGenericTypeReferenceTypeParser(
          objectType.cppType,
          type,
          objectType.kind === 'interface',
          typeParsers,
        );
      }
      case 'promise':
        return this.getPromiseTypeParser(this.getTypeParser(type.typeArgument, namePaths, nameAllocator));
      case 'enum': {
        const enumType = type.mapping;
        // No support for @NativeClass and @NativeInterface for now: they're exported as untyped.
        if (!enumType.isGenerated) return this.getUntypedTypeParser();
        if (!enumType.cppType) throw new CompilerError(`No C++ type declared for referenced enum ${enumType.tsType}`);
        return this.getTypeReferenceTypeParser(enumType.cppType, type, false, false);
      }
      case 'nullable': {
        // Nullable objects become Ref<>, which only needs a forward declaration: they're handled here, before the
        // recursive getTypeParser registers a hard dependency. The element type is the referenced property type, for
        // consistent canonical type keys.
        const elementType = type.type;
        if (elementType.kind === 'object') {
          const objectType = elementType.mapping;
          if (!objectType.isGenerated) return this.getUntypedTypeParser();
          if (!objectType.cppType) {
            throw new CompilerError(`No C++ type declared for referenced type ${objectType.tsType}`);
          }
          return this.getTypeReferenceTypeParser(objectType.cppType, elementType, true, true);
        }
        if (elementType.kind === 'genericObject') {
          const objectType = elementType.mapping;
          if (!objectType.isGenerated) return this.getUntypedTypeParser();
          if (!objectType.cppType) {
            throw new CompilerError(`No C++ type declared for referenced type ${objectType.tsType}`);
          }
          const typeParsers = elementType.typeArguments.map(typeArgument =>
            this.getTypeParser(typeArgument, namePaths, nameAllocator),
          );
          return this.getGenericTypeReferenceTypeParser(objectType.cppType, elementType, true, typeParsers);
        }
        return this.toOptionalTypeParser(elementType, this.getTypeParser(elementType, namePaths, nameAllocator));
      }
    }
  }
}
