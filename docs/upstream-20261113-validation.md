# Valdi 上游同步验证（2026-11-13）

## 固定版本与改动

- 原 fork：`662bb860f78bbafd4a56a4fefa1050c0ebf255c2`。
- 官方上游：`aed1249d5614cd9afb2c8d43d8177794e28789f0`；相对上一官方基线 `b527b091`，合入 32 个提交。
- 合并提交：`a783718dfc2acd81c291fba9815d5ffa5672ebf2`。
- 初次集成 fork：`7414d7b3c2e8cd29626c4eb7ea34323a6cd9c9f8`，已推送 `origin/valdiroutes`。
- 本页以下日志记录该初次集成版本。后续三个验证入口修复已推进到
  `70fa9c63a04fbbaa2ddafb53400c0eea6fd5ca27`，应用四处 pin 已同步；
  后续结果见[三个验证入口修复](upstream-20261113-fixes.md)。

保留 fork 的 Hermes `260318099.0.4`、Promise 原生所有权和销毁保护、内部字节码检查、
默认 NativeWeb、OTA 资源 URL 钩子、Node 编译后端与 Windows 工具链修改。
跟随上游分离 `test_deps`；把误处于生产目录的 PropertyList 测试迁入 `test/` 并修正相对导入，
保留原来的两个断言。未恢复旧 Swift 编译器或 hotreloader。

第 5 条采用框架与 Node 编译器同步适配：vendored `ConsoleLogTransformer.ts` 与固定上游一致，
仅保留既有 TypeScript ESM 默认导入适配。每次日志调用重新读取 `ValdiRuntimeProvider`；
ModuleLoader 的引导日志不依赖该 provider，避免安装 require 之前形成加载循环。

## 已完成验证

原始日志和产物清单位于 `/tmp/valdi-upstream-merge-20261113/`。源码复核不替代构建或设备验证。

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| 最终完整 Node 测试 | 508 通过（120 脚本、5 头文件重写、375 编译器/应用、8 模块拆分） | `pnpm-test-final.log` |
| 上游真实源码 Jasmine | 172 通过；另有 4 个 ModuleLoader 引导路径测试通过 | 同上 |
| Node 与框架 TypeScript 检查 | 通过 | 同上 |
| 绑定 golden | 10 组；Kotlin、ObjC、C++ 相同，Swift ABI 等价 | 同上 |
| 日志专项回归 | 18 通过；包含真实 TS/TSX 发射、Debug 与压缩构建及运行 | `console-log.test.ts`；旧转换器的 RED 已验证 |
| vendored 差异 | 规范化既有 ESM 导入后 0 项 | `vendor-report-7414/vendor.md` |
| 最终下载源码核对 | 与最终 fork 的 112 个变更存续文件相同，6 个删除路径不存在 | `fetched-source-check-final.json` |
| 生产 valdi_core 模块 | Android/iOS 的 Debug、Release 输出生成成功 | `core-production-build.log` |
| 原生 Bazel 检查 | 6 个目标通过：3 个 common、内部字节码、Hermes boundary、模块归档缓存 | `native-tests-supported.log` |
| SnapDrawing 同一测试二进制 | 在框架 checkout 工作目录运行，295 通过，1 个已有禁用测试 | `snap-drawing-direct.log`、`snap-drawing-direct.json` |

172 个 Jasmine 用例分布为：ElementLayoutDispatcher 9、PropertyList 2、Renderer 104、
ModuleLoader 14、ModuleLoaderUnload 10、DebuggerInputMessageHandler 33。
日志专项覆盖运行时尚未安装、后续安装、开关变化、对象替换与移除、被抑制的参数副作用、
provider/guard 不重复生成，以及没有日志时不引入 provider。

原生检查发生在最终测试目录迁移之前；后续两个 fork 提交只调整测试路径、导入和说明。
最终固定版本的原生导出与应用构建结果在下节记录。

## 原生导出与应用构建

