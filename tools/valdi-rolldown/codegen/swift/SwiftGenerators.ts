// Ports of SwiftModelGenerator, SwiftEnumGenerator, SwiftFunctionGenerator and
// SwiftViewClassGenerator (Valdi, MIT). Module factories fill an upstream gap:
// ExportedModuleGenerator.generateSwiftSources returns [] in the pinned compiler.
import {
  IOS_GROUPING_PRIORITY, type BundleInfo, type ExportedEnum, type ExportedFunction,
  type ExportedModule, type IOSType, type NativeSource, type ValdiModel,
} from '../Models';
import { FileHeaderCommentGenerator, type GeneratedSourceFilename } from '../Utils';
import {
  SwiftSourceFileGenerator, closureType, escaping, methodType, swiftNames, swiftString, type SwiftProperty,
} from './SwiftCodeGenerator';

const q = swiftString;
const comment = FileHeaderCommentGenerator.generateComment;
const registration = (name: string, descriptor: string) => `
public func register_${name}() {
    ValdiMarshallableObjectRegistry.shared.register(className: ${q(name)}, objectDescriptor: ${descriptor}.getDescriptor())
}
`;

function declarations(properties: SwiftProperty[], isInterface: boolean): string {
  return properties.map(p => {
    if (!isInterface || !p.type.fn) return `public var ${p.name}: ${p.type.name}`;
    const fn = p.type.fn;
    return `private var ${p.name}_implementation: ${p.type.name}
    public func ${p.name}${methodType(fn)} {
        ${p.type.optional ? `guard let functionImpl = self.${p.name}_implementation else { throw ValdiError.functionCallFailed(${q(p.name)}) }` : ''}
        return try ${p.type.optional ? 'functionImpl' : `self.${p.name}_implementation`}(${fn.names.join(', ')})
    }`;
  }).join('\n');
}

function unmarshaller(properties: SwiftProperty[], isInterface: boolean): string {
  return `
    public required init(from marshaller: ValdiMarshaller, at objectIndex: Int) throws {
        ${isInterface ? 'let objectIndex = try marshaller.unwrapProxy(objectIndex)\n        defer { marshaller.pop() }' : ''}
        ${properties.map((p, index) =>
          `self.${p.name}${isInterface && p.type.fn ? '_implementation' : ''} = try marshaller.getTypedObjectProperty(objectIndex, ${index}) { ${SwiftSourceFileGenerator.get(p.type, '$0')} }`,
        ).join('\n')}
    }`;
}

function marshaller(properties: SwiftProperty[], name: string, isInterface: boolean): string {
  return `
    public func push(to marshaller: ValdiMarshaller) throws -> Int {
        ${isInterface ? 'let objectIndex = try marshaller.pushProxy(object: self) {' : ''}
        register_${name}()
        let objectIndex = try marshaller.pushObject(className: ${q(name)})
        ${properties.map((p, index) =>
          `try marshaller.setTypedObjectProperty(objectIndex, ${index}) { _ = ${SwiftSourceFileGenerator.push(p.type, `self.${p.name}`)} }`,
        ).join('\n')}
        ${isInterface ? '}' : ''}
        return objectIndex
    }`;
}

