# 自定义模块与官方模板

`pnpm new-module` 使用固定 Valdi 源码中的官方模板，支持三种选择：

```sh
pnpm new-module profile --template ui_component
pnpm new-module device_api --template polyglot_bridge_module
pnpm new-module camera_view --template polyglot_view_module
```

需要 Android `Application Context` 的能力模块可以加 `--android-context`：

```sh
pnpm new-module bluetooth --template polyglot_bridge_module --ios-language swift --android-context
```

脚手架给 Kotlin 工厂生成 Context 构造参数，并在 `module.json` 设置
`androidModuleFactoryContext: true`。宿主注册模块时自动传入 `applicationContext`，
不要在模块里保留 Activity。默认桥接模板仍使用无参工厂。

不传 `--template` 时，交互终端会显示模板菜单；非交互执行默认生成 `ui_component`。
名字会规范为 snake_case，例如 `CameraView` 生成 `camera_view`。
模板来自 `npm_modules/cli/.bootstrap/modules/`，保留上游许可证。

- `ui_component`：Valdi TSX 组件及模块配置。
- `polyglot_bridge_module`：TypeScript 原生接口、Kotlin 与 Objective-C 工厂实现，以及上游 Web 实现。
- `polyglot_view_module`：TSX 的 `<custom-view>` 封装、Android View / AttributesBinder、
  iOS UIView，以及上游 macOS / Web 实现。

这里的 TSX 模块提供 Valdi 运行时的模块名、组件、资源和原生契约，产物为 `.valdimodule`。
pnpm 安装的是构建工具和 npm 依赖；这些依赖仍会由 Node 管线处理，两者用途不同。

生成的原生模板使用 `node_valdi_module()`，由 `module.json` 驱动宿主自动链接和注册。
创建后运行 `pnpm android` 或 `pnpm ios` 即可准备模块库并构建 App。
修改 Kotlin / Objective-C / Swift 实现需要重新构建 App；只修改 TSX 页面可用开发服务器热更新。
官方模板默认使用 Objective-C；仓库同时提供 Swift 实现选项。
保留 Web / macOS 模板源码不代表当前仓库提供对应宿主的构建入口。

## Swift 与 SwiftUI

```sh
# TS 声明、Kotlin 实现、Swift 原生接口实现
pnpm new-module swift_math --template polyglot_bridge_module --ios-language swift

# TSX custom-view、Android View、Swift UIView
pnpm new-module swift_view --template polyglot_view_module --ios-language swift

# iOS 改用 UIHostingController 承载 SwiftUI；Android 仍保留官方 View 实现
pnpm new-module swift_counter --template polyglot_view_module --ios-language swift --swiftui
```

这条路线由 Node 直接生成 Swift 绑定，使用固定 Valdi 版本的 Swift marshaller 契约，
没有经过 Objective-C 生成绑定，也不调用已删除的 Swift 版 Valdi 编译器。
模型、协议代理、数值/字符串枚举、导出函数、泛型、可空类型、数组、映射、回调、
Promise 和导出的 Valdi View 使用 `ValdiCoreSwift` 的类型与 schema 规则。
仓库导出的 framework 将这份官方 Swift runtime 合入 `ValdiRuntime`。

固定版本官方编译器的 `ExportedModuleGenerator.generateSwiftSources()` 返回空列表。
本仓库在相同模型/proxy 契约上补充 Swift 模块工厂：实现生成的协议，
继承生成的 `<协议名>Factory`，覆盖 `onLoadModule()`；模块导出对象通过原有 C++ Value
wrapper 进入原生模块加载器。业务方法的 `throws` 通过 marshaller 传回 JS。
工厂构建出无效 schema 属于原生编程错误，不能用返回空对象掩盖。

`module.json` 的 `iosLanguage` 与 BUILD 的 `ios_language` 必须一致，默认均为 `objc`；
可以设成 `swift`，也可以设成 `both` 同时生成两套绑定。`swift_srcs` 编译手写实现，
`swift_deps` 声明原生 Swift 库依赖；TS 模块依赖仍通过 `deps` 声明。
双语言模块的 Swift module 名为 `<iosModuleName>_Swift`，与官方规则一致。
脚手架会给模块协议设置唯一的 `swift:` 名称，避免多个 Calculator 模板在 Swift registry 中重名。
手写跨模块模型也应给出唯一的原生名称。

Swift 工厂使用 `@objc(唯一类名)`，通过 `iosModuleFactoryClass` 自动注册。
原生 View 同样需要稳定的 `@objc` 名称，与 TSX 的 `iosClass` 一致。
SwiftUI 本身不直接注册给 Valdi：模板用 `UIView` 包装 `UIHostingController`，
在进入/离开窗口时处理 controller containment；数据和事件可继续通过 View attributes
或生成的原生接口传递。原生 View 的尺寸仍由 Valdi 页面布局决定。

