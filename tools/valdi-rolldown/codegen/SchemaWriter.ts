// Generation/SchemaWriter.swift: the type schema string the runtime marshals a class with
// (`'title':s,'itemList':a<s>`), shared by every language; each one's listener names the referenced classes.
import {
  isOptional,
  isVoid,
  unwrappingOptional,
  type EnumCase,
  type ValdiModelProperty,
  type ValdiModelPropertyType,
  type ValdiNodeClassMapping,
  type ValdiTypeParameter,
} from './Models';
import { CompilerError } from './Utils';

export interface SchemaWriterListener {
  getClassName(
    nodeMapping: ValdiNodeClassMapping,
    typeArguments: ValdiModelPropertyType[] | undefined,
  ): string | undefined;

  /**
   * Called around the return type of a function whose sync-value return marshaller is resolved lazily at runtime
   * (matches the native `deferReturnMarshaller` rule). Only the Kotlin generator (Android batched descriptor walk)
   * needs it.
   */
  enterDeferrableReturnType?(): void;
  exitDeferrableReturnType?(): void;
}

export class SchemaWriter {
  private _str = '';

  constructor(
    private readonly typeParameters: ValdiTypeParameter[] | undefined,
    private readonly listener: SchemaWriterListener,
    private readonly alwaysBoxFunctionParametersAndReturnValue: boolean,
    private readonly boxIntEnums: boolean,
  ) {}

  get str(): string {
    return this._str;
  }

  appendComma(): void {
    this._str += ',';
  }

  appendClass(clsName: string, properties: ValdiModelProperty[], asyncStrictMode = false): void {
    this._str += `c '${clsName}'`;
    this.appendProperties(properties, false, asyncStrictMode);
  }

  appendInterface(clsName: string, properties: ValdiModelProperty[], asyncStrictMode = false): void {
    this._str += `c+ '${clsName}'`;
    this.appendProperties(properties, true, asyncStrictMode);
  }

  appendStringEnum(enumName: string, enumCases: EnumCase<string>[]): void {
    this.appendEnum(enumName, 's', enumCases, value => `'${value}'`);
  }

  appendIntEnum(enumName: string, enumCases: EnumCase<number>[]): void {
    this.appendEnum(enumName, 'i', enumCases, value => `${value}`);
  }

  private appendEnum<T extends string | number>(
    enumName: string,
    enumTypename: string,
    enumCases: EnumCase<T>[],
    caseToString: (value: T) => string,
  ): void {
    this._str += `e<${enumTypename}> '${enumName}'`;
    this.appendList(enumCases, '{', '}', enumCase => {
      this.appendPropertyName(enumCase.name);
      this._str += caseToString(enumCase.value);
    });
  }

  appendFunction(
    returnType: ValdiModelPropertyType,
    parameters: ValdiModelProperty[],
    isOptional: boolean,
    isMethod: boolean,
    isSingleCall: boolean,
    shouldCallOnWorkerThread: boolean,
    allowSyncCall: boolean,
    asyncStrictMode = false,
  ): void {
    this.doAppendTypeName('f', false, isOptional);

    // `b` (bansync) = ban sync calls (opt-in). Omit = allow sync (majority of modules).
    const banSyncCall = asyncStrictMode && !allowSyncCall;
    if (isMethod || isSingleCall || shouldCallOnWorkerThread || banSyncCall) {
      const modifiers: string[] = [];
      if (isMethod) modifiers.push('m');
      if (isSingleCall) modifiers.push('s');
      if (shouldCallOnWorkerThread) modifiers.push('w');
      if (banSyncCall) modifiers.push('b');
      this.appendList(modifiers, '|', '|', modifier => {
        this._str += modifier;
      });
    }

    const shouldBoxParametersAndReturnValue = !isMethod && this.alwaysBoxFunctionParametersAndReturnValue;
    this.appendList(parameters, '(', ')', parameter => {
      this.appendType(parameter.type, shouldBoxParametersAndReturnValue, false, asyncStrictMode);
    });

    if (!isVoid(returnType)) {
      this._str += ': ';
      // LAZY_RETURN_DEFERRAL_PREDICATE v1, which Valdi keeps in sync with the native runtime: a sync-value return
      // (not a promise, not dispatched to a worker thread) has its marshaller resolved lazily at runtime, so its
      // type-reference closure is reachable only through the deferred return.
      const isPromiseReturn = unwrappingOptional(returnType).kind === 'promise';
      const deferrableReturn = !isPromiseReturn && !shouldCallOnWorkerThread;
      if (deferrableReturn) this.listener.enterDeferrableReturnType?.();
      this.appendType(returnType, shouldBoxParametersAndReturnValue, false, asyncStrictMode);
      if (deferrableReturn) this.listener.exitDeferrableReturnType?.();
    }
  }

  appendTypeRef(nodeMapping: ValdiNodeClassMapping, boxed: boolean, isOptional: boolean, hasConverter: boolean): void {
    const className = this.listener.getClassName(nodeMapping, undefined);
    if (className === undefined) {
      this.doAppendTypeName('u', false, isOptional);
      return;
    }
    this.doAppendTypeName('r', boxed, isOptional);
    if (nodeMapping.kind === 'enum') {
      this._str += '<e>';
    } else if (hasConverter) {
      this._str += '<c>';
    }
    this._str += `:'${className}'`;
  }

