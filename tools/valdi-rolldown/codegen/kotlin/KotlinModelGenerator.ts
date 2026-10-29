// ViewModels/KotlinModelGenerator.swift: an @ExportModel as a ValdiMarshallableObject class, an @ExportProxy as a
// ValdiMarshallable interface and its _Proxy class.
import { CodeWriter } from '../CodeWriter';
import {
  isFunction,
  isOptional,
  unwrappingOptional,
  type BundleInfo,
  type NativeSource,
  type ValdiModelProperty,
  type ValdiTypeParameter,
} from '../Models';
import {
  CompilerError,
  FileHeaderCommentGenerator,
  indented,
  isUppercase,
  pascalCased,
  type GeneratedSourceFilename,
} from '../Utils';
import {
  JVMClass,
  KotlinCodeGenerator,
  type KotlinMarshallableObjectDescriptorAnnotation,
  type KotlinTypeParser,
} from './KotlinCodeGenerator';
import { propertyNameAllocatorForKotlin } from './KotlinValidation';

interface KotlinProperty {
  propertyName: string;
  fieldName: string;
  getterName?: string;
  modelProperty: ValdiModelProperty;
}

interface ConstructorParameter {
  typeParser: KotlinTypeParser;
  name: string;
  typeName: string;
  fieldName: string;
  parameterToField: string;
  isFunction: boolean;
  isOptional: boolean;
  constructorOmitted: boolean;
}

export class KotlinModelGenerator {
  private readonly writer: KotlinCodeGenerator;
  private readonly jvmClass: JVMClass;
  private readonly nameAllocator = propertyNameAllocatorForKotlin();

  constructor(
    private readonly bundleInfo: BundleInfo,
    className: string,
    private readonly typeParameters: ValdiTypeParameter[] | undefined,
    private readonly properties: ValdiModelProperty[],
    private readonly sourceFileName: GeneratedSourceFilename,
    private readonly isInterface: boolean,
    private readonly emitLegacyConstructors: boolean,
    private readonly comments: string | undefined,
    private readonly usePublicFields = false,
  ) {
    this.jvmClass = new JVMClass(className);
    this.writer = new KotlinCodeGenerator(this.jvmClass.package);
  }

  private generateConstructor(parameters: ConstructorParameter[], indexesToOmit: Set<number>): CodeWriter {
    const constructorBody = new KotlinCodeGenerator();
    const constructorParameters: string[] = [];
    parameters.forEach((parameter, index) => {
      if (!indexesToOmit.has(index)) {
        constructorParameters.push(`${parameter.name}: ${parameter.typeName}${parameter.isOptional ? ' = null' : ''}`);
        constructorBody.appendBody('this.' + parameter.fieldName);
        constructorBody.appendBody(' = ');
        constructorBody.appendBody(parameter.parameterToField);
        constructorBody.appendBody('\n');
      } else {
        constructorBody.appendBody('this.' + parameter.fieldName);
        constructorBody.appendBody(' = null\n');
      }
    });
    const constructor = new KotlinCodeGenerator();
    constructor.appendBody(`constructor(${constructorParameters.join(', ')}) {\n`);
    constructor.appendBody(constructorBody);
    constructor.appendBody('}\n\n');
    return constructor;
  }

  private resolvePropertyGetterName(propertyName: string): string {
    // As Swift's index(offsetBy: 2), this needs a third character after `is`.
    if (propertyName.startsWith('is') && isUppercase([...propertyName][2])) return propertyName;
    return `get${pascalCased(propertyName)}`;
  }

  private resolveProperties(valdiProperties: ValdiModelProperty[]): KotlinProperty[] {
    return valdiProperties.map(property => {
      const propertyName = this.nameAllocator.allocate(property.name).name;
      const fieldName = this.nameAllocator.allocate(`_${property.name}`).name;
      let getterName: string | undefined;
      if (this.isInterface && !isFunction(property.type)) {
        const resolvedGetterFieldName = this.resolvePropertyGetterName(property.name);
        getterName =
          resolvedGetterFieldName !== property.name
            ? this.nameAllocator.allocate(resolvedGetterFieldName).name
            : resolvedGetterFieldName;
      }
      return { propertyName, fieldName, getterName, modelProperty: property };
    });
  }

  private appendNextOmittedParameter(constructors: ConstructorParameter[], indexesToOmit: Set<number>): boolean {
    for (let index = constructors.length - 1; index >= 0; index--) {
      if (!constructors[index].constructorOmitted) continue;
      if (!indexesToOmit.has(index)) {
        indexesToOmit.add(index);
        return true;
      }
    }
    return false;
  }

  private shouldGenerateAlternateMainConstructor(
    constructorParameters: ConstructorParameter[],
    alternateConstructorParameters: ConstructorParameter[],
  ): boolean {
    return constructorParameters.some(
      (parameter, index) => parameter.typeName !== alternateConstructorParameters[index].typeName,
    );
  }

