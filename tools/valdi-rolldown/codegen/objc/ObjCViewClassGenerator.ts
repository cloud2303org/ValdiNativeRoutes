// Template/ObjCViewClassGenerator.swift: an exported @Component as an SCValdiRootView subclass, typed by its view
// model and context classes. Views only go in the module's main files (app_pages.h/.m), after everything else.
import { CodeWriter } from '../CodeWriter';
import type { LanguageSpecificViewClassGenerator } from '../kotlin/KotlinViewClassGenerator';
import {
  importHeaderStatement,
  IOS_GROUPING_PRIORITY,
  typeDeclaration,
  type BundleInfo,
  type IOSType,
  type NativeSource,
  type Platform,
} from '../Models';
import { camelCased, FileHeaderCommentGenerator, indented, pascalCased, type GeneratedSourceFilename } from '../Utils';

export class ObjCViewClassGenerator implements LanguageSpecificViewClassGenerator {
  readonly platform: Platform = 'ios';

  private readonly className: string;
  private readonly header = new CodeWriter();
  private readonly impl = new CodeWriter();

  constructor(
    private readonly bundleInfo: BundleInfo,
    private readonly iosType: IOSType,
    private readonly componentPath: string,
    private readonly sourceFilename: GeneratedSourceFilename,
    private readonly viewModelClass: IOSType | undefined,
    private readonly componentContextClass: IOSType | undefined,
  ) {
    this.className = iosType.name;
  }

  start(): void {
    const { header, impl, className } = this;
    header.appendHeader('#import <UIKit/UIKit.h>\n');
    header.appendHeader('#import <valdi_core/SCValdiRootView.h>\n');
    const superclassName = 'SCValdiRootView';

    impl.appendHeader(`#import ${importHeaderStatement(this.iosType, 'withUtilities')}\n`);
    impl.appendHeader('#import <valdi_core/SCValdiRuntimeProtocol.h>\n');

    header.appendBody(FileHeaderCommentGenerator.generateComment(this.sourceFilename));
    header.appendBody('\n');
    header.appendBody(`@interface ${className}: ${superclassName}\n\n`);
    impl.appendBody(`@implementation ${className}\n\n`);

    impl.appendBody(`+ (NSString *)componentPath\n{\nreturn @"${this.componentPath}";\n}\n\n`);
  }

  finish(): void {
    this.header.appendBody('\n@end\n');
    this.impl.appendBody('@end\n');
    this.impl.appendHeader('#import <valdi_core/SCValdiContextProtocol.h>\n');
  }

  appendAccessor(className: string, nodeId: string): void {
    this.header.appendBody(`@property (readonly, nonatomic) ${className} * _Nullable ${camelCased(nodeId)};\n`);
    if (!className.startsWith('UI') && className !== 'SCValdiView') this.header.appendHeader(`@class ${className};\n`);
    this.impl.appendBody(
      `- (${className} *)${camelCased(nodeId)}\n{\n` +
        `return (${className} *)[self.valdiContext viewForNodeId:@"${nodeId}"];\n}\n\n`,
    );
  }

  appendConstructor(): void {
    const { header, impl } = this;
    let viewModelType = 'NSDictionary<NSString *, id> *';
    if (this.viewModelClass) {
      header.appendHeader(`#import ${importHeaderStatement(this.viewModelClass, 'withUtilities')}\n`);
      viewModelType = typeDeclaration(this.viewModelClass);
    }
    let contextType = 'NSDictionary<NSString *, id> *';
    if (this.componentContextClass) {
      header.appendHeader(`#import ${importHeaderStatement(this.componentContextClass, 'withUtilities')}\n`);
      contextType = typeDeclaration(this.componentContextClass);
    }

    header.appendBody(
      `- (instancetype _Nonnull)initWithViewModel:(${viewModelType} _Nullable)viewModel componentContext:(${contextType} _Nullable)componentContext runtime:(id<SCValdiRuntimeProtocol> _Nonnull)runtime;\n\n`,
    );
    header.appendBody(`@property (strong, nonatomic) ${viewModelType} _Nullable viewModel;\n`);

    impl.appendBody(
      `- (instancetype)initWithViewModel:(${viewModelType})viewModel componentContext:(${contextType})componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime\n` +
        '{\n' +
        '    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];\n' +
        '}\n\n',
    );
    impl.appendBody(
      `- (void)setViewModel:(${viewModelType})viewModel\n` +
        '{\n' +
        '    self.valdiContext.viewModel = viewModel;\n' +
        '}\n\n' +
        `- (${viewModelType})viewModel\n` +
        '{\n' +
        '    return self.valdiContext.viewModel;\n' +
        '}\n\n',
    );
  }

  appendNativeActions(nativeFunctionNames: string[]): void {
    if (!nativeFunctionNames.length) return;
    const protocolName = `${this.className}ActionHandler`;
    const methods = nativeFunctionNames.map(name => `-(void)${name}:(NSArray<id> * _Nonnull)parameters;`);

    // Above the class's comment.
    this.header.prependBody(`@protocol ${protocolName}\n\n${methods.join('\n')}\n\n@end\n\n`);
    this.header.appendBody(`\n@property (weak, nonatomic) id<${protocolName}> _Nullable actionHandler;\n\n`);

    this.impl.appendBody(
      `-(void)setActionHandler:(id<${protocolName}>)actionHandler\n{\nself.valdiContext.actionHandler = actionHandler;\n}\n\n`,
    );
    this.impl.appendBody(`- (id<${protocolName}>)actionHandler\n{\nreturn self.valdiContext.actionHandler;\n}\n\n`);
  }

  appendEmitActions(actions: string[]): void {
    if (!actions.length) return;
    this.header.appendHeader('#import <valdi_core/SCValdiActions.h>\n');
    for (const action of actions) {
      // String.split(separator:) drops empty pieces.
      const parts = action.split('_').filter(Boolean);
      const functionName = pascalCased(parts[parts.length - 1]);
      this.header.appendBody(`-(void)emit${functionName}:(nonnull NSArray<id> *)parameters;\n`);
      this.impl.appendBody(
        `-(void)emit${functionName}:(NSArray<id> *)parameters\n{\n` +
          `[self.valdiContext performJsAction:@"${action}" parameters:parameters];\n}\n\n`,
      );
    }
    this.header.appendBody('\n');
  }

  write(): NativeSource[] {
    const moduleName = this.bundleInfo.iosModuleName;
    const source = (writer: CodeWriter, extension: string): NativeSource => ({
      filename: `${this.className}.${extension}`,
      content: indented(writer.content, '    '),
      groupingIdentifier: `${moduleName}.${extension}`,
      groupingPriority: IOS_GROUPING_PRIORITY.viewType,
      localFilenameDependencies: [],
    });
    return [source(this.header, 'h'), source(this.impl, 'm')];
  }
}
