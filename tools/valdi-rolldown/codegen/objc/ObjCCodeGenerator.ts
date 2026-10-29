// Generation/ObjC/ObjCCodeGenerator.swift, with NativeSource.iosNativeSourcesFromGeneratedCode (Models/NativeSource.swift):
// what the ObjC generators share. Each type is written as four files: its API header and implementation (the class or
// protocol, combined into app_pagesTypes.h/.m) and its utilities header and implementation (marshall functions,
// combined into app_pages.h/.m); the type parser gives each property's declaration, registering what it needs (imports,
// forward declarations, block typedefs, trampolines) on the way.
import { CodeWriter, JoinedContent } from '../CodeWriter';
import {
  API_ONLY_MODULE_NAME_SUFFIX,
  importHeaderFilename,
  importHeaderStatement,
  includesGenericType,
  IOS_GROUPING_PRIORITY,
  isOptional,
  unwrappingOptional,
  type BundleInfo,
  type IOSType,
  type NativeSource,
  type ValdiModelProperty,
  type ValdiModelPropertyType,
  type ValdiTypeParameter,
} from '../Models';
import type { PropertyName, PropertyNameAllocator } from '../PropertyNameAllocator';
import { CompilerError, indented, pascalCased } from '../Utils';
import { ObjCEmittedTrampolineFunctions, type CType } from './ObjCEmittedTrampolineFunctions';
import { ObjCEmittedIdentifiers, ObjCSchemaWriter } from './ObjCSchemaWriter';
import { ObjCSelector } from './ObjCSelector';
import { propertyNameAllocatorForObjC } from './ObjCValidation';

export interface GeneratedCode {
  apiHeader: CodeWriter;
  apiImpl: CodeWriter;
  header: CodeWriter;
  impl: CodeWriter;
}

export interface ObjCTypeParser {
  typeName: string;
  propertyAttribute: string;
  objcSelector?: ObjCSelector;
  cType: CType;
  /** The type name usable in the header's global scope (type parameters are `id` there). */
  headerDeclarationSafeTypeName: string;
  propertyAdditionalHeaderDeclaration?: string;
}

export interface ObjCProperty {
  propertyName: string;
  modelProperty: ValdiModelProperty;
}

/** Imports, sorted. */
class ObjCImportSection {
  private importedClasses = new Set<string>();

  addImport(path: string): void {
    this.importedClasses.add(path);
  }

  get content(): string {
    return [...this.importedClasses]
      .sort()
      .map(path => `#import ${path}\n`)
      .join('');
  }
}

/** Forward declarations, sorted. */
class ObjCForwardDeclarationSection {
  private forwardsSet = new Set<string>();

  addForwardDeclaration(value: string): void {
    this.forwardsSet.add(value);
  }

  get content(): string {
    return [...this.forwardsSet]
      .sort()
      .map(value => `${value}\n`)
      .join('');
  }
}

/** A file: its imports, forward declarations and declarations (typedefs) above its body. */
export class ObjCFileGenerator extends CodeWriter {
  private readonly importSection = new ObjCImportSection();
  private readonly forwardDeclarationSection = new ObjCForwardDeclarationSection();
  private readonly declarationSection = new JoinedContent('\n');

  constructor() {
    super();
    this.appendHeader(this.importSection);
    this.appendHeader('\n');
    this.appendHeader(this.forwardDeclarationSection);
    this.appendHeader('\n');
    this.appendHeader(this.declarationSection);
    this.appendHeader('\n');
  }

  addImport(path: string): void {
    this.importSection.addImport(path);
  }

  addForwardDeclaration(type: string): void {
    this.forwardDeclarationSection.addForwardDeclaration(type);
  }

  addDeclaration(type: string): void {
    this.declarationSection.append(type);
  }
}

export interface ObjCFunctionParameterParser {
  name: PropertyName;
  parser: ObjCTypeParser;
}

export interface ObjCFunctionParser {
  parameters: ObjCFunctionParameterParser[];
  returnParser: ObjCTypeParser;
  objcSelector?: ObjCSelector;
  typeName: string;
  propertyAdditionalHeaderDeclaration?: string;
}

/** ObjCEnumGenerator.nullableTypeName: a string enum's nullable typedef. */
export const nullableEnumTypeName = (typename: string) => `${typename}_Nullable`;

export class ObjCClassGenerator {
  readonly nameAllocator = propertyNameAllocatorForObjC();

