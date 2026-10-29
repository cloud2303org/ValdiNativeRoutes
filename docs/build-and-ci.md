# 构建与 CI 边界

日常入口在根目录 `package.json`。`pnpm build` 调用 Node / TypeScript / Rolldown 管线；
`pnpm build:android` 调用宿主 Gradle；`pnpm build:ios` 生成 Xcode 工程并构建模拟器 Debug App。
平台构建已内含 TS 模块构建，无需先手动运行 `pnpm build`。

根目录 `pnpm install` 的 postinstall 安装两个子项目的锁定依赖，并生成编辑器 tsconfig。运行时导出和
OpenCV/ncnn 编译是单独的原生准备步骤，不在 npm 安装阶段运行。构建入口先检查缺失的产物及运行时指纹，
Valdi/Hermes 配置、补丁或应用 C++ 变化会提示重新导出；页面 TS 与宿主 Kotlin/Swift 的变化不会误触发运行时重导出。
首次导出先运行 `scripts/prepare-valdi.mjs`，通过 Bazel 的 `fetch --repo=@valdi` 获取类型声明，再检查 C++ 绑定。
只获取已固定版本和补丁的源码，不解析应用模块、旧 TS 编译器或 C++ 工具链目标。仅构建 TS 模块时可单独编译 host toolbox
和 SQLite 校验器，无需导出整个 Android/iOS 运行时；`pipeline.ts` 同时支持这种 host 产物和导出时的 exec-tool 产物。

已清理 `valdi/package.json` 中无应用引用的旧 ESLint/Jasmine/ts-node/esbuild 直接开发依赖；保留
`@snap/valdi` 和 TypeScript。Valdi CLI 自己的 peer / transitive 依赖仍由它的依赖关系安装，不把它们当作前端规范工具。
根目录使用 `pnpm-lock.yaml`，旧 npm `package-lock.json` 已移除；两个子目录保留各自的 pnpm lockfile 与 CLI patch。

## 本仓库的 CI

[Application CI](../.github/workflows/ci.yml) 在 push、pull request 和手动触发时运行三条任务：

| 任务 | 验证内容 | 产物 |
| --- | --- | --- |
| npm | `pnpm test`、host toolbox / SQLite validator、`pnpm build` | golden / 构建日志 |
| android | `pnpm test`、匹配运行时与视觉依赖、`pnpm build:android` | Debug APK、日志 |
| ios | `pnpm test`、匹配运行时与视觉依赖、`pnpm build:ios` | 模拟器 App 压缩包、日志 |

共用 `prepare` composite action 安装 Node 24、根目录固定的 pnpm、JDK 17，安装三个 frozen lockfile，
并获取固定版本和补丁的 Valdi 源码。使用 `macos-26` arm64 runner，匹配当前只有 arm64 的视觉库模拟器 slice；
runner 的架构见 [GitHub 官方列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。
Xcode / SDK / CMake / Ninja 的实际版本写入日志和缓存键。Actions 固定到 commit SHA。
CI 将 Bazel / Gradle / Xcode 并发限制为 3，Bazel 调度内存为 4 GB，磁盘 action cache 空闲清理目标为 3 GB。

三条任务会先跑 golden 再编原生工具，尽早发现 Node 绑定生成与上游语义的差异。
原生任务先恢复或导出运行时，优先使用导出过程产出的 host 工具；缺失时才单独编译，避免冷构建两次。
host 工具准备完成后立即保存 action cache，后续视觉库、宿主构建或产物上传失败也不会丢掉这份缓存。
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

## 仍然需要的原生工具与产物

- **Valdi + Hermes + 应用 C++ 运行时**：由 `scripts/export-android.sh` / `export-ios.sh` 导出
  AAR / XCFramework；`valdi/native` 实现和生成绑定也链接在其中。
- **Valdi 自带的模块**：`valdi/BUILD.bazel` 仍依赖 `valdi_core`、`valdi_tsx`、`client_sql`。
  它们随运行时导出，仍会使用上游 Valdi 编译器；替换应用编译管线不等于删除整个 Swift 编译器依赖。
- **Valdi toolbox**：读取图片信息、转换图片，以及用匹配运行时版本的 Hermes 编译 release 字节码。
- **ClientSQL**：Node 调度 vendored Python 生成器，仍需 SQLite 3.16 校验器。
- **宿主**：Android Gradle / SDK / NDK / CMake；iOS Xcode / XcodeGen / SwiftPM。
- **视觉依赖**：`vision/scripts/prepare-native.cjs` 按 `vision/vendor-lock.json` 准备 OpenCV Mobile / ncnn。

这些产物没有全部提交，因此 CI 显式构建 host 工具，并在缓存缺失时导出运行时、构建视觉库。
运行时缓存按平台、架构、Debug 配置、工具链和 `ota.mjs` 的 Valdi 指纹匹配，还纳入导出脚本、CLI lock 和 patch。
恢复后仍运行与本地相同的 `checkRuntime`；过期就重新导出，宿主构建继续保留原有 `check-export` 检查。
视觉缓存按平台、工具链、NDK、vendor lock 和准备脚本匹配。Bazel 仅缓存可校验的 action 输出与下载，
不缓存 `bazel-out` / `bazel-valdi` 绝对路径链接或整个 output base。

只改页面或宿主 Kotlin / Swift 时可复用匹配的导出运行时；更改 Valdi 版本、补丁、Hermes 或应用 C++ 时重新导出。
缓存都是加速手段，干净 runner 仍有完整的准备路径。原生冷构建较重，首次 GitHub runner 的耗时、磁盘和内存
仍需以实际运行结果调整；本地构建通过不代表 hosted runner 已通过。

## 后续 UI 覆盖

这次 CI 到 Debug 构建为止，不启动模拟器、不运行 e2e、不签名发布。UI 测试的默认设备来自当前开发环境，
接入 CI 时必须通过 `ANDROID_DEVICE` / `IOS_DEVICE` 指定 runner 自己创建的设备，再安装本次产物并提供测试 secret。
Android 当前只打包 arm64，届时需要选择相应设备或明确增加测试 ABI。
`pnpm test` 包含前置检查、升级脚本测试和绑定 golden 对比；构建通过也不代表 UI、热重载或 Release 字节码验证通过。

## 格式化范围

`pnpm format` / `pnpm check` 只处理 `valdi/modules/`，由 `biome.json` 约束；不格式化 Kotlin、Swift、C++、
生成绑定或 vendored 编译器源码。不引入 Spotless、ktlint、SwiftLint 或 swift-format。
