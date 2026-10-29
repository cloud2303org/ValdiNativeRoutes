// ViewModels/ObjCModelGenerator.swift: an @ExportModel as an SCValdiMarshallableObject subclass with dynamic
// properties, an @ExportProxy as a protocol (with an SCValdiProxyMarshallableObject class and a marshall function).
import { CodeWriter } from '../CodeWriter';
import {
  isOptional,
  unwrappingOptional,
  type BundleInfo,
  type IOSType,
  type NativeSource,
  type ValdiModelProperty,
  type ValdiTypeParameter,
} from '../Models';
import type { PropertyNameAllocator } from '../PropertyNameAllocator';
import { CompilerError, FileHeaderCommentGenerator, type GeneratedSourceFilename } from '../Utils';
import { cType } from './ObjCEmittedTrampolineFunctions';
import {
  iosNativeSourcesFromGeneratedCode,
  ObjCClassGenerator,
  type GeneratedCode,
  type ObjCProperty,
  type ObjCTypeParser,
} from './ObjCCodeGenerator';
import { ObjCSelector, type ObjcMessageParameter } from './ObjCSelector';

interface ConstructorParameter {
  param: ObjcMessageParameter;
  isOptional: boolean;
  isOmitted: boolean;
}

export class ObjCModelGenerator {
  private readonly className: string;

  constructor(
    private readonly iosType: IOSType,
    private readonly bundleInfo: BundleInfo,
    private readonly typeParameters: ValdiTypeParameter[] | undefined,
    private readonly properties: ValdiModelProperty[],
    private readonly sourceFileName: GeneratedSourceFilename,
    private readonly isInterface: boolean,
    private readonly emitLegacyConstructors: boolean,
    private readonly comments: string | undefined,
  ) {
    this.className = iosType.name;
  }

  /** ARC treats methods starting with `new` as returning a retained object. */
  private sanitizePropertyName(name: string): string {
    return name.startsWith('new') ? `_${name}` : name;
  }

  private resolveProperties(
    valdiProperties: ValdiModelProperty[],
    nameAllocator: PropertyNameAllocator,
  ): ObjCProperty[] {
    return valdiProperties.map(property => ({
      propertyName: nameAllocator.allocate(this.sanitizePropertyName(property.name)).name,
      modelProperty: property,
    }));
  }

