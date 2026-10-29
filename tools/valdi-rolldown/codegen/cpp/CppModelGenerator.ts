// ViewModels/CppModelGenerator.swift: an @ExportModel as a Valdi::CppGeneratedModel class (fields, getters and setters,
// marshalling), an @ExportProxy as a Valdi::CppGeneratedInterface with pure virtual methods, and the proxy class
// (implementation only) that calls into the JS object it unmarshalls.
import { CodeWriter } from '../CodeWriter';
import {
  cppFullTypeName,
  cppIncludeDir,
  isOptional,
  resolveCppTypeName,
  type BundleInfo,
  type CppNamespace,
  type CppType,
  type NativeSource,
  type ValdiModelProperty,
  type ValdiTypeParameter,
} from '../Models';
import type { PropertyNameAllocator } from '../PropertyNameAllocator';
import { FileHeaderCommentGenerator, indented, pascalCased, type GeneratedSourceFilename } from '../Utils';
import {
  CONST_REF,
  CppClassWriter,
  CppCodeGenerator,
  CppFileGenerator,
  CppFunctionArgument,
  CppTypeNameResolver,
  type CppCodeGeneratorNamespaceResolver,
  type CppTypeAlias,
  type CppTypeParser,
} from './CppCodeGenerator';
import { CppSchemaWriter } from './CppSchemaWriter';
import { propertyNameAllocatorForCpp } from './CppValidation';

interface CppPropertyName {
  fieldName: string;
  getterName: string;
  setterName: string;
  constructorParameterName: string;
}

interface CppProperty {
  name: CppPropertyName;
  property: ValdiModelProperty;
  typeParser: CppTypeParser;
}

/** An interface's method type aliases are its proxy's (in the implementation); the others are the class's. */
class CppCodeGeneratorModelNamespaceResolver implements CppCodeGeneratorNamespaceResolver {
  constructor(
    private readonly classNamespace: CppNamespace,
    private readonly proxyNamespace: CppNamespace,
    private readonly isInterface: boolean,
  ) {}

  getNamespace(typeAlias: CppTypeAlias): CppNamespace {
    return this.isInterface && typeAlias.isOnMethod ? this.proxyNamespace : this.classNamespace;
  }
}

export class CppModelGenerator {
  constructor(
    private readonly cppType: CppType,
    private readonly bundleInfo: BundleInfo,
    private readonly typeParameters: ValdiTypeParameter[] | undefined,
    private readonly properties: ValdiModelProperty[],
    private readonly sourceFileName: GeneratedSourceFilename,
    private readonly isInterface: boolean,
    private readonly comments: string | undefined,
  ) {}

  private resolveProperties(codeGenerator: CppCodeGenerator, nameAllocator: PropertyNameAllocator): CppProperty[] {
    return this.properties.map(property => {
      const typeParser = codeGenerator.getTypeParser(property.type, [property.name], nameAllocator);
      const fieldName = nameAllocator.allocate(`_${property.name}`).name;
      const getterName = nameAllocator.allocate(`get${pascalCased(property.name)}`).name;
      const setterName = nameAllocator.allocate(`set${pascalCased(property.name)}`).name;
      const constructorParameterName = nameAllocator.allocate(property.name).name;
      return { name: { fieldName, getterName, setterName, constructorParameterName }, property, typeParser };
    });
  }

  private generateClassFields(classNamespace: CppNamespace, cppProperties: CppProperty[]): CodeWriter {
    const decl = new CodeWriter();
    for (const { name, typeParser } of cppProperties) {
      const typeName = typeParser.typeNameResolver.resolve(classNamespace);
      if (typeParser.defaultInitializationString !== undefined) {
        decl.appendBody(`${typeName} ${name.fieldName} = ${typeParser.defaultInitializationString};\n`);
      } else {
        decl.appendBody(`${typeName} ${name.fieldName};\n`);
      }
    }
    return decl;
  }

  /** Generic classes are defined in their header. */
  private makeClassWriter(): CppClassWriter {
    return new CppClassWriter(
      this.cppType.declaration.namespace,
      this.cppType.declaration.name,
      new CodeWriter(),
      new CodeWriter(),
      this.typeParameters !== undefined,
    );
  }

