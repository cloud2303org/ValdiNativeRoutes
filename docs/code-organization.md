# 代码组织

`valdi/modules` 是本地模块源码。`module-build/modules` 是指向它的链接，
不是另一份源码。根 `package.json` 的 `valdi.modules` 选择启用模块；
页面及模块使用的 npm 依赖仍统一放在 `valdi/package.json`。

## Modules

- `app_pages`：业务页面、路由声明、认证策略、业务数据库和启动组合。
  `AppContext`、`NavigationHost`、`Page` 等应用宿主契约目前也在此模块，
  尚未单独建立 `app_foundation`。
- `app_ui`：弹窗、提示、选择器、BottomSheet、图片预览及原生控件。
  Android 内嵌滚轮和弹层滚轮共享这里的基础实现。
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

## Android 宿主

- `MainActivity.kt`：Activity 生命周期、权限回调、启动 Splash、视频宿主接入。
- `AppRoot.kt`：Compose/Nav3 页面栈、页面容器、官方 WindowInsets、tab 与图片引用。
- `ValdiHost.kt`：运行时启动、模块和资源接入、Valdi 页面创建及宿主能力生命周期。
- `RouteTable.kt`、`Insets.kt`：原生路由索引/校验和页面几何数据。
- `AppNativeModules.kt`：应用导航/令牌、Vision、Android Splash 工厂。
- `NativeScreens.kt`：应用自己的原生页面示例。
- `WheelViews.kt`：Valdi 自定义视图适配；保留生成模型转换、触摸、回收和事件回调。
  滚轮的布局、绘制和日期/树选择逻辑复用 `app_ui/android/ui/NativeWheel*`，
  宿主不再复制三份实现。

AppUI 的主题、BottomSheet 和拖拽优先级仍由模块管理。共享滚轮保留
`OwnsVerticalDrags` 标记；宿主仍提供 `ValdiTouchTarget` 转发。
不要用一个替换另一个。

## iOS 宿主

- `App.swift`：应用/Scene 入口、UIKit 导航容器、页面挂载和安全区/键盘适配。
- `NativeScreens.swift`：`NativePage`、原生页面映射和选择页示例。
- `ValdiHost.swift`：运行时、模块、页面创建和宿主能力。
- `RouteTable.swift`：路由别名、索引和校验。
- `CustomTabBar.swift`：自定义 Valdi tab 根视图的命中转发。
- `AppNativeModules.swift`：应用导航/令牌和 Vision 的工厂。
- `Images/AppImages.swift`：应用共享图片缓存与加载策略。
- `WheelViews.swift`、`WheelObjectBinding.{h,m}`：模块控件到 Valdi 的薄适配。
  Objective-C 异常边界和 marshaller 生命周期仍有实际消费者。

应用的 `KeyboardObserver` 服务页面容器；模块的 `AppUIKeyboardObserver`
服务独立弹层。两者均有消费者，单例、tracking view 和准备时机不同，
本轮不把它们合并为同一个生命周期。

路由层不再支持 Sheet。AppUI 内的 BottomSheet、选择器和 action sheet 仍属于模块，
不应因宿主路由清理而删除。

## 生成代码与构建

`android/app/generated/valdi`、`ios/Generated/valdi` 和
`valdi/native/generated` 来自 TS 声明的 codegen，不手改。
Android 主源码与测试由 Gradle 按 source set 发现；iOS 在新增 Swift 文件后通过
`node scripts/ios-project.mjs` 重新生成 Xcode 工程。

本轮整理不改变生成的原生接口。原生文件移动、注释和依赖声明仍属于 OTA 原生输入，
会更新兼容性指纹；需要新的原生安装包，不能作为旧二进制的纯 JS 更新发布。
这与 Valdi runtime 的导出校验是两层检查。

源码与测试布局按实际 package 对齐。权限/BLE 单测通过模块加载边界替换原生实现，
不向生产代码重新加入注入接口。真实系统权限、蓝牙、NFC、PiP 等行为仍需对应设备验证；
编译和 Node/JVM 单测不代替硬件验证。