Swift runtime 导出包含 `valdi_core`、`ValdiCoreCPP` 所需的公开头文件与 module map。
独立 Bazel 模块和 Xcode App 已自动传入该 module map；不需要使用 Bazel execroot 内的头文件。
手写代码中，`import ValdiRuntime` 提供 Swift marshaller；需要 `SCValdi*` Objective-C API 时，
另加 `import valdi_core`。更新 Xcode/Swift 工具链后应重新导出 runtime。

```sh
sh scripts/export-ios.sh debug
pnpm ios

# 单独检查真实 Swift ABI（macOS，先导出上述 runtime）
cd tools/valdi-rolldown
VALDI_SWIFT_TYPECHECK=1 node node_modules/tsx/dist/cli.mjs --test swift.test.ts
```

模块原生库默认构建 arm64 模拟器；Xcode 真机构建时会根据 `SDK_NAME`/`PLATFORM_NAME`
选择设备架构，也可显式设置 `VALDI_IOS_PLATFORM=device`。Release 配置使用优化编译。
Swift 库与 ObjC 库一起汇入 `libvaldi_modules_ios.a`，宿主保留动态注册需要的 Swift 对象。
额外的第三方原生 framework、资源、entitlements 仍需在宿主显式配置。

## 已迁移的 Bluetooth 模块

### App 启用名单

根 `package.json` 的 `valdi.modules` 明确列出当前 App 使用的模块 ID：

```json
{
  "valdi": {
    "modules": ["app_pages", "bluetooth", "calculator", "valdi_webview"]
  }
}
```

ID 是 `valdi/modules/` 下的目录名。模块的 `module.json` 描述原生工厂、平台配置；
App 的名单只引用这些 ID。未列出的模块可以留在仓库，但不会被本 App 的 TS 构建、
原生构建、工厂注册、模块 JAR/静态库汇总或 OTA 打包选中。Bazel 内的模块目标仍可单独构建。
新增脚手架模块不会自动启用；把它加入名单后运行 `pnpm android` / `pnpm ios`，
有新导出声明时由 prebuild 更新绑定。

启用模块中的 TS、声明文件或 BUILD 依赖若仍引用未启用模块，构建会明确报错，
不会隐式启用依赖。目前 `app_pages` 的蓝牙演示与启动代码依赖 `bluetooth`；
要制作无蓝牙 App，需要移除这些业务引用，再从名单移除 `bluetooth`。
WebView 演示同样依赖 `valdi_webview`；停用时需一起移除页面和路由引用。
这份 App 的入口是 `app_pages`，它也需要保留在名单中。

构建会清理仍在仓库但已停用模块的旧暂存产物，重新生成注册代码与 iOS 聚合静态库，
避免上一次构建留下的文件混入包内。修改名单后重建 App，并重启已经运行的 `pnpm dev`。
外部 npm 依赖和 Valdi runtime 内置模块不使用这份名单。

蓝牙专属 Android 权限/feature、iOS `NSBluetoothAlwaysUsageDescription` 由其 `module.json`
贡献，停用后不再合入 App。Android 主 Manifest 与 iOS 基础 Info.plist 保留 App 自己的配置；
共享定位权限仍属于宿主 Wi-Fi 等能力，不能随蓝牙一起删除。iOS entitlements、签名、
第三方 framework 和 SwiftPM 配置仍由宿主管理。

Wi-Fi、NFC、权限、MMKV 存储和 AppUI 目前仍属于 `app_pages` 与应用宿主，
尚未成为可单独开关的模块。仅从名单移除 Bluetooth 不会移除这些能力。
后续拆分必须同时迁移接口、原生实现、初始化与平台依赖；尤其 MMKV 的
iOS SwiftPM 依赖当前在 `ios/project.yml`，还不随模块名单切换。

`valdi/modules/bluetooth` 实际通过上面的 `polyglot_bridge_module` 命令创建，
再用已有 BLE 业务替换模板里的 Calculator 示例。它使用相同的 Node 编译、绑定生成、
Bazel 原生库和模块工厂注册流程，没有独立的 BLE 构建入口。

- `src/`：公共 API、参数校验、中心/外设模式、事件分发及原生声明。
- `android/`：Kotlin 工厂、适配和 BLE 核心。
- `ios/`：直接实现生成的 Swift 协议及模块工厂，CoreBluetooth 核心随模块编译。
- `App`：保留 Manifest/Info.plist 权限说明，以及与 Wi-Fi/NFC 共用的权限服务。

App 在其长期持有的启动作用域初始化一次：

```ts
import { initializeBluetooth, bluetoothApi } from 'bluetooth/src/index';
import * as permissions from './permissions/index';

initializeBluetooth(permissions);
const bluetooth = bluetoothApi();
```

