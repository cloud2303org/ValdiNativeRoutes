import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MODULE_TEMPLATES = ['ui_component', 'polyglot_bridge_module', 'polyglot_view_module'] as const;
export type ModuleTemplate = typeof MODULE_TEMPLATES[number];

// The pinned CLI's reserved project names, also invalid as generated package identifiers.
const reservedNames = new Set(`test tests build workspace native rule package glob select repository external bazel
class function var let const if else for while return import export module require main lib src bin data config`.split(/\s+/));

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function createModule({
  root, sources, name, template, iosLanguage = 'objc', swiftUI = false, androidContext = false, naming,
}: { root: string; sources: string; name: string; template: ModuleTemplate; iosLanguage?: 'objc' | 'swift'; swiftUI?: boolean; androidContext?: boolean; naming?: { androidNamespace: string; iosPrefix: string } }): { name: string; directory: string } {
  if (!['objc', 'swift'].includes(iosLanguage)) throw new Error('Template iOS language must be objc or swift');
  if (iosLanguage === 'swift' && template === 'ui_component')
    throw new Error('--ios-language swift applies to polyglot templates; ui_component contains only TS/TSX');
  if (swiftUI && (iosLanguage !== 'swift' || template !== 'polyglot_view_module'))
    throw new Error('--swiftui requires a Swift polyglot_view_module');
  if (androidContext && template !== 'polyglot_bridge_module')
    throw new Error('--android-context requires polyglot_bridge_module');
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) throw new Error('Module names must start with a letter and contain letters, digits, _, - or .');
  name = name.replace(/[-.]/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (reservedNames.has(name)) throw new Error(`Module name is reserved: ${name}`);
  const pascal = name.split('_').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join('');
  if (!MODULE_TEMPLATES.includes(template)) throw new Error(`Unknown template: ${template}`);
  if (['client_sql', 'coreutils', 'drawing', 'jasmine', 'source_map', 'valdi_core', 'valdi_tsx'].includes(name)) throw new Error(`${name} is a runtime module`);
  if (existsSync(path.join(root, 'valdi/node_modules', name))) throw new Error(`${name} conflicts with an installed npm package`);
  const directory = path.join(root, 'valdi/modules', name);
  if (existsSync(directory)) throw new Error(`Path already exists: ${directory}`);
  const modules = path.dirname(directory);
  if (existsSync(modules)) {
    for (const other of readdirSync(modules)) {
      const config = path.join(modules, other, 'module.json');
      if (existsSync(config) && JSON.parse(readFileSync(config, 'utf8')).iosModuleName === pascal) {
        throw new Error(`Native module name ${pascal} is already used by ${other}`);
      }
    }
  }
  const original = path.join(sources, 'npm_modules/cli/.bootstrap/modules', template);
  if (!existsSync(original)) throw new Error(`Pinned Valdi template missing: ${original}`);
  const license = readFileSync(path.join(sources, 'LICENSE'), 'utf8');
  const copied = new Map<string, string>();
  const copy = (from: string, prefix = '') => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) copy(path.join(from, entry.name), relative);
      else copied.set(relative.replace(/\.template$/, ''), readFileSync(path.join(from, entry.name), 'utf8')
        .replaceAll('{{MODULE_NAME}}', name).replaceAll('{{MODULE_NAME_PASCAL_CASED}}', pascal));
    }
  };
  copy(original);
  const config: Record<string, string | boolean> = { template, iosModuleName: pascal };
  if (template !== 'ui_component') config.nativeBuild = 'bazel';
  if (template === 'polyglot_bridge_module') {
    config.androidModuleFactory = `com.snap.modules.${name}.CalculatorModuleFactoryImpl`;
    config.iosModuleFactory = `${pascal}CreateModuleFactory`;
    if (androidContext) {
      config.androidModuleFactoryContext = true;
      const file = 'android/CalculatorModuleFactory.kt';
      copied.set(file, copied.get(file)!.replace(
        'class CalculatorModuleFactoryImpl:',
        'class CalculatorModuleFactoryImpl(private val context: android.content.Context):',
      ));
    }
    const header = `SCC${pascal}ModuleFactory.h`;
    const factory = `SCC${pascal}CalculatorModuleFactoryImpl`;
    const code = copied.get('ios/SCCCalculatorModuleFactory.m')!
      .replaceAll('SCCCalculatorModule', `SCC${pascal}CalculatorModule`)
      .replace('#import "valdi_core/SCValdiModuleFactoryRegistry.h"', `#import "${header}"`)
      .replace('VALDI_REGISTER_MODULE()', '');
    copied.delete('ios/SCCCalculatorModuleFactory.m');
    copied.set(`ios/SCC${pascal}ModuleFactory.m`, `${code}

id<SCNValdiCoreModuleFactory> ${config.iosModuleFactory}(void) {
    return [${factory} new];
}
`);
    copied.set(`ios/${header}`, `#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCNValdiCoreModuleFactory.h>
FOUNDATION_EXPORT id<SCNValdiCoreModuleFactory> _Nonnull ${config.iosModuleFactory}(void);
`);
  }
  if (template === 'polyglot_view_module') {
    config.androidViewBinder = `com.snap.modules.${name}.PolyglotNativeViewAttributesBinder`;
    // Upstream's fixed ObjC name collides when two view modules share a binary.
    const nativeName = `SC${pascal}NativeView`;
    for (const [file, text] of [...copied]) {
      copied.delete(file);
      copied.set(file.replaceAll('SCPolyglotView', nativeName), text.replaceAll('SCPolyglotView', nativeName));
    }
    const view = 'android/PolyglotNativeView.kt';
    copied.set(view, copied.get(view)!.replace('class PolyglotNativeView(', '@androidx.annotation.Keep\nclass PolyglotNativeView('));
  }
  if (template !== 'ui_component' && iosLanguage === 'swift') {
    config.iosLanguage = 'swift';
    for (const file of [...copied.keys()]) if (file.startsWith('ios/')) copied.delete(file);
    if (template === 'polyglot_bridge_module') {
      delete config.iosModuleFactory;
      config.iosModuleFactoryClass = `VR${pascal}ModuleFactory`;
      const api = `VR${pascal}CalculatorModule`;
      copied.set('src/Calculator.d.ts', copied.get('src/Calculator.d.ts')!
        .replace('@ExportModule', `@ExportModule({swift: '${api}'})`));
      copied.set('ios/Module.swift', `import Foundation
import ValdiRuntime

final class ${pascal}Implementation: ${api} {
    func multiply(left2: Double, right2: Double) throws -> Double { left2 * right2 }
}

@objc(VR${pascal}ModuleFactory)
final class ModuleFactory: ${api}Factory {
    override func onLoadModule() -> any ${api} { ${pascal}Implementation() }
}
`);
    } else {
      const nativeName = `SC${pascal}NativeView`;
      copied.set('ios/NativeView.swift', swiftUI ? `import UIKit
import SwiftUI
import ValdiRuntime

private struct Content: View {
    @State private var count = 0
    var body: some View {
        VStack {
            Text("Hello from SwiftUI")
            Text("Count: \\(count)")
            Button("SwiftUI +1") { count += 1 }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Valdi mounts a UIView. Keep the hosting controller alive and participate in
/// UIKit containment as the Valdi view enters/leaves its screen.
@objc(${nativeName})
final class NativeView: UIView {
    private let controller = UIHostingController(rootView: Content())
    override init(frame: CGRect) {
        super.init(frame: frame)
        controller.view.backgroundColor = .clear
        addSubview(controller.view)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
        super.layoutSubviews()
        controller.view.frame = bounds
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            if controller.parent != nil {
                controller.willMove(toParent: nil)
                controller.removeFromParent()
            }
        } else if controller.parent == nil {
            var responder: UIResponder? = next
            while let current = responder {
                if let parent = current as? UIViewController {
                    parent.addChild(controller)
                    controller.didMove(toParent: parent)
                    break
                }
                responder = current.next
            }
        }
    }
}
` : `import UIKit
import ValdiRuntime

@objc(${nativeName})
final class NativeView: UIView {
    private let label = UILabel()
    override init(frame: CGRect) {
        super.init(frame: frame)
        label.text = "Hello from Swift"
        label.textAlignment = .center
        addSubview(label)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
        super.layoutSubviews()
        label.frame = bounds
    }
}
`);
    }
  }
  if (template !== 'ui_component') {
    copied.set('BUILD.bazel', `load("//bzl/node_module:module.bzl", "node_valdi_module")

node_valdi_module(
    name = "${name}",
    srcs = glob(["src/**/*.ts", "src/**/*.tsx"]),
    config = "module.json",
    ios_module_name = "${pascal}",
    ios_language = "${iosLanguage}",
    res = glob(["res/**"]),
    android_srcs = glob(["android/**/*.kt"]),
    ios_srcs = glob(["ios/**/*.m"]),
    ios_hdrs = glob(["ios/**/*.h"]),
    swift_srcs = glob(["ios/**/*.swift"]),
)
`);
  } else copied.delete('BUILD.bazel');
  if (naming && template !== 'ui_component') {
    // Only freshly generated template symbols are renamed; installed modules retain their ABI.
    const rename = (text: string) => text
      .replaceAll(`com.snap.modules.${name}`, `${naming.androidNamespace}.modules.${name}`)
      .replaceAll(`${pascal}CreateModuleFactory`, `${naming.iosPrefix}${pascal}CreateModuleFactory`)
      .replaceAll(`SCC${pascal}`, `${naming.iosPrefix}${pascal}`)
      .replaceAll(`SC${pascal}`, `${naming.iosPrefix}${pascal}`)
      .replaceAll(`VR${pascal}`, `${naming.iosPrefix}${pascal}`);
    for (const [file, text] of [...copied]) {
      copied.delete(file);
      copied.set(rename(file), rename(text));
    }
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') config[key] = rename(value);
    }
    config.androidClassPath = `${naming.androidNamespace}.modules.${name}`;
  }
  copied.set('module.json', JSON.stringify(config, null, 2) + '\n');
  copied.set('LICENSE', license);
  copied.set('TEMPLATE.md', `# ${name}

Generated from the pinned Valdi CLI's \`${template}\` template.
Template sources: \`npm_modules/cli/.bootstrap/modules/${template}\`.

TS/TSX and resources use the repository's Node pipeline.
Android/iOS libraries and registration are discovered from module.json.
Enable this module ID in the App's package.json valdi.modules before using it.
Web/macOS sources are retained from upstream; this App has Android/iOS hosts.
Changing native implementations requires rebuilding the application.
`);
  try {
    for (const [file, text] of copied) write(path.join(directory, file), text);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { name, directory };
}