  private generateCode(properties: ValdiModelProperty[], className: string): GeneratedCode {
    const { isInterface, typeParameters } = this;
    const classGenerator = new ObjCClassGenerator(className);
    const nameAllocator = classGenerator.nameAllocator;
    nameAllocator.allocate(className);

    classGenerator.apiHeader.addImport('<valdi_core/SCValdiMarshallable.h>');
    classGenerator.apiHeader.addImport('<valdi_core/SCValdiMarshallableObject.h>');
    classGenerator.apiImpl.addImport('<valdi_core/SCValdiMarshallableObjectDescriptor.h>');

    classGenerator.apiHeader.appendBody('\n');
    classGenerator.apiHeader.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, this.comments));
    classGenerator.apiHeader.appendBody('\n');

    classGenerator.impl.appendBody('\n');

    const resolvedProperties = this.resolveProperties(properties, nameAllocator);

    const classHeaderBody = new CodeWriter();
    const classImplBody = new CodeWriter();

    const isGenericType = typeParameters !== undefined;
    let instanceType: string;

    if (isInterface) {
      classGenerator.impl.appendBody(classGenerator.emittedFunctions.emittedFunctionsSection);
      classGenerator.apiHeader.appendBody(`@protocol ${className} <NSObject, SCValdiMarshallable>\n\n`);
      classGenerator.apiHeader.appendBody(classHeaderBody);
      classGenerator.apiHeader.appendBody('@end\n\n');

      classGenerator.impl.appendBody(`@interface ${className}: SCValdiProxyMarshallableObject\n\n`);
      classGenerator.impl.appendBody('@end\n\n');

      instanceType = `id<${className}> _Nonnull `;

      // In case a typedef uses the protocol itself.
      classGenerator.apiHeader.addForwardDeclaration(`@protocol ${className};`);
    } else {
      instanceType = `${className} * _Nonnull `;

      classGenerator.apiImpl.appendBody(classGenerator.emittedFunctions.emittedFunctionsSection);

      const typeParametersSuffix = typeParameters
        ? `<${typeParameters.map(parameter => `__covariant ${parameter.name}`).join(', ')}>`
        : '';
      classGenerator.apiHeader.addForwardDeclaration(`@class ${className}${typeParametersSuffix};`);

      for (const property of resolvedProperties) classImplBody.appendBody(`@dynamic ${property.propertyName};\n`);
      classImplBody.appendBody('\n');

      const supertype = isGenericType ? 'SCValdiMarshallableGenericObject' : 'SCValdiMarshallableObject';
      classGenerator.apiHeader.appendBody(`@interface ${className}${typeParametersSuffix}: ${supertype}\n\n`);
      classGenerator.apiHeader.appendBody(classHeaderBody);
      classGenerator.apiHeader.appendBody('@end\n\n');
    }

    if (typeParameters) {
      classGenerator.apiImpl.appendBody('// Obj-C lightweight generics do not exist in class implementations\n');
      for (const typeParam of typeParameters) classGenerator.apiImpl.appendBody(`typedef id ${typeParam.name};\n`);
    }

    const implementation = isInterface ? classGenerator.impl : classGenerator.apiImpl;
    implementation.appendBody(`@implementation ${className}\n\n`);
    implementation.appendBody(classImplBody);
    implementation.appendBody('@end\n\n');

    const marshallFunctionName = `${className}Marshall`;
    const unmarshallFunctionName = `${className}Unmarshall`;
    nameAllocator.allocate(unmarshallFunctionName);
    nameAllocator.allocate(marshallFunctionName);

    const resolvedParameters: ConstructorParameter[] = [];
    const initMethods: ObjCSelector[] = [];
    const allTypeParsers: ObjCTypeParser[] = [];

    for (const objcProperty of resolvedProperties) {
      const property = objcProperty.modelProperty;
      try {
        const typeParser = classGenerator.writeTypeParser(
          unwrappingOptional(property.type),
          isOptional(property.type),
          [property.name],
          true,
          isInterface,
          nameAllocator.scoped(),
        );
        allTypeParsers.push(typeParser);

        resolvedParameters.push({
          param: { name: objcProperty.propertyName, type: typeParser.typeName },
          isOptional: isOptional(property.type),
          isOmitted: property.omitConstructor?.ios === true,
        });

        if (typeParser.objcSelector) {
          const disclaimerComment = 'NOTE: This method can be called from any thread.';
          classHeaderBody.appendBody(
            FileHeaderCommentGenerator.generateMultilineComment(
              property.comments !== undefined ? `${property.comments}\n${disclaimerComment}` : disclaimerComment,
            ),
          );
          classHeaderBody.appendBody('\n');
          classHeaderBody.appendBody(isOptional(property.type) ? '@optional\n' : '@required\n');
          classHeaderBody.appendBody(`${typeParser.typeName};\n\n`);
        } else {
          if (property.comments !== undefined) {
            classHeaderBody.appendBody(FileHeaderCommentGenerator.generateMultilineComment(property.comments));
            classHeaderBody.appendBody('\n');
          }
          if (typeParser.propertyAdditionalHeaderDeclaration !== undefined) {
            classHeaderBody.appendBody(`${typeParser.propertyAdditionalHeaderDeclaration}\n`);
          }
          if (isInterface) classHeaderBody.appendBody(isOptional(property.type) ? '@optional\n' : '@required\n');
          classHeaderBody.appendBody(
            `@property (${typeParser.propertyAttribute}, nonatomic) ${typeParser.typeName} ${objcProperty.propertyName};\n\n`,
          );
        }
      } catch (error) {
        throw new CompilerError(`Failed to process property '${property.name}': ${(error as Error).message}`);
      }
    }

    if (!isInterface) {
      const initSelector = (parameters: ConstructorParameter[]) =>
        new ObjCSelector(
          'instancetype _Nonnull',
          'init',
          parameters.map(parameter => parameter.param),
        );
      if (this.emitLegacyConstructors) {
        // One with every parameter, then one more for each @ConstructorOmitted, removing them from the last.
        initMethods.push(initSelector(resolvedParameters));
        const parametersWithoutOmitted = [...resolvedParameters];
        for (let index = parametersWithoutOmitted.length - 1; index >= 0; index--) {
          if (!parametersWithoutOmitted[index].isOmitted) continue;
          parametersWithoutOmitted.splice(index, 1);
          initMethods.push(initSelector(parametersWithoutOmitted));
        }
      } else {
        // The recommended minimal constructor: without the optional parameters.
        initMethods.push(initSelector(resolvedParameters.filter(parameter => !parameter.isOptional)));
      }

      for (const initMethod of initMethods) {
        if (initMethod.parameters.length) {
          const parametersSet = new Set(initMethod.parameters.map(parameter => parameter.name));
          const passParameters = resolvedProperties.map((property, index) =>
            parametersSet.has(property.propertyName)
              ? property.propertyName
              : cType(allTypeParsers[index].cType).defaultValue,
          );
          classImplBody.appendBody(
            `${initMethod.messageDeclaration}\n{\n    return [super initWithFieldValues:nil, ${passParameters.join(', ')}];\n}\n\n`,
          );
        } else {
          classImplBody.appendBody(`${initMethod.messageDeclaration}\n{\nreturn [super init];\n}\n\n`);
        }
        classHeaderBody.appendBody(`${initMethod.messageDeclaration};\n\n`);
      }
    }

    const objectDescriptor = classGenerator.writeObjectDescriptorGetter(
      resolvedProperties,
      allTypeParsers.map(parser => parser.objcSelector),
      typeParameters,
      isInterface ? 'SCValdiMarshallableObjectTypeProtocol' : 'SCValdiMarshallableObjectTypeClass',
    );
    classImplBody.appendBody('\n');
    classImplBody.appendBody(objectDescriptor);

    if (!isGenericType && isInterface) {
      const marshallFunctionSignature = `NSInteger ${marshallFunctionName}(SCValdiMarshallerRef  _Nonnull marshaller, ${instanceType}instance)`;
      classGenerator.header.appendBody(
        '/**\n' +
          '* Marshall the instance into the given SCValdiMarshaller.\n' +
          '*/\n' +
          `FOUNDATION_EXPORT ${marshallFunctionSignature};\n\n`,
      );
      classGenerator.impl.appendBody(
        `${marshallFunctionSignature} {\n` +
          `    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [${className} class]);\n` +
          '}\n\n',
      );
    }

    return {
      apiHeader: classGenerator.apiHeader,
      apiImpl: classGenerator.apiImpl,
      header: classGenerator.header,
      impl: classGenerator.impl,
    };
  }

  write(): NativeSource[] {
    const generatedCode = this.generateCode(this.properties, this.className);
    return iosNativeSourcesFromGeneratedCode(generatedCode, this.iosType, this.bundleInfo);
  }
}
