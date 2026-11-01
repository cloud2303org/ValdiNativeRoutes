// Port of Valdi's SwiftSchemaWriter / SwiftEmittedIdentifiers (MIT).
import { EmittedIdentifiers } from '../CodeWriter';
import type { ValdiNodeClassMapping, ValdiTypeParameter } from '../Models';
import { SchemaWriter } from '../SchemaWriter';

export class SwiftEmittedIdentifiers extends EmittedIdentifiers {
  readonly registrations = new Map<string, string>();

  get initialization(): string {
    return `[${this.identifiers.map(name =>
      `ValdiMarshallableIdentifier(name: ${JSON.stringify(name)}, registerFunc: ${this.registrations.get(name) ?? 'nil'})`,
    ).join(',\n')}]`;
  }
}

export class SwiftSchemaWriter extends SchemaWriter {
  constructor(parameters: ValdiTypeParameter[] | undefined, identifiers: SwiftEmittedIdentifiers) {
    super(parameters, {
      getClassName(mapping: ValdiNodeClassMapping) {
        const type = mapping.iosType;
        if (!type) throw new Error('No iOS type in Swift schema mapping');
        const name = type.swiftName;
        const index = identifiers.getIdentifierIndex(name);
        const registration = type.iosLanguage !== 'objc'
          ? `register_${name}`
          : `{ ValdiMarshallableObjectRegistry.shared.${mapping.marshallAsUntyped ? 'registerUntypedObjCClass' : 'registerObjCClass'}(className: ${JSON.stringify(name)}) }`;
        identifiers.registrations.set(name, registration);
        return `[${index}]`;
      },
    }, false, true);
  }
}