  private generateClassConstructors(
    cppProperties: CppProperty[],
    parentClassName: string,
  ): { decl: CodeWriter; impl: CodeWriter } {
    const classWriter = this.makeClassWriter();
    classWriter.writeConstructor([], `${parentClassName}(getRegisteredClass())`, () => {});

    if (cppProperties.length) {
      const ctorParameters = cppProperties.map(
        ({ name, typeParser }) =>
          new CppFunctionArgument(
            typeParser.isMovable
              ? CppTypeNameResolver.withSpecifiers(CONST_REF, typeParser.typeNameResolver)
              : typeParser.typeNameResolver,
            name.constructorParameterName,
          ),
      );
      const ctorFieldInitializers = cppProperties
        .map(({ name, typeParser }) => {
          const initializer = typeParser.isMovable
            ? `std::move(${name.constructorParameterName})`
            : name.constructorParameterName;
          return `${name.fieldName}(${initializer})`;
        })
        .join(',\n');
      classWriter.writeConstructor(
        ctorParameters,
        `${parentClassName}(getRegisteredClass()),\n${ctorFieldInitializers}`,
        () => {},
      );
    }
    return { decl: classWriter.header, impl: classWriter.impl };
  }

  private generateClassMethods(cppProperties: CppProperty[]): { decl: CodeWriter; impl: CodeWriter } {
    const classWriter = this.makeClassWriter();
    const voidType = CppTypeNameResolver.withTypeName('void');
    for (const { name, typeParser } of cppProperties) {
      if (typeParser.isMovable) {
        classWriter.writeMethod(
          name.getterName,
          [],
          CppTypeNameResolver.withSpecifiers(CONST_REF, typeParser.typeNameResolver),
          'const',
          writer => writer.appendBody(`return ${name.fieldName};\n`),
        );
        classWriter.writeMethod(
          name.setterName,
          [
            new CppFunctionArgument(
              CppTypeNameResolver.withSpecifiers(CONST_REF, typeParser.typeNameResolver),
              'value',
            ),
          ],
          voidType,
          'none',
          writer => writer.appendBody(`${name.fieldName} = value;\n`),
        );
        classWriter.writeMethod(
          name.setterName,
          [
            new CppFunctionArgument(
              CppTypeNameResolver.withSpecifiers(['rValueRef'], typeParser.typeNameResolver),
              'value',
            ),
          ],
          voidType,
          'none',
          writer => writer.appendBody(`${name.fieldName} = std::move(value);\n`),
        );
      } else {
        classWriter.writeMethod(name.getterName, [], typeParser.typeNameResolver, 'const', writer =>
          writer.appendBody(`return ${name.fieldName};\n`),
        );
        classWriter.writeMethod(
          name.setterName,
          [new CppFunctionArgument(typeParser.typeNameResolver, 'value')],
          voidType,
          'none',
          writer => writer.appendBody(`${name.fieldName} = value;\n`),
        );
      }
    }
    return { decl: classWriter.header, impl: classWriter.impl };
  }

