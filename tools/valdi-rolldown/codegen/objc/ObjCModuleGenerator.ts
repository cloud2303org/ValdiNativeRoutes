// Generation/ObjC/ObjCModuleGenerator.swift: an @ExportModule as the protocol of its members (ObjCModelGenerator), and
// the module factory native code subclasses to implement the module (in the API files: no utilities of its own).
import { CodeWriter } from '../CodeWriter';
import {
  importHeaderFilename,
  makeIOSType,
  type BundleInfo,
  type ExportedModule,
  type IOSType,
  type NativeSource,
} from '../Models';
import { FileHeaderCommentGenerator, trimmed, type GeneratedSourceFilename } from '../Utils';
import { iosNativeSourcesFromGeneratedCode, ObjCFileGenerator, type GeneratedCode } from './ObjCCodeGenerator';
import { ObjCModelGenerator } from './ObjCModelGenerator';

export class ObjCModuleGenerator {
  constructor(
    private readonly iosType: IOSType,
    private readonly exportedModule: ExportedModule,
    private readonly bundleInfo: BundleInfo,
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {}

  private generateCode(iosType: IOSType): GeneratedCode {
    const implementingType = this.iosType;
    const header = new ObjCFileGenerator();
    const impl = new ObjCFileGenerator();

    header.addImport('<valdi_core/SCValdiGeneratedModuleFactory.h>');
    header.addImport(`"${importHeaderFilename(implementingType, 'apiOnly')}"`);

    const comments = trimmed(
      `Subclasses of this class must implement the onLoadModule method\nand return an object implementing ${implementingType.name}.`,
    );
    header.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, comments));
    header.appendBody(`
@interface ${iosType.name}: SCValdiGeneratedModuleFactory

- (id<${implementingType.name}> _Nonnull)onLoadModule;

@end`);

    impl.appendBody(`@implementation ${iosType.name}

- (id<${implementingType.name}>)onLoadModule
{
  return [self onLoadModule];
}

- (NSString *)getModulePath
{
  return @"${this.exportedModule.modulePath}";
}

- (Protocol *)moduleProtocol
{
  return @protocol(${implementingType.name});
}

@end`);

    return { apiHeader: header, apiImpl: impl, header: new CodeWriter(), impl: new CodeWriter() };
  }

  write(): NativeSource[] {
    const { model } = this.exportedModule;
    const output = new ObjCModelGenerator(
      this.iosType,
      this.bundleInfo,
      undefined,
      model.properties,
      this.sourceFileName,
      true,
      model.legacyConstructors,
      model.comments,
    ).write();

    const resolvedIOSType = makeIOSType(
      `${this.iosType.name}Factory`,
      undefined,
      this.bundleInfo,
      this.iosType.kind,
      this.iosType.iosLanguage,
    );
    output.push(
      ...iosNativeSourcesFromGeneratedCode(this.generateCode(resolvedIOSType), resolvedIOSType, this.bundleInfo),
    );
    return output;
  }
}
