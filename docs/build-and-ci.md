# 构建与 CI 边界

日常入口在根目录 `package.json`。`pnpm build` 调用 Node / TypeScript / Rolldown 管线；
`pnpm build:android` 调用宿主 Gradle；`pnpm build:ios` 生成 Xcode 工程并构建模拟器 Debug App。
平台构建已内含 TS 模块构建，无需先手动运行 `pnpm build`。

统一开发入口由 `scripts/cli.mjs` 用 Node 分发（Windows / macOS / Linux 一致）：
首次 checkout 执行 `pnpm install`，再手动运行 `scripts/export-android.sh debug` 或
`scripts/export-ios.sh debug`（Windows 使用 `scripts/windows/export-android.ps1 -Config debug`）。
导出获取固定 Valdi 源码并生成绑定。`pnpm android` / `pnpm ios` 执行正常原生构建、安装，
并在唯一模拟器（或显式 `--device`）上启动；
`pnpm dev` 仍是现有热重载；`pnpm build:android` / `pnpm build:ios` 保持纯构建；`pnpm test` 不变。
物理 Android 设备永远不会被自动选中，多个模拟器会要求 `--device`；iOS 安装/启动只在 macOS 模拟器上支持
（不驱动物理 iPhone）。`pnpm android`/`pnpm ios` 只支持 Debug，Release OTA 的手动导出、宿主构建和签名
见 [OTA 说明](ota.md)。

`nativeBuild: "bazel"` 的模块（目前为 calculator、bluetooth、valdi_webview）由独立 `module-build/` workspace 构建。
它调用同一套 Node TS / 绑定 / 资源管线，再编译模块原生库并接入 Gradle / Xcode；不通过主 App 的旧模块规则。
见 [自定义模块实验](custom-modules.md)。模块 native targets 依赖现有导出的 runtime；
Gradle / Xcode 的构建步骤负责模块库，根 project runner 不提前重复编译。
启用哪些 App 模块由根 `package.json` 的 `valdi.modules` 明确指定，TS、原生注册和宿主打包读取同一份名单；
新建模块不会自动集成。未启用模块仍被业务代码引用时，构建会提示修正名单或移除引用。

根目录 `pnpm install` 的 postinstall 安装两个子项目的锁定依赖，并生成编辑器 tsconfig。
运行时导出和 OpenCV/ncnn 编译不在 npm 安装阶段运行。`app_vision` 使用 `nativeBuild: "cpp"`，
它的 `nativeDependencies` hook 只在显式手动 runtime 导出中运行：先检查缓存，必要时准备静态 vendor 并复查。
Android vendor 使用兼容 runtime 的 NDK r28 arm64 配置，iOS 分别准备 arm64 真机和模拟器静态缓存。
停用模块不参与检查或准备；正常 App 构建不执行 cpp 模块 hook。host 模块的依赖 hook 仍在正常原生构建中运行，
宿主声明的 Android CMake、iOS 源码和 framework 仍由 Gradle / Xcode 编译链接。
运行时导出始终手动执行。构建只检查产物存在及平台/配置元数据，不计算运行时源码指纹或自动重导出。
Valdi fork、运行时工具链、runtime Node 编译器、链接进 runtime 的 C++、vendor 或启用的 cpp 模块名单变化后，
开发者应主动重新导出。纯 TS 页面继续使用正常热重载；不提供公开 prebuild 或自动导出入口。
Vision 的生成绑定、手写 C++ 适配器、VisionCore 和静态 vendor 链接进同一个动态 ValdiRuntime，
不再使用独立 Vision/vendor DSO 或逐方法 Kotlin/Swift、JNI/Objective-C++ 桥接。
适配器复用 runtime worker queue 与 disk cache；OTA 继续保留宿主 Kotlin/Swift 和 C codec 链接。
详见 [Vision 构建与打包](vision-build.md)。该静态方案尚无本轮导出、App 构建或设备验证结果。
首次导出先运行 `scripts/prepare-valdi.mjs`，通过 Bazel 的 `fetch --repo=@valdi` 获取类型声明，再生成绑定。
只获取已固定的 fork 源码，不解析应用模块、旧 TS 编译器或 C++ 工具链目标。仅构建 TS 模块时无需编译原生 host 工具或导出 Android/iOS 运行时。图片由预编译 sharp 处理，
Release 字节码由官方 hermes-compiler 生成，应用 Node 管线不再依赖 toolbox、ClientSQL Python 生成器或 SQLite 3.16 校验器。

