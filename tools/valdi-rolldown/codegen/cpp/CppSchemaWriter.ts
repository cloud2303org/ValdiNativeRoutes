// Generation/Cpp/CppSchemaWriter.swift: in C++ schemas, a class is referenced by its index in the type references the
// code generator collected while parsing the types (`r:'[0]'`), found by its canonical type key.
import type { ValdiModelPropertyType, ValdiNodeClassMapping, ValdiTypeParameter } from '../Models';
import { SchemaWriter, type SchemaWriterListener } from '../SchemaWriter';
import { CompilerError } from '../Utils';
import { CppCodeGenerator } from './CppCodeGenerator';

class CppSchemaWriterListener implements SchemaWriterListener {
  private readonly indexByTypeName: Map<string, number>;

  constructor(generator: CppCodeGenerator | undefined) {
    // The type references as they are now: every type was parsed before the schema is written.
    this.indexByTypeName = new Map((generator?.referenceTypeKeys ?? []).map((key, index) => [key, index]));
  }

  getClassName(nodeMapping: ValdiNodeClassMapping, typeArguments: ValdiModelPropertyType[] | undefined) {
    if (!nodeMapping.isGenerated) return undefined;
    const fullTypeName = CppCodeGenerator.makeCanonicalTypeKey(
      typeArguments
        ? { kind: 'genericObject', mapping: nodeMapping, typeArguments }
        : { kind: 'object', mapping: nodeMapping },
    );
    const index = this.indexByTypeName.get(fullTypeName);
    if (index === undefined)
      throw new CompilerError(`Could not resolve dependent declaration for type ${fullTypeName}`);
    return `[${index}]`;
  }
}

/** Function parameters and return values are never boxed, nor int enums. */
export class CppSchemaWriter extends SchemaWriter {
  constructor(typeParameters: ValdiTypeParameter[] | undefined, generator: CppCodeGenerator | undefined) {
    super(typeParameters, new CppSchemaWriterListener(generator), false, false);
  }
}
