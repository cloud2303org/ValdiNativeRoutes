# 代码组织

`valdi/modules` 是本地模块源码。`module-build/modules` 是指向它的链接，
不是另一份源码。根 `package.json` 的 `valdi.modules` 选择启用模块；
页面及模块使用的 npm 依赖仍统一放在 `valdi/package.json`。

## 基础、能力与业务

- `app_foundation`：通用导航契约与配置机制、页面生命周期、同步 Splash、
  首内容绘制钩子。
  它不导入业务页面、业务路由或认证跳转策略。
- `app_pages`：业务页面、具体路由声明和启动组合。
  页面在 `src/features/<功能>/`，业务 API 和网络服务在 `src/services/`，
  应用主题及共享页面组件在 `src/components/`。
- `app_vision`：Vision 的类型、生成 getter、调用封装、Polyglot C++ 绑定和手写 C++ 适配器。
  `module.json` 使用 `nativeBuild: "cpp"`，将 VisionCore 和静态 OpenCV/ncnn 链接进 ValdiRuntime；
  适配器使用 runtime worker queue 和 disk cache。
- `app_ota`：OTA 状态与检查下载的生成 proxy、类型、JS 入口、Kotlin/Swift 客户端及工厂，
  以及共享 C codec、vendor 和平台构建声明。源码归模块，编译进宿主；不迁入 ValdiRuntime。
  它复用启动时的客户端，不另存 JS 状态。
- `app_ui`：弹窗、提示、选择器、BottomSheet、图片预览及原生控件。
  `src/wheels/` 拥有可复用的页面内滚轮、模型和校验；Android 内嵌滚轮和
  弹层滚轮共享这里的原生基础实现。
- `app_video`：官方 `<video>` 的加载器、每播放器原生对象、订阅、全屏与 PiP。
- `bluetooth`、`wifi`、`nfc`：设备能力、校验、操作队列和事件分发。
  NFC 的实际会话实现属于 Android；iOS 明确返回不支持。
- `permissions`：权限查询、申请及串行提示队列。
- `mmkv`：结构化存储与平台编码。
- `native_common`：不依赖业务模块的纯 TS helper、结构化数据及公共 schema。
  BLE 和 Wi-Fi 直接复用这里的 `bindMethods`、`nativeCall`。
- `valdi_webview`：官方 WebView 适配；`calculator`：独立原生模块示例。

跨模块源码使用 `native_common/src/nativeCall` 一类模块 ID。
模块有自己的构建与原生元数据，但没有分别管理 npm package.json。
生成的 tsconfig 负责编辑器映射；新增或移动模块后运行 `pnpm tsconfig`。

服务统一通过生成的 `@ExportModule` / `getHost()` 获取。原生工厂负责装配，
业务不再调用手动安装 setter。持续事件的全局引用作用域、页面订阅的独立取消、
视频对象的释放语义都由各模块原有实现保留。

业务依赖基础设施和能力模块；基础设施、能力模块不反向依赖 `app_pages`。
普通 JS 状态由应用定义；示例已移除登录页和会话 store，不提供原生 TokenStore。
原生 Host 扩展见[应用 Host 类型扩展](extending-app-host.md)。
`app_pages/src/routes.ts` 和 `src/app.ts` 是应用组合入口。前者声明业务页面，
后者组合错误策略、主题、业务数据库、API 和首次路由。
`src/router.ts` 根据具体 routes 推导业务路由名、参数和结果类型；
通用的 host、options、数据快照及声明工具在 `app_foundation/src/navigation/`。
表单的 `FormLayout` 类型归 `src/features/form/types.ts`，路由声明和页面直接引用，
不通过 router 反向引用业务类型。`app.ts` 以副作用导入保留 API
模块依赖；开发环境通过模块加载器读取更新后的路由声明，首次直接进入首页 Tab。
有参页面使用 `RouteViewModel<'路由名'>` 绑定参数类型，直接读取 `viewModel.params`。
Native Web 原生模块注册由 runtime 完成；`services/nativeWeb.ts` 只安装 JS 全局，
应用入口先导入它，再加载业务服务。

生成的字符串与资源使用 `app_pages/src/Strings`、`app_pages/res` 这样的模块入口，
通过模块映射查找 `.gen` 下的文件。手写源码之间可以相对导入。

```text
valdi/modules/
  app_foundation/src/
    host/               AppContext 原生契约
    navigation/         通用导航
    page/               页面契约和生命周期
    splash/             同步控制与绘制钩子
  app_pages/src/
    app.ts              应用启动组合
    routes.ts           具体业务路由
    router.ts           绑定业务 routes 的类型安全 router
    components/         应用主题、按钮、表单和导航 UI
    features/           home、form、video、vision 等页面
    services/           应用 API 和网络服务
    cpp/                当前应用的 C++ 调用示例
  app_ui/src/wheels/    可复用滚轮组件、模型和校验
  app_vision/src/       Vision 能力接口和延迟调用
  app_vision/cpp/       生成 C++ 绑定、手写适配器和 runtime 链接规则
```