  /** getRegisteredClass(): the schema registered once, with the registered classes of the types it references. */
  private generateRegisterClass(generator: CppCodeGenerator): { decl: CodeWriter; impl: CodeWriter } {
    const { declaration } = this.cppType;
    const cppGeneratedClass = CppCodeGenerator.getValdiTypeName('CppGeneratedClass').resolve(declaration.namespace);
    const registeredClassType = CppTypeNameResolver.withSpecifiers(
      ['ptr'],
      CppCodeGenerator.getValdiTypeName('RegisteredCppGeneratedClass'),
    );

    const schemaWriter = new CppSchemaWriter(this.typeParameters, generator);
    if (this.isInterface) {
      schemaWriter.appendInterface(cppFullTypeName(declaration), this.properties, this.bundleInfo.asyncStrictMode);
    } else {
      schemaWriter.appendClass(cppFullTypeName(declaration), this.properties, this.bundleInfo.asyncStrictMode);
    }

    const classWriter = this.makeClassWriter();
    const registerSchemaParameters = [`"${schemaWriter.str}"`];
    if (generator.referencedTypes.length) {
      registerSchemaParameters.push(generator.getTypeReferencesVecExpression(declaration.namespace));
    }

    let registerMethod = 'registerSchema';
    if (this.typeParameters) {
      const typeParameterNames = this.typeParameters.map(typeParameter => typeParameter.name).join(', ');
      registerSchemaParameters.push(
        `Valdi::CppGeneratedGenericClass::makeTypeArgumentsCallback<${typeParameterNames}>()`,
      );
      generator.header.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedGenericClass.hpp');
      registerMethod = 'registerGenericSchema';
    }
    classWriter.writeMethod('getRegisteredClass', [], registeredClassType, 'static', writer => {
      writer.appendBody(
        `static auto *kRegisteredClass = ${cppGeneratedClass}::${registerMethod}(${registerSchemaParameters.join(', ')});\n\n`,
      );
      writer.appendBody('return kRegisteredClass;\n');
    });
    return { decl: classWriter.header, impl: classWriter.impl };
  }

  private generateFieldsReferenceArgument(cppProperties: CppProperty[]): string {
    if (!cppProperties.length) return '';
    return `, ${cppProperties.map(({ name }) => `self.${name.fieldName}`).join(', ')}`;
  }

  private generateMethodsReferenceArgument(receiverArgument: string, cppProperties: CppProperty[]): string {
    if (!cppProperties.length) return '';
    const className = this.cppType.declaration.name;
    const methodsReferenceString = cppProperties
      .map(({ name, typeParser }) =>
        typeParser.method
          ? `Valdi::CppMarshaller::methodToFunction<${className}, &${className}::${name.constructorParameterName}>(${receiverArgument})`
          : `${receiverArgument}->${name.constructorParameterName}()`,
      )
      .join(', ');
    return `, ${methodsReferenceString}`;
  }

