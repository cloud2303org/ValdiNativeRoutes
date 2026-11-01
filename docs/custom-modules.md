# 自定义模块与官方模板

`pnpm new-module` 使用固定 Valdi 源码中的官方模板，支持三种选择：

```sh
pnpm new-module profile --template ui_component
pnpm new-module device_api --template polyglot_bridge_module
pnpm new-module camera_view --template polyglot_view_module
```

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
修改 Kotlin / Objective-C 实现需要重新构建 App；只修改 TSX 页面可用开发服务器热更新。
官方模板本身使用 Objective-C，生成器不会另外生成 Swift 实现。
保留 Web / macOS 模板源码不代表当前仓库提供对应宿主的构建入口。

## Calculator 参考实验

`valdi/modules/calculator` 参考固定 Valdi fork 中的官方
`npm_modules/cli/.bootstrap/modules/polyglot_bridge_module` 模板：
`Calculator.d.ts` 声明 `multiply(left, right)`，Kotlin / Objective-C 实现乘法。
实验增加了 TSX 页面、dayjs 和图片，用于一起验证 TS、npm、资源、绑定和原生调用。
来源的 MIT 许可证保留在模块目录。

模块使用我们自己的 `node_valdi_module()`，入口是独立的 `module-build/` Bazel workspace。
App 继续由 Gradle / Xcode 打包；原来的 `valdi/` workspace 仍负责运行时导出。
calculator 不依赖原来的 App Bazel target、`valdi_module()`、`valdi_compiled()` 或 Swift Valdi 编译器。

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
  模块引入额外原生第三方库时，还需在宿主配置相应的链接 / 打包依赖；
  当前自动收集的是各模块自身的 JAR / 静态库，不会把 Bazel 依赖转换成 Gradle / SwiftPM 依赖。
- Android 由 `scripts/native-modules.mjs` 生成工厂和 AttributesBinder 注册入口，不依赖上游注解处理器。
- iOS 保留模板的 factory / protocol 结构。已有 XCFramework 隐藏了
  `VALDI_REGISTER_MODULE()` 调用的 C 注册函数，因此由模块导出工厂创建函数，宿主通过公开的
  `registerNativeModuleFactory` 注册。calculator 接入本身不要求修改 runtime 实现。
- calculator 的根视图类同样由 Node 生成并编入模块静态库；Swift 宿主只创建这个类。
- OTA 把独立模块当前生成的原生声明纳入绑定指纹，单纯修改页面 JS 不改变这部分 ABI 指纹。
  手写原生实现、声明和原生构建配置仍影响二进制兼容性。

新增原生模块由生成器创建 BUILD 和 module.json，并自动接入宿主的链接及工厂注册。
`androidModuleFactory`、`androidViewBinder`、`iosModuleFactory` 指定相应注册类或函数；
Android 工厂使用无参构造，Binder 使用接收 `Context` 的构造；iOS 工厂函数返回
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
