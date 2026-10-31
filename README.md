# Valdi Native Routes

页面全部用 Valdi（TSX）写，原生负责路由。Android 用 Compose Navigation 3 管页面栈，iOS 用 UIKit 的 UINavigationController。

```text
valdi/                  Valdi 工作区（Bazel），只用来编 Valdi 运行时
  BUILD.bazel           valdi_runtime：导出成 valdi_runtime.aar / ValdiRuntime.xcframework
  package.json          Valdi 命令行工具，以及页面用的 npm 包（dependencies）
  modules/app_pages/    所有页面
    src/Page.ts         页面和宿主之间的契约：PageViewModel、PageContext
    src/routes.ts       路由表、参数和结果类型、getRoutesJson()（给原生读）
tools/valdi-rolldown/   我们自己的 Valdi 模块构建（代替 Valdi 的编译器）：编译、打包、热重载、原生绑定生成
android/                普通 Gradle 工程，Compose + Nav3
  app/libs/             valdi_runtime.aar（导出产物，不进 git）
  app/generated/valdi/  app_pages 的 Kotlin 绑定（codegen.ts 生成，进 git）
ios/                    UIKit 工程（XcodeGen 的 project.yml）
  Frameworks/           ValdiRuntime.xcframework（导出产物，不进 git）
  Generated/valdi/      app_pages 的 Objective-C 绑定（codegen.ts 生成，进 git）
scripts/
  export-android.sh     重新导出 Valdi 运行时 aar
  export-ios.sh         重新导出 Valdi 运行时 xcframework
  hotreload.sh          热重载（tools/valdi-rolldown 的 pnpm dev）
```

## 运行

日常构建和测试从仓库根目录运行：

```sh
pnpm prebuild --platform android   # 准备 Valdi 源码/绑定/运行时/原生模块/Vision（未变化时走快速路径）
pnpm android                       # prebuild + 构建 + 安装 + 启动（唯一模拟器，或 --device 指定）
pnpm ios                           # 同上，iOS 模拟器（仅 macOS）
pnpm dev                           # 热重载到已运行的 Debug App（现有 hotreload.sh）
pnpm build:android                 # 只构建 Android Debug APK，不安装/启动
pnpm build:ios                     # 只构建 iOS Simulator Debug App（自动 XcodeGen）
pnpm build                         # TS 模块、图片和字体；输出 tools/valdi-rolldown/out/
pnpm test                          # 构建前置检查测试 + Kotlin / Objective-C / C++ golden 对比
pnpm test:e2e:android          # 已安装 Android App 的 UI 测试
pnpm test:e2e:ios              # 已安装 iOS App 的 UI 测试
```

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
pnpm prebuild --platform android           # 首次/Valdi 或 valdi/native 变化时导出运行时并准备其余产物
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

改 TS、图片不用再导出：Gradle 和 Xcode 构建时调用 `tools/valdi-rolldown` 编译页面（见“构建”）。开发时 `scripts/hotreload.sh` 把改动直接推到正在运行的 debug 包。

iOS：

```sh
scripts/export-ios.sh                # 开发用 debug 运行时；发版加 release，同样只在首次或运行时变化后执行
cd ios && xcodegen generate          # brew install xcodegen；生成 ValdiRoutes.xcodeproj
```

真机运行要在 `project.yml` 里填 `DEVELOPMENT_TEAM`。