  readonly apiHeader = new ObjCFileGenerator();
  readonly apiImpl = new ObjCFileGenerator();
  readonly header = new ObjCFileGenerator();
  readonly impl = new ObjCFileGenerator();

  readonly emittedIdentifiers = new ObjCEmittedIdentifiers();
  readonly emittedFunctions = new ObjCEmittedTrampolineFunctions();

  constructor(private readonly className: string) {
    this.apiHeader.addImport('<Foundation/Foundation.h>');
    this.apiImpl.addImport('<valdi_core/SCValdiBuiltinTrampolines.h>');
    this.header.addImport('<valdi_core/SCValdiMarshaller.h>');
    this.impl.addImport('<valdi_core/SCValdiJSConversionUtils.h>');

    // Reserved, to simplify code generation.
    this.nameAllocator.allocate('marshaller');
  }

  /** A type declared in both the header and the implementation: allocated from the root allocator. */
  private newUniqueType(namePaths: string[], suffix: string): PropertyName {
    const innerIdentifier = namePaths.map(pascalCased).join('');
    return this.nameAllocator.allocate(`${this.className}${innerIdentifier}${suffix}`);
  }

  writeFunctionTypeParser(
    returnType: ValdiModelPropertyType,
    parameters: ValdiModelProperty[],
    namePaths: string[],
    isInterface: boolean,
    hasGenericType: boolean,
    nameAllocator: PropertyNameAllocator,
  ): ObjCFunctionParser {
    const parsers = parameters.map(parameter =>
      this.writeTypeParser(
        unwrappingOptional(parameter.type),
        isOptional(parameter.type),
        [...namePaths, parameter.name],
        true,
        false,
        nameAllocator.scoped(),
      ),
    );
    const returnParser = this.writeTypeParser(
      unwrappingOptional(returnType),
      isOptional(returnType),
      [...namePaths, 'Return'],
      true,
      false,
      nameAllocator.scoped(),
    );
    const parametersAndParsers: ObjCFunctionParameterParser[] = parsers.map((parser, index) => ({
      name: nameAllocator.allocate(parameters[index].name),
      parser,
    }));

    let objcSelector: ObjCSelector | undefined;
    let typeName: string;
    let propertyAdditionalHeaderDeclaration: string | undefined;

    if (isInterface) {
      objcSelector = new ObjCSelector(
        returnParser.typeName,
        namePaths[0],
        parametersAndParsers.map(({ name, parser }) => ({ name: name.name, type: parser.typeName })),
      );
      typeName = objcSelector.messageDeclaration;
    } else {
      const blockName = this.newUniqueType(namePaths, 'Block');
      const headerSafeParameterString = parametersAndParsers
        .map(({ name, parser }) => `${parser.headerDeclarationSafeTypeName} ${name}`)
        .join(', ');
      const headerDeclarationSafeTypeDef = `typedef ${returnParser.headerDeclarationSafeTypeName}(^${blockName})(${headerSafeParameterString});`;
      typeName = blockName.name;

      // A typedef of a function including generic types can't be global: it's declared outside of the type parameters.
      if (hasGenericType) {
        const actualParameterString = parametersAndParsers
          .map(({ name, parser }) => `${parser.typeName} ${name}`)
          .join(', ');
        const actualTypeDef = `typedef ${returnParser.typeName}(^${blockName})(${actualParameterString});`;
        const declarations = parametersAndParsers
          .map(({ parser }) => parser.propertyAdditionalHeaderDeclaration)
          .filter((declaration): declaration is string => declaration !== undefined);
        if (returnParser.propertyAdditionalHeaderDeclaration !== undefined) {
          declarations.push(returnParser.propertyAdditionalHeaderDeclaration);
        }
        declarations.push(actualTypeDef);
        propertyAdditionalHeaderDeclaration = declarations.join('\n');
      } else {
        this.apiHeader.addDeclaration(headerDeclarationSafeTypeDef);
      }
    }

    this.emittedFunctions.appendBlockSupportIfNeeded(
      parametersAndParsers.map(({ parser }) => parser.cType),
      returnParser.cType,
      isInterface ? 'objcMethod' : 'block',
    );

    return {
      parameters: parametersAndParsers,
      returnParser,
      objcSelector,
      typeName,
      propertyAdditionalHeaderDeclaration,
    };
  }

