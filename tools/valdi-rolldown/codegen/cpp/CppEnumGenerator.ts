// ViewModels/CppEnumGenerator.swift: an @ExportEnum as an `enum class`, with the free functions marshalling it and the
// registered enum schema other types' schemas reference.
import { CodeWriter } from '../CodeWriter';
import {
  cppFullTypeName,
  cppIncludeDir,
  type BundleInfo,
  type CppType,
  type ExportedEnum,
  type NativeSource,
} from '../Models';
import { FileHeaderCommentGenerator, indented, pascalCased, type GeneratedSourceFilename } from '../Utils';
import { CppFileGenerator } from './CppCodeGenerator';
import { CppSchemaWriter } from './CppSchemaWriter';
import { propertyNameAllocatorForCpp } from './CppValidation';

export class CppEnumGenerator {
  constructor(
    private readonly exportedEnum: ExportedEnum,
    private readonly cppType: CppType,
    private readonly bundleInfo: BundleInfo,
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {}

  write(): NativeSource[] {
    const { declaration } = this.cppType;
    const header = new CppFileGenerator(declaration.namespace, true);
    const impl = new CppFileGenerator(declaration.namespace, false);

    impl.includeSection.addInclude(this.cppType.includePath);

    const exceptionTrackerTypeDecl = CppFileGenerator.getValdiTypeDeclaration('ExceptionTracker');
    const valueTypeDecl = CppFileGenerator.getValdiTypeDeclaration('Value');
    const registeredClassType = CppFileGenerator.getValdiTypeDeclaration('RegisteredCppGeneratedClass');
    const generatedEnumClass = CppFileGenerator.getValdiTypeDeclaration('CppGeneratedEnum');
    const exceptionTracker = cppFullTypeName(exceptionTrackerTypeDecl);
    const value = cppFullTypeName(valueTypeDecl);
    const registeredClass = cppFullTypeName(registeredClassType);

    header.forwardDeclarations.addForwardDeclaration({ declaration: exceptionTrackerTypeDecl });
    header.forwardDeclarations.addForwardDeclaration({ declaration: valueTypeDecl });
    header.forwardDeclarations.addForwardDeclaration({ declaration: registeredClassType });

    header.body.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, this.exportedEnum.comments));
    header.body.appendBody('\n');

    const enumBody = new CodeWriter();
    header.body.appendBody(`enum class ${declaration.name} {\n`);
    header.body.appendBody(enumBody);
    header.body.appendBody('};\n\n');

    header.body.appendBody(
      `void unmarshallEnum(${exceptionTracker} &exceptionTracker, const ${value} &value, ${declaration.name} &out);\n\n`,
    );
    header.body.appendBody(
      `void marshallEnum(${exceptionTracker} &exceptionTracker, ${declaration.name} value, ${value} &out);\n\n`,
    );
    header.body.appendBody(`${registeredClass} *getRegisteredEnumClass(const ${declaration.name} *);\n`);

    impl.includeSection.addInclude('valdi_core/cpp/Marshalling/CppGeneratedEnum.hpp');

    const schemaWriter = new CppSchemaWriter(undefined, undefined);
    const nameAllocator = propertyNameAllocatorForCpp();

    // Int cases carry their TypeScript value so C++ can hand one to anything keyed by the number (a proto field, a
    // server-side code). String cases have no number, so they take their index.
    let fqMarshallerTypeName: string;
    let allEnumValuesLiteral: string;
    let allCases: { name: string; value?: number; comments?: string }[];
    const { cases } = this.exportedEnum;
    if (cases.kind === 'enum') {
      schemaWriter.appendIntEnum(cppFullTypeName(declaration), cases.cases);
      const intEnumMarshaller = cppFullTypeName(CppFileGenerator.getValdiTypeDeclaration('CppIntEnumMarshaller'));
      fqMarshallerTypeName = `${intEnumMarshaller}<${declaration.name}, ${cases.cases.length}>`;
      allEnumValuesLiteral = cases.cases.map(enumCase => `${enumCase.value}`).join(', ');
      allCases = cases.cases.map(enumCase => ({
        name: nameAllocator.allocate(enumCase.name).name,
        value: enumCase.value,
        comments: enumCase.comments,
      }));
    } else {
      schemaWriter.appendStringEnum(cppFullTypeName(declaration), cases.cases);
      const stringEnumMarshaller = cppFullTypeName(CppFileGenerator.getValdiTypeDeclaration('CppStringEnumMarshaller'));
      fqMarshallerTypeName = `${stringEnumMarshaller}<${declaration.name}, ${cases.cases.length}>`;
      allEnumValuesLiteral = cases.cases.map(enumCase => `"${enumCase.value}"`).join(', ');
      allCases = cases.cases.map(enumCase => ({
        name: nameAllocator.allocate(enumCase.name).name,
        comments: enumCase.comments,
      }));
    }

    allCases.forEach(({ name, value, comments }, index) => {
      if (comments !== undefined) {
        enumBody.appendBody(FileHeaderCommentGenerator.generateMultilineComment(comments));
        enumBody.appendBody('\n');
      }
      enumBody.appendBody(`${name} = ${value ?? index}`);
      enumBody.appendBody(index !== allCases.length - 1 ? ',\n' : '\n');
    });

    const getEnumMarshallerName = `get${pascalCased(declaration.name)}EnumMarshaller`;
    impl.body.appendBody(`namespace {
  const ${fqMarshallerTypeName} &${getEnumMarshallerName}() {
    static auto kEnumMarshaller = ${fqMarshallerTypeName}({${allEnumValuesLiteral}});
    return kEnumMarshaller;
  }
}

void unmarshallEnum(${exceptionTracker} &exceptionTracker, const ${value} &value, ${declaration.name} &out) {
  ${getEnumMarshallerName}().unmarshall(exceptionTracker, value, out);
}

void marshallEnum(${exceptionTracker} &exceptionTracker, ${declaration.name} value, ${value} &out) {
  ${getEnumMarshallerName}().marshall(exceptionTracker, value, out);
}

${registeredClass} *getRegisteredEnumClass(const ${declaration.name} *) {
  static auto kEnumClass = ${cppFullTypeName(generatedEnumClass)}::registerEnumSchema("${schemaWriter.str}");
  return kEnumClass;
}`);

    return [
      {
        relativePath: cppIncludeDir(this.cppType),
        filename: `${declaration.name}.hpp`,
        content: indented(header.content, '  '),
        groupingIdentifier: `${this.bundleInfo.name}.hpp`,
        groupingPriority: 0,
        localFilenameDependencies: [],
      },
      {
        relativePath: cppIncludeDir(this.cppType),
        filename: `${declaration.name}.cpp`,
        content: indented(impl.content, '  '),
        groupingIdentifier: `${this.bundleInfo.name}.cpp`,
        groupingPriority: 0,
        localFilenameDependencies: [],
      },
    ];
  }
}
