// Generation/ObjC/ObjCEmittedTrampolineFunctions.swift: the C functions the runtime calls and creates blocks and
// methods of a given signature with, for the signatures it has no builtin ones for.
import { CodeWriter } from '../CodeWriter';

/** CType: how a value is passed in C. */
export type CType = 'void' | 'pointer' | 'double' | 'bool' | 'int' | 'long' | 'nsobject';

interface CTypeInfo {
  typeEncoding: string;
  cName: string;
  makeFieldValueFunctionName: string;
  getFieldValueFunctionName: string;
  defaultValue: string;
}

const C_TYPES: Record<CType, CTypeInfo> = {
  void: {
    typeEncoding: 'v',
    cName: 'void',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeNull',
    getFieldValueFunctionName: 'void',
    defaultValue: 'void',
  },
  pointer: {
    typeEncoding: 'o',
    cName: 'const void *',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakePtr',
    getFieldValueFunctionName: 'SCValdiFieldValueGetPtr',
    defaultValue: 'nil',
  },
  double: {
    typeEncoding: 'd',
    cName: 'double',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeDouble',
    getFieldValueFunctionName: 'SCValdiFieldValueGetDouble',
    defaultValue: '0.0',
  },
  bool: {
    typeEncoding: 'b',
    cName: 'BOOL',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeBool',
    getFieldValueFunctionName: 'SCValdiFieldValueGetBool',
    defaultValue: 'FALSE',
  },
  int: {
    typeEncoding: 'i',
    cName: 'int32_t',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeInt',
    getFieldValueFunctionName: 'SCValdiFieldValueGetInt',
    defaultValue: '0',
  },
  long: {
    typeEncoding: 'l',
    cName: 'int64_t',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeLong',
    getFieldValueFunctionName: 'SCValdiFieldValueGetLong',
    defaultValue: '0',
  },
  nsobject: {
    typeEncoding: 'o',
    cName: 'id',
    makeFieldValueFunctionName: 'SCValdiFieldValueMakeUnretainedObject',
    getFieldValueFunctionName: 'SCValdiFieldValueGetObject',
    defaultValue: 'nil',
  },
};

export const cType = (type: CType): CTypeInfo => C_TYPES[type];

/** CFunctionType. */
export type CFunctionType = 'block' | 'objcMethod';

export interface ObjCTrampolineCallArgument {
  name: string;
  type: CType;
}

export class ObjCEmittedTrampolineFunctions {
  /** The signatures the runtime has trampolines for. */
  static readonly builtinTypeSignatures = new Set([
    'o:v',
    'oo:v',
    'ooo:v',
    'oooo:v',
    'ooooo:v',
    'oooooo:v',
    'o:o',
    'oo:o',
    'ooo:o',
    'oooo:o',
    'o:b',
    'oo:b',
    'ooo:b',
    'o:d',
    'oo:d',
    'ooo:d',
  ]);

  readonly emittedFunctionsSection = new CodeWriter();
  readonly blocksSection = new CodeWriter();

  private emittedBlockSupportSignatures = new Set<string>();

  get needBlockSupport(): boolean {
    return this.emittedBlockSupportSignatures.size > 0;
  }

  appendBlockSupportIfNeeded(parameters: CType[], returnType: CType, functionType: CFunctionType): void {
    // A block's first parameter in the Objective-C block ABI is the block itself; a method's first two are the
    // receiver and the selector.
    const resolvedParameters: CType[] =
      functionType === 'block' ? ['pointer', ...parameters] : ['pointer', 'pointer', ...parameters];
    const parametersTypeEncoding = resolvedParameters.map(type => cType(type).typeEncoding).join('');
    const functionTypeSignature = `${parametersTypeEncoding}:${cType(returnType).typeEncoding}`;

    if (ObjCEmittedTrampolineFunctions.builtinTypeSignatures.has(functionTypeSignature)) return;
    if (this.emittedBlockSupportSignatures.has(functionTypeSignature)) return;
    this.emittedBlockSupportSignatures.add(functionTypeSignature);

    this.appendTrampoline(functionTypeSignature, parametersTypeEncoding, resolvedParameters, returnType);
  }