已清理 `valdi/package.json` 中无应用引用的旧 ESLint/Jasmine/ts-node/esbuild 直接开发依赖；保留
`@snap/valdi` 和 TypeScript。Valdi CLI 自己的 peer / transitive 依赖仍由它的依赖关系安装，不把它们当作前端规范工具。
根目录使用 `pnpm-lock.yaml`，旧 npm `package-lock.json` 已移除；两个子目录保留各自的 pnpm lockfile 与 CLI patch。

## 本仓库的 CI

[Application CI](../.github/workflows/ci.yml) 在 push、pull request 和手动触发时运行三条任务：

| 任务 | 验证内容 | 产物 |
| --- | --- | --- |
| macos-android | `pnpm test`、`pnpm build`、匹配运行时与视觉依赖、`pnpm build:android` | Debug APK、日志 |
| macos-ios | `pnpm test`、`pnpm build`、匹配运行时与视觉依赖、`pnpm build:ios` | 模拟器 App 压缩包、日志 |
| linux-android | `pnpm test`、`pnpm build`、匹配运行时与视觉依赖、`pnpm build:android` | Debug APK、日志 |

共用 `prepare` composite action 安装 Node 24、根目录固定的 pnpm、JDK 17，安装三个 frozen lockfile，
并获取固定 commit 的 Valdi fork 源码。macOS 使用 `macos-26` arm64 runner，匹配当前只有 arm64 的视觉库模拟器 slice；
Linux Android 使用 GitHub 托管的 `ubuntu-24.04` x64 runner，与本地 WSL runner 分开；
runner 的架构见 [GitHub 官方列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。
Xcode / SDK / CMake / Ninja 的实际版本写入日志和缓存键。Actions 固定到 commit SHA。
CI 不额外指定 Bazel / Gradle / Xcode / Ninja 的构建并发或 Bazel 调度内存，使用各工具默认值。
Bazel 磁盘 action cache 空闲清理目标保留为 3 GB；这与构建并发、调度内存无关。

Linux GitHub-hosted 临时 runner 在恢复缓存之前运行 `scripts/ci-linux-disk.sh prepare`，
移除本项目不用的预装 .NET、GHC、CodeQL，以及 Android SDK 中非选定的 NDK；
保留宿主 Gradle 所需的 NDK；Vision 静态缓存要求 runtime 兼容的 NDK r28，不能用旧 r27/shared 缓存替代。
Bazel 仍使用自身固定的 NDK，清理及缓存配置需保留静态 vendor 准备所需的工具链。
清理不会触碰工作区、依赖缓存、当前选定的 Android 工具、Java 或 Node；
脚本不会在本地机器或 self-hosted runner 上删除工具。
`.ci/disk-prepare.log`、`.ci/disk-before-export.log`、`.ci/disk-final.log`
分别记录清理前后、缓存恢复后和任务结束时的可用空间与目录大小。
这用于处理恢复缓存后冷导出解压 NDK 出现的 `No space left on device`；
3 GB 是 Bazel 空闲 GC 的目标，不是缓存恢复或运行中磁盘占用的硬上限。

三条任务先跑测试和 golden，尽早发现 Node 绑定生成与上游语义的差异。
此阶段的滚轮 Renderer 测试读取已固定的 Valdi 源码，不要求本地已有 AAR 或 XCFramework。
原生任务显式导出运行时，由 Bazel 自身缓存复用构建结果；不再单独编译应用 host 工具或 SQL 校验器。
随后设置 `WHEEL_RUNTIME=android|ios`，用相同滚轮断言验证该任务平台实际导出的运行时模块；
缺少产物或所需模块会直接失败，不回退到源码，也不要求另一个平台的导出产物。
视觉依赖缓存恢复后，由显式 runtime 导出的 cpp 模块 hook 检查并按需准备，再保存可用缓存；
后续宿主构建消费该导出。host 模块的依赖检查仍随正常构建执行。
同一分支的运行中构建会完成以保存缓存，后续提交只保留最新的待运行版本。
artifact 上传是可选步骤：账号存储额度不足时会在日志和任务 summary 中警告，测试/构建仍按自身结果判定；
这种情况下无法下载 APK、模拟器 App 和报告，只能查看 workflow 日志。清理账号其他仓库的产物或调整额度需单独处理。
上游 workflow 位于 Bazel 获取的 `valdi/bazel-valdi/external/valdi+/.github/workflows/`，只作为参考，
不会作为本仓库的 CI 执行。升级操作和手动试跑见 [同步 Valdi 上游](upgrading-valdi.md)。

已检查上游 `bzl-changes.yml`、`compiler-tests.yml`、`release-test.yml`、`publish-npm.yml`，
以及 `tools/ci/build_compiler.sh`、`bootstrap_app.sh`、`hotreload_smoke.sh`、`run_tests.sh`。

## 已由 npm 管线接管的应用开发步骤

- **应用 TS / TSX 编译、类型检查**：`tools/valdi-rolldown/valdiTs.ts` 与 `build.ts`，不再编译
  `//modules/app_pages` 的 Bazel 目标。
- **应用 Kotlin / Objective-C / C++ 绑定**：`tools/valdi-rolldown/codegen.ts`。Gradle / Xcode 的绑定检查
  继续保留；`pnpm test` 比较已签入上游源码的 golden，不构建或运行原来的 Swift 编译器。
- **应用模块、npm 包和资源打包**：`build.ts`、`pipeline.ts`、`resources.ts`、`archive.ts`。
- **应用热重载**：`dev.ts`，由 `scripts/hotreload.sh` 启动；上游 compiler `--monitor` / Watchman 的
  hotreload smoke 测的不是这条路径。
- **应用 tsconfig / 新模块**：`tsconfig.ts`、`new-module.ts`，日常不再依赖 `valdi projectsync` / CLI 模板。
  `valdi/modules/app_pages/BUILD.bazel` 只是旧模块声明参考，不应再作为应用构建或 CI 入口。
- **应用 UI 回归**：`.argent/e2e/`，通过 `pnpm test:e2e:android` / `pnpm test:e2e:ios` 执行。

因此，本应用 CI 不需要照搬上游 Swift 编译器单测、CLI bootstrap / 发布、旧热重载 smoke、
helloworld / Widgets / Web 示例构建、Snap 发布和 GCP 缓存认证。这些是上游项目自己的职责，
并非都已经获得本项目的等价覆盖；特别是新 Node 热重载路径还没有专门的自动 delivery smoke。

## Windows 构建与冷启动检查

Windows 使用与其他平台相同的顺序：`pnpm install`，手动运行
`scripts/windows/export-android.ps1 -Config debug`，再 `pnpm android` 或 `pnpm build:android`。
新机器仍需预装 Node 24、pnpm 启动器、Bazel 8.2.1、JDK 17、Android SDK/NDK/CMake、
Git Bash、CMake/Ninja/curl。日常入口检查运行时产物及平台/配置元数据；不会根据源码变化决定重新导出。

`scripts/windows/build-android.ps1` 配置 Windows 工具与缓存后调用正常宿主构建；
它要求先手动导出运行时。`scripts/windows/test-cold-build.ps1` 在空的隔离目录克隆指定提交，
安装依赖、显式导出运行时，再构建 App、检查绑定和运行管线测试，验证正常构建没有改写导出的 AAR。
旧源码指纹失效 runner 已移除，历史报告不代表当前流程已通过；此次文档更新没有运行 Windows 构建。
命令与证据路径见 [Windows 原生构建](windows-native-build.md)。

## 仍然需要的原生工具与产物

- **Valdi + Hermes + 应用 C++ 运行时**：由 `scripts/export-android.sh` / `export-ios.sh` 导出
  AAR / XCFramework；模块 `cpp/` 中的实现和生成绑定也链接在其中。
- **Valdi 自带的模块**：`valdi/BUILD.bazel` 依赖 `valdi_core`、`valdi_tsx` 和作为数据库原生执行层的 `client_sql`。
  它们及传递依赖现在默认使用 Node 编译后端，保留原生库与导出规则。
  [接入范围、测试和源码清理](node-runtime-compiler.md)。
- **应用图片**：pnpm 的预编译 `sharp`，保留尺寸、density、命名、透明度和 catalog 协议，编码字节可变化。
- **应用 Release 字节码**：固定的官方 `hermes-compiler`，启动时检查版本与 `hermes.BUILD` 一致，
  Node 保留当前 Valdi 的模块函数包装和文件头；上游协议变化会明确报错。
- **导出头文件**：fork 内的 `bzl/valdi/node_tools/rewrite_header.mjs` 由 Bazel Node 工具链执行，无 npm 依赖。C++ toolbox 源码、构建目标和入口已删除。
- **数据库**：Drizzle schema、查询和迁移使用 npm 工具链；ClientSQL 原生执行层通过 Valdi 对象接口随运行时导出，
  两个 Bazel workspace 应用同一份 `clientsql-drizzle.patch`，补充位置行数组和执行元数据。
  `pnpm db:generate` 生成迁移，`pnpm db:check` 校验打包常量；`.sq`、旧 `sqlgen` 和 Python 生成器不再使用。
- **宿主**：Android Gradle / SDK / NDK / CMake；iOS Xcode / XcodeGen / SwiftPM。
- **视觉依赖**：`vision/scripts/prepare-native.cjs` 按 `vision/vendor-lock.json` 准备 OpenCV Mobile / ncnn。

这些产物没有全部提交，因此 CI 显式导出运行时，并在该导出中按需准备静态视觉库。
运行时通过显式导出获得；Bazel action cache 处理它自己的构建输入和增量编译。
宿主的运行时检查只验证产物存在及平台/配置元数据；`valdi_ota.json` 仅含 `platform` / `config`，
用于 OTA 的 Release runtime 检查。绑定生成结果与 codegen golden 检查继续保留。
视觉缓存按平台、工具链、NDK、vendor lock 和准备脚本匹配。Bazel 仅缓存可校验的 action 输出与下载，
不缓存 `bazel-out` / `bazel-valdi` 绝对路径链接或整个 output base。

GitHub 缓存默认在超过 7 天未访问或仓库缓存总量超过 10 GB 时淘汰，容量不足时优先删除最久未访问的条目；
具体以仓库设置和 [GitHub 缓存规则](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) 为准。
输入变化导致缓存不匹配不等于旧缓存被删除；输入未变也只有在缓存尚存且当前分支可访问时才能恢复。

只改页面或宿主 Kotlin / Swift 时可复用导出运行时；更改 Valdi fork、运行时工具链、链接进 runtime 的 C++、
vendor 或启用的 cpp 模块名单时手动重新导出。
缓存都是加速手段，干净 runner 仍有完整的准备路径。原生冷构建较重，首次 GitHub runner 的耗时、磁盘和内存
仍需以实际运行结果调整；本地构建通过不代表 hosted runner 已通过。

## 后续 UI 覆盖

这次 CI 到 Debug 构建为止，不启动模拟器、不运行 e2e、不签名发布。UI 测试的默认设备来自当前开发环境，
接入 CI 时必须通过 `ANDROID_DEVICE` / `IOS_DEVICE` 指定 runner 自己创建的设备，再安装本次产物并提供测试 secret。
Android 当前只打包 arm64，届时需要选择相应设备或明确增加测试 ABI。
`pnpm test` 包含前置检查、升级脚本测试、图片/字节码适配测试和绑定 golden 对比；构建通过也不代表 UI、热重载或 Release 字节码验证通过。

### 真机输入测试

登录页账号、密码框分别使用 `login-account`、`login-password` 标识；独立的输入自检页可从登录页
进入，无需认证。输入后点「提交输入」，检查下方收到的 JSON 字符串和提交次数，才能确认文本经过
原生输入事件到达 TS state。仅看到输入框显示文本不足以证明这条链路。

2026-11-01 在 Argent 0.30.1 / MEIZU 20 上实测，`fill` 显示成功后，输入自检页提交仍得到空字符串；
真实键入后可以提交内容。因此本项目的 Android 输入测试使用 `keyboard` 真实键入，不以 `fill` 的
`verified` 结果代替 `onChange` 验证。该现象的范围限于这次设备和工具路径，不能据此推断用户手输也会丢失。
微信输入法可能保留组合候选或转换标点，需提交候选并核对页面收到的文本；
无障碍树可能缓存旧标签，必要时用页面回显与可见界面交叉确认。

登录是本地演示逻辑，测试使用公开的非空 fixture 即可，不需要真实账号或密码。不要在填写密码后保存
包含输入区域的截图或原始字段值。蓝牙测试仅扫描与广播时，不能把结果写成已验证连接后的读写或通知收发。

## 格式化范围

`pnpm format` / `pnpm check` 只处理 `valdi/modules/`，由 `biome.json` 约束；不格式化 Kotlin、Swift、C++、
生成绑定或 vendored 编译器源码。不引入 Spotless、ktlint、SwiftLint 或 swift-format。
