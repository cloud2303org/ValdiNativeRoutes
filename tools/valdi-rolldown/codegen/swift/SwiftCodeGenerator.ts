// Port of Generation/Swift/SwiftCodeGenerator.swift (Valdi, MIT).
// Uses the upstream ValdiCoreSwift ABI, not Objective-C-generated bridge functions.
import {
  isOptional, unwrappingOptional,
  type BundleInfo, type IOSType, type NativeSource, type ValdiModelProperty,
  type ValdiModelPropertyType, type ValdiTypeParameter,
} from '../Models';
import { PropertyNameAllocator } from '../PropertyNameAllocator';
import { SwiftEmittedIdentifiers, SwiftSchemaWriter } from './SwiftSchemaWriter';

const keywords = `associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while Any as false is nil self Self super throws true try associativity convenience didSet dynamic final get indirect infix lazy left mutating none nonmutating optional override postfix precedence prefix Protocol required right set some Type unowned weak willSet any await async actor`.split(' ');

export function swiftNames(): PropertyNameAllocator {
  const allocator = new PropertyNameAllocator();
  for (const name of [...keywords, 'marshaller', 'objectIndex', 'functionImpl', 'result', '__result']) allocator.allocate(name);
  return allocator;
}

export interface SwiftFunction {
  helper: string;
  names: string[];
  parameters: SwiftType[];
  result: SwiftType;
}

export interface SwiftType {
  name: string;
  optional: boolean;
  marshaller?: string;
  inner?: SwiftType;
  fn?: SwiftFunction;
  interface?: boolean;
}

export interface SwiftProperty {
  name: string;
  original: ValdiModelProperty;
  type: SwiftType;
}

export const bare = (type: SwiftType) => type.optional ? type.name.slice(0, -1) : type.name;
export const escaping = (type: SwiftType) => type.fn && !type.optional ? '@escaping ' : '';
export const closureType = (fn: SwiftFunction) =>
  `(${fn.parameters.map(type => escaping(type) + type.name).join(', ')}) throws -> ${fn.result.name}`;
export const namedParameters = (fn: SwiftFunction) =>
  fn.parameters.map((type, index) => `${fn.names[index]}: ${escaping(type)}${type.name}`).join(', ');
export const methodType = (fn: SwiftFunction) => `(${namedParameters(fn)}) throws -> ${fn.result.name}`;
const args = (fn: SwiftFunction) => fn.names.join(', ');
export function swiftString(text: string): string {
  return '"' + [...text].map(character => {
    switch (character) {
      case '\\': return '\\\\';
      case '"': return '\\"';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      default: {
        const code = character.codePointAt(0)!;
        return code < 32 || code === 0x7f || code === 0x2028 || code === 0x2029
          ? `\\u{${code.toString(16)}}` : character;
      }
    }
  }).join('') + '"';
}
const q = swiftString;

export class SwiftSourceFileGenerator {
  readonly imports = new Set(['ValdiCoreSwift']);
  readonly functions: SwiftType[] = [];
  readonly names = swiftNames();

  constructor(readonly bundle: BundleInfo) {}

  type(input: ValdiModelPropertyType, helper: string, names = this.names.scoped()): SwiftType {
    const optional = isOptional(input);
    const type = unwrappingOptional(input);
    const make = (name: string, marshaller?: string, extra: Partial<SwiftType> = {}): SwiftType => ({
      name: name + (optional ? '?' : ''), optional,
      marshaller: marshaller ? (optional ? 'Optional' : '') + marshaller : undefined, ...extra,
    });
    switch (type.kind) {
      case 'string': return make('String', 'String');
      case 'double': return make('Double', 'Double');
      case 'bool': return make('Bool', 'Bool');
      case 'long': return make('Int64', 'Long');
      case 'bytes': this.imports.add('Foundation'); return make('Data', 'Data');
      case 'void': return { name: 'Void', optional: false };
      case 'any': return { name: 'Any?', optional: true, marshaller: 'OptionalUntyped' };
      case 'array': {
        const inner = this.type(type.elementType, helper + 'Element', names);
        return make(`[${inner.name}]`, 'Array', { inner });
      }
      case 'map': {
        if (type.keyType.kind !== 'string') throw new Error('Maps with non-string keys are not supported in Swift');
        const inner = this.type(type.valueType, helper + 'Value', names);
        return make(`[String: ${inner.name}]`, 'Map', { inner });
      }
      case 'promise': {
        const inner = this.type(type.typeArgument, helper + 'Result', names);
        return make(`ValdiPromise<${inner.name}>`, 'Promise');
      }
      case 'function': {
        if (type.parameters.length > 16) throw new Error('Exported functions to Swift support up to 16 parameters');
        const scope = names.scoped();
        const fn: SwiftFunction = {
          helper,
          names: type.parameters.map(p => scope.allocate(p.name).name),
          parameters: type.parameters.map(p => this.type(p.type, helper + p.name, scope)),
          result: this.type(type.returnType, helper + 'Return', scope),
        };
        const result = make(`(${closureType(fn)})`, 'Function', { fn });
        this.functions.push(result);
        return result;
      }
      case 'enum':
      case 'object':
      case 'genericObject': {
        const mapping = type.mapping;
        const ios = mapping.iosType;
        if (!ios) throw new Error('No Swift type declared');
        const module = ios.importPrefix;
        if (module && module !== this.bundle.iosModuleName)
          this.imports.add(module + (ios.iosLanguage === 'both' ? '_Swift' : ''));
        if (type.kind === 'enum') return make(ios.swiftName, 'Enum');
        if (type.kind === 'genericObject') {
          const parameters = type.typeArguments.map((t, i) => this.type(t, helper + i, names));
          return make(`${ios.swiftName}<${parameters.map(t => t.name).join(', ')}>`, 'GenericObject');
        }
        const swift = ios.iosLanguage !== 'objc';
        return make(ios.swiftName, swift ? 'Object' : 'ObjCObject', {
          interface: swift && mapping.kind === 'interface',
        });
      }
      case 'genericTypeParameter': return make(type.name, 'GenericTypeParameter');
      default: throw new Error(`Unsupported Swift type: ${type.kind}`);
    }
  }

