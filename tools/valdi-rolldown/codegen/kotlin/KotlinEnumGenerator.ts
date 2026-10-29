// ViewModels/KotlinEnumGenerator.swift: an @ExportEnum as a Kotlin enum class with its @ValdiEnum descriptor (each
// case's value in the schema) and a `value` property.
import type { BundleInfo, EnumCase, ExportedEnum, NativeSource } from '../Models';
import { FileHeaderCommentGenerator, indented, type GeneratedSourceFilename } from '../Utils';
import { JVMClass, KotlinCodeGenerator, type KotlinDescriptorObjectType } from './KotlinCodeGenerator';

export class KotlinEnumGenerator {
  private readonly writer: KotlinCodeGenerator;
  private readonly jvmClass: JVMClass;

  constructor(
    private readonly bundleInfo: BundleInfo,
    fullTypeName: string,
    private readonly exportedEnum: ExportedEnum,
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {
    this.jvmClass = new JVMClass(fullTypeName);
    this.writer = new KotlinCodeGenerator(this.jvmClass.package);
  }

  write(): NativeSource[] {
    const { cases } = this.exportedEnum;
    if (cases.kind === 'enum') {
      this.writeEnum('Int', 'intEnum', cases.cases, enumCase => `${enumCase.value}`);
    } else {
      this.writeEnum('String', 'stringEnum', cases.cases, enumCase => `'${enumCase.value}'`);
    }
    const content = indented(this.writer.content, '    ');
    return [KotlinCodeGenerator.makeNativeSource(this.bundleInfo, this.jvmClass, content)];
  }

  private writeEnum<T extends string | number>(
    enumType: 'Int' | 'String',
    objectType: KotlinDescriptorObjectType,
    cases: EnumCase<T>[],
    getCaseStringValue: (enumCase: EnumCase<T>) => string,
  ): void {
    const { writer } = this;
    writer.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, this.exportedEnum.comments));
    writer.appendBody('\n');

    const importedEnumType = writer.importClass('com.snap.valdi.schema.ValdiEnumType');
    const valdiEnumUtils = writer.importClass('com.snap.valdi.utils.ValdiEnumUtils');

    const descriptorAnnotation = writer.getDescriptorAnnotation(objectType, undefined, [
      ['type', `${importedEnumType.name}.${enumType.toUpperCase()}`],
    ]);

    writer.appendBody(descriptorAnnotation);
    writer.appendBody(`enum class ${this.jvmClass.name} {\n`);
    cases.forEach((enumCase, index) => {
      const commaOrSemicolon = index === cases.length - 1 ? ';' : ',';
      if (enumCase.comments !== undefined) {
        writer.appendBody(FileHeaderCommentGenerator.generateMultilineComment(enumCase.comments));
        writer.appendBody('\n');
      }
      const fieldAnnotationContent = descriptorAnnotation.appendField(
        index,
        enumCase.name,
        enumCase.name,
        enumCase.name,
        schemaWriter => schemaWriter.appendEnumValue(getCaseStringValue(enumCase)),
      );
      writer.appendBody(fieldAnnotationContent);
      writer.appendBody(`${enumCase.name}${commaOrSemicolon}\n`);
    });

    writer.appendBody(`\nval value: ${enumType}\n`);
    writer.appendBody(`get() = ${valdiEnumUtils.name}.getEnum${enumType}Value(this)\n\n`);
    writer.appendBody('}\n');
  }
}