## Android 宿主

- 根目录的 `App.kt`、`MainActivity.kt`、`AppNativeModules.kt`：入口、生命周期和模块装配。
- `runtime/ValdiHost.kt`：运行时、模块资源、页面创建和宿主能力生命周期。
- `navigation/`：Compose/Nav3 页面栈、Navigator、路由校验、Insets、tab 和转场。
- `startup/`：同步 Splash 状态、内容就绪协调和默认静默的启动计时。
- `features/picker/PickerScreen.kt`：应用自己的原生页面示例及显式注册；
  通用 `NativePage`、`NativeScreens` 注册表在 `navigation/NativeScreens.kt`。
- `images/`：平台图片加载。OTA 实现在 `app_ota/android/` 和 `app_ota/native/`；
  宿主只保留启动、后台检查和图片读取接线。Vision 由 `app_vision/cpp/` 接入 runtime。
- `app_ui/android/wheels/WheelViews.kt` 拥有 Valdi 滚轮模型转换、触摸、回收和事件回调，
  布局、绘制和选择逻辑复用模块 `ui/NativeWheel*`。宿主只保留 binder 注册。

AppUI 的主题、BottomSheet 和拖拽优先级仍由模块管理。共享滚轮保留
`OwnsVerticalDrags` 标记；宿主仍提供 `ValdiTouchTarget` 转发。
不要用一个替换另一个。

本轮 Android 采用职责目录，保留 `io.valdiroutes.app` 包名。目录移动不改变
Manifest、JNI、R8 或自定义视图使用的类名；这不是每个目录都变成一个 Gradle module。

## iOS 宿主

- `App.swift`：应用/Scene 入口和根控制器装配。
- `Features/Picker/PickerScreen.swift`：原生选择页示例及显式注册；
  通用 `NativePage`、注册表在 `Navigation/NativeScreens.swift`。
- `Runtime/`：运行时、模块、页面创建和宿主能力。
- `Navigation/`：Navigator、路由校验、自定义 tab 命中转发和页面键盘观察。
  `AppRoot.swift` 拥有 UIKit 页面/Tab 容器、页面挂载和安全区/键盘适配。
- `AppNativeModules.swift`：应用导航和 Splash 的工厂注册。OTA 由模块元数据生成注册。
- `Startup/`：同步 Splash 状态、首屏覆盖层和系统共用的启动 storyboard；
  公共接口与资源位置见 [SplashScreen](splash-screen.md)。
- OTA 平台实现在 `app_ota/ios/`，共享 codec 在 `app_ota/native/`；
  宿主保留手动启动和图片读取接线。Vision 由 `app_vision/cpp/` 接入 runtime。
- `Images/AppImages.swift`：应用共享图片缓存与加载策略。
- `app_ui/ios/wheels/` 拥有模块控件到 Valdi 的适配、Objective-C 对象解码及生命周期。
  AppUI 的两端测试和独立 runner 统一在 `app_ui/tests/`，不再固定放在宿主测试源码中。

应用的 `KeyboardObserver` 服务页面容器；模块的 `AppUIKeyboardObserver`
服务独立弹层。两者均有消费者，单例、tracking view 和准备时机不同，
本轮不把它们合并为同一个生命周期。

路由层不再支持 Sheet。AppUI 内的 BottomSheet、选择器和 action sheet 仍属于模块，
不应因宿主路由清理而删除。

## 生成代码与构建

`android/app/generated/valdi`、`ios/Generated/valdi` 和
模块自己的 `cpp/generated/` 来自 TS 声明的 codegen，不手改。
`nativeBuild: "bazel"` 模块的 Kotlin、Objective-C／Swift 绑定由模块自身编译；
默认宿主 codegen 会清理它们在宿主生成目录中的旧副本，`--check` 只报告待清理项，
避免同一类型同时进入模块库和 App。显式指定模块的独立生成仍然可用。
Android 主源码与测试由 Gradle 按 source set 发现；iOS 在新增 Swift 文件后通过
`node scripts/ios-project.mjs` 重新生成 Xcode 工程。

本轮模块提取会改变原生声明的模块路径、生成文件归属和 schema 标识；
滚轮模型的 Android 包也随所属 AppUI 模块调整。原生自定义视图类名保持不变。
生成绑定和链接进 runtime 的 C++ 必须一起重新生成、导出和构建。
原生实现或导出契约的变化需要新的原生安装包，不能由 OTA 更新。
OTA 按 App 版本手动绑定，不再根据文件移动、注释等源码变化生成兼容指纹；发布者负责原生 API 兼容性。
OTA 只拥有 `app_pages` 归档、可选 map 和所属资源，其他应用/Valdi 模块（含 JS 封装）保持原生内嵌；
切换到该协议需要新的原生客户端。`appVersion` 取原生版本，根 `package.json` 的
`valdi.ota.bundleVersion` 记录内嵌业务版本，生成配置固定 `modules: ["app_pages"]`。
检查更新时查询本进程 active 或内嵌业务版本，绝不使用 pending。签名完整清单保留 full fallback，
可选 delta 按条目 copy/full/HDIFFSF20-zlib patch 后以 default ZSTD 重建，最终压缩哈希和大小必须
与签名 full 一致，否则下载原始 full。完整准备后下次冷启动验证并持久化为 current，
无需启动确认；退出或崩溃不触发自动业务回滚，也不记录失败版本黑名单。
C 编码器读取有 64 MiB 上限的整个输入，整条流程不保证流式内存。
打包参数、本地 hdiffz 前置条件和服务端 full/base/delta 保留规则见 [OTA 说明](ota.md)。

