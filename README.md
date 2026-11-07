# Valdi Native Routes

业务页面用 Valdi（TSX）写，保留一个原生选择页用于互操作示例。原生负责路由：Android 用 Compose Navigation 3 管页面栈，iOS 用 UIKit 的 UINavigationController。

媒体示例从首页进入：[`Lottie 动画`](docs/lottie-demo.md) 使用官方 `<animatedimage>`，
[`原生视频播放器`](docs/video-demo.md) 使用官方 `<video>` 接入 Android Media3 和 iOS AVPlayer，
通过每播放器的 Valdi 原生对象接口和事件订阅控制，
提供离线 MP4、HLS、TSX 控制、全屏及画中画。各功能的验证范围见对应文档。

```text
valdi/                  Valdi 工作区（Bazel），只用来编 Valdi 运行时
  BUILD.bazel           valdi_runtime：导出成 valdi_runtime.aar / ValdiRuntime.xcframework
  package.json          Valdi 命令行工具，以及页面用的 npm 包（dependencies）
  modules/app_foundation/ 通用导航、页面生命周期、Splash 和数据库驱动
  modules/app_pages/    业务页面、应用路由与初始化
    src/features/       按功能归类的页面
    src/services/       业务 API、认证和数据库服务
    src/routes.ts       具体路由声明，由 StartApp(debug) 返回给原生
  modules/app_vision/   独立 Vision 能力契约和调用封装
  modules/              AppUI、视频、蓝牙、存储等能力及其平台实现
tools/valdi-rolldown/   我们自己的 Valdi 模块构建（代替 Valdi 的编译器）：编译、打包、热重载、原生绑定生成
android/                普通 Gradle 工程，Compose + Nav3
  app/libs/             valdi_runtime.aar（导出产物，不进 git）
  app/generated/valdi/  各启用模块的 Kotlin 绑定（codegen.ts 生成，进 git）
ios/                    UIKit 工程（XcodeGen 的 project.yml）
  Frameworks/           ValdiRuntime.xcframework（导出产物，不进 git）
  Generated/valdi/      各启用模块的 Objective-C 绑定（codegen.ts 生成，进 git）
scripts/
  export-android.sh     重新导出 Valdi 运行时 aar
  export-ios.sh         重新导出 Valdi 运行时 xcframework
  hotreload.sh          热重载（tools/valdi-rolldown 的 pnpm dev）
```

模块和两端宿主的职责、共享实现与生成代码边界见[代码组织](docs/code-organization.md)。

## 发行模板

模板版本由根 `package.json` 的 `version` 标识。可从 GitHub Releases 下载固定版本源码包，
修改应用配置后执行 `pnpm install --frozen-lockfile`，再执行 `pnpm android` 或 `pnpm ios`。
首次仍需本机原生工具链和构建；不是免编译的 APK / IPA。
下载、版本含义、后续同步及发布步骤见[模板发行说明](docs/template-releases.md)。

## 运行

应用名、Android applicationId、iOS Bundle ID 与新模块命名默认值统一在根目录
`package.json` 的 `valdi.app` 配置，见[应用配置说明](docs/app-configuration.md)。

日常构建和测试从仓库根目录运行：

```sh
pnpm prebuild --platform android   # 准备 Valdi 源码/绑定/运行时/原生模块/Vision（未变化时走快速路径）
pnpm android                       # prebuild + 构建 + 安装 + 启动（唯一模拟器，或 --device 指定）
pnpm ios                           # 同上，iOS 模拟器（仅 macOS）
pnpm dev                           # Node 热重载；按 a / i 选择设备并构建、安装、启动 App
pnpm build:android                 # 只构建 Android Debug APK，不安装/启动
pnpm build:ios                     # 只构建 iOS Simulator Debug App（自动 XcodeGen）
pnpm build                         # TS 模块、图片和字体；输出 tools/valdi-rolldown/out/
pnpm build:web                     # 打包固定框架版本的官方 Web HelloWorld 示例
pnpm test                          # 构建前置检查测试 + Kotlin / Objective-C / C++ golden 对比
pnpm test:e2e:android          # 已安装 Android App 的 UI 测试
pnpm test:e2e:ios              # 已安装 iOS App 的 UI 测试
```

也可以先只运行 `pnpm dev`，在同一个终端按 **a**（Android）或 **i**（iOS 模拟器，仅 Mac），
输入设备编号后按回车启动。支持大写 A/I；Esc 取消选择，Ctrl+C 退出并停止从这里启动的构建。
Android 列出已启动的模拟器和已授权的连接设备；尚未启动的 Android 模拟器需先在 Android Studio 打开。
iOS 列出可用 iPhone 模拟器，选中后由 `pnpm ios --device` 自动启动。选择 Android 后热重载也定向到该设备。
原生构建在子进程执行，Node 热重载继续运行；构建期间不会重复启动第二个构建，失败后可以再次按 a/i 重试。
输出重定向或非交互终端不启用快捷键，仍可另开终端执行 `pnpm android` / `pnpm ios`。

统一入口都是 Node 分发，Windows / macOS / Linux 用法一致；`android`/`ios` 先按指纹准备（源码、绑定、运行时、
原生模块、Vision），指纹未变化时不会重新导出运行时，只改 TS 不会触发导出。设备选择是显式的：唯一运行中的
模拟器会被使用，多个模拟器或只有物理设备时必须 `--device <adb serial | simulator udid|name>`，永远不会自动挑
物理设备（物理设备只在使用 `--device` 时安装）。常用选项：`--no-install`（只构建）、`--no-launch`（安装不启动）、
`--no-prebuild`（跳过准备，交给构建自己的指纹检查）；`--` 之后的参数原样传给 Gradle / `xcodebuild`，例如
`pnpm android -- --stacktrace`。`pnpm android`/`pnpm ios` 目前只做 Debug，Release OTA 构建仍需手动导出与签名，
见 [构建与 CI 边界](docs/build-and-ci.md)。iOS 的 prebuild/构建/安装只在 macOS + Xcode 下可用；Linux 支持
`prebuild --platform android` 与 `android`（需要 adb/模拟器）。

仓库根目录的 `.npmrc` 关闭了 pnpm 的 pre/post 脚本自动执行（`enable-pre-post-scripts=false`），否则
`pnpm build` 会先自动跑同名的 `prebuild` 脚本；`pnpm prebuild --platform android` 是显式命令，不受影响。

直接构建时 Android 的 Gradle 参数、iOS 的 `xcodebuild` 参数可跟在命令后面，例如 `pnpm build:android --stacktrace`。
UI 测试沿用现有设备配置（可用
`ANDROID_DEVICE` / `IOS_DEVICE` 覆盖），默认跑全部用例；也可指定一个用例，例如
`pnpm test:e2e:android detail-scroll`。UI 测试不隐式构建或覆盖已安装的 App。

`pnpm format` 只格式化 `valdi/modules/` 的前端代码；`pnpm check` 也只检查这个范围。不添加原生格式化步骤。
GitHub Actions 运行 golden、TS 构建、Android Debug APK 和 iOS 模拟器 App 构建。
CI 的范围和缓存规则见 [构建与 CI 边界](docs/build-and-ci.md)，
框架 fork 同步、版本试跑及 vendored 代码的维护步骤见 [同步 Valdi 上游](docs/upgrading-valdi.md)。
Windows 原生 Android 构建入口见 [Native Windows Android builds](docs/windows-native-build.md)。

准备依赖和原生运行时可以显式执行（`pnpm android`/`pnpm prebuild` 会自动完成同样的步骤）：

