// ViewModels/ObjCEnumGenerator.swift: an @ExportEnum as an NS_CLOSED_ENUM (int) or NS_STRING_ENUM constants (string),
// registered with the runtime, and a function listing all the cases.
import {
  importHeaderStatement,
  type BundleInfo,
  type EnumCase,
  type ExportedEnum,
  type IOSType,
  type NativeSource,
} from '../Models';
import { FileHeaderCommentGenerator, type GeneratedSourceFilename } from '../Utils';
import {
  iosNativeSourcesFromGeneratedCode,
  nullableEnumTypeName,
  ObjCClassGenerator,
  type GeneratedCode,
} from './ObjCCodeGenerator';

/** Whether the values are 0 to count - 1, each once. */
function containsOnlyIncreasingValues(enumCases: EnumCase<number>[]): boolean {
  const set = new Set(enumCases.map(enumCase => enumCase.value));
  if (set.size !== enumCases.length) return false;
  for (let index = 0; index < enumCases.length; index++) {
    if (!set.has(index)) return false;
  }
  return true;
}

function generateEnumCaseString(declarationString: string, comments: string | undefined): string {
  if (comments === undefined) return declarationString;
  return `${FileHeaderCommentGenerator.generateMultilineComment(comments)}\n${declarationString}`;
}

export class ObjCEnumGenerator {
  private readonly typeName: string;

  constructor(
    private readonly iosType: IOSType,
    private readonly exportedEnum: ExportedEnum,
    private readonly sourceFileName: GeneratedSourceFilename,
    private readonly bundleInfo: BundleInfo,
  ) {
    this.typeName = iosType.name;
  }

  private generateCode(): GeneratedCode {
    const { typeName, sourceFileName } = this;
    const classGenerator = new ObjCClassGenerator(typeName);

    classGenerator.header.addImport('<Foundation/Foundation.h>');
    classGenerator.header.addImport('<valdi_core/SCValdiMarshaller.h>');
    classGenerator.apiImpl.addImport('<valdi_core/SCValdiMarshallableObjectRegistry.h>');
    classGenerator.impl.addImport('<valdi_core/SCValdiMarshallableObjectRegistry.h>');
    classGenerator.impl.addImport('<valdi_core/SCValdiMarshallableObject.h>');

    classGenerator.impl.addImport(importHeaderStatement(this.iosType, 'withUtilities'));
    classGenerator.impl.appendBody(FileHeaderCommentGenerator.generateComment(sourceFileName));
    classGenerator.impl.appendBody('\n\n');

    classGenerator.header.appendBody(FileHeaderCommentGenerator.generateComment(sourceFileName));
    classGenerator.header.appendBody('\n');

    classGenerator.apiHeader.appendBody(
      FileHeaderCommentGenerator.generateComment(sourceFileName, this.exportedEnum.comments),
    );
    classGenerator.apiHeader.appendBody('\n');

    const { cases } = this.exportedEnum;
    if (cases.kind === 'enum') {
      const objcEnumCases = cases.cases
        .map(enumCase => generateEnumCaseString(`${typeName}${enumCase.name} = ${enumCase.value}`, enumCase.comments))
        .join(',\n');
      classGenerator.apiHeader.appendBody(`typedef NS_CLOSED_ENUM(int32_t, ${typeName}) {\n    ${objcEnumCases}\n}`);
      classGenerator.apiHeader.appendBody(';\n');
      classGenerator.apiHeader.appendBody(`    NSArray<NSNumber *> * _Nonnull ${typeName}GetAllCases();\n`);

      if (containsOnlyIncreasingValues(cases.cases)) {
        classGenerator.apiImpl.appendBody(`\nVALDI_TRIVIAL_INT_ENUM(${typeName}, ${cases.cases.length})\n`);
      } else {
        const allEnumCasesBody = cases.cases.map(enumCase => `${typeName}${enumCase.name}`).join(', ');
        classGenerator.apiImpl.appendBody(`\nVALDI_INT_ENUM(${typeName}, ${allEnumCasesBody})\n`);
      }
      classGenerator.apiImpl.appendBody('\n');
      classGenerator.apiImpl.appendBody(`NSArray<NSNumber *> * _Nonnull ${typeName}GetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSNumber *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[${cases.cases.map(enumCase => `@${enumCase.value}`).join(', ')}];
    });
    return kAllCases;
}`);
    } else {
      const objcEnumCases = cases.cases
        .map(enumCase =>
          generateEnumCaseString(`FOUNDATION_EXPORT ${typeName} ${typeName}${enumCase.name};\n`, enumCase.comments),
        )
        .join('');
      classGenerator.apiHeader.appendBody(`typedef NSString * _Nonnull ${typeName} NS_STRING_ENUM`);
      classGenerator.apiHeader.appendBody(';\n');
      classGenerator.apiHeader.appendBody(
        `typedef NSString * _Nullable ${nullableEnumTypeName(typeName)} NS_STRING_ENUM`,
      );
      classGenerator.apiHeader.appendBody(';\n');
      classGenerator.apiHeader.appendBody(`\n    ${objcEnumCases}`);
      classGenerator.apiHeader.appendBody('\n');
      classGenerator.apiHeader.appendBody(`    NSArray<NSString *> * _Nonnull ${typeName}GetAllCases();`);

      const objcEnumCaseNames = cases.cases.map(enumCase => `${typeName}${enumCase.name}`);
      const objcEnumCasesImpl = cases.cases
        .map(enumCase => `${typeName} ${typeName}${enumCase.name} = @"${enumCase.value}";\n`)
        .join('');
      classGenerator.apiImpl.appendBody(objcEnumCasesImpl);

      const allEnumCasesBody = objcEnumCaseNames.join(', ');
      classGenerator.apiImpl.appendBody(`VALDI_STRING_ENUM(${typeName}, ${allEnumCasesBody})`);
      classGenerator.apiImpl.appendBody('\n');
      classGenerator.apiImpl.appendBody(`NSArray<NSString *> * _Nonnull ${typeName}GetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[${allEnumCasesBody}];
    });
    return kAllCases;
}`);
    }

    return {
      apiHeader: classGenerator.apiHeader,
      apiImpl: classGenerator.apiImpl,
      header: classGenerator.header,
      impl: classGenerator.impl,
    };
  }

  write(): NativeSource[] {
    return iosNativeSourcesFromGeneratedCode(this.generateCode(), this.iosType, this.bundleInfo);
  }
}
