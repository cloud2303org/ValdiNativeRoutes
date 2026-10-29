// Processors/GenerateDependencyInjectionDataProcessor.swift: what native dependency injection needs of the @Context
// models. On Android, a factory for each, which it creates them with; on iOS, the module's dependency metadata.
import type { DocumentsIndexer } from './CompilationItems';
import { JVMClass, KotlinCodeGenerator } from './kotlin/KotlinCodeGenerator';
import { KotlinFactoryGenerator } from './kotlin/KotlinFactoryGenerator';
import type { BundleInfo, NativeSourceAndPlatform, ValdiModel } from './Models';
import { ObjCDependencyRepresentationGenerator } from './objc/ObjCDependencyRepresentationGenerator';

const contextModels = (items: DocumentsIndexer): ValdiModel[] =>
  items.items.flatMap(item => (item.kind === 'exportedDependencyMetadata' ? [item.model] : []));

export function generateDependencyInjectionData(
  items: DocumentsIndexer,
  bundleInfo: BundleInfo,
): NativeSourceAndPlatform[] {
  const out: NativeSourceAndPlatform[] = [];
  for (const item of items.items) {
    if (item.kind !== 'exportedDependencyMetadata' || item.model.androidClassName === undefined) continue;
    const { model } = item;
    const jvmClass = new JVMClass(model.androidClassName!);
    const content = new KotlinFactoryGenerator(
      jvmClass,
      model.typeParameters,
      model.properties,
      item.sourceFilename,
    ).write();
    out.push({
      source: KotlinCodeGenerator.makeNativeSource(bundleInfo, jvmClass, content, `${jvmClass.name}_ContextFactory.kt`),
      platform: 'android',
    });
  }
  return out;
}

/** The module's dependencyData.json (ios/metadata), none when it has no @Context model. */
export function generateIOSDependencyMetadata(items: DocumentsIndexer): string | undefined {
  const models = contextModels(items);
  return models.length ? new ObjCDependencyRepresentationGenerator(models).generate() : undefined;
}
