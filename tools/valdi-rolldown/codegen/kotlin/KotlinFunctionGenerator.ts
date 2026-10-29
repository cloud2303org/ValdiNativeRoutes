// Generation/Kotlin/KotlinFunctionGenerator.swift: an @ExportFunction as a ValdiBridgeFunction class, which native
// code creates from a JS runtime to call the function.
import type { BundleInfo, ExportedFunction, NativeSource } from '../Models';
import {
  CompilerError,
  FileHeaderCommentGenerator,
  generatedFunctionAttribution,
  indented,
  type GeneratedSourceFilename,
} from '../Utils';
import { JVMClass, KotlinCodeGenerator } from './KotlinCodeGenerator';
import { propertyNameAllocatorForKotlin } from './KotlinValidation';

export class KotlinFunctionGenerator {
  constructor(
    private readonly bundleInfo: BundleInfo,
    private readonly fullTypeName: string,
    private readonly exportedFunction: ExportedFunction,
    private readonly sourceFileName: GeneratedSourceFilename,
    /** The function's file in its module, without extension: `src/app`. */
    private readonly modulePath: string,
  ) {}

  write(): NativeSource[] {
    const { bundleInfo, exportedFunction, modulePath } = this;
    const jvmClass = new JVMClass(this.fullTypeName);
    const containingTypeName = jvmClass.name;

    const generator = new KotlinCodeGenerator(jvmClass.package);
    const jsRuntimeClass = generator.importClass('com.snap.valdi.jsmodules.ValdiJSRuntime');
    const bridgeFunctionClass = generator.importClass('com.snap.valdi.callable.ValdiBridgeFunction');

    generator.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFileName, exportedFunction.comments));
    generator.appendBody('\n');

    const nameAllocator = propertyNameAllocatorForKotlin();
    const fieldName = nameAllocator.allocate('_invoker').name;

    const typeParser = generator.getTypeParser(
      {
        kind: 'function',
        parameters: exportedFunction.parameters,
        returnType: exportedFunction.returnType,
        isSingleCall: false,
        shouldCallOnWorkerThread: false,
        allowSyncCall: exportedFunction.allowSyncCall,
      },
      false,
      undefined,
      nameAllocator,
    );
    const functionTypeParser = typeParser.functionTypeParser;
    if (!functionTypeParser) throw new CompilerError('Expecting functionTypePArser');

    const descriptorAnnotation = generator.getDescriptorAnnotation('valdiFunction', undefined, []);
    const constructorAnnotationContent = generator.getJavaAnnotationContent(
      'com.snap.valdi.schema.ValdiClassConstructor',
    );
    const invokeParameters = functionTypeParser.parameterNames.map(name => name.name).join(', ');

    generator.appendBody('\n');
    generator.appendBody(descriptorAnnotation);
    generator.appendBody(`class ${containingTypeName}: ${bridgeFunctionClass.name} {\n\n`);

    const fieldAnnotation = descriptorAnnotation.appendField(
      0,
      exportedFunction.functionName,
      fieldName,
      '_invoker',
      schemaWriter => {
        schemaWriter.appendFunction(
          exportedFunction.returnType,
          exportedFunction.parameters,
          false,
          false,
          false,
          false,
          exportedFunction.allowSyncCall,
          bundleInfo.asyncStrictMode,
        );
      },
    );

    generator.appendBody(fieldAnnotation);
    generator.appendBody(`private var ${fieldName}: ${typeParser.fullTypeName}\n\n`);

    generator.appendBody(constructorAnnotationContent);
    const returnTypeName = functionTypeParser.returnType.fullTypeName;
    const isUnit = returnTypeName === 'Unit';
    const names = functionTypeParser.parameterNames;
    const parameters = names
      .map((name, index) => `${name.name}: ${functionTypeParser.parameterTypes[index].fullTypeName}`)
      .join(', ');
    const call = isUnit
      ? `function.${fieldName}(${invokeParameters})\n                    completionHandler()`
      : `val result = function.${fieldName}(${invokeParameters})\n                    completionHandler(result)`;
    // Lines as in the Swift template; their indentation doesn't matter, indented() redoes it.
    generator.appendBody(`constructor(invoker: ${typeParser.fullTypeName}) {
    ${fieldName} = invoker
}

fun invoke${functionTypeParser.methodTypeName} {
    return ${fieldName}(${invokeParameters})
}

companion object {
    const val MODULE_PATH = "${bundleInfo.name}/${modulePath}"
    const val ASYNC_STRICT_MODE: Boolean = ${bundleInfo.asyncStrictMode ? 'true' : 'false'}

    @JvmStatic
    fun create(runtime: ${jsRuntimeClass.name}): ${containingTypeName} {
      ${bridgeFunctionClass.name}.assertResolutionNotOnMainThreadIfNeeded(ASYNC_STRICT_MODE)
      return ${bridgeFunctionClass.name}.createFromRuntime(runtime, ${containingTypeName}::class.java, MODULE_PATH)
    }

    @JvmStatic
    fun invokeWithJSRuntime(jsRuntimeProvider: () -> ${jsRuntimeClass.name}${names.length ? ', ' : ''}${parameters}, completionHandler: ${isUnit ? '() -> Unit' : `(${returnTypeName}) -> Unit`}) {
        val runtime = jsRuntimeProvider()
        runtime.runOnJsThread("${generatedFunctionAttribution(bundleInfo.name, modulePath, exportedFunction.functionName)}") {
            val function = create(runtime)
            ${call}
        }
    }
}
}
`);

    const content = indented(generator.content, '    ');
    return [KotlinCodeGenerator.makeNativeSource(bundleInfo, jvmClass, content)];
  }
}