export function swiftModel(model: ValdiModel, bundle: BundleInfo, type: IOSType, filename: GeneratedSourceFilename): NativeSource[] {
  const generator = new SwiftSourceFileGenerator(bundle);
  const name = type.swiftName;
  const properties = generator.properties(model.properties);
  const generic = model.typeParameters?.length ? `<${model.typeParameters.map(p => p.name).join(', ')}>` : '';
  const dummy = model.typeParameters?.length ? `<${model.typeParameters.map(() => 'Void').join(', ')}>` : '';
  let body = comment(filename, model.comments) + '\n';
  if (model.exportAsInterface) {
    body += `
public protocol ${name}: ValdiMarshallableInterface {
    ${properties.map(p => p.type.fn ? `func ${p.name}${methodType(p.type.fn)}` : `var ${p.name}: ${p.type.name} { get }`).join('\n')}
}
public extension ${name} {
    ${marshaller(properties, name, true).replace('public func', 'func')}
    ${generator.helpers()}
}
public class ${name}_Proxy: ${name}, ValdiMarshallableObject {
    ${declarations(properties, true)}
    ${unmarshaller(properties, true)}
    ${generator.descriptor(properties, model.typeParameters, 'Interface')}
}
${registration(name, `${name}_Proxy`)}`;
  } else {
    const required = properties.filter(p => !p.type.optional);
    body += `
public class ${name}${generic}: ValdiMarshallableObject {
    ${declarations(properties, false)}
    public init(${required.map(p => `${p.name}: ${escaping(p.type)}${p.type.name}`).join(', ')}) {
        ${required.map(p => `self.${p.name} = ${p.name}`).join('\n')}
    }
    ${unmarshaller(properties, false)}
    ${marshaller(properties, name, false)}
    ${generator.helpers()}
    ${generator.descriptor(properties, model.typeParameters, 'Class')}
}
${registration(name, name + dummy)}`;
  }
  return [generator.source(type, body, true, model.exportAsInterface ? IOS_GROUPING_PRIORITY.interfaceType : IOS_GROUPING_PRIORITY.classType)];
}

export function swiftEnum(value: ExportedEnum, bundle: BundleInfo, type: IOSType, filename: GeneratedSourceFilename): NativeSource[] {
  const generator = new SwiftSourceFileGenerator(bundle);
  const string = value.cases.kind === 'stringEnum';
  const allocator = swiftNames();
  const cases = value.cases.cases.map(c => {
    if (!string && (!Number.isInteger(c.value) || Number(c.value) < -2147483648 || Number(c.value) > 2147483647))
      throw new Error('Swift numeric enums require Int32 raw values');
    // Foundation's CharacterSet.alphanumerics includes non-ASCII identifiers.
    const words = c.name.split(/[^\p{L}\p{N}]/u);
    const camel = words.map((word, i) => {
      const [first = '', ...rest] = [...word];
      return i ? first.toUpperCase() + rest.join('').toLowerCase() : word.toLowerCase();
    }).join('');
    return `case ${allocator.allocate(camel).name} = ${typeof c.value === 'string' ? q(c.value) : c.value}`;
  });
  const kind = string ? 'String' : 'Int';
  const body = `${comment(filename, value.comments)}
public enum ${type.swiftName}: ${string ? 'String' : 'Int32'}, ValdiMarshallable${kind}Enum {
    ${cases.join('\n')}
    public init(from marshaller: ValdiMarshaller, at objectIndex: Int) throws {
        self = try create${kind}Enum(from: marshaller, at: objectIndex)
    }
}
public func register_${type.swiftName}() {
    ValdiMarshallableObjectRegistry.shared.register${kind}Enum(enumName: ${q(type.swiftName)}, enumCases: allEnumCases(of: ${type.swiftName}.self))
}`;
  return [generator.source(type, body, true, IOS_GROUPING_PRIORITY.enumType)];
}

