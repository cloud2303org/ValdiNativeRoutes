# 代码组织

`valdi/modules` 是本地模块源码。`module-build/modules` 是指向它的链接，
不是另一份源码。根 `package.json` 的 `valdi.modules` 选择启用模块；
页面及模块使用的 npm 依赖仍统一放在 `valdi/package.json`。

## 基础、能力与业务

- `app_foundation`：通用导航契约与配置机制、页面生命周期、同步 Splash、
  首内容绘制钩子、Drizzle 通用驱动和原生连接类型。
  它不导入业务页面、业务路由、业务表结构或认证跳转策略。
- `app_pages`：业务页面、具体路由声明、认证策略、业务数据库和启动组合。
  页面在 `src/features/<功能>/`，业务 API、认证和数据库服务在 `src/services/`，
  应用主题及共享页面组件在 `src/components/`。
- `app_vision`：Vision 的类型、生成 getter 和调用封装。OpenCV/ncnn 的链接、
  平台实现和工厂注册由原生应用装配。
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
用户状态在应用自己的 `state/` 中定义；示例使用 `zustand/vanilla`，不提供原生 TokenStore。
原生 Host 扩展见[应用 Host 类型扩展](extending-app-host.md)。
`app_pages/src/routes.ts` 和 `src/app.ts` 是应用组合入口。前者声明业务页面，
后者组合错误策略、主题、业务数据库、API 和首次路由。
`src/routing/index.ts` 根据具体 routes 推导业务路由名、参数和结果类型；
通用的 host、options、数据快照及声明工具在 `app_foundation/src/navigation/`。

数据库也遵守这个边界：通用 `driver.ts` 和 `native-types.ts` 在 foundation；
`app_pages/src/database/` 保留 schema、生成迁移和应用迁移流程；
`app_pages/src/services/database.ts` 才绑定数据库名称、ClientSQL 和业务查询。
它不会改变数据库文件名、历史或迁移内容。

```text
valdi/modules/
  app_foundation/src/
    database/           通用 Drizzle 驱动
    host/               AppContext 原生契约
    navigation/         通用导航
    page/               页面契约和生命周期
    splash/             同步控制与绘制钩子
  app_pages/src/
    app.ts              应用启动组合
    routes.ts           具体业务路由
    components/         应用主题、按钮、表单和导航 UI
    database/           业务表结构和迁移
    features/           home、auth、form、video、vision 等页面
    routing/            绑定业务 routes 的类型安全 router
    services/           应用 API、认证策略和数据库服务
    state/              应用自己的 Zustand 状态
    cpp/                当前应用的 C++ 调用示例
  app_ui/src/wheels/    可复用滚轮组件、模型和校验
  app_vision/src/       Vision 能力接口和延迟调用
```

## Android 宿主

- 根目录的 `App.kt`、`MainActivity.kt`、`AppNativeModules.kt`：入口、生命周期和模块装配。
- `runtime/ValdiHost.kt`：运行时、模块资源、页面创建和宿主能力生命周期。
- `navigation/`：Compose/Nav3 页面栈、Navigator、路由校验、Insets、tab 和转场。
- `startup/`：同步 Splash 状态、内容就绪协调和默认静默的启动计时。
- `features/picker/NativeScreens.kt`：应用自己的原生页面示例。
- `images/`、`ota/`、`capabilities/vision/`：各自的平台实现。
- `adapters/WheelViews.kt`：Valdi 自定义视图适配；保留生成模型转换、触摸、回收和事件回调。
  滚轮的布局、绘制和日期/树选择逻辑复用 `app_ui/android/ui/NativeWheel*`，
  宿主不再复制三份实现。

AppUI 的主题、BottomSheet 和拖拽优先级仍由模块管理。共享滚轮保留
`OwnsVerticalDrags` 标记；宿主仍提供 `ValdiTouchTarget` 转发。
不要用一个替换另一个。

本轮 Android 采用职责目录，保留 `io.valdiroutes.app` 包名。目录移动不改变
Manifest、JNI、R8 或自定义视图使用的类名；这不是每个目录都变成一个 Gradle module。

## iOS 宿主

- `App.swift`：应用/Scene 入口和根控制器装配。
- `Features/Picker/NativeScreens.swift`：`NativePage`、原生页面映射和选择页示例。
- `Runtime/`：运行时、模块、页面创建和宿主能力。
- `Navigation/`：Navigator、路由校验、自定义 tab 命中转发和页面键盘观察。
  `AppRoot.swift` 拥有 UIKit 页面/Tab 容器、页面挂载和安全区/键盘适配。
