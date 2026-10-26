# Valdi Native Routes

页面全部用 Valdi（TSX）写，原生负责路由。Android 用 Compose Navigation 3 管页面栈，iOS 计划用 SwiftUI NavigationStack（还没做）。

```text
valdi/                  Valdi 工作区（Bazel）
  BUILD.bazel           valdi_exported_library(valdi_pages)，导出成 aar / xcframework
  modules/app_pages/    所有页面
    src/Page.ts         页面和宿主之间的契约：PageViewModel、PageContext
    src/routes.ts       路由表、参数和结果类型、getRoutesJson()（给原生读）
android/                普通 Gradle 工程，Compose + Nav3
  app/libs/             valdi_pages.aar（导出产物，不进 git）
scripts/
  export-android.sh     重新导出 aar
```

## 运行

```sh
scripts/export-android.sh            # 改了 TS 以后重新跑；release 包加参数 release
cd android && ./gradlew :app:installDebug
```

需要 JDK 17、Android SDK、`valdi` CLI。aar 里有三种 CPU 架构，APK 只打包 arm64（`abiFilters`）。第一次导出要从头编译 Valdi 运行时，约 17 分钟；之后只改 TS 是增量编译。

## 设计

**路由表在 TS 里。** `routes.ts` 声明每个路由是 Valdi 页面还是原生页面，以及组件路径。原生启动时通过 `@ExportFunction` 生成的 `Routes.getRoutesJson()` 读取，不需要生成清单文件。

**每个页面一个 Valdi 根 view，由宿主持有。** `PageEntry` 持有 `ValdiRootView`。Nav3 会释放被覆盖页面的 composition，所以根 view 不能放在 Compose 里；`AndroidView` 释放时只把它摘下来，页面真正出栈后才 `destroy()`。

**页面通过 context 调路由。** `PageContext` 里是 `push`、`pushForResult`、`finish`、`back` 四个回调，Kotlin 实现，TS 侧包成类型化的 `Router`。

**inset 由宿主算好放进 viewModel。** 开了 edge-to-edge，页面按 `viewModel.insets` 自己留边。Valdi 自带的 `Device.getDisplayTopInset()` 在 Android 上一直是 0，不用它。

**键盘只由宿主处理一次，页面不读键盘高度。** 宿主读一次 `WindowInsets.ime`，规则只有一条：给容器的内容底部加一段键盘高度的 padding。窗口开了 edge-to-edge，系统不会再缩窗口；Sheet 也不是 Dialog，所以没有第二个地方在避让键盘。

| 场景 | 宿主 | 页面 |
|---|---|---|
| 全屏页 | 内容底部加键盘 padding，页面变矮；导航栏被键盘盖住时 bottom inset 变成 0 | 在自己的范围里布局 |
| `sheet`（固定高度） | Sheet 高度不变，内容加键盘 padding，页面变矮 | `FocusScroller` 把输入框滚到可见区域 |
| `compactSheet`（按内容） | Sheet 高度 = 内容 + 键盘 padding，整个 Sheet 跟着键盘升高 | 不用做任何事 |

**Sheet 是 `SheetHostView`**，从 Software Mansion 的 react-native-bottom-sheet（MIT）移植的 Android 核心，去掉了 RN 绑定：跟手拖动、按速度和距离吸附、弹簧动画、遮罩、点遮罩和返回键关闭。内容里有 scroll 时，往下拖要等内容滚到顶才接手拖 Sheet。Sheet 本身完全不知道键盘，键盘按上面的规则在外面处理。Sheet 和下面的页面在同一个窗口，里面是独立的 Valdi 根 view。

## SQLite（ClientSQL）

`modules/app_pages/sql/AppDb/*.sq` 里写建表和命名查询，编译时生成类型化的 TS（`src/sqlgen/`）。`src/db.ts` 打开共享的 `AppDb`，例如 `getAppDb().submissionQueries.insertSubmission(...)`，`watchCountSubmissions` 在表变化时自动回调。改了 `.sq` 要重新导出 aar（SQLite 是原生模块）。

## Valdi 补丁

`valdi/bzl/patches/valdi/clientsql_rules_python.patch`：Valdi 的 ClientSQL 工具用的是 Bazel 内置的 `py_binary`，在 rules_python 1.9 下启动时不设置导入路径，`.sq` 编译和 `valdi hotreload` 都会报 `No module named 'python'`。补丁改成从 rules_python 加载这些规则。升级 Valdi 时先看上游是否已修复，修复了就删掉补丁。

## 已知问题

- **Valdi 输入框在慢速滚动时会弹出长按菜单。** 手指按在输入框上、慢慢拖动超过约 400ms，滚动已经开始了，Valdi 仍然把触摸事件转给输入框，没有发取消；输入框和手指一起移动，Android 就判定为长按，弹出 "Paste"。全屏页和 Sheet 里都会出现，是 Valdi 的行为（`TouchDispatcherImpl` 只取消手势识别器，不取消 `ValdiEditText` 这种直接处理触摸的目标）。