`permissions` 传入平台信息、权限请求和同一个权限串行队列；模块不反向导入
`app_pages`。页面监听归页面所有，连接/扫描/外设服务由应用级会话持有，
直到业务主动停止或关闭。`BlePage` 仍是 App 的演示页面；它在销毁时移除监听，
并主动停止该演示页发起的扫描。

第三方 Android 库在 BUILD 的 `android_deps` 中用于独立编译，在 `module.json`
的 `androidDependencies` 中声明 Maven 坐标供 Gradle 打包；两处需保持一致。
Bluetooth 的 Blessed 依赖仍使用原项目的 JitPack 来源。模块 JAR 不内嵌依赖库，
也不会把第三方蓝牙实现复制回宿主源码目录。

官方 Swift `ValdiResolvablePromise<T>` 的通用值编码不覆盖 `Void` 和数组。
Bluetooth 使用同一份 runtime 的 Promise/marshaller API 显式编码这些结果，
保留 native Promise 的生命周期；没有修改 runtime，也没有用页面 callback 替代 Promise。

## Calculator 参考实验

`valdi/modules/calculator` 参考固定 Valdi fork 中的官方
`npm_modules/cli/.bootstrap/modules/polyglot_bridge_module` 模板：
`Calculator.d.ts` 声明 `multiply(left, right)`，Kotlin / Objective-C 实现乘法。
实验增加了 TSX 页面、dayjs 和图片，用于一起验证 TS、npm、资源、绑定和原生调用。
来源的 MIT 许可证保留在模块目录。

模块使用我们自己的 `node_valdi_module()`，入口是独立的 `module-build/` Bazel workspace。
App 继续由 Gradle / Xcode 打包；原来的 `valdi/` workspace 仍负责运行时导出。
calculator 不依赖原来的 App Bazel target、`valdi_module()`、`valdi_compiled()` 或 Swift Valdi 编译器。

## 官方 WebView 模块

`valdi_webview` 保留官方 Android WebView / iOS WKWebView 实现及 TypeScript 接口，
通过相同 Node 编译、生成绑定和原生模块注册流程接入。`androidClassPath` 保留官方
生成代码的 Java 包名，`ios_frameworks` 声明原生模块编译所需的 WebKit；
应用的 `ios/project.yml` 同时负责最终 WebKit 链接。
接入、演示入口和验证边界见 [WebView 模块](webview-module.md)。

## 构建入口

先按主 README 安装依赖并准备已有 runtime。模块原生库直接引用
`android/app/libs/valdi_runtime.aar` 和 `ios/Frameworks/ValdiRuntime.xcframework`，不编译另一份 runtime。

```sh
# 单独生成模块的 JS、图片和 Kotlin / Objective-C / C++ 绑定
cd module-build
bazel build //modules/calculator:calculator_compiled

# Release TS：现有 Node 管线 + 锁定的 hermesc，输出 Valdi 包装的 Hermes 字节码和 source map
bazel build //modules/calculator:calculator_release

# 两端原生库目标（各自只编译模块实现和 Node 生成绑定）
bazel build //modules/calculator:calculator_ios --platforms=//:ios_sim_arm64
bazel build //modules/calculator:calculator_android --android_platforms=@snap_platforms//os:android_arm64
```

在仓库根目录执行下面的入口，会同时构建模块并整理宿主需要的产物：

```sh
node scripts/node-modules.mjs ios
node scripts/node-modules.mjs android
pnpm build:ios
pnpm build:android
```

`module-build/out/ios/calculator/` 包含静态库和生成头文件；
`module-build/out/android/calculator/` 包含模块 jar。
原始 `.valdimodule`、source map、平台图片、生成绑定和 `build.json` 位于
`module-build/bazel-bin/modules/calculator/calculator_compiled/`，Release 在 `calculator_release/`。
`pnpm build` 和宿主模块构建会从这些产物复制 calculator，不再单独绕开规则编译它。

## 接入边界

- `module.json` 用 `nativeBuild: "bazel"` 选择新规则，`iosModuleName` 必须与 BUILD 声明一致。
- Node 的 `module-build.ts` 在临时目录生成 tsconfig、资源声明和绑定，不向源模块或宿主绑定目录写文件。
- TS 模块依赖通过 `deps` 指定其他模块的 `_compiled` target，规则传递源码输入和资源类型声明。
  原生库依赖分别由 `android_deps` / `ios_deps` 声明。calculator 本身不依赖 app_pages。
  Android 第三方库还需在 `module.json` 的 `androidDependencies` 中列出 Maven 坐标，
  宿主 Gradle 会读取这些坐标；它不会自动解析 Bazel 依赖图。iOS 第三方 framework、
  SwiftPM 依赖和资源仍需在宿主配置。
