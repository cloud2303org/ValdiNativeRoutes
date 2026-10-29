// Generation/ObjC/ObjCFunctionGenerator.swift: an @ExportFunction as an SCValdiBridgeFunction subclass, which native
// code creates from a JS runtime to call the function, with a class method calling it on the JS thread.
import { CodeWriter } from '../CodeWriter';
import {
  EMPTY_INJECTABLE_PARAMS,
  type BundleInfo,
  type ExportedFunction,
  type IOSType,
  type NativeSource,
} from '../Models';
import { FileHeaderCommentGenerator, generatedFunctionAttribution, type GeneratedSourceFilename } from '../Utils';
import { iosNativeSourcesFromGeneratedCode, ObjCClassGenerator, type GeneratedCode } from './ObjCCodeGenerator';
import { ObjCSelector } from './ObjCSelector';

export class ObjCFunctionGenerator {
  private readonly typeName: string;

  constructor(
    private readonly iosType: IOSType,
    private readonly exportedFunction: ExportedFunction,
    private readonly sourceFileName: GeneratedSourceFilename,
    private readonly bundleName: string,
    /** The function's file in its module, without extension: `src/app`. */
    private readonly modulePath: string,
    private readonly bundleInfo: BundleInfo,
  ) {
    this.typeName = iosType.name;
  }