**UI 测试**用 [argent](https://www.npmjs.com/package/@swmansion/argent)（`npm i -g @swmansion/argent`）：`.argent/e2e/*.yaml` 是测试流程，按页面上的文字找元素、点击、断言，同一份在 iOS 模拟器和 Android 模拟器上跑，不经过 AI。`scripts/e2e.sh [ios|android]` 依次在两个平台上跑全部流程，设备由 `IOS_DEVICE` / `ANDROID_DEVICE` 指定，只用这两台（Android 默认是远程模拟器 `100.78.189.64:5555`，先 `adb connect`）。跑之前它会打开 iOS 模拟器的 `ApplicationAccessibilityEnabled`（不开的话 argent 读不到 UILabel 的文字），在 Android 上预先授予 app 的运行时权限（否则系统授权框会挡住后面所有测试），并放一张测试照片（`.argent/fixtures/e2e-photo.jpg`）给相册选图用。`.argent/e2e/` 覆盖了原来的 38 个 XCUITest，只在 iOS 上跑的有 4 个：两个依赖模拟器没有摄像头、`fullScreen` 打开方式 Android 没有、Android 的 Toast 不在无障碍树里。测试密码在 `.argent/secrets.env`（不进 git）。iOS 页面开了 Valdi 的无障碍树（`ValdiHost.swift` 的 `enableAccessibility`），argent 和 VoiceOver 才读得到 Valdi 页面的内容。

## 设计

**路由表在 TS 里。** `routes.ts` 声明每个路由是 Valdi 页面还是原生页面，以及组件路径。原生启动时通过 `@ExportFunction` 生成的 `Routes.getRoutesJson()` 读取，不需要生成清单文件。

**参数和返回值都是 JSON。** `router.push` 把参数 `JSON.stringify` 成字符串交给原生，原生原样转交，页面用 `readParams` 解析；`finish` 的结果也一样。页面之间的跳转在运行时不校验参数，靠 `RouteParams` / `RouteResults` 的 TS 类型约束；`routes.ts` 里的 `RoutesAreJson` 要求它们只含 JSON 值，写了 `Date`、`Map`、函数这类过不了 `JSON.stringify` 的类型会编译失败。以后加外部链接（deep link）时，只给开放 `link` 的路由加 valibot schema，在解析链接的地方校验一次（格式和 ExpoNativeRoutes 一样：固定路径，参数放在 `?params=<JSON>`）。

**每个页面一个 Valdi 根 view，由宿主持有。** `PageEntry` 持有 `ValdiRootView`。Nav3 会释放被覆盖页面的 composition，所以根 view 不能放在 Compose 里；`AndroidView` 释放时只把它摘下来，页面真正出栈后才 `destroy()`。

**页面通过 context 调路由。** `PageContext` 里是 `push`、`pushForResult`、`finish`、`back` 四个回调，Kotlin 实现，TS 侧包成类型化的 `Router`。`push` 的第四个参数是导航选项（见“路由动画”），TS 合并好再交给原生。

**inset 由宿主算好放进 viewModel。** 开了 edge-to-edge，页面按 `viewModel.insets` 自己留边。Valdi 自带的 `Device.getDisplayTopInset()` 在 Android 上一直是 0，不用它。

**键盘只由宿主处理一次，页面不读键盘高度。** 宿主读一次 `WindowInsets.ime`，规则只有一条：给容器的内容底部加一段键盘高度的 padding。窗口开了 edge-to-edge，系统不会再缩窗口；Sheet 也不是 Dialog，所以没有第二个地方在避让键盘。

| 场景 | 宿主 | 页面 |
|---|---|---|
| 全屏页 | 内容底部加键盘 padding，页面变矮；导航栏被键盘盖住时 bottom inset 变成 0 | 在自己的范围里布局 |
| `sheet`（固定高度） | Sheet 高度不变，内容加键盘 padding，页面变矮 | `FocusScroller` 把输入框滚到可见区域 |
| `compactSheet`（按内容） | Sheet 高度 = 内容 + 键盘 padding，整个 Sheet 跟着键盘升高 | 不用做任何事 |

**Sheet 是 `SheetHostView`**，从 Software Mansion 的 react-native-bottom-sheet（MIT）移植的 Android 核心，去掉了 RN 绑定：跟手拖动、按速度和距离吸附、弹簧动画、遮罩、点遮罩和返回键关闭。内容里有 scroll 时，往下拖要等内容滚到顶才接手拖 Sheet。Sheet 本身完全不知道键盘，键盘按上面的规则在外面处理。Sheet 和下面的页面在同一个窗口，里面是独立的 Valdi 根 view。

## 弹窗与提示 API

小程序风格的接口：`api.showModal`、`showToast`、`hideToast`、`showLoading`、`hideLoading`（`src/api.ts`）。每个方法只返回 Promise，不接受 `success` / `fail` / `complete`（蓝牙、Wi-Fi、NFC 也一样）。成功结果带 `errMsg: 'showModal:ok'` 这类字段，失败抛 `ApiError`（`errMsg` 形如 `showModal:fail …`）。参数只在入口校验一次：`src/schemas.ts` 里的 valibot schema（和 ExpoNativeRoutes 同一套规则）检查类型和取值约束（选项个数、选择器的值必须在选项里、年份范围、日期用 dayjs 校验等），并补默认值（按钮文字“确定”“取消”、Toast 图标 `success`、时长 1500 ms 等）。之后不再检查：原生 AppUI 只负责展示，原生回传的结果也不校验，所以原生页面直接调 `NativeApp.ui` / `app.ui` 时要自己传合法参数。蓝牙、Wi-Fi、NFC 同样在入口用 valibot 校验（`ble/`、`wifi/`、`nfc/` 下的 `schemas.ts`），错误码不变。valibot 1.5.0 是 npm 包，`import * as v from 'valibot'`（见“npm 依赖”）。没人 catch 的错误（比如参数错了又没处理 `fail`）由 `startAppServices` 装的全局处理器接住：debug 包直接崩溃，release 包只记日志。

```ts
import { api } from './api';

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

- **桥接**：`AppUIHost.ts` 里的 `AppUIHost` 是一组回调（`@ExportModel`），宿主用 Kotlin/Swift 实现，启动时通过 `@ExportFunction installAppUI` 装进 JS，和读路由表一样。
- **Modal**：所有 `showModal` 共用一个串行队列，前一个完全关闭后才显示下一个，关闭动画结束后才返回结果。弹出时归属当时最上层的页面（Sheet 在上就是 Sheet），这个页面被覆盖或移除时按取消结束。返回键、点遮罩都算取消。Android 是 Compose 自己的窗口，iOS 是加在窗口最上层的 view，所以都盖得住 Sheet。输入框的键盘：Android 用弹窗窗口的 IME inset，iOS 用 `KeyboardObserver`，只在键盘真的挡住卡片时把卡片往上推。
- **Toast / Loading**：各占一个独立窗口，在 Modal 之上，Toast 又在 Loading 之上。`mask: true` 时吞掉触摸（Android 也吞掉返回键）。Loading 一直显示到 `hideLoading`。
- 外观照 ExpoNativeRoutes 原生 Dialog/Toast 的 token：卡片宽度不超过 360、圆角 20、内边距 24，标题 18/26，按钮高 48、圆角 14。
- **Android 注意**：交给 JS 长期持有的原生函数，属于传递它时所在的 `createScopedJSRuntime` 作用域；这个作用域对象被回收后，JS 再调用会报 `Cannot unwrap native function … reference was disposed`。所以 `ValdiHost` 开一个 `hosts` 作用域并一直持有，所有 host 都在里面安装。iOS 的 `runtime.jsRuntime()` 随 runtime 存活，没有这个问题。

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

原生实现是 ExpoNativeRoutes 原生 UI 库的对应组件（含扫码和附件选择）。Android 用 Compose，放在 `io.nativeroutes.ui`，图片用 coil3 加载；iOS 用 UIKit，放在 `ValdiRoutes/NativeRoutesUI/`，图片用 SDWebImage 加载。每个弹层都盖在整个窗口上，所以也盖得住 Sheet，Toast 和 Loading 始终在最上层。iOS 26 起，iPhone 上的系统操作菜单是浮动菜单，没有取消按钮，点外面就是取消。原生页面也可以直接调用 `NativeApp.ui` / `app.ui` 上的同名方法。示例页是首页“更多示例”里的“选择器、日期、图片预览”（`PresentationPage.tsx`）。

## OpenCV 与 ncnn

`vision/` 是 ExpoNativeRoutes `@native-routes/vision` 的 C++ 核心（`VisionCore`）：原生生成一张 256 × 192 的彩色图，用 OpenCV 转灰度、做 Canny 边缘检测、缩放到 64 × 64，再用 ncnn 跑一个没有训练权重的真实网络（全局平均池化加 Softmax），输出 RGB 三通道响应。TS 通过 `vision/VisionHost.ts` 的 `runDemo()` 调用，两张图以缓存目录里的 PNG 文件返回。示例页是首页“更多示例”里的“OpenCV 与 ncnn”（`VisionPage.tsx`）。

OpenCV Mobile 4.13.0 和 ncnn 20260526 按 `vision/vendor-lock.json`（固定 URL 和 SHA256）从源码编译，静态链接进宿主。Android 用 NDK r27.1 和 CMake 编出 `libvaldi_routes_vision.so`（`c++_shared`，和依赖库编译时一致），在 `JNI_OnLoad` 里设置 `OPENCV_PARALLEL_BACKEND=builtin`：否则 OpenCV 第一次运行会去 `base.apk!/lib/…` 找并行插件，而 opencv-mobile 关闭了异常，找不到就直接崩溃。iOS 把 `VisionCore.cpp` 和一个 Objective-C++ 包装编进 app target，静态链接 `VisionDependencies.xcframework`（模拟器只有 arm64）。产物在 git 忽略的 `vision/vendor/install/`，用 `node vision/scripts/prepare-native.cjs --target android-arm64` / `--target ios` 生成（需要 CMake、Ninja 和对应 SDK）。

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

和蓝牙一样，`api` 跟应用同寿命：宿主启动时在常驻的 JS 作用域里装好，页面关闭不会释放；页面只停掉自己开始的扫描、移除自己的监听。

## 原生调用与页面

Valdi 把页面传给原生的 JS 函数登记在当时的页面名下（根 Context），页面销毁时一起清掉；原生之后再调用，只会在日志里报 `Cannot unwrap JS value reference … as it was disposed`（Valdi 文档 `advanced-native-references.md`）。页面在退出动画结束时销毁。蓝牙、Wi-Fi、NFC 和权限的状态是整个应用共用的：比如连接中途返回，结果回调丢了，`wechat.ts` 的设备队列就会一直等着，之后所有页面都用不了这个设备。

- **异步调用返回原生 Promise。** `BleHost`、`WifiHost`、`NfcHost`、`PermissionHost` 的方法都返回 `Promise<T>`，由 `nativeCall.ts` 调用，页面不再给原生任何函数。原生 Promise 不登记在页面名下，页面关了照样完成。
- **事件只有一个出口。** 启动时在常驻作用域里调用 `install…Host` 时 `setEvents`，原生只持有这一份；页面的监听登记在 JS 里（`ble/events.ts`、`wifi/native.ts`、`nfc/native.ts`），不过桥。
- **错误信息**：Android 会把失败包成 `类名: '…'`，`nativeCall` 去掉这层，`E_BLE_…`、`E_WIFI_…` 等错误码照常解析。
- **iOS 的符号**：以前的 `ValdiPages.xcframework` 不导出 `SCValdiPromise`、`SCValdiUndefinedValue` 这些类符号，Swift 一引用就链接失败，所以带值的 Promise 用 `SCValdiResolvablePromise` 创建，`Promise<void>` 由 Objective-C 的 `ValdiVoidPromise`（`AppUI/ValdiImageBridge.m`）创建。现在的 `ValdiRuntime.xcframework` 导出 valdi_core 的整套 Objective-C API（`valdi/.bazelrc` 的 `-fvisibility=default`），这些绕法可以简化，但还没改。
- **模块不被卸载**：内存警告时 Valdi 会卸载既不被活着的页面、也不被原生 import 的 JS 模块。`api` 里放着这些状态，所以由 `startAppServices`（`db.ts`，原生 import）引用，并在启动时创建。
- toast、modal、选择器这类 UI 调用和原生 AppUI 之间仍用 `done` 回调：结果只关系到发起的页面，页面关了丢掉也没关系。

## 路由动画

照 ExpoNativeRoutes 的 `NativeRouteAnimations`：全局 `NAVIGATION`、路由的 `options`、每次调用的 `options` 三层合并，后面的覆盖前面的，每层可以有 `android` / `ios` 分支。`routes.ts` 的 `resolveNavigation` 在 TS 里校验并合并成本平台的 `{animation, durationMs, presentation}`，写错直接抛错，不会推页面。

```ts
this.router.push('detail', { id: 1, from: 'home' }, 'push', {
  android: { animation: 'fade', durationMs: 200 },
  ios: { presentation: 'fullScreen' },
});
```

- 全局默认和 ExpoNativeRoutes 一样：`{ animation: 'default', android: { animation: 'slideRight', durationMs: 300 } }`。`durationMs` 是 0–2000 的整数，0 等于 `none`。
- **Android**：预设 `default`（交给 Nav3）、`none`、`slideRight`、`slideUp`、`fade`、`zoom`（`NativeRouteAnimations.kt`），每个页面把自己的进入、返回、预测性返回动画放进 Nav3 的 entry metadata。可以用 `NativeRouteAnimations.register` 加预设，名字也要加进 `routes.ts` 的 `ANDROID_ANIMATIONS`。原生页面打开的页面用全局默认。
- **iOS**：只有 `default`（`UINavigationController` 自带的 push、pop 和边缘侧滑）和 `none`；写别的名字会报错。`ios.presentation: 'fullScreen'` 全屏盖住整个导航栈，里面有自己的栈，再 push 的页面留在里面，关掉时一起取消；它不能侧滑关闭。一次只有一层全屏。
- 示例页是首页“更多示例”里的“路由动画”（`RouteAnimationPage.tsx`）。

## SQLite（ClientSQL）

应用构建已移除 `.sq` 生成流程、vendored Python 生成器和 SQLite 3.16 校验器。现有三份查询代码原样固定在
`modules/app_pages/src/sqlgen/`，作为接入 Drizzle 前的过渡源码；不再自动生成。`src/db.ts` 仍打开共享的 `AppDb`，
表单保存、计数订阅、事务和数据库调试视图沿用现有实现，数据库文件标识与 schema version 不变。
Drizzle 尚未接入，后续一起替换 schema、驱动和迁移；原生 SQLite 模块继续随运行时导出。

数据库在启动时由宿主调用 `startAppServices()`（`db.ts`，`@ExportFunction`）打开，不能等页面第一次用到时再打开。原因是 ClientSQL 返回的连接由原生函数组成，Valdi 会把它们和创建时所在的 Context 绑在一起：在首页里打开，连接就属于首页的根 view。Android 按返回键退出时 Activity 销毁，根 view 一起销毁，之后所有查询都失败，计数显示 0。宿主在常驻的 JS 作用域里调用它，连接就一直有效。以后新增应用级、返回原生对象的服务（例如 `persistence`），也要在这里创建。

## 页面生命周期和状态栏

**生命周期**：页面继承 `Page`（`src/PageComponent.ts`），写法 `class XxxPage extends Page<PageViewModel, State, PageContext>`。类型参数跟 `StatefulComponent` 一样，因为 `@Component` 注解点名的类型要在页面文件里当类型用到，Valdi 编译器才找得到。

| 小程序 | 这里 |
|---|---|
| `onLoad` | `onCreate()`（参数用 `readParams`） |
| `onShow` | `onShow(reason)`：`'navigation'`（打开或上面的页面关了）、`'tab'`、`'foreground'` |
| `onHide` | `onHide(reason)`：`'covered'`、`'tab'`、`'background'` |
| `onUnload` | `onDestroy()`；页面关闭时不先调 `onHide`，和小程序一样 |

- **`whileVisible(effect)`**：页面可见时运行，隐藏或销毁时调用它返回的清理函数，适合扫描、轮询这类只在可见时要做的事。
- **可见**的意思是：栈顶（或全屏 cover 的栈顶）、tab 壳里选中的那页、sheet 本身和 sheet 下面那页，并且 app 在前台。
- **怎么算**：宿主根据导航状态算出来，通过 PageViewModel 的 `visible` / `visibilityReason` 传给页面，不看 UIKit 的 appear/disappear，所以 `showModal`、`previewImage` 这些弹出层不会让页面 hide。
- **前后台**：iOS 只看 UIScene 的进入后台和回到前台，所以控制中心、权限弹框不算后台；安卓看 `MainActivity` 的 start/stop，所以打开系统相册、文件选择、相机会触发 `onHide('background')` / `onShow('foreground')`，和小程序一样。

**状态栏**：整个 app 一个，和 ExpoNativeRoutes 的 `StatusBar.setBarStyle` 一样。`Page` 有个属性 `statusBarStyle`（`'auto'` 跟主题走，默认；`'light'` 白色图标，给深色页面；`'dark'`），页面每次 onShow 时把它设上去，所以返回上一页会恢复上一页的样式；页面显示中要改就调 `this.setStatusBarStyle(...)`。sheet 不设，沿用下面那页的。原生页每次出现时恢复 `'auto'`，要别的样式调 `NativePage.setStatusBarStyle`。iOS 由根控制器（和全屏 cover）的 `preferredStatusBarStyle` 显示，安卓用 `WindowInsetsControllerCompat` 同时设置状态栏和导航栏的图标。

## 存储

- **一般数据：** `api.getStorageSync(key)`、`setStorageSync(key, data)`、`removeStorageSync(key)`、`clearStorageSync()`（`src/storage.ts`），接口照小程序，但只有同步版本。
  - 值按 JSON 存：Date 读回来是字符串，`undefined` 成员会丢掉；没有的 key 读出 `undefined`（小程序是 `''`）。
  - 入参用 valibot 在入口校验，错了抛 `ApiError`，比如 `setStorageSync:fail data must be JSON, …`。
  - 底层是一个 MMKV 实例 `app`，和 ExpoNativeRoutes 一样。目录：iOS `Documents/mmkv`，安卓 `files/mmkv`。iOS 用 SPM，钉在 v2.4.3 的 commit 上（它的包用了 `unsafeFlags`，SPM 只允许按 revision 引用这种包）；安卓用 `com.tencent:mmkv:2.4.3`。
  - MMKV 的文件没加密，拿到 app 文件的人能读，所以不放机密。
- **token：** 存在 `TokenStore`（`src/auth.ts`）里：iOS 存 Keychain，重装后算未登录；安卓用 Keystore 里的 AES 密钥加密后存 SharedPreferences，这个文件不进备份。安卓判断是否已登录只看有没有存过 token，不解密，启动时不碰 Keystore。
- **为什么不用 Valdi 的 `PersistentStore`：** 它只有异步接口，而 `startApp` 要同步决定首页。它的加密只给 user-scoped 的存储用，要宿主提供 Snap 的 `UserSession` 和 Keychain 实现；`deviceGlobal` 的存储不加密。

## Valdi fork 与工具补丁

框架维护在 [cloud2303org/Valdi](https://github.com/cloud2303org/Valdi/tree/valdiroutes) 的 `valdiroutes` 分支，当前基于上游 `beta-0.2.1`。
应用通过 `valdi/MODULE.bazel` 的 `VALDI_COMMIT` 固定完整提交，registry 使用同一个 fork 提交。
原来的 11 个框架补丁已转换为 fork 中的独立提交，Hermes 构建输入也迁入 fork；应用不再持有这套补丁。
后续在 fork 中合并上游，再更新应用 pin，详见 [同步 Valdi 上游](docs/upgrading-valdi.md)。
Valdi 的 Kotlin 代码用 rules_kotlin 2.3.10 编译；宿主 Gradle 是 Kotlin 2.4.21 + AGP 内置 Kotlin。

**Bazel 8 和 Valdi 命令行工具的补丁。** Valdi 0.2.1 本身用 Bazel 8.2.1（`valdi/.bazelversion`），但命令行工具 1.2.1 的 `bootstrap` 模板还停在 Valdi 0.1.x：Bazel 7.2.1、protobuf 27.0、rules_java 7.4.0、rules_kotlin 1.9.0、rules_jvm_external 6.2，`projectsync` 也只认 Bazel 7 的外部仓库名（`valdi~`），不认 Bazel 8 的（`valdi+`）。`valdi/patches/@snap__valdi@1.2.1.patch`（`pnpm patch`，登记在 `pnpm-workspace.yaml`）把模板改成和 Valdi 0.2.1 一致，并让 `projectsync` 认 `+`。这个项目自己的 `.bazelversion`、`MODULE.bazel`、`.bazelrc` 也按同样的版本改过（另加 `platforms` 依赖和两个 Bazel 8 参数）。升级命令行工具时先看上游是否已修复，修复了就删掉补丁。Bazel 的磁盘缓存在 `~/.cache/bazel-disk-cache`，空闲时自动清理到 30 GB 以内（`.bazelrc` 的 `--experimental_disk_cache_gc_max_size`）。

ClientSQL 的 rules_python 导入路径修复已迁入 fork。应用 Node 构建已移除旧 SQL 生成器；框架自己的构建路径继续保留该修复。

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

iOS 宿主和 Android 结构一样：`ValdiHost.swift` 读路由表、按组件创建生成的根 view 类（`VRHomePage` 等），`Navigator.swift` 管一个 `UINavigationController`（`StackController`）、最多一层全屏 cover 和一个 Sheet。Valdi 页面自己画标题栏，所以导航栏只在原生页显示，隐藏导航栏后关掉的侧滑返回另外打开。用户侧滑或点原生返回按钮离开的页面按取消处理。

iOS 的键盘和 Sheet 与 Android 同一套规则，也各自独立：

- **键盘**：`KeyboardObserver.swift` 移植自 react-native-keyboard-controller 1.22.6（MIT）。每帧读键盘在屏幕上的真实位置（iOS 26+ 用 `keyboardLayoutGuide` 上的零高度 view，更早的系统找系统键盘 view），再按系统键盘动画的曲线往前预测两帧；交互式收起用 KVO 跟。它只报高度。SwiftUI 的键盘避让全部关掉（`.ignoresSafeArea(.keyboard)`），只有 `PageContainerView` 处理键盘：根 view 底部让出键盘高度，bottom inset 减去被键盘盖住的部分。跟踪 view 要在键盘出现前就挂进窗口，键盘弹出时才挂上去的 view 会直接排到终点，跟不上动画。
- **Sheet**：`SheetHostView.swift` 移植自 Software Mansion 的 react-native-bottom-sheet 0.16.2 的 iOS 实现（MIT）：临界阻尼弹簧做成 keyframe 动画、遮罩、点遮罩和下拉关闭、内容可滚动时先滚到顶再接手拖 Sheet、高度不超过状态栏以下。它和下面的页面在同一个窗口（`SheetLayer`），不用系统 sheet。Sheet 完全不知道键盘：宿主只设 `openHeight`（`sheet` 是窗口的 75%，`compactSheet` 是 24 + 340 + 底部 inset + 键盘高度），内容里的键盘由 `PageContainerView` 处理。

Android release 开了 R8（`isMinifyEnabled`、`isShrinkResources`），APK 从约 66 MB 降到约 32 MB（dex 从 39 MB 到 5 MB）。Valdi 运行时和生成的绑定类（`generated/valdi/`，现在是 app 自己的源码，按 Valdi 的注解保留）由 aar 自带的 `proguard.txt` 保留，`app/proguard-rules.pro` 只补它没覆盖的：Valdi 的 `JNI_OnLoad` 按名字注册 native 方法（包括 Java 不调用的），删掉一个加载 so 就崩；ML Kit 用反射创建 `ComponentRegistrar`，R8 full mode 会删掉它们的无参构造。我们自己的 native 代码按名字找的类用 `@Keep`（`VisionNative.Result`）。只写不读的字段也会被删：`ValdiHost.hostScope` 只是为了让常驻 JS 作用域不被回收，所以加了 `@Keep`，否则 release 里 host 全部失效（`Cannot unwrap native function … reference was disposed`）。以后新增"只为持有"的字段、或者被 JNI / 反射按名字访问的类，都要同样处理。iOS 不需要：`ValdiRuntime.xcframework` 是动态库，按名字查类在运行时到库里找，App 的 release 构建不会裁掉它。

导出 AAR 后需要重新构建宿主 APK；Gradle 的 debug/release 名称不会改变已经导出的 AAR 配置。导出命令会覆盖 `android/app/libs/valdi_runtime.aar`，失败时该文件也可能被移除，切换配置前应保留需要对比的产物。

## 线上热更新（OTA）

和 CodePush 一样，发版后下发新的 Valdi 模块（代码和图片一起），下次冷启动生效。只更新 `tools/valdi-rolldown` 构建的应用模块（`valdi/modules` 下的每个模块，npm 包打在里面），Valdi 自带的模块（`valdi_core` 等）跟着安装包走。

**加载。** Valdi 读模块前先问 runtime 的 custom module provider，返回 null 才读安装包里的 `.valdimodule`。图片的清单（名字、宽高）在 `.valdimodule` 里，图片文件在外面（Android 是 drawable，iOS 是 `<module>.bundle`），和 RN 的 AssetRegistry 加 `--assets-dest` 一样。`custom_module_assets.patch` 给 provider 加了一个可选方法，Valdi 找模块图片前先问它（Android `resolveAssetUrl`，iOS `assetURLForModule:resourcePath:`），返回 `file://` 地址就用热更新包里的图，返回 null 用安装包里的。宿主的 provider 在 `ValdiOta.kt` / `ValdiOta.swift`（iOS 的 provider 本身是 Objective-C 的 `ValdiOtaModules`：Swift 的 `throws -> Data` 表达不了"没有错误、用安装包里的"）。原生 Tab 栏图标也先问 `ValdiOta.image`。

**按 App 版本下发，指纹兜底。** 热更新包针对一个 App 版本（Android `versionName`，iOS `CFBundleShortVersionString`，`project.yml` 的 `MARKETING_VERSION`），打包时指定，这个版本的安装包都会收到。前提是这个版本的原生部分没变，指纹用来检查这一点。指纹由四部分组成：
- 导出时记下的 Valdi 部分：Valdi fork 提交、依赖规则补丁、`valdi/native`，写在 `libs/valdi_ota.json`、`ios/Frameworks/valdi_ota.json` 里；
- `codegen.ts` 从 `@Export…` 生成的原生绑定（`android/app/generated/valdi/`、`ios/Generated/valdi/`，去掉注释后计算）；
- `ota/fingerprint.json` 列出的原生源码；
- debug/release：包里是 Hermes 字节码，只发 release。

开了热更新（`VALDI_OTA_URL` 不为空）的 release 构建会把指纹记到 `ota/releases/<platform>/<App 版本>.json`，这个文件要和发版一起提交。之后再构建同一个版本时，如果原生部分不一样，构建会失败并指出哪部分变了：已经发出去的版本要升版本号，还没发的版本就删掉这个记录文件。打热更新包时会拿当前代码的指纹和记录比对，不一致就拒绝打包。客户端也会检查 manifest 里的版本和指纹。所以只改 TS 实现、文案、图片，可以热更新；改了导出给原生的接口、原生代码或 Valdi 本身，就只能发新版本。

**包和服务器。** `ota/dist/` 就是要放到服务器上的静态文件，每个 App 版本可以有多个热更新版本，`latest.json` 指向当前下发的那个（改它就能回退到旧包）：

```text
<platform>/<App 版本>/latest.json             {"version": "…"}
<platform>/<App 版本>/<version>/manifest.json 平台、App 版本、指纹、版本、每个文件的 sha256
<platform>/<App 版本>/<version>/manifest.sig  manifest.json 的 ECDSA P-256 签名
<platform>/<App 版本>/<version>/modules/…     <module>.valdimodule、<module>.map.json
<platform>/<App 版本>/<version>/res/…         Android drawable-<dpi>/<module>_<name>.webp，iOS <module>.bundle/<name>@<n>x.png
```

客户端先校验签名、平台、App 版本、指纹和版本号，再逐个下载文件并校验 sha256，全部通过后整个目录改名到 `files/valdi-ota/packages/<version>`。包和版本号一一对应，同一个版本号不能重新打包。

**生效和回滚。** 启动时选定这次进程用的包，进程内不再换（内存警告卸载的模块也从同一个包重新加载）。新包第一次启动时是 pending；`startApp` 返回后确认，变成 current，上一个包删掉。pending 的包启动后没能确认（崩溃、JS 启动报错），下次启动就回到上一个包，这个版本记为失败、不再下载。读不了的包同样处理。安装了新的安装包（指纹或安装时间变了）就清空所有热更新包。确认之后才在后台检查更新，下载的包下次冷启动生效。

```sh
node scripts/ota.mjs keygen                  # 只需一次：ota/private.pem（不进 git）和 ota/public.pem（编进安装包）
scripts/export-android.sh release            # 发版：release 运行时
cd android && ./gradlew :app:assembleRelease -PvaldiOtaUrl=https://ota.example.com   # 记下 ota/releases/android/<versionName>.json
scripts/ota-pack-android.sh 0.1 0.1-h1       # 热更新：在发版的代码上改 TS / 图片后打包，输出到 ota/dist/android/0.1/0.1-h1
```

iOS 是 `scripts/export-ios.sh release`、`project.yml` 的 `VALDI_OTA_URL`、`scripts/ota-pack-ios.sh <App 版本> <version>`。本地测试：`(cd ota/dist && python3 -m http.server 8765)`，`adb reverse tcp:8765 tcp:8765`，用 `-PvaldiOtaUrl=http://127.0.0.1:8765` 构建（`network_security_config.xml` 只对 127.0.0.1/localhost 放开明文 HTTP）。

`ota-pack-*.sh` 由 `ota.mjs` 调 `tools/valdi-rolldown` 的 `build.ts --release` 编出模块（字节码和 `<module>.map.json`）和图片，和安装包里的是同一套构建；不用重新导出运行时，字节码用的是 pnpm 安装的同版本 `hermes-compiler`，无需 toolbox。

## 构建（tools/valdi-rolldown）

我们的模块不再经过 Valdi 的编译器（Swift 写的，只能在 Bazel 里跑），由 `tools/valdi-rolldown` 用 Node 构建，产物和 Valdi 的格式一样，运行时照常加载：

自定义原生模块另有 [calculator 实验与模块规则](docs/custom-modules.md)：独立 `module-build/` workspace
运行时内置模块固定使用 Node 后端，旧 Swift Valdi 编译器源码和回退已从 fork 删除；接入范围和验证见 [Node runtime 编译器](docs/node-runtime-compiler.md)。
运行我们的 Node 编译和绑定生成，再用 Bazel 编译模块原生库，宿主继续使用 Gradle / Xcode，现有 runtime 不变。

- **编译**：TypeScript LanguageService 做类型检查（有错构建就失败），`.tsx` 用 Valdi 自己的 JSX 转换（`vendor/companion/`，MIT），再由 rolldown 输出 CommonJS：每个源文件是一个入口，输出一个 Valdi 模块文件，懒加载和内存警告时卸载都和原来一样；npm 代码按引用关系拆分（见“npm 依赖”）。
- **打包**：`.valdimodule`（zstd 压缩的 ValdiPacket）。debug 是 JS 加内联 source map；release 用官方预编译 `hermes-compiler` 编成 Hermes 字节码，由 Node 补齐 Valdi 模块包装和文件头，source map 单独放 `<module>.map.json`。
- **图片**：`res/` 生成 `res.ts` 和 `res.assetcatalog`；Android 输出 5 种密度的 webp 和 keep.xml，iOS 输出 `app_pages.bundle`（@2x/@3x）。
- **数据库**：应用不再运行 SQL 代码生成。当前 `src/sqlgen/` 为保留存储行为的固定过渡源码，后续由 Drizzle schema、驱动与迁移接管；原生 SQLite 能力保留。
- **原生绑定**：`codegen.ts` 是 Valdi 编译器绑定生成的 TS 移植，从 `@ExportModel`、`@ExportProxy`、`@ExportFunction`、`@ExportModule`、`@ExportEnum` 生成 Kotlin、Objective-C 和 C++，结果提交进 git。`npx tsx codegen/goldens.ts` 拿 Valdi 源码里的编译器 golden（`tools/ci/compiler_goldens`）逐字节对比三种语言；app_pages 的输出也和 Valdi 的 Bazel 构建一致。构建只跑 `--check`，过期就失败并给出命令；改了导出给原生的接口后手动重新生成：

  ```sh
  cd tools/valdi-rolldown
  pnpm exec tsx codegen.ts --kotlin-out ../../android/app/generated/valdi \
    --objc-out ../../ios/Generated/valdi --objc-framework ValdiRuntime --cpp-out ../../valdi/native/generated
  ```

- **接入**：Android 是 Gradle 的 `<variant>ValdiModules`（产物进 assets 和 res）和 `valdiCodegenCheck`（挂在 preBuild）；iOS 是 `project.yml` 的 “Valdi bindings check” 和 “Valdi modules” 两个构建脚本（产物进 app 的资源目录，Valdi 先在这里找模块）。改了 `project.yml` 要重新 `xcodegen generate`。
- **命令行**：`pnpm build [--release] [--minify] [--out <dir>] [--res <dir>] [--ios-res <dir>]`；`pnpm dev` 是热重载（`scripts/hotreload.sh`），监听 `src/`、`res/`、`sql/`，把改动推给 Android 模拟器和启动着的 iOS 模拟器（端口 13592，Valdi daemon 的协议），代替 `valdi hotreload`。真机只在 `ANDROID_SERIAL` 指定时才推，因为装着别的构建的 app 收到推送会出问题。
- **模块**：`valdi/modules/` 下每个有 `src/` 的目录都是一个模块，不用登记，各自打成 `<模块>.valdimodule`（自己的图片、npm 代码），绑定也按模块生成到同一组目录。模块之间按路径导入（`import { X } from 'other/src/X'`），运行时 Valdi 加载对方的模块。新建：`pnpm new-module <名字>`（snake_case，它也是 Kotlin 包 `com.snap.modules.<名字>`、Objective-C 目录和 C++ 命名空间），写出 `src/<Name>Component.tsx`（Valdi 的 ui_component 模板）、所有模块的 tsconfig.json 和这个模块的绑定；iOS 要再 `xcodegen generate` 把新的 Objective-C 文件加进工程。没有 `@Export…` 的模块不生成 C++ 文件，所以不需要重新导出运行时。删掉一个模块后，删它在 `android/app/generated/valdi`、`ios/Generated/valdi` 里的绑定，再跑 `pnpm tsconfig`。
- **IDE**：各模块的 `tsconfig.json` 由 `pnpm tsconfig` 生成（`new-module` 会跑），代替 `valdi projectsync`：Valdi 的基础配置、运行时带的 Valdi 模块（只有这些能导入）、所有 app 模块，生成的资源声明（`res.ts`）在 `tools/valdi-rolldown/.gen/`。`valdi/modules/app_pages/BUILD.bazel` 已经用不到了。

导出脚本只在 Valdi fork 提交、工具链配置或 `valdi/native`（C++，见下一节）变了时才需要跑：它提供运行时 aar / xcframework 和指纹的 Valdi 一半；导出内置模块时仍可能构建上游 toolbox，应用 Node 管线不再调用它。

## C++ 绑定

TS 声明一个 `@ExportModule` 的 `.d.ts`，C++ 实现它，JS 像普通模块一样 `import` 并直接同步调用（在 JS 线程上执行，返回值直接回到 JS）。宿主的 Kotlin / Swift 不参与。示例是 `src/cpp/Cpp.d.ts`（常量 `BUILD_INFO`、`sha256(text)`、`stats(values)` 返回一个模型），实现在 `valdi/native/src/Cpp.cpp`，页面是“OpenCV 与 ncnn”最下面的“C++ 绑定”。

- **生成**：`codegen.ts --cpp-out ../../valdi/native/generated` 写出 `valdi_modules/app_pages/app_pages.{hpp,cpp}`，命名空间 `snap::valdi_modules::app_pages`，和 Valdi 编译器的输出一样。`Cpp.d.ts` 生成接口 `CppModule`（每个函数一个纯虚方法，常量是无参方法）和工厂 `CppModuleFactory`；同时也生成 Kotlin / Objective-C 的同名接口，没人实现，不影响。模块和模型要像其他注解一样写上 `ios` / `android` 名字，否则 Kotlin 默认落在 `com.snap.modules.app_pages`，和模块的包冲突，生成会失败（Valdi 的编译器也一样）。
- **实现**：继承 `CppModuleFactory`，重写 `onLoadModule()` 返回 `CppModule` 的实现，再用 `Valdi::RegisterModuleFactory::registerTyped<…>()` 静态注册。运行时创建时收集这些注册，JS 第一次读 `app_pages/src/cpp/Cpp` 时调用工厂。
- **编进运行时**：`valdi/native/BUILD.bazel` 的 `app_pages_native`（实现 + 生成的绑定，`alwayslink`）通过 `valdi_exported_library` 的 `native_deps`（fork 中的原生导出规则扩展）链接进 `libvaldi_runtime.so` 和 `ValdiRuntime.xcframework`。不在 CMake / Xcode 里单独编：`libvaldi_runtime.so` 静态链接 libc++、只导出 JNI 符号，单独编的 so 会带另一份 libc++，跨 so 传 `shared_ptr`、抛异常都不安全。代价是改了 C++ 要重新导出（增量编译）。
- **检查**：导出脚本先检查 C++ 绑定没过期；导出时 `valdi_ota.json` 记下 `valdi/native` 的哈希，Gradle 的 `valdiCodegenCheck` 和 Xcode 的 “Valdi bindings check” 比对它（`scripts/ota.mjs check-export`），改了 C++ 没重新导出就构建失败并给出命令。`valdi/native` 也算进 OTA 指纹：C++ 在安装包里，不能热更新。
- **耗时的计算**：同步调用期间 JS 线程被占住。要在后台算，用回调参数，C++ 在自己的线程（`Valdi::DispatchQueue::create`）算完再调回调，Valdi 会把调用转回 JS 线程。

## npm 依赖

页面直接按包名导入 npm 包：`import dayjs from 'dayjs'`、`import * as v from 'valibot'`。

- **版本**写在 `valdi/package.json` 的 `dependencies`，`pnpm-lock.yaml` 锁版本和 integrity；`node_modules` 在 `valdi/` 下。pnpm 只把直接声明的包放在顶层，没声明的包导入不到。用新包就是 `pnpm add` 再 `import`，不用登记。
- **打包**：npm 代码打进 `app_pages` 里，按 rolldown 的代码分割走（类似 webpack 的 splitChunks）：只有一个文件用的包直接打进那个文件（现在的 dayjs 在 `src/schemas.js` 里），多个文件共用的提成公共 chunk（`npm/valibot.js`），按包名命名，每次构建名字不变。CommonJS 包的互操作在 chunk 里由 rolldown 处理，不经过 Valdi 的懒加载代理。
- **类型**直接用包自带的。

升级：改 `package.json` 的版本，`pnpm install`，然后重新构建。`@tanstack/query-core` 已经装了，还没有页面用它。

**Valdi 的懒加载代理。** Valdi 的 `require` 返回一个代理，第一次读属性时才执行那个文件。文件之间的引用都是读属性，所以照常懒加载。只为副作用的导入（`import './x'`）编出来是一句单独的 `require("./x")`，没人读属性就永远不执行，所以构建把它改成 `require("./x", true)`，立即加载（`pipeline.ts` 的 `eagerSideEffectRequires`）。互相 import 的文件（`nfc/NfcHost.ts` ↔ `nfc/native.ts`）会被 rolldown 合成一块 `chunks/src/nfc/NfcHost.js`，原来的文件只转发导出；转发的是加载时的值，所以循环依赖里不要用会重新赋值的 `export let`。

## 已知问题

- **Valdi 输入框在慢速滚动时会弹出长按菜单。** 手指按在输入框上、慢慢拖动超过约 400ms，滚动已经开始了，Valdi 仍然把触摸事件转给输入框，没有发取消；输入框和手指一起移动，Android 就判定为长按，弹出 "Paste"。全屏页和 Sheet 里都会出现，是 Valdi 的行为（`TouchDispatcherImpl` 只取消手势识别器，不取消 `ValdiEditText` 这种直接处理触摸的目标）。