- Android 由 `scripts/native-modules.mjs` 生成工厂和 AttributesBinder 注册入口，不依赖上游注解处理器。
- iOS 保留模板的 factory / protocol 结构。已有 XCFramework 隐藏了
  `VALDI_REGISTER_MODULE()` 调用的 C 注册函数，因此由模块导出工厂创建函数，宿主通过公开的
  `registerNativeModuleFactory` 注册。calculator 接入本身不要求修改 runtime 实现。
- calculator 的根视图类同样由 Node 生成并编入模块静态库；Swift 宿主只创建这个类。
- OTA 把独立模块当前生成的原生声明纳入绑定指纹，单纯修改页面 JS 不改变这部分 ABI 指纹。
  手写原生实现、声明和原生构建配置仍影响二进制兼容性。

新增原生模块由生成器创建 BUILD 和 module.json，并自动接入宿主的链接及工厂注册。
`androidModuleFactory`、`androidViewBinder`、`iosModuleFactory` 指定相应注册类或函数；
Android 工厂默认使用无参构造；`--android-context` 创建的工厂接收 `applicationContext`。
Binder 使用接收 `Context` 的构造；iOS 工厂函数返回
`id<SCNValdiCoreModuleFactory>`。手写模块也可以使用这些字段。
iOS 模块库合并到 `module-build/out/ios/libvaldi_modules_ios.a`，
生成头文件集中在 `module-build/out/ios/include`；Android 按模块链接各自的 JAR。
OTA 动态纳入这些模块的原生实现、BUILD、配置和生成契约，避免原生实现改变后误发兼容更新。
主 `valdi/.bazelignore` 排除 App 的 `modules/`，因为这些 BUILD 属于独立 workspace。

## 验证与限制

```sh
pnpm test
pnpm --dir tools/valdi-rolldown exec tsx --test module-build.test.ts
pnpm --dir tools/valdi-rolldown exec tsx --test scaffold.test.ts
pnpm test:e2e:ios calculator-module
```

`scaffold.test.ts` 从固定上游源码生成三种模板，实际编译 Debug / Release TS/TSX、
检查归档、Hermes 字节码及原生声明，
并验证工厂 / Binder 注册、多模块 Objective-C 类名和非法名称处理。
2026-11-01 的本地模板验证另行生成了桥接模块和原生 View 模块，
两者均通过 Kotlin JAR 与 iOS arm64 模拟器静态库的真实编译。
三种临时模块一起通过完整 Android / iOS Debug App 构建；
Android APK 中确认了工厂、View、Binder 的 DEX 类定义和三个 `.valdimodule`，
iOS App 中确认了原生 View 与桥接工厂的链接符号。临时模块移除后，原有 App 两端构建再次通过。
这些检查不等同于新原生 View 的设备交互测试。

`module-build.test.ts` 使用临时真实模块验证 npm / 图片 / 原生绑定输出、纯 `.d.ts` 模块、
Release Hermes 文件头、显式模块依赖及资源类型传递，以及类型错误阻止归档发布。设备用例从首页进入 Calculator，
检查 `6 × 7 = 42`、`-3 × 2.5 = -7.5`，没有 JS 乘法回退实现。

当前规则使用本机已安装的 Node / pnpm 依赖和已导出的 runtime，Node action 明确设置为
local、no-cache，不支持远程执行，也不声称是完全密封的工具链。
两套 workspace 的 Valdi commit 必须一致，宿主入口会检查；升级 fork 时同步模块 workspace 的 pin 和 registry。
目前 iOS 宿主准备入口针对 arm64 模拟器，未提供真机 XCFramework 打包。
C++ 绑定通过 `cpp` output group 暴露；本实验没有 C++ 手写实现，尚不证明独立 C++ 库的链接、加载或 ABI。

2026-10-29 本地验证：`pnpm test`（含 5 个自定义模块测试、7 个内置模块测试和绑定 golden）、
iOS / Android 完整 Debug App 构建均通过。后续 runtime Node 编译后端迁移已重新导出两端 runtime，
此前 Android 的旧 AAR 工具链指纹阻塞已解决。
iOS 模拟器和本机 arm64 Android 16 KB 模拟器均通过 calculator、C++ 模块和表单数据库写入回放。
iOS 同一 Debug 宿主加载 Release calculator，以及加载 Release 内置模块的回放也通过；这些不等同于完整 Release App 验证。
两端 runtime 构建图的旧编译器动作数为 0；iOS 两个 slice、Android 三个 ABI 的 runtime 二进制均与修改前逐字节一致。
未运行完整 Release App 或物理真机测试。全仓格式检查仍有原有文件问题；calculator 文件检查通过。
本地详细日志保留在忽略的 `.ci/calculator-*`、`.ci/node-runtime-*` 下。