```sh
pnpm install                               # 一次安装根目录、页面和构建工具的锁定依赖，生成 tsconfig
pnpm prebuild --platform android           # 首次/Valdi 或模块 C++ 变化时导出运行时并准备其余产物
```

需要 JDK 17、Android SDK、Node、pnpm。Valdi 命令行工具不用全局安装：它是 `valdi/package.json` 里的开发依赖（`@snap/valdi` 1.2.1），导出脚本用 `pnpm exec valdi` 调它。导出只编 Valdi 运行时（`libvaldi_runtime.so`、Valdi 的 Kotlin 和它自带的模块）以及构建要用的 Valdi 工具，第一次从头编译约 17 分钟。aar 里有三种 CPU 架构，APK 只打包 arm64（`abiFilters`）。

根目录安装通过 `postinstall` 依次安装 `valdi/` 和 `tools/valdi-rolldown/`，各自使用已有的 frozen lockfile，
然后生成页面的 tsconfig；安装阶段不编译原生代码。首次导出会先获取 Valdi 的类型源码，再检查 C++ 绑定，
避免干净目录里类型声明尚未准备好就检查绑定。构建入口会检查依赖、运行时指纹及视觉库，
缺失或过期时给出具体准备命令；只改 TS 或宿主代码不会因此要求重新导出 Valdi 运行时。

视觉库尚未准备时，Android 运行 `node vision/scripts/prepare-native.cjs --target android-arm64`，
iOS 运行 `node vision/scripts/prepare-native.cjs --target ios`。iOS 构建需要 macOS、Xcode 和 XcodeGen。

只构建 TS 模块时，不必导出 Android/iOS 运行时：首次运行 `node scripts/prepare-valdi.mjs` 获取类型声明，
之后使用根目录 `pnpm build`。图片处理使用预编译 `sharp`，Release 字节码使用固定版本的官方 `hermes-compiler`；
应用构建不再需要 toolbox、ClientSQL Python 生成器或 SQLite 3.16 校验器。
`pnpm test` 包含图片与 Hermes 适配测试和绑定 golden 对比，只需要类型源码与 npm 依赖。

`pnpm build:web` 使用同一份已准备的框架源码和官方 Web 实现，输出
`tools/valdi-rolldown/web/.local/dist/`。这是官方示例的浏览器入口；当前业务 App 的硬件服务仍由原生宿主提供。
Web 测试、浏览器验证与通用 Bazel Web 导出的接入边界见 [Node Web 入口](tools/valdi-rolldown/web/README.md)。

改 TS、图片不用再导出：Gradle 和 Xcode 构建时调用 `tools/valdi-rolldown` 编译页面（见“构建”）。开发时 `scripts/hotreload.sh` 把改动直接推到正在运行的 debug 包。

iOS：

```sh
scripts/export-ios.sh                # 开发用 debug 运行时；发版加 release，同样只在首次或运行时变化后执行
node scripts/ios-project.mjs         # brew install xcodegen；按 valdi.app 配置生成工程
```

真机运行要在 `project.yml` 里填 `DEVELOPMENT_TEAM`。

