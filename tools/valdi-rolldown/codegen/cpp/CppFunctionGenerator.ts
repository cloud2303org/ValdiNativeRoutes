// Generation/Cpp/CppFunctionGenerator.swift: an @ExportFunction as a Valdi::CppGeneratedExportedFunction class, which
// native code resolves from a JS runtime to call the function.
import {
  cppIncludeDir,
  CppNamespace,
  EMPTY_INJECTABLE_PARAMS,
  type BundleInfo,
  type CppType,
  type ExportedFunction,
  type NativeSource,
  type ValdiModelProperty,
} from '../Models';
import { FileHeaderCommentGenerator, indented, type GeneratedSourceFilename } from '../Utils';
import { CppCodeGenerator, CppCodeGeneratorSingleNamespaceResolver } from './CppCodeGenerator';
import { CppSchemaWriter } from './CppSchemaWriter';
import { propertyNameAllocatorForCpp } from './CppValidation';

export class CppFunctionGenerator {
  constructor(
    private readonly cppType: CppType,
    private readonly exportedFunction: ExportedFunction,
    private readonly sourceFileName: GeneratedSourceFilename,
    /** The function's file in its module, without extension: `src/app`. */
    private readonly modulePath: string,
    private readonly bundleInfo: BundleInfo,
  ) {}

  write(): NativeSource[] {
    const { cppType, exportedFunction, bundleInfo, modulePath } = this;
    const { declaration } = cppType;
    const typealiasNamespace = declaration.namespace.appending(`${declaration.name}TypeAliases`);

    const generator = new CppCodeGenerator(
      declaration.namespace,
      cppType.includePath,
      new CppCodeGeneratorSingleNamespaceResolver(typealiasNamespace),
    );

    generator.header.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedExportedFunction.hpp');
    generator.header.includeSection.addInclude('valdi_core/cpp/Utils/Result.hpp');
    generator.header.includeSection.addInclude('valdi_core/cpp/Utils/Shared.hpp');
    generator.header.includeSection.addInclude('valdi_core/cpp/Utils/ValueTypedObject.hpp');
    generator.impl.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp');
    generator.impl.includeSection.addInclude(cppType.includePath);

    const valdiCoreNamespace = new CppNamespace(['snap', 'valdi_core']);
    for (const [namespace, name] of [
      [valdiCoreNamespace, 'JSRuntime'],
      [valdiCoreNamespace, 'JSRuntimeNativeObjectsManager'],
      [new CppNamespace(['Valdi']), 'RegisteredCppGeneratedClass'],
    ] as const) {
      generator.header.forwardDeclarations.addForwardDeclaration({
        declaration: { namespace, name, symbolType: 'class' },
      });
    }

    const property: ValdiModelProperty = {
      name: exportedFunction.functionName,
      type: {
        kind: 'function',
        parameters: exportedFunction.parameters,
        returnType: exportedFunction.returnType,
        isSingleCall: false,
        shouldCallOnWorkerThread: false,
        allowSyncCall: exportedFunction.allowSyncCall,
      },
      comments: exportedFunction.comments,
      injectableParams: EMPTY_INJECTABLE_PARAMS,
    };

    const nameAllocator = propertyNameAllocatorForCpp();
    const returnTypeParser = generator.getTypeParser(exportedFunction.returnType, [], nameAllocator);
    const parameterTypeParsers = exportedFunction.parameters.map(parameter =>
      generator.getTypeParser(parameter.type, [], nameAllocator),
    );

    const schemaWriter = new CppSchemaWriter(undefined, generator);
    schemaWriter.appendClass(declaration.name, [property], bundleInfo.asyncStrictMode);

    const allTypeArguments = [returnTypeParser, ...parameterTypeParsers]
      .map(typeParser => typeParser.typeNameResolver.resolve(declaration.namespace))
      .join(', ');

    const registerSchemaParameters = [`"${schemaWriter.str}"`];
    if (generator.referencedTypes.length) {
      registerSchemaParameters.push(generator.getTypeReferencesVecExpression(declaration.namespace));
    }

    const header = generator.header.body;
    if (generator.typealiases.length) {
      header.appendBody(`namespace ${typealiasNamespace.components[typealiasNamespace.components.length - 1]} {\n`);
      for (const cppTypealias of generator.typealiases)
        header.appendBody(cppTypealias.statement.resolve(typealiasNamespace));
      header.appendBody('}\n\n');
    }

    header.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, exportedFunction.comments));

    const className = declaration.name;
    const jsRuntimeArguments =
      'snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager';
    header.appendBody(`
class ${className}: public Valdi::CppGeneratedExportedFunction<${allTypeArguments}> {
public:
    using CppGeneratedExportedFunction<${allTypeArguments}>::CppGeneratedExportedFunction;

    /**
    * Resolve the function from the given JS runtime. If the native objects manager is provided,
    * emitted native objects will be associated with the given manager, otherwise they will be
    * associated with the global native objects manager and only be cleaned up on JS GC.
    */
    static Valdi::Result<${className}> resolve(${jsRuntimeArguments});

    /**
    * Resolve the function as a ValueTypedObject without C++ type instantiation.
    * Useful for bridging scenarios where only the typed schema representation is needed.
    */
    static Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> resolveAsTypedObject(${jsRuntimeArguments});

    static Valdi::RegisteredCppGeneratedClass& registeredSchema();
};
`);

    const path = `${bundleInfo.name}/${modulePath}`;
    generator.impl.body.appendBody(`
Valdi::RegisteredCppGeneratedClass& ${className}::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema(${registerSchemaParameters.join(', ')});
    return *kSchema;
}

Valdi::Result<${className}> ${className}::resolve(${jsRuntimeArguments}) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<${className}>(jsRuntime, nativeObjectsManager, "${path}", registeredSchema());
}

Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> ${className}::resolveAsTypedObject(${jsRuntimeArguments}) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "${path}", registeredSchema());
}`);

    return [
      {
        relativePath: cppIncludeDir(cppType),
        filename: `${declaration.name}.hpp`,
        content: indented(generator.header.content, '  '),
        groupingIdentifier: `${bundleInfo.name}.hpp`,
        groupingPriority: 0,
        localFilenameDependencies: generator.dependenciesInSameHeaderFile,
      },
      {
        relativePath: cppIncludeDir(cppType),
        filename: `${declaration.name}.cpp`,
        content: indented(generator.impl.content, '  '),
        groupingIdentifier: `${bundleInfo.name}.cpp`,
        groupingPriority: 0,
        localFilenameDependencies: [],
      },
    ];
  }
}