源码与测试布局按实际 package 对齐。权限/BLE 单测通过模块加载边界替换原生实现，
不向生产代码重新加入注入接口。真实系统权限、蓝牙、NFC、PiP 等行为仍需对应设备验证；
编译和 Node/JVM 单测不代替硬件验证。

## 模块自己的 C++ 构建

C++ 的声明、实现和生成绑定按模块归属：

- `app_pages/src/cpp/Cpp.d.ts`：应用示例的 TS 接口，模块 ID 保持不变。
- `app_pages/cpp/src/Cpp.cpp`：对应手写实现。
- `app_pages/cpp/generated/valdi_modules/app_pages/`：生成接口、模型和转换代码。
- `app_pages/cpp/BUILD.bazel`：公共 `module_cpp_library` 规则创建 `:bindings` 和 `:native`。

宿主 `valdi/BUILD.bazel` 通过生成的 `CPP_IMPLEMENTATIONS` 选择启用模块的实现，
包含启用的 `app_pages` 和 `app_vision` C++ 实现及其所需绑定。
这些业务 C++、VisionCore 和 OpenCV/ncnn 静态库最终链接进同一个动态 ValdiRuntime：
Android 是 `libvaldi_runtime.so`，iOS 是 ValdiRuntime framework，
不会为 Vision 另行打包 `.so` 或逐方法 Kotlin/Swift、JNI/Objective-C++ 桥接。Hermes 保持现有链接方式。
只有包含静态工厂注册的手写实现 target 使用
`alwayslink`；普通绑定 target 不使用它。旧的全局 `valdi/native` 目录已退役。

执行 `codegen.ts --cpp-modules-out ../../valdi/modules` 时，生成器从启用模块的
`cpp/src` 中寻找实现根，再根据生成的 C++ include 关系计算类型依赖闭包。
`app_vision` 的 C++ 实现也成为绑定闭包的根；只有类型依赖的模块继续按闭包纳入，
不会仅因其他 host 模块有导出注解就把它们的 C++ 绑定一起链接。
模块可在 `module.json` 中配置 `cppSourceRoots`，只为这条生成命令选择 TS 入口文件；
未配置时仍使用完整模块程序。入口必须是模块内存在的 TS 文件，列表不能为空，
导入的文件和生成绑定的 include 依赖仍按原流程解析，路径错误在写入任何输出前失败。
`app_pages` 配置为 `{"cppSourceRoots":["src/cpp/Cpp.d.ts"]}`，
因此只生成示例的 `CppStats`、`CppModule` 和工厂，保留原命名空间与模块路径。
`StartApp`、TabBar 等宿主契约继续从完整程序生成 Kotlin/Objective-C；
当前 runtime C++ 绑定闭包为 `app_pages`、`app_vision`，无需生成 `app_foundation/cpp`。
`cppSourceRoots` 不改变注解语义、宿主模块配置或通用 `--cpp-out` 的完整程序输出。
通用 `--cpp-out <临时目录>` 仍可用于独立绑定验证，当前编译器支持 C++ 生成。
同时生成的 `modules/runtime-cpp.bzl` 记录实现选择及绑定间的直接依赖，供宿主和公共规则读取。
新建 C++ 模块使用 `pnpm new-module <名字> --template cpp_bridge_module`，启用后由同一流程接入，
不需要按模块修改宿主 BUILD。

`module-build/` 继续编译父模块 BUILD 中的 TS、Kotlin 和 Objective-C/Swift target。
运行时工作区使用生成的 `modules/runtime-packages.bazelrc` 排除这些父 package，
同时允许嵌套的 `modules/<模块>/cpp` package；新增模块后重新生成绑定即可更新清单。

cpp 模块的 `nativeDependencies` 只在显式手动 runtime 导出时检查并按需准备，
host 模块的依赖 hook 仍随正常 App 构建执行。Vision 使用 NDK r28 兼容的 Android arm64 静态缓存，
以及 iOS arm64 真机/模拟器静态缓存；详见 [Vision 构建与打包](vision-build.md)。
普通构建不计算运行时源码指纹，也不自动导出。C++、vendor、链接规则或启用的 cpp 模块名单变化后
需手动重新导出运行时并重建 App；纯页面 TS 修改继续热重载。
旧 shared/JNI 构建与设备证据不验证本次静态接入，本轮尚未完成静态方案的构建或设备验证。
这里只调整编译依赖边界，不把增量构建改善当作已测得的启动加速。
