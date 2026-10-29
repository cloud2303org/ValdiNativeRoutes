// Generation/ObjC/ObjCDependencyRepresentationGenerator.swift: the module's dependency metadata for iOS
// (ios/metadata/dependencyData.json), each @Context class's properties as native dependency injection declares them.
import { isOptional, unwrappingOptional, type ValdiModel } from '../Models';
import { ObjCClassGenerator } from './ObjCCodeGenerator';
import { propertyNameAllocatorForObjC } from './ObjCValidation';

interface ContextFactoryProperty {
  qualifiedType: string;
  name: string;
  propertyAttribute: string;
  injectable: boolean;
}

/** JSONEncoder with .sortedKeys: keys sorted at every level, and '/' escaped as Foundation does. */
function encodeSortedKeys(value: unknown): string {
  const sortKeys = (_key: string, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item;
  // A '/' can only be in a string.
  return JSON.stringify(value, sortKeys).replace(/\//g, '\\/');
}

export class ObjCDependencyRepresentationGenerator {
  /** The @Context models, in item order. Every module has single file codegen. */
  constructor(private readonly models: ValdiModel[]) {}

  generate(): string {
    const contexts: Record<string, ContextFactoryProperty[]> = {};
    for (const model of this.models) {
      const iosType = model.iosType;
      if (!iosType) continue;
      const className = iosType.name;
      const objcGenerator = new ObjCClassGenerator(className);
      const nameAllocator = propertyNameAllocatorForObjC();
      contexts[className] = model.properties.map(property => {
        const typeParser = objcGenerator.writeTypeParser(
          unwrappingOptional(property.type),
          isOptional(property.type),
          [property.name],
          true,
          model.exportAsInterface,
          nameAllocator.scoped(),
        );
        return {
          qualifiedType: typeParser.typeName,
          name: property.name,
          propertyAttribute: typeParser.propertyAttribute,
          injectable: property.injectableParams.ios,
        };
      });
    }
    return encodeSortedKeys({ single_file_codegen: true, contexts });
  }
}