  private appendTrampoline(
    typeEncoding: string,
    parametersTypeEncoding: string,
    parameters: CType[],
    returnType: CType,
  ): void {
    const functionNameSuffix = `${parametersTypeEncoding.toUpperCase()}_${cType(returnType).typeEncoding}`;
    // CombineNativeSourcesProcessor recognizes these names to deduplicate the functions in the combined .m.
    const invokeFunctionName = `SCValdiFunctionInvoke${functionNameSuffix}`;
    const createBlockFunctionName = `SCValdiBlockCreate${functionNameSuffix}`;

    this.appendInvokeFunction(invokeFunctionName, parameters, returnType);
    this.appendCreateBlockFunction(createBlockFunctionName, parameters, returnType);
    this.blocksSection.appendBody(
      `{ .typeEncoding = "${typeEncoding}", .invoker = &${invokeFunctionName}, .factory = &${createBlockFunctionName} },\n`,
    );
  }

  private appendInvokeFunction(functionName: string, parameters: CType[], returnType: CType): void {
    const functionBody = new CodeWriter();

    this.emittedFunctionsSection.appendBody(
      `static SCValdiFieldValue ${functionName}(const void *function, SCValdiFieldValue* fields) {\n`,
    );
    this.emittedFunctionsSection.appendBody(functionBody);
    this.emittedFunctionsSection.appendBody('}\n\n');

    const callArguments = parameters
      .map((type, index) => `${cType(type).getFieldValueFunctionName}(fields[${index}])`)
      .join(', ');
    const cFunctionPointerType = `(${cType(returnType).cName} (*) (${parameters.map(type => cType(type).cName).join(', ')} ))`;
    const callExpression = `(${cFunctionPointerType}function)(${callArguments})`;

    if (returnType === 'void') {
      functionBody.appendBody(`${callExpression};\n`);
      functionBody.appendBody(`return ${cType(returnType).makeFieldValueFunctionName}();\n`);
    } else {
      functionBody.appendBody(`${cType(returnType).cName} result = ${callExpression};\n`);
      functionBody.appendBody(`return ${cType(returnType).makeFieldValueFunctionName}(result);\n`);
    }
  }

  private appendCreateBlockFunction(functionName: string, parameters: CType[], returnType: CType): void {
    const functionBody = new CodeWriter();

    this.emittedFunctionsSection.appendBody(`static id ${functionName}(SCValdiBlockTrampoline trampoline) {\n`);
    this.emittedFunctionsSection.appendBody(functionBody);
    this.emittedFunctionsSection.appendBody('}\n\n');

    // The first parameter is the block itself.
    const callArguments = parameters.slice(1).map((type, index) => ({ name: `p${index}`, type }));
    const blockArguments = callArguments.map(argument => `${cType(argument.type).cName} ${argument.name}`).join(', ');

    functionBody.appendBody(`return ^${cType(returnType).cName}(${blockArguments}) {\n`);
    ObjCEmittedTrampolineFunctions.appendTrampolineCall(functionBody, 'trampoline', 'nil', callArguments, returnType);
    functionBody.appendBody('};\n');
  }

  static appendTrampolineCall(
    output: CodeWriter,
    trampolineVar: string,
    receiver: string,
    callArguments: ObjCTrampolineCallArgument[],
    returnType: CType,
  ): void {
    if (returnType === 'void') {
      ObjCEmittedTrampolineFunctions.appendTrampolineCallBody(output, trampolineVar, receiver, callArguments);
      output.appendBody(';\n');
    } else {
      output.appendBody(`return ${cType(returnType).getFieldValueFunctionName}(`);
      ObjCEmittedTrampolineFunctions.appendTrampolineCallBody(output, trampolineVar, receiver, callArguments);
      output.appendBody(');\n');
    }
  }

  private static appendTrampolineCallBody(
    output: CodeWriter,
    trampolineVar: string,
    receiver: string,
    callArguments: ObjCTrampolineCallArgument[],
  ): void {
    output.appendBody(`${trampolineVar}(${receiver}`);
    if (callArguments.length) {
      output.appendBody(', ');
      output.appendBody(
        callArguments
          .map(argument => `${cType(argument.type).makeFieldValueFunctionName}(${argument.name})`)
          .join(', '),
      );
    }
    output.appendBody(')');
  }
}