**UI 测试**用 [argent](https://www.npmjs.com/package/@swmansion/argent)（`npm i -g @swmansion/argent`）：`.argent/e2e/*.yaml` 是测试流程，按页面上的文字找元素、点击、断言，同一份在 iOS 模拟器和 Android 模拟器上跑，不经过 AI。`scripts/e2e.sh [ios|android]` 依次在两个平台上跑全部流程，设备由 `IOS_DEVICE` / `ANDROID_DEVICE` 指定，只用这两台（Android 默认是远程模拟器 `100.78.189.64:5555`，先 `adb connect`）。跑之前它会打开 iOS 模拟器的 `ApplicationAccessibilityEnabled`（不开的话 argent 读不到 UILabel 的文字），在 Android 上预先授予 app 的运行时权限（否则系统授权框会挡住后面所有测试），并放一张测试照片（`.argent/fixtures/e2e-photo.jpg`）给相册选图用。`.argent/e2e/` 覆盖路由、输入和 AppUI 等行为；移除路由 Sheet 后，相应的五个专用流程已删除。平台限定流程保留各自的条件。测试密码在 `.argent/secrets.env`（不进 git）。iOS 页面开了 Valdi 的无障碍树（`ValdiHost.swift` 的 `enableAccessibility`），argent 和 VoiceOver 才读得到 Valdi 页面的内容。

## 设计

**路由表在 TS 里。** `routes.ts` 声明每个路由是 Valdi 页面还是原生页面，以及组件路径。原生启动时调用生成的 `StartApp(debug)`，接收结构化的路由声明，不需要生成清单文件。路由支持普通页面、tab 和 iOS 的 `fullScreen` 导航选项，不支持 `sheet` 或 `compactSheet` 展示方式。

**参数和返回值用结构化数据传递。** `router.push` 和 `finish` 直接跨原生绑定传对象，不经过 JSON 字符串。TS 的 `RouteParams` / `RouteResults` 检查路由对应的入参和结果类型；运行时还会快照数据并拒绝函数、循环引用等非法载荷，避免调用后修改原对象影响已提交的导航。

**每个页面一个 Valdi 根 view，由宿主持有。** `PageEntry` 持有 `ValdiRootView`。Nav3 会释放被覆盖页面的 composition，所以根 view 不能放在 Compose 里；`AndroidView` 释放时只把它摘下来，页面真正出栈后才 `destroy()`。

**路由通过原生 host 调用。** 全局 `NavigationHost` 提供导航能力，页面的 `PageContext` 只提供 `finish` 和 `back`。TS 侧包成类型化的 `router` / `Router`，调用为 `router.push(route, params, options)` 或 `router.pushForResult(route, params, options)`；第三个参数是导航选项，TS 合并好再交给原生。

**inset 由宿主算好放进 viewModel。** 开了 edge-to-edge，页面按 `viewModel.insets` 自己留边。Valdi 自带的 `Device.getDisplayTopInset()` 在 Android 上一直是 0，不用它。

**页面键盘只由宿主处理一次，页面不读键盘高度。** Android 宿主读 `WindowInsets.ime`，给页面容器底部加键盘高度的 padding。窗口开了 edge-to-edge，系统不会再缩窗口；页面在变矮后的范围内布局，`FocusScroller` 将输入框滚到可见区域。AppUI 弹层独立处理自己的键盘避让。

**Sheet 仅作为 AppUI 弹层组件保留。** `app_ui` 模块里的 `SheetHostView`（Android）和 `AppUISheetHostView`（iOS）从 Software Mansion 的 react-native-bottom-sheet（MIT）移植，供 BottomSheet、选择器等内容使用。它不再承载路由页面；路由层不再有独立 Sheet 状态、尺寸公式或关闭回调。

## 弹窗与提示 API

小程序风格的接口：`api.showModal`、`showToast`、`hideToast`、`showLoading`、`hideLoading`（`app_pages/src/services/api.ts`）。每个方法只返回 Promise，不接受 `success` / `fail` / `complete`（蓝牙、Wi-Fi、NFC 也一样）。成功结果带 `errMsg: 'showModal:ok'` 这类字段，失败抛 `ApiError`（`errMsg` 形如 `showModal:fail …`）。参数只在入口校验一次：各能力模块的 valibot schema（和 ExpoNativeRoutes 同一套规则）检查类型和取值约束（选项个数、选择器的值必须在选项里、年份范围、日期用 dayjs 校验等），并补默认值（按钮文字“确定”“取消”、Toast 图标 `success`、时长 1500 ms 等）。之后不再检查：原生 AppUI 只负责展示，原生回传的结果也不校验，所以原生页面直接调 `NativeApp.ui` / `app.ui` 时要自己传合法参数。蓝牙、Wi-Fi、NFC 同样在入口用 valibot 校验（`ble/`、`wifi/`、`nfc/` 下的 `schemas.ts`），错误码不变。valibot 1.5.0 是 npm 包，`import * as v from 'valibot'`（见“npm 依赖”）。没人 catch 的错误（比如参数错了又没处理 `fail`）由 `startAppServices` 装的全局处理器接住：debug 包直接崩溃，release 包只记日志。

```ts
import { api } from 'app_pages/src/services/api';

const answer = await api.showModal({ title: '重命名设备', editable: true, defaultText: '采样设备' });
if (answer.confirm) console.log(answer.content);
await api.showToast({ title: '保存成功' });
await api.showLoading({ title: '加载中', mask: true });
await api.hideLoading();
```

原生页面直接调用同一个实现，不经过 JS：

```kotlin
val answer = NativeApp.ui.showModal(ModalOptions(title = "确认操作", content = "同步设置？"))
NativeApp.ui.showToast(ToastOptions("已同步", icon = "none"))
```

```swift
let answer = try await app.ui.showModal(ModalOptions(title: "确认操作", content: "同步设置？"))
_ = try await app.ui.showToast(ToastOptions(title: "已同步", icon: "none"))
```

- **桥接**：`AppUIHost.ts` 里的 `AppUIHost` 是一组回调（`@ExportModel`），宿主用 Kotlin/Swift 实现，通过生成的 `@ExportModule` / `getHost()` 获取；业务无需手动安装。
- **Modal**：所有 `showModal` 共用一个串行队列，前一个完全关闭后才显示下一个，关闭动画结束后才返回结果。弹出时归属当时最上层的页面，这个页面被覆盖或移除时按取消结束。返回键、点遮罩都算取消。Android 是 Compose 自己的窗口，iOS 是加在窗口最上层的 view。输入框的键盘：Android 用弹窗窗口的 IME inset，iOS 用 `KeyboardObserver`，只在键盘真的挡住卡片时把卡片往上推。
- **Toast / Loading**：各占一个独立窗口，在 Modal 之上，Toast 又在 Loading 之上。`mask: true` 时吞掉触摸（Android 也吞掉返回键）。Loading 一直显示到 `hideLoading`。
- 外观照 ExpoNativeRoutes 原生 Dialog/Toast 的 token：卡片宽度不超过 360、圆角 20、内边距 24，标题 18/26，按钮高 48、圆角 14。
- **Android 注意**：交给 JS 长期持有的原生函数，属于传递它时所在的 `createScopedJSRuntime` 作用域；这个作用域对象被回收后，JS 再调用会报 `Cannot unwrap native function … reference was disposed`。所以 `ValdiHost` 仍保留应用启动的 `hosts` 作用域；延迟获取认证、导航和注册长期事件时使用官方 `withGlobalNativeRefs`，不依赖首次调用的页面寿命。

## 选择与展示 API

`api.showActionSheet`、`showPicker`、`showDatePicker`、`showBottomSheet`、`previewImage` 与小程序同名同参（不含回调）：类型检查和默认值在 `api.ts`，取值约束在原生 AppUI（见上一节）。它们和 `showModal` 共用一个串行队列，归属弹出时最上层的页面，关闭动画结束后才返回结果。

- 操作菜单：1–6 个非空选项，返回 `tapIndex`，取消走 `fail`（`showActionSheet:fail cancel`）。
- 选择器：返回 `confirm/cancel/value/index`；`options` 可以是字符串或 `{value, label}`，值必须唯一，初始值必须在选项里。取消（包括页面被盖住或关掉）时 `value` 为空、`index` 为 -1，日期选择器同样返回空 `value`。
- 日期选择器：`mode` 为 `year`、`year-month`、`date`、`time`、`datetime`，年份范围默认当前年上下 5 年，按日历校验值。
- 文本底部弹层：返回 `confirm/cancel`。
- 图片预览：`current` 必须是 `urls` 之一，关闭后完成。
- 日期：解析、校验和默认年份用 dayjs 1.11.23（`customParseFormat`、`utc` 插件），和 ExpoNativeRoutes 一样，不依赖 `Intl`。dayjs 同样是 npm 包，`import dayjs from 'dayjs'`。
- 选图 `chooseImage`：`count` 1–9（默认 9），`sourceType` 是不重复的 `album` / `camera`，两种都给时先弹“从相册选择 / 拍照”，拍照只返回一张；返回 `tempFilePaths` 和 `tempFiles{path,size}`。
- 选文件 `chooseFile`：`count` 1–20（默认 1），`mimeTypes` 默认 `['*/*']`；`tempFiles` 另带 `name` 和 `type`。
- 选出来的文件复制在应用自己的缓存目录里，`clearAttachmentCache` 清掉；不再用这些路径时再调。
- 扫码 `scanCode`：只支持相机（`onlyFromCamera` 省略或为 true），返回 `result` 和 `scanType`（`QR_CODE`、`EAN_13`、`EAN_8`、`CODE_128`、`CODE_39`、`UPC_A`），关闭扫码页是 `scanCode:fail cancel`。Android 是 CameraX + ML Kit，iOS 是 AVFoundation。

原生实现是 ExpoNativeRoutes 原生 UI 库的对应组件（含扫码和附件选择）。Android 用 Compose，放在 `io.nativeroutes.ui`，图片用 coil3 加载；iOS 用 UIKit，放在 `ValdiRoutes/NativeRoutesUI/`，图片用 SDWebImage 加载。每个弹层都盖在整个窗口上，Toast 和 Loading 始终在最上层。iOS 26 起，iPhone 上的系统操作菜单是浮动菜单，没有取消按钮，点外面就是取消。原生页面也可以直接调用 `NativeApp.ui` / `app.ui` 上的同名方法。示例页是首页“更多示例”里的“选择器、日期、图片预览”（`PresentationPage.tsx`）。

## OpenCV 与 ncnn

`vision/` 是 ExpoNativeRoutes `@native-routes/vision` 的 C++ 核心（`VisionCore`）：原生生成一张 256 × 192 的彩色图，用 OpenCV 转灰度、做 Canny 边缘检测、缩放到 64 × 64，再用 ncnn 跑一个没有训练权重的真实网络（全局平均池化加 Softmax），输出 RGB 三通道响应。TS 通过 `vision/VisionHost.ts` 的 `runDemo()` 调用，两张图以缓存目录里的 PNG 文件返回。示例页是首页“更多示例”里的“OpenCV 与 ncnn”（`VisionPage.tsx`）。

OpenCV Mobile 4.13.0 和 ncnn 20260526 按 `vision/vendor-lock.json`（固定 URL 和 SHA256）从源码编译。Android 用 NDK r27.1 和 CMake 生成独立的 `libopencv_core.so`、`libopencv_imgproc.so`、`libopencv_highgui.so` 和 `libncnn.so`，由 `libvaldi_routes_vision.so` JNI 桥接库动态链接；共用 `c++_shared`，开启 RTTI 和异常。`JNI_OnLoad` 仍选择 `OPENCV_PARALLEL_BACKEND=builtin`，避免查找未提供的并行插件。Android 产物位于 `vision/vendor/install/android-arm64/shared/`，具体构建、依赖验证及无摄像头后端的边界见 [Android Vision 动态库](docs/vision-android-shared.md)。

iOS 保持静态链接：`VisionCore.cpp` 和 Objective-C++ 包装编进 app target，依赖静态 `VisionDependencies.xcframework`（模拟器只有 arm64），不拆动态库。产物在 git 忽略的 `vision/vendor/install/`；用 `node vision/scripts/prepare-native.cjs --target android-arm64` 或 `--target ios` 生成，需要 CMake、Ninja 和对应 SDK。

## 蓝牙 API

小程序的蓝牙接口，合并在 `api` 里：`api.openBluetoothAdapter`、`startBluetoothDevicesDiscovery`、`createBLEConnection`、`getBLEDeviceServices`、`notifyBLECharacteristicValueChange`、`writeBLECharacteristicValue`、`createBLEPeripheralServer` 等，以及 `on…/off…` 事件。只返回 Promise；结果带 `errMsg`，失败带 `errMsg` 和 `errCode`。示例页是首页的“打开蓝牙 api 页”（`BlePage.tsx`）。

```ts
await api.openBluetoothAdapter();
api.onBluetoothDeviceFound(({ devices }) => console.log(devices));
await api.startBluetoothDevicesDiscovery({ allowDuplicatesKey: false });
await api.createBLEConnection({ deviceId });
```

- **代码来源**：TS 层 `src/ble/wechat.ts`、`peripheral.ts`、`errors.ts` 最初来自 ExpoNativeRoutes，现在不再和它同步：直接使用 `BleHost` 生成的类型，`native.ts` 只做 Promise 调用和 `ArrayBuffer` 转换，回调和 `release()` 都去掉了。原生核心来自同一处：Android `io.nativeroutes.ble`（Blessed 3.0.12，JitPack），iOS `ValdiRoutes/Ble/`（CoreBluetooth）。原生页面直接用同一个 `BleCore` 单例。
- **桥接**：`ble/BleHost.ts` 是 `@ExportProxy`，宿主分别用 `BleHostImpl.kt` / `BleHostImpl.swift` 实现，只做映射，规则都在 `wechat.ts`。异步方法返回原生 Promise，事件统一发给安装时交给原生的一个 `BleHostEvents`，由 `events.ts` 分发给监听（见“原生调用与页面”）。`ArrayBuffer` 以 `Uint8Array` 过桥。
- **权限**：`ble/permission.ts` 经 `permissions/index.ts` 调用原生的 `PermissionHost`，Wi-Fi 和 NFC 共用同一个弹窗队列。Android 在 `openBluetoothAdapter` 时弹系统授权（12+ 扫描/连接，从机为广播/连接；更早版本是定位），清单里已声明。iOS 首次打开适配器时由系统弹窗，`Info.plist` 已有 `NSBluetoothAlwaysUsageDescription`。
- **生命周期**：适配器、连接、扫描和从机 server 属于应用，页面返回不会关掉它们，业务需要时显式 `stop…` / `close…`。监听也不会自动移除：页面要在离开时停止接收，就自己 `off`（`BlePage.onDestroy` 是这样做的）；不 `off` 的监听在页面之外继续收到事件。

## Wi-Fi 与 NFC API

小程序的 Wi-Fi 和 NFC 接口，也合并在 `api` 里：`api.startWifi`、`stopWifi`、`connectWifi`、`getWifiList`、`getConnectedWifi`、`setWifiList`、`on/offWifiConnected`、`on/offWifiConnectedWithPartialInfo`、`on/offGetWifiList`、`getWifiPermissionState`、`requestWifiPermission`、`openWifiPermissionSettings`，以及 `api.getNFCAdapter()`（`startDiscovery`、`onDiscovered`、`getNfcA()`、`getIsoDep()`、`getNdef()` 等）。TS 层 `wechat.ts`、`errors.ts`、`permission.ts`、`adapter.ts` 直接使用 `WifiHost` / `NfcHost`（`@ExportProxy`）生成的类型，桥接和蓝牙一样：原生 Promise 加一个事件出口，只返回 Promise。NFC 只有 Android，iOS 上返回 `NOT_SUPPORTED`。示例页是首页“更多示例”里的“Wi-Fi 与 NFC”（`DevicePage.tsx`）。

和蓝牙一样，`api` 跟应用同寿命：首次实际使用时自动获取原生 host，长期事件登记在全局原生引用作用域，页面关闭不会释放应用会话；页面只停掉自己开始的扫描、移除自己的监听。

## 原生调用与页面

原生服务统一通过生成的 `@ExportModule` / `getHost()` 获取，业务无需调用安装函数。认证、导航和 Vision 的工厂注册、延迟创建及回调所有权见 [原生模块入口](docs/native-module-access.md)。

Valdi 把页面传给原生的 JS 函数登记在当时的页面名下（根 Context），页面销毁时一起清掉；原生之后再调用，只会在日志里报 `Cannot unwrap JS value reference … as it was disposed`（Valdi 文档 `advanced-native-references.md`）。页面在退出动画结束时销毁。蓝牙、Wi-Fi、NFC 和权限的状态是整个应用共用的：比如连接中途返回，结果回调丢了，`wechat.ts` 的设备队列就会一直等着，之后所有页面都用不了这个设备。

- **异步调用返回原生 Promise。** `BleHost`、`WifiHost`、`NfcHost`、`PermissionHost` 的方法都返回 `Promise<T>`，由 `nativeCall.ts` 调用，页面不再给原生任何函数。原生 Promise 不登记在页面名下，页面关了照样完成。
- **事件只有一个出口。** 蓝牙、Wi-Fi、NFC 在首次使用时于 `withGlobalNativeRefs` 内获取 host 并执行一次 `setEvents`，原生持有这一份出口；页面监听登记在各模块的 JS 分发器中，单独取消。
- **错误信息**：Android 会把失败包成 `类名: '…'`，`nativeCall` 去掉这层，`E_BLE_…`、`E_WIFI_…` 等错误码照常解析。
- **iOS 的符号**：当前 `ValdiRuntime.xcframework` 导出 valdi_core 的 Objective-C API。宿主图片加载器位于 `Images/AppImages.swift`，直接使用 `SCValdiImage`；旧宿主 `ValdiImageBridge` / `ValdiVoidPromise` 已删除。AppUI 的原生 Promise 由模块自身的 `AppUIPromise` / `VRAppUIVoidPromise` 管理。
- **模块不被卸载**：内存警告时 Valdi 会卸载既不被活着的页面、也不被原生 import 的 JS 模块。`api` 里放着这些状态，所以由原生持有的 `startApp` 模块引用；创建 JS 门面本身不触发原生 host 初始化。
- toast、modal、选择器这类 UI 调用通过原生 Promise 返回；展示归属仍由原生页面生命周期管理。

## 路由动画

照 ExpoNativeRoutes 的 `NativeRouteAnimations`：全局 `NAVIGATION`、路由的 `options`、每次调用的 `options` 三层合并，后面的覆盖前面的，每层可以有 `android` / `ios` 分支。`routes.ts` 的 `resolveNavigation` 在 TS 里校验并合并成本平台的 `{animation, durationMs, presentation}`，写错直接抛错，不会推页面。

```ts
this.router.push('detail', { id: 1, from: 'home' }, {
  android: { animation: 'fade', durationMs: 200 },
  ios: { presentation: 'fullScreen' },
});
```

- 全局默认和 ExpoNativeRoutes 一样：`{ animation: 'default', android: { animation: 'slideRight', durationMs: 300 } }`。`durationMs` 是 0–2000 的整数，0 等于 `none`。
- **Android**：预设 `default`（交给 Nav3）、`none`、`slideRight`、`slideUp`、`fade`、`zoom`（`NativeRouteAnimations.kt`），每个页面把自己的进入、返回、预测性返回动画放进 Nav3 的 entry metadata。可以用 `NativeRouteAnimations.register` 加预设，名字也要加进 `routes.ts` 的 `ANDROID_ANIMATIONS`。原生页面打开的页面用全局默认。
- **iOS**：只有 `default`（`UINavigationController` 自带的 push、pop 和边缘侧滑）和 `none`；写别的名字会报错。`ios.presentation: 'fullScreen'` 全屏盖住整个导航栈，里面有自己的栈，再 push 的页面留在里面，关掉时一起取消；它不能侧滑关闭。一次只有一层全屏。
- 示例页是首页“更多示例”里的“路由动画”（`RouteAnimationPage.tsx`）。

## SQLite 与 Drizzle

表结构在 `valdi/modules/app_pages/src/database/schema.ts`，查询使用 Drizzle，官方 ClientSQL 原生执行层通过 Valdi
对象接口执行参数化 SQL。结果按列顺序传递，SQL 参数和二进制数据不经过 JSON 字符串。
ClientSQL 负责连接、调度和事务协调；业务表和迁移记录只由 Drizzle 管理，旧 `sqlgen/` 过渡代码已删除。
使用全新的 `valdiroutes_app_drizzle.sqlite`，不导入旧数据库。

修改 schema 后运行 `pnpm db:generate`，审查并提交 SQL、Kit journal/snapshot 和生成的迁移常量。
`pnpm db:check` 检查打包输入；模块构建、两端宿主构建和测试都会执行它。运行时在同一事务中执行迁移与
迁移记录写入，拒绝变化的历史和未知的新版本。重新发布旧业务内容也不会撤销数据库迁移，具体限制见
[数据库接口和迁移](docs/drizzle-database.md)。

连接由 `startApp()` 调用 `initializeAppDb()` 在应用作用域创建。页面持有可取消的查询订阅，数据库操作等待
迁移完成；原生回调注册使用明确归属的全局引用作用域，避免返回页面时回调已被销毁。
新增的 `queryRows` / `run` 原生接口需要匹配的 AAR / XCFramework，旧运行时会明确拒绝接入。

## 页面生命周期和状态栏

**生命周期**：页面继承 `Page`（`app_foundation/src/page/PageComponent.ts`），写法 `class XxxPage extends Page<PageViewModel, State, PageContext>`。类型参数跟 `StatefulComponent` 一样，因为 `@Component` 注解点名的类型要在页面文件里当类型用到，Valdi 编译器才找得到。

| 小程序 | 这里 |
|---|---|
| `onLoad` | `onCreate()`（参数用 `readParams`） |
| `onShow` | `onShow(reason)`：`'navigation'`（打开或上面的页面关了）、`'tab'`、`'foreground'` |
| `onHide` | `onHide(reason)`：`'covered'`、`'tab'`、`'background'` |
| `onUnload` | `onDestroy()`；页面关闭时不先调 `onHide`，和小程序一样 |

- **`whileVisible(effect)`**：页面可见时运行，隐藏或销毁时调用它返回的清理函数，适合扫描、轮询这类只在可见时要做的事。
- **可见**的意思是：栈顶（或全屏 cover 的栈顶）、tab 壳里选中的那页，并且 app 在前台。
- **怎么算**：宿主根据导航状态算出来，通过 PageViewModel 的 `visible` / `visibilityReason` 传给页面，不看 UIKit 的 appear/disappear，所以 `showModal`、`previewImage` 这些弹出层不会让页面 hide。
- **前后台**：iOS 只看 UIScene 的进入后台和回到前台，所以控制中心、权限弹框不算后台；安卓看 `MainActivity` 的 start/stop，所以打开系统相册、文件选择、相机会触发 `onHide('background')` / `onShow('foreground')`，和小程序一样。

**状态栏**：整个 app 一个，和 ExpoNativeRoutes 的 `StatusBar.setBarStyle` 一样。`Page` 有个属性 `statusBarStyle`（`'auto'` 跟主题走，默认；`'light'` 白色图标，给深色页面；`'dark'`），页面每次 onShow 时把它设上去，所以返回上一页会恢复上一页的样式；页面显示中要改就调 `this.setStatusBarStyle(...)`。原生页每次出现时恢复 `'auto'`，要别的样式调 `NativePage.setStatusBarStyle`。iOS 由根控制器（和全屏 cover）的 `preferredStatusBarStyle` 显示，安卓用 `WindowInsetsControllerCompat` 同时设置状态栏和导航栏的图标。

## 存储

- **一般数据：** `api.getStorageSync(key)`、`setStorageSync(key, data)`、`removeStorageSync(key)`、`clearStorageSync()`（`src/storage.ts`），接口照小程序，但只有同步版本。
  - 值按 JSON 存：Date 读回来是字符串，`undefined` 成员会丢掉；没有的 key 读出 `undefined`（小程序是 `''`）。
  - 入参用 valibot 在入口校验，错了抛 `ApiError`，比如 `setStorageSync:fail data must be JSON, …`。
  - 底层是一个 MMKV 实例 `app`，和 ExpoNativeRoutes 一样。目录：iOS `Documents/mmkv`，安卓 `files/mmkv`。iOS 用 SPM，钉在 v2.4.3 的 commit 上（它的包用了 `unsafeFlags`，SPM 只允许按 revision 引用这种包）；安卓用 `com.tencent:mmkv:2.4.3`。
  - MMKV 的文件没加密，拿到 app 文件的人能读，所以不放机密。
- **应用状态：** 示例使用 `app_pages/src/state/session.ts` 的 `zustand/vanilla` store，认证跳转在 `services/auth.ts`。示例会话只在当前 JS runtime 内有效，重启后重新登录。用户模型、认证和持久化策略由应用自己实现，基础模块不提供 TokenStore。普通 JS 状态不需要生成原生代理。

## Valdi fork 与工具补丁

框架维护在 [cloud2303org/Valdi](https://github.com/cloud2303org/Valdi/tree/valdiroutes) 的 `valdiroutes` 分支，当前基于上游 `beta-0.2.1`。
应用通过 `valdi/MODULE.bazel` 的 `VALDI_COMMIT` 固定完整提交，registry 使用同一个 fork 提交。
原来的 11 个框架补丁已转换为 fork 中的独立提交，Hermes 构建输入也迁入 fork；应用不再持有这套补丁。
后续在 fork 中合并上游，再更新应用 pin，详见 [同步 Valdi 上游](docs/upgrading-valdi.md)。
Valdi 的 Kotlin 代码用 rules_kotlin 2.3.10 编译；宿主 Gradle 是 Kotlin 2.4.21 + AGP 内置 Kotlin。

**Bazel 8 和 Valdi 命令行工具的补丁。** Valdi 0.2.1 本身用 Bazel 8.2.1（`valdi/.bazelversion`），但命令行工具 1.2.1 的 `bootstrap` 模板还停在 Valdi 0.1.x：Bazel 7.2.1、protobuf 27.0、rules_java 7.4.0、rules_kotlin 1.9.0、rules_jvm_external 6.2，`projectsync` 也只认 Bazel 7 的外部仓库名（`valdi~`），不认 Bazel 8 的（`valdi+`）。`valdi/patches/@snap__valdi@1.2.1.patch`（`pnpm patch`，登记在 `pnpm-workspace.yaml`）把模板改成和 Valdi 0.2.1 一致，并让 `projectsync` 认 `+`。这个项目自己的 `.bazelversion`、`MODULE.bazel`、`.bazelrc` 也按同样的版本改过（另加 `platforms` 依赖和两个 Bazel 8 参数）。升级命令行工具时先看上游是否已修复，修复了就删掉补丁。Bazel 的磁盘缓存在 `~/.cache/bazel-disk-cache`，空闲时自动清理到 30 GB 以内（`.bazelrc` 的 `--experimental_disk_cache_gc_max_size`）。

框架源码保留未使用的上游模块；应用复用 ClientSQL 原生执行层，不使用旧 SQL API 生成器。

### Hermes V1

Hermes 固定为 `260318099.0.4`，构建定义和生成头文件在 fork 的 `third-party/hermes_v1/`。VM、编译器、调试器适配作为源码提交维护。

- Debug 使用完整运行时，模块保留 JavaScript 源码。
- Android release 通过 `.bazelrc` 的 `js_bytecode_format=hermes` 预编译模块；编译工具和设备运行时使用同一版本的 Hermes。fork 中的 Hermes 构建调整让 production flavor 也包含精简运行时。精简运行时不编译调试器，消息转发代码同样受 `HERMES_API` 条件保护。
- 首页引擎版本来自 `HermesInternal.getRuntimeProperties()`，可检查安装包实际使用的运行时。
- 模块预编译为 Hermes 字节码时，fork 中的 Hermes 构建调整同时去掉 QuickJS（debug 和 release 都是），arm64 so 小约 0.6 MiB。
- fork 把 TypeScript 输出从 ES2016 提到 ES2020（`lib` 到 ES2021，Hermes 支持 `replaceAll`、`Promise.allSettled`），`async/await`、对象展开、`?.`、`??` 都原样输出。fork 把 Valdi 的压缩器从 terser 4.6.10 换成 5.44.1（4.x 解析不了 `?.` 和 `??`），按 ES2020 压缩。
- fork 给 Valdi 链接 `.so` 加 `-Wl,-z,max-page-size=16384`，三个 ABI 都按 16 KB 对齐（lld 在 arm64/armv7 默认 4 KB）。不对齐的包在 16 KB 页设备上会进兼容模式并弹出 "isn't 16 KB compatible" 提示。检查：`llvm-readelf -lW libvaldi_runtime.so` 的 LOAD 对齐为 `0x4000`，`zipalign -c -P 16 -v 4 app-release.apk` 通过。AVD `ValdiRoutes_16K`（`google_apis_ps16k`）可以实测。
- 64 位 Android 的 `libhermesvm-config.h` 用压缩指针、连续堆和装箱 double，与 Hermes 自己的 Android 构建（`HEAP_HV_PREFER32`）一致。
- iOS 也用 Hermes（`.bazelrc` 的引擎设置是全局的）。模块是 Hermes 字节码时 fork 不编 `valdi_jscore`，也不再链接系统 JavaScriptCore（`otool -L` 里没有）。Valdi 的编译器只给 Android release 预编译字节码，iOS release 拿到的是 JS 源码，精简 Hermes 跑不了，启动时报 `Hermes not compiled with compilation enabled`。fork 让字节码格式是 Hermes 时 iOS release 也用同一份字节码，debug 仍是源码。这些框架调整现在只影响 Valdi 自带的模块；我们的模块由 `tools/valdi-rolldown` 调用与运行时同版本的官方 `hermes-compiler` 编成字节码，两个平台的 release 都是。
- iOS 导出头文件修复：导出的 xcframework 里 `SCValdiDrawingModuleFactory.h` 引用了 drawing 模块的 `SCCDrawingTypes.h`，但没打包进去，宿主一 `import ValdiRuntime` 就编译失败。fork 的导出规则把 drawing 模块的 ObjC 头加进导出列表。
- fork 的 `third-party/hermes_v1/no_fbjni.patch` 允许未接入 fbjni 的宿主构建，但不会把 JSI finalizer 线程附加到 JVM。以后若引入需要访问 JNI 的 JSI finalizer，必须重新处理该线程的 JVM 附加。

iOS 宿主和 Android 结构一样：`ValdiHost.swift` 读路由表、按组件创建根 view，`Navigator.swift` 管一个 `UINavigationController`（`StackController`）和最多一层全屏 cover。Valdi 页面自己画标题栏，所以导航栏只在原生页显示，隐藏导航栏后关掉的侧滑返回另外打开。用户侧滑或点原生返回按钮离开的页面按取消处理。

iOS 的页面键盘和 AppUI Sheet 各自独立：

- **键盘**：`KeyboardObserver.swift` 移植自 react-native-keyboard-controller 1.22.6（MIT）。每帧读键盘在屏幕上的真实位置（iOS 26+ 用 `keyboardLayoutGuide` 上的零高度 view，更早的系统找系统键盘 view），再按系统键盘动画的曲线往前预测两帧；交互式收起用 KVO 跟。它只报高度。SwiftUI 的键盘避让全部关掉（`.ignoresSafeArea(.keyboard)`），只有 `PageContainerView` 处理键盘：根 view 底部让出键盘高度，bottom inset 减去被键盘盖住的部分。跟踪 view 要在键盘出现前就挂进窗口，键盘弹出时才挂上去的 view 会直接排到终点，跟不上动画。
- **AppUI Sheet**：`app_ui/ios/ui/AppUISheetHostView.swift` 保留弹簧动画、遮罩、拖动和滚动手势协调，由 AppUI 组件按自己的内容和可用空间测量，不创建路由页面。App 目录中的旧路由 Sheet 容器已删除。

Android release 开了 R8（`isMinifyEnabled`、`isShrinkResources`），APK 从约 66 MB 降到约 32 MB（dex 从 39 MB 到 5 MB）。Valdi 运行时和生成的绑定类（`generated/valdi/`，现在是 app 自己的源码，按 Valdi 的注解保留）由 aar 自带的 `proguard.txt` 保留，`app/proguard-rules.pro` 只补它没覆盖的：Valdi 的 `JNI_OnLoad` 按名字注册 native 方法（包括 Java 不调用的），删掉一个加载 so 就崩；ML Kit 用反射创建 `ComponentRegistrar`，R8 full mode 会删掉它们的无参构造。我们自己的 native 代码按名字找的类用 `@Keep`（`VisionNative.Result`）。只写不读的字段也会被删：`ValdiHost.hostScope` 只是为了让常驻 JS 作用域不被回收，所以加了 `@Keep`，否则 release 里 host 全部失效（`Cannot unwrap native function … reference was disposed`）。以后新增"只为持有"的字段、或者被 JNI / 反射按名字访问的类，都要同样处理。iOS 不需要：`ValdiRuntime.xcframework` 是动态库，按名字查类在运行时到库里找，App 的 release 构建不会裁掉它。

导出 AAR 后需要重新构建宿主 APK；Gradle 的 debug/release 名称不会改变已经导出的 AAR 配置。导出命令会覆盖 `android/app/libs/valdi_runtime.aar`，失败时该文件也可能被移除，切换配置前应保留需要对比的产物。

## 线上热更新（OTA）

OTA 使用静态文件服务，按平台和 App 版本手动绑定，不计算原生源码兼容指纹。
只更新 `app_pages` 的 `.valdimodule`、可选 source map 和所属资源；其他应用/Valdi 模块连同
JS 封装均随原生安装包发布。Release 归档内是 Hermes 字节码，原生实现（包括 `app_pages` 的 C++）
仍需 APK/IPA 更新。必须先安装包含新客户端、版本配置和原生 codec 集成的原生包。

`appVersion` 来自 Android `versionName` / iOS `CFBundleShortVersionString`；
根 `package.json` 的 `valdi.ota.bundleVersion` 标识原生包内嵌业务版本（初始 `pages-001`），
生成的 `valdi_ota.json` 记录它和 `modules: ["app_pages"]`。`latest.json` 请求带
`platform`、`appVersion`、`bundleVersion` 查询参数；业务版本取本进程运行的 active 快照或内嵌版本，
绝不取 pending，也不随运行中持久化 current 的变化而改变。

ECDSA P-256 签名的 schemaVersion=1 完整清单始终保留 full 文件；可选 split delta 按归档条目选择
copy、full（raw / default-ZSTD）或仅限 HBC 的 HDIFFSF20/zlib patch。客户端按运行版本选择 base，
下载分片、按目标顺序合并并用 default ZSTD 压缩，只校验最终 `.valdimodule` 的 SHA256 和大小，
必须与签名 full 描述完全一致；不再逐层校验 base、分片、条目和 packet 哈希。
缺失 codec/base、合并或最终校验失败都回退下载原始 full。
客户端文件读写分块进行；C 编码器会读取最多 64 MiB 的整个输入，不能把整条管线称为流式或以此推断总内存。

签名验证后在独立临时目录准备并逐文件校验，整套准备好才标记 pending，下次冷启动统一选择。
进程内不替换模块集合，也不原地修改 active。
下次启动验证 pending 文件后直接将其持久化为 current，不需要启动确认。
正常退出或崩溃不会使该版本作废，也没有失败版本黑名单；业务问题通过发布修复版本处理。
需要恢复旧业务内容时，以新版本号重新发布旧内容。数据库迁移不会随业务包切换撤销。

默认启动后静默检查。JS 通过 `app_ota/src` 的 `getInfo()` 和 `checkForUpdate()`
调用原生 `OtaHost` proxy；两者返回 Promise，状态由原生客户端持有。
手动检查等待同一次后台下载完成，返回当前运行版本和待生效版本，下次冷启动生效。
有待生效版本时，业务可提示“更新已准备好，关闭并重新打开 App 后生效”，不自动退出或重建 Runtime。
下次启动实际切换到不同版本时，`isNewVersion` 为 `true`，`previousBundleVersion` 给出旧版本号；
之后普通启动为 `false`，业务可以据此展示更新成功提示。从后台回到前台不算冷启动。
调用方式见 [OTA 接口说明](docs/ota.md#javascript-and-native-access)。

```sh
# 已有的签名密钥继续使用；只有首次没有密钥时运行 node scripts/ota.mjs keygen。
# 先准备匹配的 Release runtime；原生导出过期检查仍然有效。
(cd android && ./gradlew :app:assembleRelease -PvaldiOtaUrl=https://ota.example.com)
# 在仓库根目录手动指定接收更新的 App 版本和不可重复使用的更新版本。
node scripts/ota.mjs pack android 0.1 pages-002
# 可选：旧 package 目录推导 base 版本并校验平台/App 版本。
node scripts/ota.mjs pack android 0.1 pages-002 --base ota/dist/android/0.1/pages-001
# 或指定旧归档及其业务版本；两种 base 形式均需本地 hdiffz。
VALDI_HDIFFZ=/path/to/hdiffz node scripts/ota.mjs pack android 0.1 pages-002 \
  --base /path/to/old.valdimodule --base-version pages-001
```

iOS 通过 Release 构建设置 `VALDI_OTA_URL`，打包命令为 `node scripts/ota.mjs pack ios 1.0 pages-002`；
两端 `scripts/ota-pack-*.sh` 支持相同 base 参数。工具依次从 `VALDI_HDIFFZ`、
`ota/tools/hdiffz(.exe)`、`PATH` 查找；没有工具时显式 base 报错，不联网安装，full-only 无此依赖。
编译器以 `--module app_pages --hermes-base <旧归档>` 构建，通过 Hermes `-base-bytecode` 复用旧 HBC，
不使用 `deltaprep`。仅当完整 delta 元数据和 payload 总量小于目标归档时才附带 delta。

发布时上传完整版本目录，最后替换 `latest.json`；静态服务须保留 full、所有引用的 delta 路径，
以及仍需下载或用于后续打包的相关 base 版本。兼容性由发布者手动负责；不兼容的原生 API/Hermes
变更应提升原生 App 版本并发布新安装包。没有发布后台也可以使用。
Debug 和空更新地址均只使用安装包。签名、协议、目录、版本管理和测试方式见 [OTA 说明](docs/ota.md)。

## 构建（tools/valdi-rolldown）

我们的模块不再经过 Valdi 的编译器（Swift 写的，只能在 Bazel 里跑），由 `tools/valdi-rolldown` 用 Node 构建，产物和 Valdi 的格式一样，运行时照常加载：

自定义原生模块另有 [calculator 实验与模块规则](docs/custom-modules.md)：独立 `module-build/` workspace
运行时内置模块固定使用 Node 后端，旧 Swift Valdi 编译器源码和回退已从 fork 删除；接入范围和验证见 [Node runtime 编译器](docs/node-runtime-compiler.md)。
运行我们的 Node 编译和绑定生成，再用 Bazel 编译模块原生库，宿主继续使用 Gradle / Xcode，现有 runtime 不变。

- **编译**：TypeScript LanguageService 做类型检查（有错构建就失败），`.tsx` 用 Valdi 自己的 JSX 转换（`vendor/companion/`，MIT），再由 rolldown 输出 CommonJS：每个源文件是一个入口，输出一个 Valdi 模块文件，懒加载和内存警告时卸载都和原来一样；npm 代码按引用关系拆分（见“npm 依赖”）。
- **打包**：`.valdimodule`（zstd 压缩的 ValdiPacket）。debug 是 JS 加内联 source map；release 用官方预编译 `hermes-compiler` 编成 Hermes 字节码，由 Node 补齐 Valdi 模块包装和文件头，source map 单独放 `<module>.map.json`。
- **图片**：`res/` 生成 `res.ts` 和 `res.assetcatalog`；Android 输出 5 种密度的 webp 和 keep.xml，iOS 输出 `app_pages.bundle`（@2x/@3x）。
- **数据库**：Drizzle 管理 schema、类型化查询和 SQL 迁移；原生 SQLite 执行参数绑定和事务。迁移常量在构建时校验，手机端不运行 Drizzle Kit。
- **原生绑定**：`codegen.ts` 是 Valdi 编译器绑定生成的 TS 移植，从 `@ExportModel`、`@ExportProxy`、`@ExportFunction`、`@ExportModule`、`@ExportEnum` 生成 Kotlin、Objective-C 和 C++，结果提交进 git。`npx tsx codegen/goldens.ts` 拿 Valdi 源码里的编译器 golden（`tools/ci/compiler_goldens`）逐字节对比三种语言；app_pages 的输出也和 Valdi 的 Bazel 构建一致。构建只跑 `--check`，过期就失败并给出命令；改了导出给原生的接口后手动重新生成：

  ```sh
  cd tools/valdi-rolldown
  pnpm exec tsx codegen.ts --kotlin-out ../../android/app/generated/valdi \
    --objc-out ../../ios/Generated/valdi --objc-framework ValdiRuntime --cpp-modules-out ../../valdi/modules
  ```

- **接入**：Android 是 Gradle 的 `<variant>ValdiModules`（产物进 assets 和 res）和 `valdiCodegenCheck`（挂在 preBuild）；iOS 是 `project.yml` 的 “Valdi bindings check” 和 “Valdi modules” 两个构建脚本（产物进 app 的资源目录，Valdi 先在这里找模块）。改了 `project.yml` 要重新运行 `node scripts/ios-project.mjs`。
- **命令行**：`pnpm build [--release] [--minify] [--out <dir>] [--res <dir>] [--ios-res <dir>]`；`pnpm dev` 是热重载（`scripts/hotreload.sh`），监听 `src/`、`res/`、`sql/`，把改动推给 Android 模拟器和启动着的 iOS 模拟器（端口 13592，Valdi daemon 的协议），代替 `valdi hotreload`。真机只在 `ANDROID_SERIAL` 指定时才推，因为装着别的构建的 app 收到推送会出问题。
- **模块**：`valdi/modules/` 下每个有 `src/` 的目录都是一个模块，不用登记，各自打成 `<模块>.valdimodule`（自己的图片、npm 代码），绑定也按模块生成到同一组目录。模块之间按路径导入（`import { X } from 'other/src/X'`），运行时 Valdi 加载对方的模块。新建：`pnpm new-module <名字>`，交互选择官方 `ui_component`、`polyglot_bridge_module`、`polyglot_view_module`，或仓库的 `cpp_bridge_module` 模板，也可用 `--template` 指定。名字规范为 snake_case；原生模板自动接入库链接、工厂和 View Binder 注册；C++ 模板自动生成模块自己的实现与 Bazel 规则，启用后由公共流程生成绑定和 runtime 链接清单，无需手改宿主 BUILD，再运行 `pnpm android` / `pnpm ios`。详见 [自定义模块](docs/custom-modules.md)。没有 `@Export…` 的模块不生成 C++ 文件，所以不需要重新导出运行时。删掉一个模块后，删它在 `android/app/generated/valdi`、`ios/Generated/valdi` 里的绑定，再跑 `pnpm tsconfig`。
- **IDE**：各模块的 `tsconfig.json` 由 `pnpm tsconfig` 生成（`new-module` 会跑），代替 `valdi projectsync`：Valdi 的基础配置、运行时带的 Valdi 模块（只有这些能导入）、所有 app 模块，生成的资源声明（`res.ts`）在 `tools/valdi-rolldown/.gen/`。`valdi/modules/app_pages/BUILD.bazel` 已经用不到了。

导出脚本只在 Valdi fork 提交、工具链配置或 模块的 `cpp/`（C++，见下一节）变了时才需要跑：它提供运行时 aar / xcframework 和指纹的 Valdi 一半；导出内置模块时仍可能构建上游 toolbox，应用 Node 管线不再调用它。

## C++ 绑定

TS 声明一个 `@ExportModule` 的 `.d.ts`，C++ 实现它，JS 像普通模块一样 `import` 并直接同步调用（在 JS 线程上执行，返回值直接回到 JS）。宿主的 Kotlin / Swift 不参与。示例是 `src/cpp/Cpp.d.ts`（常量 `BUILD_INFO`、`sha256(text)`、`stats(values)` 返回一个模型），实现在 `valdi/modules/app_pages/cpp/src/Cpp.cpp`，页面是“OpenCV 与 ncnn”最下面的“C++ 绑定”。

- **生成**：`codegen.ts --cpp-modules-out ../../valdi/modules` 写出模块自己的 `cpp/generated/valdi_modules/<模块>/<模块>.{hpp,cpp}`；默认只生成有手写 C++ 的模块及其生成类型依赖，命名空间 `snap::valdi_modules::app_pages`，和 Valdi 编译器的输出一样。`Cpp.d.ts` 生成接口 `CppModule`（每个函数一个纯虚方法，常量是无参方法）和工厂 `CppModuleFactory`；同时也生成 Kotlin / Objective-C 的同名接口，没人实现，不影响。模块和模型要像其他注解一样写上 `ios` / `android` 名字，否则 Kotlin 默认落在 `com.snap.modules.app_pages`，和模块的包冲突，生成会失败（Valdi 的编译器也一样）。
- **实现**：继承 `CppModuleFactory`，重写 `onLoadModule()` 返回 `CppModule` 的实现，再用 `Valdi::RegisterModuleFactory::registerTyped<…>()` 静态注册。运行时创建时收集这些注册，JS 第一次读 `app_pages/src/cpp/Cpp` 时调用工厂。
- **编进运行时**：`//modules/app_pages/cpp:native`（手写实现，`alwayslink`），以及它显式依赖的 `:bindings` 和 `//modules/app_foundation/cpp:bindings`通过 `valdi_exported_library` 的 `native_deps`（fork 中的原生导出规则扩展）链接进 `libvaldi_runtime.so` 和 `ValdiRuntime.xcframework`。不在 CMake / Xcode 里单独编：`libvaldi_runtime.so` 静态链接 libc++、只导出 JNI 符号，单独编的 so 会带另一份 libc++，跨 so 传 `shared_ptr`、抛异常都不安全。代价是改了 C++ 要重新导出（增量编译）。
- **检查**：导出脚本先检查 C++ 绑定没过期；导出时 `valdi_ota.json` 记下 启用模块 C++ 目录及链接规则的哈希，Gradle 的 `valdiCodegenCheck` 和 Xcode 的 “Valdi bindings check” 比对它（`scripts/ota.mjs check-export`），改了 C++ 没重新导出就构建失败并给出命令。C++ 在安装包里，不能热更新；OTA 接收版本由发布者手动指定。
- **耗时的计算**：同步调用期间 JS 线程被占住。要在后台算，用回调参数，C++ 在自己的线程（`Valdi::DispatchQueue::create`）算完再调回调，Valdi 会把调用转回 JS 线程。

## npm 依赖

页面直接按包名导入 npm 包：`import dayjs from 'dayjs'`、`import * as v from 'valibot'`。

- **版本**写在 `valdi/package.json` 的 `dependencies`，`pnpm-lock.yaml` 锁版本和 integrity；`node_modules` 在 `valdi/` 下。pnpm 只把直接声明的包放在顶层，没声明的包导入不到。用新包就是 `pnpm add` 再 `import`，不用登记。
- **打包**：npm 代码打进使用它的各个模块里，按 rolldown 的代码分割走（类似 webpack 的 splitChunks）：只有一个文件用的包直接打进那个文件（例如 AppUI 滚轮的 dayjs），多个文件共用的提成公共 chunk（`npm/valibot.js`），按包名命名，每次构建名字不变。CommonJS 包的互操作在 chunk 里由 rolldown 处理，不经过 Valdi 的懒加载代理。
- **类型**直接用包自带的。

升级：改 `package.json` 的版本，`pnpm install`，然后重新构建。`@tanstack/query-core` 已经装了，还没有页面用它。

**Valdi 的懒加载代理。** Valdi 的 `require` 返回一个代理，第一次读属性时才执行那个文件。文件之间的引用都是读属性，所以照常懒加载。只为副作用的导入（`import './x'`）编出来是一句单独的 `require("./x")`，没人读属性就永远不执行，所以构建把它改成 `require("./x", true)`，立即加载（`pipeline.ts` 的 `eagerSideEffectRequires`）。互相 import 的文件（`nfc/NfcHost.ts` ↔ `nfc/native.ts`）会被 rolldown 合成一块 `chunks/src/nfc/NfcHost.js`，原来的文件只转发导出；转发的是加载时的值，所以循环依赖里不要用会重新赋值的 `export let`。

## 已知问题

- **Valdi 输入框在慢速滚动时会弹出长按菜单。** 手指按在输入框上、慢慢拖动超过约 400ms，滚动已经开始了，Valdi 仍然把触摸事件转给输入框，没有发取消；输入框和手指一起移动，Android 就判定为长按，弹出 "Paste"。页面中会出现，是 Valdi 的行为（`TouchDispatcherImpl` 只取消手势识别器，不取消 `ValdiEditText` 这种直接处理触摸的目标）。
