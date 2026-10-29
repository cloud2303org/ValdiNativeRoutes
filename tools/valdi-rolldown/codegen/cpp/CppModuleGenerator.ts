// Generation/Cpp/CppModuleGenerator.swift: an @ExportModule as the interface of its members (CppModelGenerator), and
// the module factory native code inherits from to implement the module, registered with Valdi::RegisterModuleFactory.
import {
  cppFullTypeName,
  cppIncludeDir,
  makeCppType,
  type BundleInfo,
  type CppType,
  type ExportedModule,
  type NativeSource,
} from '../Models';
import { FileHeaderCommentGenerator, indented, type GeneratedSourceFilename } from '../Utils';
import { CppCodeGenerator, CppCodeGeneratorSingleNamespaceResolver } from './CppCodeGenerator';
import { CppModelGenerator } from './CppModelGenerator';

export class CppModuleGenerator {
  constructor(
    private readonly bundleInfo: BundleInfo,
    private readonly cppType: CppType,
    private readonly exportedModule: ExportedModule,
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {}

  write(): NativeSource[] {
    const { bundleInfo, cppType, exportedModule } = this;
    const moduleFactoryClassName = `${cppType.declaration.name}Factory`;
    const moduleFactoryCppType = makeCppType(
      { namespace: cppType.declaration.namespace, name: moduleFactoryClassName, symbolType: 'class' },
      bundleInfo,
      cppType.includePrefix,
    );
    const classNamespace = cppType.declaration.namespace.appending(moduleFactoryCppType.declaration.name);

    const output = new CppModelGenerator(
      cppType,
      bundleInfo,
      undefined,
      exportedModule.model.properties,
      this.sourceFileName,
      true,
      exportedModule.model.comments,
    ).write();

    const generator = new CppCodeGenerator(
      cppType.declaration.namespace,
      moduleFactoryCppType.includePath,
      new CppCodeGeneratorSingleNamespaceResolver(classNamespace),
    );
    generator.impl.includeSection.addInclude(moduleFactoryCppType.includePath);
    generator.header.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedModuleFactory.hpp');
    generator.header.includeSection.addInclude('valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp');
    if (cppType.includePath !== moduleFactoryCppType.includePath) {
      generator.header.includeSection.addInclude(cppType.includePath);
    }

    const additionalComments =
      'This type should be inherited from, and the onLoadModule() should be overriden to return\n' +
      `an instance of type ${cppFullTypeName(cppType.declaration)}.\n` +
      'The module should then be registered by creating a Valdi::RegisterModuleFactory static instance.\n';
    generator.header.body.appendBody(
      FileHeaderCommentGenerator.generateComment(this.sourceFileName, additionalComments),
    );
    generator.header.body.appendBody(`
class ${moduleFactoryClassName}: public Valdi::CppGeneratedModuleFactory<${cppType.declaration.name}> {
public:
    ${moduleFactoryClassName}();
    ~${moduleFactoryClassName}() override;

    Valdi::StringBox getModulePath() final;
};
`);

    generator.impl.body.appendBody(`${moduleFactoryClassName}::${moduleFactoryClassName}() = default;
${moduleFactoryClassName}::~${moduleFactoryClassName}() = default;

Valdi::StringBox ${moduleFactoryClassName}::getModulePath() {
    return Valdi::StringBox::fromCString("${exportedModule.modulePath}");
}`);

    output.push(
      {
        relativePath: cppIncludeDir(moduleFactoryCppType),
        filename: `${moduleFactoryCppType.declaration.name}.hpp`,
        content: indented(generator.header.content, '  '),
        groupingIdentifier: `${bundleInfo.name}.hpp`,
        groupingPriority: 0,
        localFilenameDependencies: [`${cppType.declaration.name}.hpp`],
      },
      {
        relativePath: cppIncludeDir(moduleFactoryCppType),
        filename: `${moduleFactoryCppType.declaration.name}.cpp`,
        content: indented(generator.impl.content, '  '),
        groupingIdentifier: `${bundleInfo.name}.cpp`,
        groupingPriority: 0,
        localFilenameDependencies: [],
      },
    );
    return output;
  }
}
