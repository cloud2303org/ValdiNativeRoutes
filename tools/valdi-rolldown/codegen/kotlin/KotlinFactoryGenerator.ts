// ViewModels/KotlinFactoryGenerator.swift: a @Context model's <Name>Factory, which native dependency injection
// creates (@Inject constructor) with the @Injectable properties and which creates the context with the others.
import { CodeWriter } from '../CodeWriter';
import { isOptional, unwrappingOptional, type ValdiModelProperty, type ValdiTypeParameter } from '../Models';
import { FileHeaderCommentGenerator, indented, type GeneratedSourceFilename } from '../Utils';
import { KotlinCodeGenerator, type JVMClass, type KotlinTypeParser } from './KotlinCodeGenerator';
import { propertyNameAllocatorForKotlin } from './KotlinValidation';

interface KotlinProperty {
  propertyName: string;
  fieldName: string;
  modelProperty: ValdiModelProperty;
}

interface ConstructorParameter {
  typeParser: KotlinTypeParser;
  name: string;
  typeName: string;
  fieldName: string;
  parameterToField: string;
}

interface CreateMethodParameter {
  typeParser: KotlinTypeParser;
  name: string;
  typeName: string;
  fieldName: string;
  injectable: boolean;
  isOptional: boolean;
}

export class KotlinFactoryGenerator {
  private readonly writer: KotlinCodeGenerator;
  private readonly nameAllocator = propertyNameAllocatorForKotlin();