  private writeClassPrologue(parentClassName: string, header: CodeWriter): void {
    header.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, this.comments));
    header.appendBody('\n');
    if (this.typeParameters) {
      const typeNames = this.typeParameters.map(typeParameter => `typename ${typeParameter.name}`).join(', ');
      header.appendBody(`template<${typeNames}>\n`);
    }
    header.appendBody(`class ${this.cppType.declaration.name}: public ${parentClassName} {\n`);
  }

  private getSelfTypename(): string {
    const { name } = this.cppType.declaration;
    if (!this.typeParameters) return name;
    return `${name}<${this.typeParameters.map(typeParameter => typeParameter.name).join(', ')}>`;
  }

  private writeClass(classNamespace: CppNamespace, generator: CppCodeGenerator, cppProperties: CppProperty[]): void {
    const parentClassName = resolveCppTypeName(
      CppFileGenerator.getValdiTypeDeclaration('CppGeneratedModel'),
      classNamespace,
    );
    const exceptionTrackerTypeDeclaration = CppFileGenerator.getValdiTypeDeclaration('ExceptionTracker');
    const valueTypeDeclaration = CppFileGenerator.getValdiTypeDeclaration('Value');
    generator.header.forwardDeclarations.addForwardDeclaration({ declaration: exceptionTrackerTypeDeclaration });
    generator.header.forwardDeclarations.addForwardDeclaration({ declaration: valueTypeDeclaration });

    const exceptionTrackerType = CppTypeNameResolver.withSpecifiers(
      ['ref'],
      CppTypeNameResolver.withTypeDeclaration(exceptionTrackerTypeDeclaration),
    );
    const valueType = CppTypeNameResolver.withTypeDeclaration(valueTypeDeclaration);

    const constructors = this.generateClassConstructors(cppProperties, parentClassName);
    const methods = this.generateClassMethods(cppProperties);
    const fieldsDeclaration = this.generateClassFields(classNamespace, cppProperties);
    const registerClass = this.generateRegisterClass(generator);
    const selfTypeName = this.getSelfTypename();

    // Header generation
    const header = generator.header.body;
    this.writeClassPrologue(parentClassName, header);
    header.appendBody('public:\n');
    if (generator.typealiases.length) {
      for (const cppTypealias of generator.typealiases)
        header.appendBody(cppTypealias.statement.resolve(classNamespace));
      header.appendBody('\n');
    }
    header.appendBody(constructors.decl);
    header.appendBody('\n');
    header.appendBody(methods.decl);
    header.appendBody(registerClass.decl);

    const marshallWriter = this.makeClassWriter();
    const fieldsReferenceArguments = this.generateFieldsReferenceArgument(cppProperties);
    const voidType = CppTypeNameResolver.withTypeName('void');
    const selfType = CppTypeNameResolver.withTypeName(selfTypeName);
    marshallWriter.writeMethod(
      'unmarshall',
      [
        new CppFunctionArgument(exceptionTrackerType, 'exceptionTracker'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(CONST_REF, valueType), 'value'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(['ref'], selfType), 'out'),
      ],
      voidType,
      'static',
      writer => {
        if (cppProperties.length) writer.appendBody('auto &self = out;\n');
        writer.appendBody(
          `Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value${fieldsReferenceArguments});\n`,
        );
      },
    );
    marshallWriter.writeMethod(
      'marshall',
      [
        new CppFunctionArgument(exceptionTrackerType, 'exceptionTracker'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(CONST_REF, selfType), 'value'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(['ref'], valueType), 'out'),
      ],
      voidType,
      'static',
      writer => {
        if (cppProperties.length) writer.appendBody('const auto &self = value;\n');
        writer.appendBody(
          `Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out${fieldsReferenceArguments});\n`,
        );
      },
    );
    header.appendBody(marshallWriter.header);
    header.appendBody('\nprivate:\n');
    header.appendBody(fieldsDeclaration);
    header.appendBody('};\n');

    // Impl generation
    const impl = generator.impl.body;
    impl.appendBody(constructors.impl);
    impl.appendBody(methods.impl);
    impl.appendBody(marshallWriter.impl);
    impl.appendBody(registerClass.impl);
  }

  private generateInterfaceMethods(
    classNamespace: CppNamespace,
    proxyNamespace: CppNamespace,
    nameAllocator: PropertyNameAllocator,
    cppProperties: CppProperty[],
  ): { decl: CodeWriter; impl: CodeWriter } {
    const decl = new CodeWriter();
    const impl = new CodeWriter();
    for (const { name, property, typeParser } of cppProperties) {
      const scopedNameAllocator = nameAllocator.scoped();
      const cppMethod = typeParser.method;
      if (cppMethod) {
        const returnTypeName = cppMethod.returnTypeNameResolver.resolve(classNamespace);
        const returnPrefix = returnTypeName === 'void' ? '' : 'return ';
        const parameterNames = cppMethod.parameters.map(parameter => scopedNameAllocator.allocate(parameter.name).name);
        const parameterWithTypes = cppMethod.parameters
          .map((parameter, index) => `${parameter.typeNameResolver.resolve(classNamespace)} ${parameterNames[index]}`)
          .join(', ');
        const methodName = name.constructorParameterName;

        decl.appendBody(`virtual ${returnTypeName} ${methodName}(${parameterWithTypes}) = 0;\n\n`);
        if (isOptional(property.type)) {
          impl.appendBody(
            `${returnTypeName} ${methodName}(${parameterWithTypes}) final {\n` +
              `  if (!${name.fieldName}) {\n` +
              '    Valdi::CppMarshaller::throwUnimplementedMethod();\n' +
              '  }\n' +
              `  ${returnPrefix}${name.fieldName}.value()(${parameterNames.join(', ')});\n` +
              '}\n\n',
          );
        } else {
          impl.appendBody(
            `${returnTypeName} ${methodName}(${parameterWithTypes}) final {\n` +
              `  ${returnPrefix}${name.fieldName}(${parameterNames.join(', ')});\n` +
              '}\n\n',
          );
        }
      } else {
        const methodName = name.constructorParameterName;
        decl.appendBody(`virtual ${typeParser.typeNameResolver.resolve(classNamespace)} ${methodName}() = 0;\n\n`);
        impl.appendBody(
          `${typeParser.typeNameResolver.resolve(proxyNamespace)} ${methodName}() final {\n` +
            `  return ${name.fieldName};\n` +
            '}\n\n',
        );
      }
    }
    return { decl, impl };
  }

  private writeInterface(
    classNamespace: CppNamespace,
    generator: CppCodeGenerator,
    proxyClassName: string,
    proxyNamespace: CppNamespace,
    nameAllocator: PropertyNameAllocator,
    cppProperties: CppProperty[],
  ): void {
    const { declaration } = this.cppType;
    const parentClassName = resolveCppTypeName(
      CppFileGenerator.getValdiTypeDeclaration('CppGeneratedInterface'),
      classNamespace,
    );
    const exceptionTrackerTypeDeclaration = CppFileGenerator.getValdiTypeDeclaration('ExceptionTracker');
    const valueTypeDeclaration = CppFileGenerator.getValdiTypeDeclaration('Value');
    generator.header.forwardDeclarations.addForwardDeclaration({ declaration: exceptionTrackerTypeDeclaration });
    generator.header.forwardDeclarations.addForwardDeclaration({ declaration: valueTypeDeclaration });

    const exceptionTrackerType = CppTypeNameResolver.withSpecifiers(
      ['ref'],
      CppTypeNameResolver.withTypeDeclaration(exceptionTrackerTypeDeclaration),
    );
    const valueType = CppTypeNameResolver.withTypeDeclaration(valueTypeDeclaration);
    const cppTypeRefType = CppCodeGenerator.makeRefType(CppTypeNameResolver.withTypeName(this.getSelfTypename()));
    const registerClass = this.generateRegisterClass(generator);
    const methods = this.generateInterfaceMethods(classNamespace, proxyNamespace, nameAllocator, cppProperties);
    const fieldsDeclaration = this.generateClassFields(proxyNamespace, cppProperties);

    // Header generation: the constructor and the marshalling methods are written below, into the writers already in
    // the header.
    const header = generator.header.body;
    this.writeClassPrologue(parentClassName, header);
    header.appendBody('public:\n');
    const nonMethodsTypealiases = generator.typealiases.filter(typealias => !typealias.isOnMethod);
    if (nonMethodsTypealiases.length) {
      for (const cppTypealias of nonMethodsTypealiases)
        header.appendBody(cppTypealias.statement.resolve(classNamespace));
      header.appendBody('\n');
    }
    const ctor = this.makeClassWriter();
    header.appendBody(ctor.header);
    header.appendBody(methods.decl);
    header.appendBody(registerClass.decl);
    const marshallWriter = this.makeClassWriter();
    header.appendBody(marshallWriter.header);
    header.appendBody('};\n');

    ctor.writeConstructor([], `${parentClassName}(getRegisteredClass())`, () => {});

    // Impl generation
    const impl = generator.impl.body;
    impl.appendBody(`class ${proxyClassName}: public ${declaration.name} {\n`);
    impl.appendBody('public:\n');
    const methodsTypealiases = generator.typealiases.filter(typealias => typealias.isOnMethod);
    if (methodsTypealiases.length) {
      for (const cppTypealias of methodsTypealiases) impl.appendBody(cppTypealias.statement.resolve(classNamespace));
      impl.appendBody('\n');
    }
    impl.appendBody(`${proxyClassName}() = default;\n`);
    impl.appendBody(`~${proxyClassName}() override = default;\n\n`);
    impl.appendBody(methods.impl);

    const voidType = CppTypeNameResolver.withTypeName('void');
    const proxyUnmarshallWriter = new CppClassWriter(declaration.namespace, proxyClassName, impl, impl, true);
    proxyUnmarshallWriter.writeMethod(
      'unmarshall',
      [
        new CppFunctionArgument(exceptionTrackerType, 'exceptionTracker'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(CONST_REF, valueType), 'value'),
        new CppFunctionArgument(
          CppTypeNameResolver.withSpecifiers(
            ['ref'],
            CppCodeGenerator.makeRefType(CppTypeNameResolver.withTypeName(proxyClassName)),
          ),
          'out',
        ),
      ],
      voidType,
      'static',
      writer => {
        const fieldsReferenceArguments = this.generateFieldsReferenceArgument(cppProperties);
        writer.appendBody(`out = Valdi::makeShared<${proxyClassName}>();\n`);
        if (cppProperties.length) writer.appendBody('auto &self = *out;\n');
        writer.appendBody(
          `Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value${fieldsReferenceArguments});\n`,
        );
      },
    );

    marshallWriter.writeMethod(
      'unmarshall',
      [
        new CppFunctionArgument(exceptionTrackerType, 'exceptionTracker'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(CONST_REF, valueType), 'value'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(['ref'], cppTypeRefType), 'out'),
      ],
      voidType,
      'static',
      writer => {
        writer.appendBody(
          `Valdi::CppMarshaller::unmarshallProxyObject<${proxyClassName}>(exceptionTracker, *getRegisteredClass(), value, out);\n`,
        );
      },
    );
    marshallWriter.writeMethod(
      'marshall',
      [
        new CppFunctionArgument(exceptionTrackerType, 'exceptionTracker'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(CONST_REF, cppTypeRefType), 'value'),
        new CppFunctionArgument(CppTypeNameResolver.withSpecifiers(['ref'], valueType), 'out'),
      ],
      voidType,
      'static',
      writer => {
        const methodsReferenceArguments = this.generateMethodsReferenceArgument('value', cppProperties);
        writer.appendBody(
          'Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {\n' +
            `   Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out${methodsReferenceArguments});\n` +
            '});\n',
        );
      },
    );

    impl.appendBody('private:\n');
    impl.appendBody(fieldsDeclaration);
    impl.appendBody('};\n\n');
    impl.appendBody(ctor.impl);
    impl.appendBody(marshallWriter.impl);
    impl.appendBody(registerClass.impl);
  }

  write(): NativeSource[] {
    const { declaration } = this.cppType;
    const namespace = declaration.namespace;
    const classNamespace = namespace.appending(declaration.name);

    const nameAllocator = propertyNameAllocatorForCpp();
    const proxyClassName = nameAllocator.allocate(`${declaration.name}Proxy`).name;
    const proxyNamespace = namespace.appending(proxyClassName);

    const generator = new CppCodeGenerator(
      namespace,
      this.cppType.includePath,
      new CppCodeGeneratorModelNamespaceResolver(classNamespace, proxyNamespace, this.isInterface),
    );
    for (const reserved of ['getRegisteredClass', 'registeredClass']) nameAllocator.allocate(reserved);

    generator.header.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedClass.hpp');
    generator.impl.includeSection.addInclude(this.cppType.includePath);
    if (this.typeParameters) {
      generator.header.includeSection.addInclude('valdi_core/cpp/Marshalling/CppMarshaller.hpp');
    } else {
      generator.impl.includeSection.addInclude('valdi_core/cpp/Marshalling/CppMarshaller.hpp');
    }

    const cppProperties = this.resolveProperties(generator, nameAllocator);
    if (this.isInterface) {
      this.writeInterface(classNamespace, generator, proxyClassName, proxyNamespace, nameAllocator, cppProperties);
    } else {
      this.writeClass(classNamespace, generator, cppProperties);
    }

    return [
      {
        relativePath: cppIncludeDir(this.cppType),
        filename: `${declaration.name}.hpp`,
        content: indented(generator.header.content, '  '),
        groupingIdentifier: `${this.bundleInfo.name}.hpp`,
        groupingPriority: 0,
        localFilenameDependencies: generator.dependenciesInSameHeaderFile,
      },
      {
        relativePath: cppIncludeDir(this.cppType),
        filename: `${declaration.name}.cpp`,
        content: indented(generator.impl.content, '  '),
        groupingIdentifier: `${this.bundleInfo.name}.cpp`,
        groupingPriority: 0,
        localFilenameDependencies: [],
      },
    ];
  }
}