  properties(properties: ValdiModelProperty[]): SwiftProperty[] {
    const allocator = swiftNames();
    return properties.map(original => {
      const name = allocator.allocate(original.name).name;
      return { name, original, type: this.type(original.type, name) };
    });
  }

  source(type: IOSType, body: string, api: boolean, priority: number): NativeSource {
    const module = this.bundle.iosModuleName;
    return {
      filename: type.swiftName + '.swift',
      content: [...this.imports].sort().map(name => `import ${name}\n`).join('') + '\n' + body + '\n',
      relativePath: api ? `../${module}Types` : undefined,
      groupingIdentifier: module + (api ? 'Types' : '') + '.swift',
      groupingPriority: priority,
      localFilenameDependencies: [],
    };
  }

  static push(type: SwiftType, value: string): string {
    if (!type.marshaller) return '';
    const throwing = /^(Optional)?(Array|Map|Object|GenericObject|Untyped|Promise|ObjCObject|GenericTypeParameter)$/.test(type.marshaller);
    const parameter = type.fn ? `Self.create_${type.fn.helper}_bridgeFunction(using: ${value})` : value;
    return `${throwing ? 'try ' : ''}marshaller.push${type.marshaller}(${parameter})` +
      (type.inner ? ` { ${this.push(type.inner, '$0')} }` : '');
  }

  static get(type: SwiftType, index: string): string {
    if (!type.marshaller) return '';
    if (type.interface) {
      const proxy = `try ${bare(type)}_Proxy(from: marshaller, at: ${type.optional ? '$0' : index})`;
      return type.optional ? `try marshaller.getOptional(${index}) { ${proxy} }` : proxy;
    }
    const call = `try marshaller.get${type.marshaller}(${index})` +
      (type.inner ? ` { ${this.get(type.inner, '$0')} }` : '');
    return type.fn ? `Self.create_${type.fn.helper}_from_bridgeFunction(using: ${call})` : call;
  }

  helpers(): string {
    return this.functions.map(type => {
      const fn = type.fn!;
      const opt = type.optional ? '?' : '';
      const popReturn = SwiftSourceFileGenerator.get(fn.result, '-1');
      return `
    static func create_${fn.helper}_from_bridgeFunction(using functionImpl: ValdiFunction${opt}) -> (${closureType(fn)})${opt} {
        ${type.optional ? 'guard let functionImpl = functionImpl else { return nil }' : ''}
        return { (${namedParameters(fn)}) throws -> ${fn.result.name} in
            let marshaller = ValdiMarshaller()
            ${fn.parameters.map((t, i) => `_ = ${SwiftSourceFileGenerator.push(t, fn.names[i])}`).join('\n')}
            if !functionImpl.perform(with: marshaller, sync: ${popReturn ? 'true' : 'false'}) {
                try marshaller.checkError()
                throw ValdiError.functionCallFailed(${q(fn.helper)})
            }
            ${popReturn ? `let __result: ${fn.result.name} = ${popReturn}` : ''}
            try marshaller.checkError()
            ${popReturn ? 'return __result' : ''}
        }
    }

    static func create_${fn.helper}_bridgeFunction(using functionImpl: ${escaping(type)}(${closureType(fn)})${opt}) -> ((ValdiMarshaller) -> Bool)${opt} {
        ${type.optional ? 'guard let functionImpl = functionImpl else { return nil }' : ''}
        return createBridgeFunctionWrapper { marshaller in
            ${fn.parameters.map((t, i) => `let ${fn.names[i]}: ${t.name} = ${SwiftSourceFileGenerator.get(t, String(i))}`).join('\n')}
            ${fn.result.marshaller ? 'let result = ' : ''}try functionImpl(${args(fn)})
            ${fn.result.marshaller ? `_ = ${SwiftSourceFileGenerator.push(fn.result, 'result')}` : ''}
        }
    }`;
    }).join('\n');
  }

  descriptor(properties: SwiftProperty[], parameters: ValdiTypeParameter[] | undefined, kind: string): string {
    const ids = new SwiftEmittedIdentifiers();
    const fields = properties.map(p => {
      const schema = new SwiftSchemaWriter(parameters, ids);
      schema.appendType(p.original.type, false, false, this.bundle.asyncStrictMode);
      return `ValdiMarshallableObjectFieldDescriptor(name: ${q(p.original.name)}, type: ${q(schema.str)})`;
    });
    return `
    public static func getDescriptor() -> ValdiMarshallableObjectDescriptor {
        let fields: [ValdiMarshallableObjectFieldDescriptor] = [${fields.join(',\n')}]
        ${ids.isEmpty ? '' : `let identifiers: [ValdiMarshallableIdentifier] = ${ids.initialization}`}
        return ValdiMarshallableObjectDescriptor(fields, identifiers: ${ids.isEmpty ? 'nil' : 'identifiers'}, type: .${kind})
    }`;
  }
}
