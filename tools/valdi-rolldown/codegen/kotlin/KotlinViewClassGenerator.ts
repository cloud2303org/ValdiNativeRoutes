// Template/KotlinViewClassGenerator.swift: an exported @Component as a ValdiGeneratedRootView subclass, typed by its
// view model and context classes, whose companion inflates the component.
import type { BundleInfo, NativeSource, Platform } from '../Models';
import { camelCased, FileHeaderCommentGenerator, indented, pascalCased, type GeneratedSourceFilename } from '../Utils';
import { JVMClass, KotlinCodeGenerator } from './KotlinCodeGenerator';

/**
 * LanguageSpecificViewClassGenerator.swift: what ViewClassGenerator drives for each language. The ObjC emitter's
 * ObjCViewClassGenerator implements it too.
 */
export interface LanguageSpecificViewClassGenerator {
  readonly platform: Platform;
  start(): void;
  finish(): void;
  write(): NativeSource[];
  appendAccessor(className: string, nodeId: string): void;
  appendConstructor(): void;
  appendNativeActions(nativeFunctionNames: string[]): void;
  appendEmitActions(actions: string[]): void;
}

export class KotlinViewClassGenerator implements LanguageSpecificViewClassGenerator {
  readonly platform: Platform = 'android';

  private readonly className: JVMClass;
  private readonly writer: KotlinCodeGenerator;
  private readonly staticMethods = new KotlinCodeGenerator();

  constructor(
    private readonly bundleInfo: BundleInfo,
    className: string,
    private readonly componentPath: string,
    private readonly sourceFilename: GeneratedSourceFilename,
    private readonly viewModelClassName: string | undefined,
    private readonly componentContextClassName: string | undefined,
  ) {
    this.className = new JVMClass(className);
    this.writer = new KotlinCodeGenerator(this.className.package);
  }

  start(): void {
    this.writer.appendHeader('');
    for (const name of [
      'com.snap.valdi.IValdiRuntime',
      'com.snap.valdi.context.ValdiViewOwner',
      'com.snap.valdi.views.ValdiGeneratedRootView',
    ]) {
      this.writer.importClass(name);
    }
    this.writer.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFilename));
    const viewModelType = this.getViewModelType();
    const componentContextType = this.getComponentContextType();
    this.writer.appendBody(
      `\nclass ${this.className.name}(context: android.content.Context): ` +
        `ValdiGeneratedRootView<${viewModelType}, ${componentContextType}>(context) {\n\n`,
    );
    this.staticMethods.appendBody('companion object {\n');
  }

  finish(): void {
    this.staticMethods.appendBody('}\n');
    this.writer.appendBody(this.staticMethods);
    this.writer.appendBody('}\n');
  }

  write(): NativeSource[] {
    const content = indented(this.writer.content, '    ');
    return [KotlinCodeGenerator.makeNativeSource(this.bundleInfo, this.className, content)];
  }

  appendAccessor(className: string, nodeId: string): void {
    const jvmClass = this.writer.importClass(className);
    const staticPropertyName = `${camelCased(nodeId)}Id`;
    this.staticMethods.appendBody(`val ${staticPropertyName} = "${nodeId}"\n`);
    this.writer.appendBody(`val ${camelCased(nodeId)}: ${jvmClass.name}?\n`);
    this.writer.appendBody(`get() = valdiContext?.getView(${staticPropertyName}) as? ${jvmClass.name}\n`);
    this.writer.appendBody('\n\n');
  }

  private getViewModelType(): string {
    return this.viewModelClassName === undefined ? 'Any?' : this.writer.importClass(this.viewModelClassName).name;
  }

  private getComponentContextType(): string {
    return this.componentContextClassName === undefined
      ? 'Any'
      : this.writer.importClass(this.componentContextClassName).name;
  }

  appendConstructor(): void {
    const viewModelType = this.getViewModelType();
    const componentContextType = this.getComponentContextType();
    const inflationCompletion = this.writer.importClass('com.snap.valdi.InflationCompletion');
    const name = this.className.name;

    this.staticMethods.appendBody(`val componentPath = "${this.componentPath}"\n`);
    this.staticMethods.appendBody('\n');
    this.staticMethods.appendBody(
      `@JvmStatic fun create(runtime: IValdiRuntime, owner: ValdiViewOwner? = null): ${name} = create(runtime, null, null, owner)\n\n`,
    );
    this.staticMethods.appendBody(
      `@JvmStatic fun create(runtime: IValdiRuntime, viewModel: ${viewModelType}?, componentContext: ${componentContextType}?, ` +
        `owner: ValdiViewOwner? = null, inflationCompletion: ${inflationCompletion.name}? = null): ${name} {\n` +
        `    val view = ${name}(runtime.context)\n` +
        '    runtime.inflateViewAsync(view, componentPath, viewModel, componentContext, owner, inflationCompletion)\n' +
        '    return view\n' +
        '}\n\n',
    );
  }

  appendNativeActions(nativeFunctionNames: string[]): void {
    if (!nativeFunctionNames.length) return;
    const keepName = this.writer.importClass('androidx.annotation.Keep').name;
    this.writer.appendBody(`@${keepName}\n`);
    this.writer.appendBody('interface ActionHandler {\n');
    for (const functionName of nativeFunctionNames)
      this.writer.appendBody(`fun ${functionName}(parameters: Array<Any?>)\n`);
    this.writer.appendBody('}\n\n');
    this.writer.appendBody(
      'var actionHandler: ActionHandler?\n' +
        '    get() = valdiContext?.actionHandler as? ActionHandler\n' +
        '    set(value) { setActionHandlerUntyped(value) }\n\n',
    );
  }

  appendEmitActions(actions: string[]): void {
    for (const action of actions) {
      const parts = action.split('_').filter(Boolean);
      const functionName = pascalCased(parts[parts.length - 1]);
      this.writer.appendBody(
        `fun emit${functionName}(parameters: Array<Any?> = arrayOf()) {\n` +
          '    getValdiContext {\n' +
          `        it.performJsAction("${action}", parameters)\n` +
          '    }\n' +
          '}\n\n',
      );
    }
  }
}