  private writeConstructors(
    writer: KotlinCodeGenerator,
    constructors: CodeWriter,
    constructorParameters: ConstructorParameter[],
  ): void {
    // Java's limit is 255 parameters.
    if (constructorParameters.length > 250) {
      throw new CompilerError(
        `Too many constructor parameters: ${constructorParameters.length}. Maximum allowed is 250 parameters to avoid Java bytecode limitations.`,
      );
    }

    constructors.appendBody(writer.getJavaAnnotationContent('com.snap.valdi.schema.ValdiClassConstructor'));
    constructors.appendBody(this.generateConstructor(constructorParameters, new Set()));

    const alternateConstructorParameters = constructorParameters.map(parameter => ({
      ...parameter,
      typeName: parameter.typeParser.fullTypeName,
      parameterToField: parameter.name,
    }));

    const indexesToOmit = new Set<number>();
    if (this.emitLegacyConstructors) {
      if (constructorParameters.length) {
        if (this.shouldGenerateAlternateMainConstructor(constructorParameters, alternateConstructorParameters)) {
          constructors.appendBody('\n');
          constructors.appendBody(this.generateConstructor(alternateConstructorParameters, indexesToOmit));
        }
        while (this.appendNextOmittedParameter(alternateConstructorParameters, indexesToOmit)) {
          constructors.appendBody('\n\n');
          constructors.appendBody(this.generateConstructor(alternateConstructorParameters, indexesToOmit));
        }
      }
    } else {
      // The recommended minimal constructors: the main one, and one without the optional parameters.
      alternateConstructorParameters.forEach((parameter, index) => {
        if (parameter.isOptional) indexesToOmit.add(index);
      });
      if (alternateConstructorParameters.length) {
        if (
          indexesToOmit.size > 0 ||
          this.shouldGenerateAlternateMainConstructor(constructorParameters, alternateConstructorParameters)
        ) {
          constructors.appendBody('\n');
          constructors.appendBody(this.generateConstructor(alternateConstructorParameters, indexesToOmit));
        }
      }
    }
  }

