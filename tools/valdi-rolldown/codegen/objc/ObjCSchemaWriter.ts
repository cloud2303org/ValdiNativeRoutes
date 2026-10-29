// Generation/ObjC/ObjCSchemaWriter.swift and Generation/ObjC/ObjCEmittedIdentifiers.swift: in ObjC schemas, a class
// is referenced by its index in the descriptor's identifiers (`r:'[0]'`), and int enums are boxed where optional.
import { CodeWriter, EmittedIdentifiers } from '../CodeWriter';
import type { ValdiModelPropertyType, ValdiNodeClassMapping, ValdiTypeParameter } from '../Models';
import { SchemaWriter, type SchemaWriterListener } from '../SchemaWriter';
import { CompilerError } from '../Utils';

export class ObjCEmittedIdentifiers extends EmittedIdentifiers {
  /** The C array of the identifiers, nil-terminated. */
  get initializationString(): CodeWriter {
    const out = new CodeWriter();
    out.appendBody('{\n');
    for (const identifier of this.identifiers) {
      out.appendBody(`"${identifier}"`);
      out.appendBody(',\n');
    }
    out.appendBody('nil\n');
    out.appendBody('}');
    return out;
  }
}

class ObjCSchemaWriterListener implements SchemaWriterListener {
  constructor(private readonly emittedIdentifiers: ObjCEmittedIdentifiers) {}

  getClassName(nodeMapping: ValdiNodeClassMapping, _typeArguments: ValdiModelPropertyType[] | undefined): string {
    if (!nodeMapping.iosType) throw new CompilerError('No iOS type in given mapping');
    return `[${this.emittedIdentifiers.getIdentifierIndex(nodeMapping.iosType.name)}]`;
  }
}

export class ObjCSchemaWriter extends SchemaWriter {
  constructor(typeParameters: ValdiTypeParameter[] | undefined, emittedIdentifiers: ObjCEmittedIdentifiers) {
    super(typeParameters, new ObjCSchemaWriterListener(emittedIdentifiers), false, true);
  }
}