  ensureTypeAvailability(type: IOSType, typeParameterCount = 0): void {
    this.apiHeader.addImport(importHeaderStatement(type, 'apiOnly'));
    this.header.addImport(importHeaderStatement(type, 'withUtilities'));
    if (type.kind === 'interface') {
      this.apiHeader.addForwardDeclaration(`@protocol ${type.name};`);
    } else if (type.kind === 'class') {
      if (typeParameterCount > 0) {
        const typeParamList = Array.from({ length: typeParameterCount }, (_, index) => `T${index}`).join(', ');
        this.apiHeader.addForwardDeclaration(`@class ${type.name}<${typeParamList}>;`);
      } else {
        this.apiHeader.addForwardDeclaration(`@class ${type.name};`);
      }
    }
  }

  /** The class method the runtime marshals the type with: its fields' schemas, identifiers and trampolines. */
  writeObjectDescriptorGetter(
    resolvedProperties: ObjCProperty[],
    objcSelectors: (ObjCSelector | undefined)[],
    typeParameters: ValdiTypeParameter[] | undefined,
    objectDescriptorType: string,
  ): CodeWriter {
    const output = new CodeWriter();
    output.appendBody('+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor\n{\n');

    let blocksParam: string;
    if (this.emittedFunctions.needBlockSupport) {
      blocksParam = 'kBlocks';
      output.appendBody(`static const SCValdiMarshallableObjectBlockSupport ${blocksParam}[] = {\n`);
      output.appendBody(this.emittedFunctions.blocksSection);
      output.appendBody('{ .typeEncoding = nil },\n');
      output.appendBody('};\n');
    } else {
      blocksParam = 'nil';
    }

    output.appendBody('static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {\n');
    resolvedProperties.forEach((objcProperty, index) => {
      const objcSelector = objcSelectors[index];
      let selName: string;
      if (objcSelector) selName = `"${objcSelector.selectorName}"`;
      else if (objcProperty.propertyName !== objcProperty.modelProperty.name)
        selName = `"${objcProperty.propertyName}"`;
      else selName = 'nil';

      const schemaWriter = new ObjCSchemaWriter(typeParameters, this.emittedIdentifiers);
      schemaWriter.appendType(objcProperty.modelProperty.type, false, objcSelector !== undefined);

      output.appendBody(
        `{.name = "${objcProperty.modelProperty.name}", .selName = ${selName}, .type = "${schemaWriter.str}"},\n`,
      );
    });
    output.appendBody('{.name = nil},\n');
    output.appendBody('};\n');

    let identifiersParam: string;
    if (!this.emittedIdentifiers.isEmpty) {
      identifiersParam = 'kIdentifiers';
      output.appendBody(`static const char *const ${identifiersParam}[] = `);
      output.appendBody(this.emittedIdentifiers.initializationString);
      output.appendBody(';\n');
    } else {
      identifiersParam = 'nil';
    }

    output.appendBody(
      `return SCValdiMarshallableObjectDescriptorMake(kFields, ${identifiersParam}, ${blocksParam}, ${objectDescriptorType});\n`,
    );
    output.appendBody('}\n\n');
    return output;
  }