  private writeClass(
    className: string,
    properties: ValdiModelProperty[],
    writer: KotlinCodeGenerator,
    usePublicFields: boolean,
  ): void {
    const marshallableObjectClass = writer.importClass('com.snap.valdi.utils.ValdiMarshallableObject');
    const typeParameters = this.typeParameters;
    const fullTypeName = typeParameters?.length
      ? `${className}<${typeParameters.map(item => item.name).join(', ')}>`
      : className;

    const constructors = new CodeWriter();
    const propertiesBody = new CodeWriter();
    const fieldsBody = new CodeWriter();

    writer.appendBody('\n');
    writer.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, this.comments));
    writer.appendBody('\n');

    let descriptorAnnotation: KotlinMarshallableObjectDescriptorAnnotation;

    // ValdiMarshallableObject implements DisposablePrivate so we need to reserve the __dispose__() method.
    this.nameAllocator.allocate('__dispose__');

    if (this.isInterface) {
      const proxyClassName = this.nameAllocator.allocate(`${fullTypeName}_Proxy`).name;
      const marshallableInterface = writer.importClass('com.snap.valdi.utils.ValdiMarshallable').name;

      descriptorAnnotation = writer.getDescriptorAnnotation('valdiInterface', typeParameters, [
        ['proxyClass', `${proxyClassName}::class`],
      ]);

      writer.appendBody(descriptorAnnotation);
      writer.appendBody(`interface ${fullTypeName}: ${marshallableInterface} {\n\n`);
      writer.appendBody(propertiesBody);

      const marshallerClass = writer.importClass('com.snap.valdi.utils.ValdiMarshaller').name;
      writer.appendBody(
        `\noverride fun pushToMarshaller(marshaller: ${marshallerClass}) = ` +
          `${marshallableObjectClass.name}.marshall(${fullTypeName}::class.java, marshaller, this)\n\n`,
      );

      writer.appendBody('}\n\n');

      writer.appendBody(`class ${proxyClassName}: ${fullTypeName} {\n\n`);
      writer.appendBody(fieldsBody);
      writer.appendBody('\n\n');
      writer.appendBody(constructors);
      writer.appendBody('}');
    } else {
      descriptorAnnotation = writer.getDescriptorAnnotation('valdiClass', typeParameters, []);

      writer.appendBody(descriptorAnnotation);
      writer.appendBody(`class ${fullTypeName}: ${marshallableObjectClass.name} {\n\n`);
      writer.appendBody(propertiesBody);
      writer.appendBody('\n\n');
      writer.appendBody(fieldsBody);
      writer.appendBody('\n\n');
      writer.appendBody(constructors);
      writer.appendBody('}');
    }

    const kotlinProperties = this.resolveProperties(properties);

    const resolvedNamesAndTypes: ConstructorParameter[] = [];
    kotlinProperties.forEach((kotlinProperty, propertyIndex) => {
      const propertyName = kotlinProperty.propertyName;
      const property = kotlinProperty.modelProperty;
      const optional = isOptional(property.type);

      const typeParser = writer.getTypeParser(
        unwrappingOptional(property.type),
        optional,
        kotlinProperty.modelProperty.name,
        this.nameAllocator.scoped(),
      );

      const propertyIsFunction = isFunction(property.type);

      if (property.comments !== undefined) {
        // Public fields have their comment above the field; the others above the property.
        const body = usePublicFields ? fieldsBody : propertiesBody;
        body.appendBody(FileHeaderCommentGenerator.generateMultilineComment(property.comments));
        body.appendBody('\n');
      }

      const fieldVisibility = usePublicFields ? 'var' : 'private var';
      const fieldName = usePublicFields ? kotlinProperty.propertyName : kotlinProperty.fieldName;
      const publicFieldName = this.isInterface ? (kotlinProperty.getterName ?? kotlinProperty.propertyName) : fieldName;
      const expectedKotlinFieldName = this.isInterface
        ? propertyIsFunction
          ? property.name
          : this.resolvePropertyGetterName(property.name)
        : `_${property.name}`;

      const fieldAnnotation = descriptorAnnotation.appendField(
        propertyIndex,
        property.name,
        publicFieldName,
        expectedKotlinFieldName,
        schemaWriter => {
          schemaWriter.appendType(property.type, false, this.isInterface);
        },
      );

      if (!this.isInterface) fieldsBody.appendBody(fieldAnnotation);
      fieldsBody.appendBody(`${fieldVisibility} ${fieldName}: ${typeParser.fullTypeName}\n\n`);

      if (this.isInterface) {
        if (propertyIsFunction) {
          const functionTypeParser = typeParser.functionTypeParser;
          if (!functionTypeParser) throw new CompilerError('Expected functionTypeParser for function property');
          const parameterNamesString = functionTypeParser.parameterNames.map(name => name.name).join(', ');

          if (optional) {
            propertiesBody.appendBody(writer.getJavaAnnotationContent('com.snap.valdi.schema.ValdiOptionalMethod'));
            propertiesBody.appendBody(
              `fun ${propertyName}${functionTypeParser.methodTypeName} {\n` +
                `  ${marshallableObjectClass.name}.unimplementedMethod()\n` +
                '}\n\n',
            );
          } else {
            propertiesBody.appendBody(`fun ${propertyName}${functionTypeParser.methodTypeName}\n\n`);
          }

          constructors.appendBody(fieldAnnotation);
          constructors.appendBody(`override fun ${propertyName}${functionTypeParser.methodTypeName} {\n`);
          if (optional) {
            if (functionTypeParser.returnType.fullTypeName === 'Unit') {
              constructors.appendBody(`    return ${fieldName}?.invoke(${parameterNamesString}) ?: Unit`);
            } else {
              constructors.appendBody(`    return ${fieldName}!!(${parameterNamesString})`);
            }
          } else {
            constructors.appendBody(`    return ${fieldName}(${parameterNamesString})`);
          }
          constructors.appendBody('\n}\n\n');
        } else {
          constructors.appendBody(`override val ${propertyName}: ${typeParser.fullTypeName}\n`);
          constructors.appendBody(fieldAnnotation);
          constructors.appendBody(`    get() = ${fieldName}\n\n`);

          propertiesBody.appendBody(`val ${propertyName}: ${typeParser.fullTypeName}\n`);
          propertiesBody.appendBody(optional ? '    get() = null\n\n' : '\n');
        }
      } else if (!usePublicFields) {
        propertiesBody.appendBody(`var ${propertyName}: ${typeParser.fullTypeName}\n`);
        propertiesBody.appendBody(`    get() = ${kotlinProperty.fieldName}\n`);
        propertiesBody.appendBody(`    set(value) { ${kotlinProperty.fieldName} = value }\n\n`);
      }

      resolvedNamesAndTypes.push({
        typeParser,
        name: property.name,
        typeName: typeParser.fullTypeName,
        fieldName,
        parameterToField: property.name,
        isFunction: propertyIsFunction,
        isOptional: optional,
        constructorOmitted: property.omitConstructor?.android === true,
      });
    });

    this.writeConstructors(writer, constructors, resolvedNamesAndTypes);
  }

  write(): NativeSource[] {
    this.writeClass(this.jvmClass.name, this.properties, this.writer, this.usePublicFields);
    const content = indented(this.writer.content, '    ');
    return [KotlinCodeGenerator.makeNativeSource(this.bundleInfo, this.jvmClass, content)];
  }
}
