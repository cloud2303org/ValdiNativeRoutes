// Generation/Kotlin/KotlinModuleGenerator.swift: an @ExportModule as the interface of its members
// (KotlinModelGenerator), and the abstract module factory native code subclasses to implement the module.
import type { BundleInfo, ExportedModule, NativeSource } from '../Models';
import { FileHeaderCommentGenerator, indented, type GeneratedSourceFilename } from '../Utils';
import { JVMClass, KotlinCodeGenerator } from './KotlinCodeGenerator';
import { KotlinModelGenerator } from './KotlinModelGenerator';

export class KotlinModuleGenerator {
  constructor(
    private readonly bundleInfo: BundleInfo,
    private readonly fullTypeName: string,
    private readonly exportedModule: ExportedModule,
    private readonly sourceFileName: GeneratedSourceFilename,
  ) {}

  write(): NativeSource[] {
    const { bundleInfo, fullTypeName, exportedModule } = this;
    const { model } = exportedModule;
    const output = new KotlinModelGenerator(
      bundleInfo,
      fullTypeName,
      model.typeParameters,
      model.properties,
      this.sourceFileName,
      model.exportAsInterface,
      model.legacyConstructors,
      model.comments,
    ).write();

    const jvmClass = new JVMClass(`${fullTypeName}Factory`);
    const generator = new KotlinCodeGenerator(jvmClass.package);
    const baseClass = generator.importClass('com.snap.valdi.modules.ValdiGeneratedModuleFactory');
    const implementingClass = generator.importClass(fullTypeName);

    generator.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, model.comments));
    generator.appendBody('\n');
    generator.appendBody(`abstract class ${jvmClass.name}: ${baseClass.name}<${implementingClass.name}>() {
    override fun getModulePath(): String {
       return "${exportedModule.modulePath}"
    }
}`);

    const content = indented(generator.content, '    ');
    output.push(KotlinCodeGenerator.makeNativeSource(bundleInfo, jvmClass, content));
    return output;
  }
}