  constructor(
    private readonly jvmClass: JVMClass,
    private readonly typeParameters: ValdiTypeParameter[] | undefined,
    private readonly properties: ValdiModelProperty[],
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {
    this.writer = new KotlinCodeGenerator(jvmClass.package);
  }

  private generateConstructor(parameters: ConstructorParameter[]): CodeWriter {
    const constructorBody = new KotlinCodeGenerator();
    const constructorParameters: string[] = [];
    for (const parameter of parameters) {
      constructorParameters.push(`${parameter.name}: ${parameter.typeName}`);
      constructorBody.appendBody(parameter.fieldName);
      constructorBody.appendBody(' = ');
      constructorBody.appendBody(parameter.parameterToField);
      constructorBody.appendBody('\n');
    }
    const constructor = new KotlinCodeGenerator();
    const injectClass = this.writer.importClass('javax.inject.Inject');
    constructor.appendBody(`@${injectClass.name} constructor(${constructorParameters.join(', ')}) {\n`);
    constructor.appendBody(constructorBody);
    constructor.appendBody('}\n\n');
    return constructor;
  }

  private generateCreateMethod(
    name: string,
    createMethodName: string,
    parameters: CreateMethodParameter[],
    indicesToOmit: Set<number>,
  ): CodeWriter {
    const createMethodParameters: string[] = [];
    const createMethodBody = new KotlinCodeGenerator();
    createMethodBody.appendBody(`return ${name}(\n`);
    parameters.forEach((parameter, index) => {
      const isOmitted = indicesToOmit.has(index);
      if (!isOmitted && !parameter.injectable) createMethodParameters.push(`${parameter.name}: ${parameter.typeName}`);
      createMethodBody.appendBody(parameter.name);
      createMethodBody.appendBody(isOmitted ? ' = null,\n' : ` = ${parameter.name},\n`);
    });
    createMethodBody.appendBody(')\n');

    const createMethod = new KotlinCodeGenerator();
    createMethod.appendBody(`fun ${createMethodName}(${createMethodParameters.join(', ')}): ${name} {\n`);
    createMethod.appendBody(createMethodBody);
    createMethod.appendBody('}\n\n');
    return createMethod;
  }

  private resolveProperties(valdiProperties: ValdiModelProperty[]): KotlinProperty[] {
    return valdiProperties.map(property => ({
      propertyName: this.nameAllocator.allocate(property.name).name,
      fieldName: this.nameAllocator.allocate(`_${property.name}`).name,
      modelProperty: property,
    }));
  }

  private writeConstructors(
    writer: KotlinCodeGenerator,
    constructors: CodeWriter,
    constructorParameters: ConstructorParameter[],
  ): void {
    constructors.appendBody(writer.getJavaAnnotationContent('com.snap.valdi.schema.ValdiClassConstructor'));
    constructors.appendBody(this.generateConstructor(constructorParameters));
  }

  private writeCreateMethod(fieldsBody: CodeWriter, name: string, parameters: CreateMethodParameter[]): void {
    fieldsBody.appendBody(this.generateCreateMethod(name, 'create', parameters, new Set()));

    // Then one taking only the non-optional parameters.
    const indicesToOmit = new Set<number>();
    parameters.forEach((parameter, index) => {
      if (parameter.isOptional && !parameter.injectable) indicesToOmit.add(index);
    });
    if (parameters.length && indicesToOmit.size > 0) {
      const createMethod = this.generateCreateMethod(name, 'createWithNullDefaults', parameters, indicesToOmit);
      fieldsBody.appendBody('\n');
      fieldsBody.appendBody(createMethod);
    }
  }

  private writeClass(className: string, properties: ValdiModelProperty[], writer: KotlinCodeGenerator): void {
    const marshallableObjectClass = writer.importClass('com.snap.valdi.utils.ValdiMarshallableObject');

    const constructors = new CodeWriter();
    const propertiesBody = new CodeWriter();
    const fieldsBody = new CodeWriter();

    writer.appendBody('\n');
    writer.appendBody(FileHeaderCommentGenerator.generateFactoryHeaderMessage(className, this.sourceFileName));
    writer.appendBody('\n');

    const descriptorAnnotation = writer.getDescriptorAnnotation('valdiClass', this.typeParameters, []);

    writer.appendBody(descriptorAnnotation);
    writer.appendBody(`class ${className}Factory: ${marshallableObjectClass.name} {\n\n`);
    writer.appendBody(propertiesBody);
    writer.appendBody('\n\n');
    writer.appendBody(fieldsBody);
    writer.appendBody('\n\n');
    writer.appendBody(constructors);
    writer.appendBody('}');

    const resolvedNamesAndTypesForConstructor: ConstructorParameter[] = [];
    const resolvedNamesAndTypesForProperties: CreateMethodParameter[] = [];

    this.resolveProperties(properties).forEach((kotlinProperty, propertyIndex) => {
      const property = kotlinProperty.modelProperty;
      const typeParser = writer.getTypeParser(
        unwrappingOptional(property.type),
        isOptional(property.type),
        kotlinProperty.modelProperty.name,
        this.nameAllocator.scoped(),
      );
      const injectable = property.injectableParams.android;

      // Only the injected properties go to the constructor.
      if (injectable) {
        propertiesBody.appendBody(`var ${kotlinProperty.propertyName}: ${typeParser.fullTypeName}\n`);
        propertiesBody.appendBody(`    get() = ${kotlinProperty.fieldName}\n`);
        propertiesBody.appendBody(`    set(value) { ${kotlinProperty.fieldName} = value }\n\n`);
        resolvedNamesAndTypesForConstructor.push({
          typeParser,
          name: property.name,
          typeName: typeParser.fullTypeName,
          fieldName: kotlinProperty.fieldName,
          parameterToField: property.name,
        });
      }

      const fieldAnnotation = descriptorAnnotation.appendField(
        propertyIndex,
        property.name,
        kotlinProperty.fieldName,
        `_${property.name}`,
        schemaWriter => schemaWriter.appendType(property.type, false, false),
      );

      if (injectable) {
        fieldsBody.appendBody(fieldAnnotation);
        fieldsBody.appendBody(`private var ${kotlinProperty.fieldName}: ${typeParser.fullTypeName}\n\n`);
      }

      resolvedNamesAndTypesForProperties.push({
        typeParser,
        name: property.name,
        typeName: typeParser.fullTypeName,
        fieldName: kotlinProperty.fieldName,
        injectable,
        isOptional: isOptional(property.type),
      });
    });

    this.writeConstructors(writer, constructors, resolvedNamesAndTypesForConstructor);
    this.writeCreateMethod(fieldsBody, className, resolvedNamesAndTypesForProperties);
  }

  write(): string {
    this.writeClass(this.jvmClass.name, this.properties, this.writer);
    return indented(this.writer.content, '    ');
  }
}