  /**
   * A property's (or parameter's, element's…) ObjC type. Value types (double, BOOL, int64_t, int enums) are boxed in
   * NSNumber where optional or not allowed (in collections, generics); declarations get their nullability unless in a
   * generic argument.
   */
  writeTypeParser(
    type: ValdiModelPropertyType,
    optional: boolean,
    namePaths: string[],
    allowValueType: boolean,
    isInterface: boolean,
    nameAllocator: PropertyNameAllocator,
    typeParameterSafe = false,
  ): ObjCTypeParser {
    let typeName: string;
    let cElementType: CType;
    let isVoid = false;
    let objcSelector: ObjCSelector | undefined;
    let propertyAttribute: string;
    let propertyAdditionalHeaderDeclaration: string | undefined;
    let headerDeclarationSafeTypeNameOverride: string | undefined;

    // Type name, property attribute and C type of a value type.
    const valueType = (name: string, cType: CType): [string, string, CType] =>
      optional || !allowValueType ? ['NSNumber *', 'strong', 'pointer'] : [name, 'assign', cType];

    switch (type.kind) {
      case 'string':
        typeName = 'NSString *';
        propertyAttribute = 'copy';
        cElementType = 'pointer';
        break;
      case 'double':
        [typeName, propertyAttribute, cElementType] = valueType('double', 'double');
        break;
      case 'bool':
        [typeName, propertyAttribute, cElementType] = valueType('BOOL', 'bool');
        break;
      case 'long':
        [typeName, propertyAttribute, cElementType] = valueType('int64_t', 'long');
        break;
      case 'array': {
        const childParser = this.writeTypeParser(
          unwrappingOptional(type.elementType),
          isOptional(type.elementType),
          [...namePaths, 'element'],
          false,
          false,
          nameAllocator.scoped(),
          true,
        );
        propertyAdditionalHeaderDeclaration = childParser.propertyAdditionalHeaderDeclaration;
        typeName = `NSArray<${childParser.typeName}> *`;
        headerDeclarationSafeTypeNameOverride = `NSArray<${childParser.headerDeclarationSafeTypeName}> *`;
        propertyAttribute = 'copy';
        cElementType = 'pointer';
        break;
      }
      case 'bytes':
        typeName = 'NSData *';
        propertyAttribute = 'copy';
        cElementType = 'pointer';
        break;
      case 'map':
        typeName = 'NSDictionary <NSString *, id> *';
        propertyAttribute = 'copy';
        cElementType = 'pointer';
        break;
      case 'any':
        typeName = 'NSObject *';
        propertyAttribute = 'strong';
        cElementType = 'pointer';
        break;
      case 'void':
        if (typeParameterSafe) {
          const undefinedImportPath = '<valdi_core/SCValdiUndefinedValue.h>';
          this.apiHeader.addImport(undefinedImportPath);
          this.header.addImport(undefinedImportPath);
          typeName = 'SCValdiUndefinedValue *';
          propertyAttribute = 'strong';
          cElementType = 'pointer';
        } else {
          typeName = 'void';
          propertyAttribute = '';
          isVoid = true;
          cElementType = 'void';
        }
        break;
      case 'function': {
        const functionParser = this.writeFunctionTypeParser(
          type.returnType,
          type.parameters,
          namePaths,
          isInterface,
          includesGenericType(type),
          nameAllocator,
        );
        typeName = functionParser.typeName;
        objcSelector = functionParser.objcSelector;
        propertyAdditionalHeaderDeclaration = functionParser.propertyAdditionalHeaderDeclaration;
        propertyAttribute = 'copy';
        cElementType = 'pointer';
        break;
      }
      case 'enum': {
        const { mapping } = type;
        const resolvedType = mapping.iosType;
        if (!resolvedType) throw new CompilerError('No iOS type declared');
        this.ensureTypeAvailability(resolvedType);
        if (mapping.kind === 'enum' && (optional || !allowValueType)) {
          typeName = 'NSNumber *';
          propertyAttribute = 'strong';
          cElementType = 'pointer';
        } else {
          typeName = optional ? nullableEnumTypeName(resolvedType.name) : resolvedType.name;
          if (mapping.kind === 'stringEnum') {
            propertyAttribute = 'copy';
            cElementType = 'pointer';
          } else {
            propertyAttribute = 'assign';
            cElementType = 'int';
          }
        }
        break;
      }
      case 'genericTypeParameter':
        typeName = type.name;
        headerDeclarationSafeTypeNameOverride = 'id';
        propertyAttribute = 'strong';
        cElementType = 'pointer';
        break;
      case 'genericObject': {
        const { mapping, typeArguments } = type;
        const resolvedType = mapping.iosType;
        if (!resolvedType) throw new CompilerError('No iOS type declared');
        this.ensureTypeAvailability(resolvedType, typeArguments.length);
        if (mapping.kind !== 'class') throw new CompilerError('Generic object must be a class, not a protocol');
        const typeArgumentsParsers = typeArguments.map(typeArgument =>
          this.writeTypeParser(typeArgument, isOptional(typeArgument), namePaths, false, false, nameAllocator),
        );
        const typeArgumentsList = typeArgumentsParsers.map(parser => parser.headerDeclarationSafeTypeName).join(', ');
        // Always set, if only to '' (its users add a line for it).
        propertyAdditionalHeaderDeclaration = typeArgumentsParsers
          .map(parser => parser.propertyAdditionalHeaderDeclaration)
          .filter((declaration): declaration is string => declaration !== undefined)
          .join('\n');
        typeName = `${resolvedType.name}<${typeArgumentsList}> *`;
        if (!mapping.isGenerated) throw new CompilerError('Generic objects must be generated');
        propertyAttribute = 'strong';
        cElementType = 'pointer';
        break;
      }
      case 'object': {
        const { mapping } = type;
        const resolvedType = mapping.iosType;
        if (!resolvedType) throw new CompilerError('No iOS type declared');
        this.ensureTypeAvailability(resolvedType);
        switch (mapping.kind) {
          case 'interface':
            typeName = `id<${resolvedType.name}>`;
            break;
          case 'class':
            typeName = `${resolvedType.name} *`;
            break;
          case 'enum':
          case 'stringEnum':
            typeName = resolvedType.name;
            break;
        }
        propertyAttribute = 'strong';
        cElementType = 'pointer';
        break;
      }
      case 'promise': {
        const promiseImportPath = '<valdi_core/SCValdiPromise.h>';
        this.apiHeader.addImport(promiseImportPath);
        this.header.addImport(promiseImportPath);
        const childParser = this.writeTypeParser(
          unwrappingOptional(type.typeArgument),
          isOptional(type.typeArgument),
          [...namePaths, 'element'],
          false,
          false,
          nameAllocator.scoped(),
          true,
        );
        propertyAdditionalHeaderDeclaration = childParser.propertyAdditionalHeaderDeclaration;
        typeName = `SCValdiPromise<${childParser.typeName}> *`;
        headerDeclarationSafeTypeNameOverride = `SCValdiPromise<${childParser.headerDeclarationSafeTypeName}> *`;
        propertyAttribute = 'strong';
        cElementType = 'pointer';
        break;
      }
      case 'nullable':
        // As the compiler: typeParameterSafe isn't passed on.
        return this.writeTypeParser(type.type, true, namePaths, false, isInterface, nameAllocator);
    }

    const isObjCMessage = objcSelector !== undefined;
    const resolveTypeName = (name: string) => {
      if (optional && !isObjCMessage) {
        if (!isVoid && allowValueType && !typeParameterSafe) return `${name} _Nullable`;
      } else if (
        !propertyAttribute.includes('assign') &&
        !isVoid &&
        !isObjCMessage &&
        allowValueType &&
        !typeParameterSafe
      ) {
        return `${name} _Nonnull`;
      }
      return name;
    };

    const resolvedTypeName = resolveTypeName(typeName);
    return {
      typeName: resolvedTypeName,
      propertyAttribute,
      objcSelector,
      cType: cElementType,
      headerDeclarationSafeTypeName:
        headerDeclarationSafeTypeNameOverride !== undefined
          ? resolveTypeName(headerDeclarationSafeTypeNameOverride)
          : resolvedTypeName,
      propertyAdditionalHeaderDeclaration,
    };
  }
}