  appendGenTypeRef(
    nodeMapping: ValdiNodeClassMapping,
    isOptional: boolean,
    hasConverter: boolean,
    typeArguments: ValdiModelPropertyType[],
    asyncStrictMode = false,
  ): void {
    const className = this.listener.getClassName(nodeMapping, typeArguments);
    if (className === undefined) {
      this.doAppendTypeName('u', false, isOptional);
      return;
    }
    this.doAppendTypeName('g', false, isOptional);
    if (hasConverter) this._str += '<c>';
    this._str += `:'${className}'`;
    this.appendList(typeArguments, '<', '>', item => {
      this.appendType(item, true, false, asyncStrictMode);
    });
  }

  appendPromise(isOptional: boolean, typeArgument: ValdiModelPropertyType, asyncStrictMode = false): void {
    this.doAppendTypeName('p', false, isOptional);
    this._str += '<';
    this.appendType(typeArgument, true, false, asyncStrictMode);
    this._str += '>';
  }

  private doAppendTypeName(name: string, boxed: boolean, isOptional: boolean): void {
    this._str += name;
    if (boxed) this._str += '@';
    if (isOptional) this._str += '?';
  }

  appendType(type: ValdiModelPropertyType, asBoxed: boolean, isMethod: boolean, asyncStrictMode = false): void {
    const innerType = unwrappingOptional(type);
    const optional = isOptional(type);

    switch (innerType.kind) {
      case 'string':
        this.doAppendTypeName('s', false, optional);
        break;
      case 'double':
        this.doAppendTypeName('d', asBoxed || optional, optional);
        break;
      case 'bool':
        this.doAppendTypeName('b', asBoxed || optional, optional);
        break;
      case 'long':
        this.doAppendTypeName('l', asBoxed || optional, optional);
        break;
      case 'array':
        this.doAppendTypeName('a', false, optional);
        this._str += '<';
        this.appendType(innerType.elementType, true, false, asyncStrictMode);
        this._str += '>';
        break;
      case 'bytes':
        this.doAppendTypeName('t', false, optional);
        break;
      case 'map':
        this.doAppendTypeName('m', false, optional);
        this._str += '<';
        this.appendType(innerType.keyType, true, false, asyncStrictMode);
        this._str += ',';
        this.appendType(innerType.valueType, true, false, asyncStrictMode);
        this._str += '>';
        break;
      case 'any':
        this.doAppendTypeName('u', false, optional);
        break;
      case 'void':
        this.doAppendTypeName('v', false, optional);
        break;
      case 'function':
        this.appendFunction(
          innerType.returnType,
          innerType.parameters,
          optional,
          isMethod,
          innerType.isSingleCall,
          innerType.shouldCallOnWorkerThread,
          innerType.allowSyncCall,
          asyncStrictMode,
        );
        break;
      case 'object':
        this.appendTypeRef(innerType.mapping, false, optional, innerType.mapping.converter !== undefined);
        break;
      case 'genericTypeParameter': {
        const index = this.typeParameters?.findIndex(item => item.name === innerType.name) ?? -1;
        if (index < 0) {
          const given = (this.typeParameters ?? []).map(item => item.name).join(', ');
          throw new CompilerError(
            `Could not match generic type parameter ${innerType.name} to given type parameters [${given}]`,
          );
        }
        this.doAppendTypeName('r', false, optional);
        this._str += `:${index}`;
        break;
      }
      case 'genericObject':
        this.appendGenTypeRef(
          innerType.mapping,
          optional,
          innerType.mapping.converter !== undefined,
          innerType.typeArguments,
          asyncStrictMode,
        );
        break;
      case 'promise':
        this.appendPromise(optional, innerType.typeArgument, asyncStrictMode);
        break;
      case 'enum': {
        const shouldBoxEnum = innerType.mapping.kind === 'enum' && this.boxIntEnums && (asBoxed || optional);
        this.appendTypeRef(innerType.mapping, shouldBoxEnum, optional, false);
        break;
      }
      case 'nullable':
        throw new CompilerError('unreachable: nested nullable');
    }
  }

  appendProperties(properties: ValdiModelProperty[], isMethod: boolean, asyncStrictMode = false): void {
    this.appendList(properties, '{', '}', property => this.appendProperty(property, isMethod, asyncStrictMode));
  }

  appendPropertyName(propertyName: string): void {
    this._str += `'${propertyName}':`;
  }

  appendProperty(property: ValdiModelProperty, isMethod: boolean, asyncStrictMode = false): void {
    this.appendPropertyName(property.name);
    this.appendType(property.type, false, isMethod, asyncStrictMode);
  }

  appendEnumValue(value: string): void {
    this._str += value;
  }

  private appendList<T>(list: T[], startDelimiter: string, endDelimiter: string, handle: (item: T) => void): void {
    this._str += startDelimiter;
    list.forEach((item, i) => {
      if (i > 0) this._str += ', ';
      handle(item);
    });
    this._str += endDelimiter;
  }
}