以下使用最终固定 archive/registry，不使用本地框架源码 override：

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| Android Debug 运行库导出 | 通过；三种 ABI 的 `libvaldi_runtime.so`，AAR 为 51,293,541 字节 | `export-android-final.log` |
| iOS Debug 运行库导出 | 通过；真机 arm64、模拟器 arm64/x86_64，并完成 Swift 包装 | `export-ios-final.log` |
| 最终应用模块 `pnpm build` | 通过；使用最终下载源码，刷新 module-build 锁文件 | `pnpm-build-final.log` |
| Android Debug 宿主 `pnpm build:android --max-workers=4` | 通过；包含 8 个 Bazel 原生模块目标、Gradle 打包 | `build-android-final.log` |
| iOS Debug 模拟器宿主 `pnpm build:ios -jobs 10` | 通过；Xcode `BUILD SUCCEEDED` | `build-ios-final.log` |
| 最终 pin 与锁文件 | 四处 pin 一致；两个锁文件仅包含预期的 registry pin、NDK extension digest 与 API 23 变更 | `final-pin-check.json` |

导出命令：

```sh
VALDI_BAZEL_ARGS='--jobs=10' sh scripts/export-android.sh debug
VALDI_BAZEL_ARGS='--jobs=10' sh scripts/export-ios.sh debug
VALDI_BAZEL_ARGS='--jobs=10' pnpm build
VALDI_BAZEL_ARGS='--jobs=10' pnpm build:android --max-workers=4
VALDI_BAZEL_ARGS='--jobs=10' pnpm build:ios -jobs 10
```

默认输出为 `android/app/libs/valdi_runtime.aar` 和 `ios/Frameworks/ValdiRuntime.xcframework`。
导出输出和后续宿主构建产物均是本地忽略文件。
上游 `bzl/hermetic_ndk.bzl` 将默认 NDK API 从 31 调整为 23；最终运行库导出已使用该配置，
对应锁文件的 extension digest 和生成仓库属性一同更新。

`artifacts-final.json` 记录 AAR、三个 Android ABI 的共享库、两个 XCFramework 切片二进制、
APK 和 iOS App 可执行文件/Debug dylib 的字节数与 SHA-256，以及运行库元数据。
Android APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`；
iOS 模拟器 App 位于 `ios/build/Build/Products/Debug-iphonesimulator/ValdiRoutes.app`。
这些是 Debug 构建验证，不代表 Release 或真机运行通过。

## 验证边界

- 初次 Android 导出暴露 `PropertyListTest.ts` 误入生产模块而缺少 Jasmine 类型的问题。
  通过迁入 `test/` 解决，未把 Jasmine 恢复为生产依赖；初次失败保留在 `export-android.log`。
- 初次验证中，SnapDrawing 的 Bazel 测试启动方式因既有测试资源相对路径解析失败而退出 139。
  `TestDataUtils.cpp` 的查找不覆盖当前 external runfiles 位置；直接运行相同二进制可找到资源并通过。
  此次直接运行结果不能当作 Bazel runner 通过；后续已修复并通过实际 Bazel 入口，见上方修复记录。
- 初次验证中，回调归因原生目标在分析阶段受既有 `source_map_static_res` 旧静态资源生成入口阻塞；
  当时未恢复已删除的旧编译器，该轮无运行通过结论。日志为 `native-tests.log`。
  后续已迁移聚焦目标并完成实际执行，见上方修复记录。
- 初次额外执行的 `pnpm build:web` 在 Rolldown 打包前的类型检查失败：
  `coreutils/web/UnicodeNative.ts` 第 31、33、35 行将 `ArrayBufferLike` 返回为 `ArrayBuffer`。
  已从原 fork `662bb860` 和最终 fork 分别提取相同源码与声明，以当前已提交的 TypeScript 5.9.3
  和 Web 编译选项进行独立 `noEmit` 检查，两者均复现完全相同的三处 TS2322。
  该文件、声明、相关框架配置和应用编译器依赖未在本次修改；这是已有类型兼容问题。
  该轮未修改源码或放宽类型检查，Web 构建无通过结论；也未运行整个旧 fork 的 Web 构建。
  后续已修正私有返回类型推断并通过打包，见上方修复记录。
  证据为 `build-web-final.log`、`web-baseline/evidence.json`，复现入口为 `web-baseline/reproduce.cjs`。
- 三轮独立源码复核未发现具体新增 P1/P2；均为只读源码审查，不构成原生执行或真机证明。
- 本次合并验证没有安装或操作设备。此前 Hermes 真机 A/B 是独立的编译器/VM 工作负载测试，
  不能用来证明合并后应用的启动、帧率或原生布局行为。
- 验证结束时，应用仓库的 pin、适配、测试和本文档未暂存、未提交；
  这些改动现纳入 `v0.1.4` 源码发行。框架 fork 已提交并推送。