  private generateCode(): GeneratedCode {
    const { exportedFunction, typeName, bundleName, modulePath } = this;
    const classGenerator = new ObjCClassGenerator(typeName);

    classGenerator.header.addImport('<valdi_core/SCValdiBridgeFunction.h>');
    classGenerator.impl.addImport('<valdi_core/SCValdiMarshallableObjectRegistry.h>');

    const callBlockVariable = classGenerator.nameAllocator.allocate('callBlock');

    const functionParser = classGenerator.writeFunctionTypeParser(
      exportedFunction.returnType,
      exportedFunction.parameters,
      [],
      false,
      false,
      classGenerator.nameAllocator,
    );
    const objcSelector = new ObjCSelector(
      functionParser.returnParser.typeName,
      exportedFunction.functionName,
      functionParser.parameters.map(({ name, parser }) => ({ name: name.name, type: parser.typeName })),
    );

    const comments = FileHeaderCommentGenerator.generateComment(this.sourceFileName, exportedFunction.comments);

    let messageDeclaration = '';
    if (exportedFunction.comments) {
      messageDeclaration = FileHeaderCommentGenerator.generateMultilineComment(exportedFunction.comments);
      messageDeclaration += '\n';
    }
    // The declaration gets a second ';' below, as in the compiler's template.
    messageDeclaration += `${objcSelector.messageDeclaration};`;

    // The class method calling the function on the JS thread of the runtime it's given, then the completion handler.
    const jsRuntimeProviderType = 'id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void)';
    const returnsVoid = functionParser.returnParser.cType === 'void';
    const invokeWithJSRuntimeSelectorParts = [
      `invokeWithJSRuntimeProvider:(${jsRuntimeProviderType})jsRuntimeProvider`,
      ...functionParser.parameters.map(({ name, parser }) => `${name.name}:(${parser.typeName})${name.name}`),
      `completionHandler:(${returnsVoid ? 'void (^ _Nonnull)(void)' : `void (^ _Nonnull)(${functionParser.returnParser.typeName})`})completionHandler`,
    ];
    const invokeWithJSRuntimeDeclaration = `+ (void)${invokeWithJSRuntimeSelectorParts.join(' ')}`;

    classGenerator.header.appendBody(
      `${comments}\n` +
        `@interface ${typeName}: SCValdiBridgeFunction\n\n` +
        `${messageDeclaration};\n\n` +
        `${invokeWithJSRuntimeDeclaration};\n\n` +
        '@end\n',
    );

    const objectDescriptor = classGenerator.writeObjectDescriptorGetter(
      [
        {
          propertyName: exportedFunction.functionName,
          modelProperty: {
            name: exportedFunction.functionName,
            type: {
              kind: 'function',
              parameters: exportedFunction.parameters,
              returnType: exportedFunction.returnType,
              isSingleCall: false,
              shouldCallOnWorkerThread: false,
              allowSyncCall: exportedFunction.allowSyncCall,
            },
            injectableParams: EMPTY_INJECTABLE_PARAMS,
          },
        },
      ],
      [undefined],
      undefined,
      'SCValdiMarshallableObjectTypeFunction',
    );

    const parameterNames = objcSelector.parameters.map(parameter => parameter.name).join(', ');
    const callBody = `${callBlockVariable}(${parameterNames})`;

    const messageForwarder = new CodeWriter();
    messageForwarder.appendBody(objcSelector.messageDeclaration);
    messageForwarder.appendBody('{\n');
    messageForwarder.appendBody(
      `${functionParser.typeName} ${callBlockVariable.name} = (${functionParser.typeName})self.${callBlockVariable};\n`,
    );
    if (!returnsVoid) messageForwarder.appendBody('return ');
    messageForwarder.appendBody(callBody);
    messageForwarder.appendBody(';\n');
    messageForwarder.appendBody('}\n');

    classGenerator.impl.appendBody(classGenerator.emittedFunctions.emittedFunctionsSection);
    classGenerator.impl.appendBody(
      `@implementation ${typeName}\n\n` +
        '+ (NSString *)modulePath\n' +
        '{\n' +
        `  return @"${bundleName}/${modulePath}";\n` +
        '}\n\n' +
        '+ (BOOL)asyncStrictMode\n' +
        '{\n' +
        `  return ${this.bundleInfo.asyncStrictMode ? 'YES' : 'NO'};\n` +
        '}\n',
    );
    classGenerator.impl.appendBody(messageForwarder);
    classGenerator.impl.appendBody('\n');

    const invokeWithJSRuntimeImpl = new CodeWriter();
    invokeWithJSRuntimeImpl.appendBody(`${invokeWithJSRuntimeDeclaration}\n`);
    invokeWithJSRuntimeImpl.appendBody('{\n');
    invokeWithJSRuntimeImpl.appendBody('  id<SCValdiJSRuntime> runtime = jsRuntimeProvider();\n');
    invokeWithJSRuntimeImpl.appendBody('  [runtime dispatchInJsThread:^{\n');
    invokeWithJSRuntimeImpl.appendBody(`    ${typeName} *function = [${typeName} functionWithJSRuntime:runtime];\n`);
    invokeWithJSRuntimeImpl.appendBody(
      `    ${functionParser.typeName} ${callBlockVariable.name} = (${functionParser.typeName})function.${callBlockVariable};\n`,
    );
    if (returnsVoid) {
      invokeWithJSRuntimeImpl.appendBody(`    ${callBody};\n`);
      invokeWithJSRuntimeImpl.appendBody('    completionHandler();\n');
    } else {
      invokeWithJSRuntimeImpl.appendBody(`    ${functionParser.returnParser.typeName} result = ${callBody};\n`);
      invokeWithJSRuntimeImpl.appendBody('    completionHandler(result);\n');
    }
    const attribution = generatedFunctionAttribution(bundleName, modulePath, exportedFunction.functionName);
    invokeWithJSRuntimeImpl.appendBody(`  } attribution:@"${attribution}"];\n`);
    invokeWithJSRuntimeImpl.appendBody('}\n');
    invokeWithJSRuntimeImpl.appendBody('\n');

    classGenerator.impl.appendBody(invokeWithJSRuntimeImpl);
    classGenerator.impl.appendBody(objectDescriptor);
    classGenerator.impl.appendBody('\n');
    classGenerator.impl.appendBody('@end\n');

    return {
      apiHeader: classGenerator.apiHeader,
      apiImpl: classGenerator.apiImpl,
      header: classGenerator.header,
      impl: classGenerator.impl,
    };
  }

  write(): NativeSource[] {
    return iosNativeSourcesFromGeneratedCode(this.generateCode(), this.iosType, this.bundleInfo);
  }
}