export function swiftFunction(value: ExportedFunction, bundle: BundleInfo, type: IOSType, filename: GeneratedSourceFilename, modulePath: string): NativeSource[] {
  const generator = new SwiftSourceFileGenerator(bundle);
  generator.imports.add('valdi_core');
  const functionType = {
    kind: 'function' as const, parameters: value.parameters, returnType: value.returnType,
    isSingleCall: false, shouldCallOnWorkerThread: false, allowSyncCall: value.allowSyncCall,
  };
  const property = { name: value.functionName, type: functionType, injectableParams: { ios: false, android: false } };
  const parsed = generator.type(functionType, 'callBlock');
  const fn = parsed.fn!;
  const methodName = swiftNames().allocate(value.functionName).name;
  const parameters = fn.parameters.map((p, i) => `${fn.names[i]}: ${escaping(p)}${p.name}`);
  const completion = fn.result.name === 'Void' ? '() -> Void' : `(${fn.result.name}) -> Void`;
  const body = `${comment(filename, value.comments)}
public class ${type.swiftName}: ValdiBridgeFunction {
    private let callBlock: ${closureType(fn)}
    public static let className = ${q(type.swiftName)}
    public static let asyncStrictMode = ${bundle.asyncStrictMode}
    public init(jsRuntime: Any) throws {
        guard let jsRuntime = jsRuntime as? SCValdiJSRuntime else {
            throw ValdiError.runtimeError("jsRuntime is not of type SCValdiJSRuntime")
        }
        Self.assertResolutionNotOnMainThreadIfNeeded(asyncStrictMode: Self.asyncStrictMode)
        register_${type.swiftName}()
        self.callBlock = try Self.create_callBlock_from_bridgeFunction(using: Self.createBridgeFunction(jsRuntime: jsRuntime))
    }
    public static func modulePath() -> String { ${q(bundle.name + '/' + modulePath)} }
    public func ${methodName}${methodType(fn)} {
        return try self.callBlock(${fn.names.join(', ')})
    }
    public static func invokeWithJSRuntime(jsRuntimeProvider: @escaping () -> SCValdiJSRuntime${parameters.length ? ', ' : ''}${parameters.join(', ')}, completionHandler: @escaping ${completion}) {
        let runtime = jsRuntimeProvider()
        runtime.dispatch(inJsThread: {
            do {
                let function = try ${type.swiftName}(jsRuntime: runtime)
                ${fn.result.name === 'Void' ? '' : 'let result = '}try function.callBlock(${fn.names.join(', ')})
                completionHandler(${fn.result.name === 'Void' ? '' : 'result'})
            } catch { print("Error in invokeWithJSRuntime: \\(error)") }
        }, attribution: ${q(bundle.name + '/' + modulePath + ':' + value.functionName)})
    }
    ${generator.helpers()}
    ${generator.descriptor([{ name: value.functionName, original: property, type: parsed }], undefined, 'Function')}
}
${registration(type.swiftName, type.swiftName)}`;
  return [generator.source(type, body, false, IOS_GROUPING_PRIORITY.functionType)];
}

export function swiftModule(value: ExportedModule, bundle: BundleInfo, type: IOSType, filename: GeneratedSourceFilename): NativeSource[] {
  const sources = swiftModel({ ...value.model, exportAsInterface: true }, bundle, type, filename);
  const generator = new SwiftSourceFileGenerator(bundle);
  generator.imports.add('Foundation');
  generator.imports.add('valdi_core');
  // C++ Value wrapper preserves the Swift proxy, avoiding NSObject conversion of
  // a Swift-only protocol. This is the existing native module factory contract.
  const body = `${comment(filename)}
open class ${type.swiftName}Factory: NSObject, SCNValdiCoreModuleFactory {
    open func onLoadModule() -> any ${type.swiftName} {
        preconditionFailure("Override onLoadModule")
    }
    public func getModulePath() -> String { ${q(value.modulePath)} }
    public func loadModule() -> NSObject {
        do {
            let marshaller = ValdiMarshaller()
            let index = try onLoadModule().push(to: marshaller)
            try marshaller.checkError()
            return SCValdiMarshallerGetNativeWrapper(OpaquePointer(marshaller.marshallerCpp), index) as! NSObject
        } catch {
            // A malformed factory is a programming error, as in upstream.
            // Business method errors propagate to JS through the marshaller.
            preconditionFailure("Invalid Swift module ${type.swiftName}: \\(error)")
        }
    }
}`;
  sources.push(generator.source(type, body, false, IOS_GROUPING_PRIORITY.functionType));
  return sources;
}

export function swiftView(bundle: BundleInfo, type: IOSType, filename: GeneratedSourceFilename, componentPath: string): NativeSource {
  const generator = new SwiftSourceFileGenerator(bundle);
  generator.imports.add('valdi_core');
  return generator.source(type, `${comment(filename)}
public class ${type.swiftName}: SwiftComponentBase {
    public override class func componentPath() -> String { ${q(componentPath)} }
}`, false, IOS_GROUPING_PRIORITY.viewType);
}
