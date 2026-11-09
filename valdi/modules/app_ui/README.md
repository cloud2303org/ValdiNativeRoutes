# AppUI

AppUI 和 ThemeBridge 是模板默认启用的基础组件。AppUI 保持整包选配：
启用后包含弹窗、Toast、Loading、菜单、Picker、页面内滚轮、图片预览、
扫码及附件选择，也包含对应平台依赖、权限和资源。

根 `package.json` 的 `valdi.modules` 保留 `app_ui`、`theme_bridge` 和
`native_common`。AppUI 的 BUILD 依赖显式要求后两者；缺少时构建会提示，
不会自动修改启用名单。

## 原生代码可以直接访问

模块源码同时供原生宿主使用，并非只能由 JS 调用：

- Android 页面使用 `io.valdiroutes.app_ui.appui.NativeApp.ui` 的挂起方法，
  例如 `showModal(ModalOptions(...))`。调用放在 Activity/页面拥有的协程作用域。
- iOS 页面使用 `app.ui` 的异步方法，例如
  `try await app.ui.showModal(ModalOptions(...))`，展示入口在主线程使用。
- 原生 `UiDesign` 直接读取 ThemeBridge 的 `ThemeTokensStore`。
  JS 获取的是同一原生 token 树的生成模型，不另存一套默认主题值。
- 原生页面内滚轮、Valdi 自定义视图适配器和 Objective-C 对象解码都由本模块拥有。
  现有 `io.valdiroutes.app.*WheelView`、`VR*WheelView` 身份保持不变；
  源码集中在模块中，不需要兼容别名。

主题构造位置和读取方式见 [ThemeBridge](../theme_bridge/README.md)。

## 宿主接线

工厂由 `module.json` 生成注册。宿主负责应用状态、导航和展示上下文：

- Android `App` 安装应用图片 loader；`MainActivity` 调用
  `AppUI.attach/detach`；导航容器通知当前页面及其展示状态，并挂载现有 modal/
  presentation host。`ValdiHost` 保留三个 wheel binder 的显式注册。
- iOS 在 runtime 注册前设置 `AppUI.imageLoader = AppImages.load`，
  导航容器继续通知 `AppUI.shared.topPageChanged(...)`。模块头文件通过生成的
  `ValdiModuleImports.h` 导入宿主。
- Android 根 Gradle 按模块选择加载 `android/appui.gradle`，
  仅在 AppUI 启用时编译本模块的 Android 单测。

这些是明确的应用组合点。完整接线说明见
[服务集成](../native_common/SPLIT_INTEGRATION.md)。

## 源码和测试归属

- `android/`、`ios/`：平台实现、控件和原生桥接。
- `android/wheels/`、`ios/wheels/`：页面内滚轮的 Valdi 适配。
- `src/`：生成契约、公开 API、schema 和 TSX 控件。
- `tests/android/`：JVM/JNI、滚轮、Picker、Sheet 和结果状态测试。
- `tests/ios/`：Promise、滚轮对象绑定和 Sheet 测试及独立工程 runner。

```sh
python3 valdi/modules/app_ui/tests/android/AppUIPromiseRun.py

# 只编译链接独立测试工程，不启动设备或执行 XCTest。
python3 valdi/modules/app_ui/tests/ios/run-wheel-object-binding-tests.py --build-only
python3 valdi/modules/app_ui/tests/ios/run-sheet-host-tests.py --build-only
python3 valdi/modules/app_ui/tests/ios/run-appui-promise-tests.py --build-only
```

runner 默认只准备工程；需要执行时使用 `--run --udid <已启动模拟器>`。
独立 iOS 测试使用真实 ThemeBridge 模块及静态库，先正常构建 iOS 模块。

## 不使用 AppUI 的应用

模板默认保留它。如果整个应用不需要原生 UI 能力，可以手动：

1. 移除业务 `app_ui` 导入、页面内滚轮和原生示例中的直接 AppUI 调用。
2. 移除上述 Activity、导航、图片 loader、wheel binder 接线。
3. 从 `valdi.modules` 删除 `app_ui`；ThemeBridge 是否保留取决于应用其他原生和 JS
   消费者，不能因为移除 AppUI 就直接删除仍被页面使用的主题。
4. 重新生成绑定和平台注册、iOS 工程，再正常构建 App。

模块停用后其平台源码、权限、资源、依赖和 Android 单测一同退出构建。
Theme/AppUI 不静态编入 ValdiRuntime，修改它们只需重新构建原生 App；
改变 runtime/C++ 时仍按正常流程手动重新导出。