/**
 * NativeSource.iosNativeSourcesFromGeneratedCode: a type's four files, each importing the one it builds on, grouped
 * into the module's combined files (API ones in `../<module>Types`) by the type's kind.
 */
export function iosNativeSourcesFromGeneratedCode(
  generatedCode: GeneratedCode,
  iosType: IOSType,
  bundleInfo: BundleInfo,
): NativeSource[] {
  const typeName = iosType.name;
  const moduleName = bundleInfo.iosModuleName;

  generatedCode.apiImpl.appendHeader(`#import "${importHeaderFilename(iosType, 'apiOnly')}"\n\n`);
  generatedCode.header.appendHeader(`#import ${importHeaderStatement(iosType)}\n\n`);
  generatedCode.impl.appendHeader(`#import "${importHeaderFilename(iosType, 'withUtilities')}"\n\n`);

  const groupingPriority = {
    enum: IOS_GROUPING_PRIORITY.enumType,
    stringEnum: IOS_GROUPING_PRIORITY.enumStringType,
    class: IOS_GROUPING_PRIORITY.classType,
    interface: IOS_GROUPING_PRIORITY.interfaceType,
  }[iosType.kind];
  const source = (
    writer: CodeWriter,
    extension: string,
    relativePath?: string,
    groupingIdentifier = `${moduleName}.${extension}`,
  ): NativeSource => ({
    relativePath,
    filename: `${typeName}.${extension}`,
    content: indented(writer.content, '    '),
    groupingIdentifier,
    groupingPriority,
    localFilenameDependencies: [],
  });

  const apiRelativePath = `../${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}`;
  const apiGroupingIdentifier = (extension: string) => `${moduleName}${API_ONLY_MODULE_NAME_SUFFIX}.${extension}`;
  return [
    source(generatedCode.apiHeader, 'h', apiRelativePath, apiGroupingIdentifier('h')),
    source(generatedCode.apiImpl, 'm', apiRelativePath, apiGroupingIdentifier('m')),
    source(generatedCode.header, 'h'),
    source(generatedCode.impl, 'm'),
  ];
}