- `AppNativeModules.swift`：应用导航、Vision 和 Splash 的工厂注册。
- `Startup/`：同步 Splash 状态、首屏覆盖层和系统共用的启动 storyboard；
  公共接口与资源位置见 [SplashScreen](splash-screen.md)。
- `Ota/`、`Capabilities/Vision/`：各自的平台实现。
- `Images/AppImages.swift`：应用共享图片缓存与加载策略。
- `Adapters/Wheels/`：模块控件到 Valdi 的薄适配。
  Objective-C 异常边界和 marshaller 生命周期仍有实际消费者。

应用的 `KeyboardObserver` 服务页面容器；模块的 `AppUIKeyboardObserver`
服务独立弹层。两者均有消费者，单例、tracking view 和准备时机不同，
本轮不把它们合并为同一个生命周期。

路由层不再支持 Sheet。AppUI 内的 BottomSheet、选择器和 action sheet 仍属于模块，
不应因宿主路由清理而删除。

## 生成代码与构建

`android/app/generated/valdi`、`ios/Generated/valdi` 和
模块自己的 `cpp/generated/` 来自 TS 声明的 codegen，不手改。
Android 主源码与测试由 Gradle 按 source set 发现；iOS 在新增 Swift 文件后通过
`node scripts/ios-project.mjs` 重新生成 Xcode 工程。

本轮模块提取会改变原生声明的模块路径、生成文件归属和 schema 标识；
滚轮模型的 Android 包也随所属 AppUI 模块调整。原生自定义视图类名保持不变。
生成绑定和链接进 runtime 的 C++ 必须一起重新生成、导出和构建。
原生文件移动、注释和依赖声明同样属于 OTA 原生输入，会更新兼容性指纹；
需要新的原生安装包，不能作为旧二进制的纯 JS 更新发布。

源码与测试布局按实际 package 对齐。权限/BLE 单测通过模块加载边界替换原生实现，
不向生产代码重新加入注入接口。真实系统权限、蓝牙、NFC、PiP 等行为仍需对应设备验证；
编译和 Node/JVM 单测不代替硬件验证。

## 模块自己的 C++ 构建

C++ 的声明、实现和生成绑定按模块归属：

- `app_pages/src/cpp/Cpp.d.ts`：应用示例的 TS 接口，模块 ID 保持不变。
- `app_pages/cpp/src/Cpp.cpp`：对应手写实现。
- `app_pages/cpp/generated/valdi_modules/app_pages/`：生成接口、模型和转换代码。
- `app_pages/cpp/BUILD.bazel`：公共 `module_cpp_library` 规则创建 `:bindings` 和 `:native`。
- `app_foundation/cpp:bindings`：被应用 C++ 绑定引用的基础类型。

宿主 `valdi/BUILD.bazel` 通过生成的 `CPP_IMPLEMENTATIONS` 选择启用模块的实现，
当前只有 `//modules/app_pages/cpp:native`。
三个 C++ target 均显式使用 `linkstatic = True`，最终链接进同一个 Valdi runtime，
不会为每个模块另行打包 `.so`。Hermes 保持现有静态链接；Android Vision 的独立动态库链路不变。
只有包含静态工厂注册的手写实现 target 使用
`alwayslink`；普通绑定 target 不使用它。旧的全局 `valdi/native` 目录已退役。

执行 `codegen.ts --cpp-modules-out ../../valdi/modules` 时，生成器从启用模块的
`cpp/src` 中寻找实现根，再根据生成的 C++ include 关系计算类型依赖闭包。
当前闭包只有 `app_pages` 和 `app_foundation`，不会因 Vision、视频等模块有导出注解
就把它们的 C++ 绑定一起链接。通用 `--cpp-out <临时目录>` 仍可用于独立绑定验证。
同时生成的 `modules/runtime-cpp.bzl` 记录实现选择及绑定间的直接依赖，供宿主和公共规则读取。
新建 C++ 模块使用 `pnpm new-module <名字> --template cpp_bridge_module`，启用后由同一流程接入，
不需要按模块修改宿主 BUILD。

`module-build/` 继续编译父模块 BUILD 中的 TS、Kotlin 和 Objective-C/Swift target。
运行时工作区使用生成的 `modules/runtime-packages.bazelrc` 排除这些父 package，
同时允许嵌套的 `modules/<模块>/cpp` package；新增模块后重新生成绑定即可更新清单。

OTA/导出检查保守地记录所有启用模块的 `cpp/` 目录、宿主链接规则和 package 清单。
C++ 或规则变化需要重新导出运行时；纯页面 TS 修改不因此要求重导出。
这里只调整编译依赖边界，不把增量构建改善当作已测得的启动加速。
