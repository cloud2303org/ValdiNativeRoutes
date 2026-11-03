# Runtime 内置模块的 Node 编译后端

`scripts/export-ios.sh` / `scripts/export-android.sh` 固定使用自己的 Node 管线。
替换的是用 Swift 编写的旧 Valdi 编译器；Valdi C++ runtime、布局引擎、Kotlin / Objective-C 平台实现和宿主 Swift 保留。

## 接入方式

固定 fork 的编译规则直接调用应用的 `valdi/bzl/node_compiler/adapter.bzl`；没有本地框架补丁或下载后裁剪：

- `valdi_compiled` 保留原来的 target、输出声明和 `ValdiModuleInfo`，Node 后端不解析旧编译器 toolchain；
  产物提取规则也移除不再使用的旧 toolchain 声明。
- `adapter.bzl` 把源码、模块设置和声明输出交给 `tools/valdi-rolldown/runtime-module.ts`。
- Node 完成 TypeScript 检查、TSX 转换、原始 JS 处理、Hermes 字节码、Kotlin / Objective-C / C++ 绑定和模块归档。
  内置模块没有 npm 依赖，按源码文件独立输出 CommonJS，避免启动时 `ModuleLoader` 依赖尚不能加载的共享 chunk；
  应用模块继续由 Rolldown 打包 npm。
- 现有 Bazel 原生库、资源嵌入、AAR / XCFramework 导出规则继续负责原生编译和打包。
- 原生导出路径排除模块的 `test/`、`.spec.` 源码和 `test_deps`；上游测试工具不进入发布 runtime。

覆盖的内置模块是 `valdi_core`、`valdi_tsx`、`coreutils`、`source_map`、`jasmine`、`drawing`、`client_sql`。
calculator 的独立自定义规则见 [custom-modules.md](custom-modules.md)，它不经过这里的 `valdi_compiled` 适配。

`valdi_core` 上游的 `ValdiRuntime.d.ts` 私有导入了自身源码使用的 `ElementFrame`，但没有导出；
Node 后端只在临时目录追加类型导出。`valdi_tsx` 使用自己的全局声明，避免与基础模块全局声明重复。
这些处理不修改上游源码和 runtime 实现。

## 构建与验证

```sh
pnpm test
scripts/export-ios.sh debug
scripts/export-android.sh debug
pnpm build:ios
pnpm build:android
pnpm test:e2e:ios calculator-module
pnpm test:e2e:android calculator-module
```

`runtime-module.test.ts` 编译真实的七个内置模块，验证声明、原始启动 JS、模块归档和 Release Hermes 文件头。
`runtime-native-golden.json` 保存固定 fork 旧编译器生成的 44 个原生文件的 SHA256，要求新生成文件逐字节一致。
升级 fork 时需要审查这些输出并更新基线，不能直接跳过 golden。
已有 codegen golden 测试继续覆盖 Kotlin / Objective-C / C++ 语法和 ABI 生成。
原生导出验证链接；模拟器回放验证启动、TSX 和实际原生调用，两者不能由 golden 测试代替。
`scripts/verify-runtime-actions.mjs` 审查 aquery JSON 构建图，要求内置模块的 Node action 存在，
并拒绝旧编译器和 toolbox action，包括缓存中的动作。`compiler/compiler:valdi_proto*` 是运行时协议定义，保留其 C++ 生成。

`ota/fingerprint.json` 把运行时 Node 编译器、转换器、绑定生成器及其依赖锁纳入 runtime 指纹。
更改这些输入需要重新导出 runtime。后端选择本身也计入指纹。

## 范围与源码清理

当前适配面向本仓库的原生 runtime 导出，不是对官方编译器所有功能的完整替代。
不支持上游测试编译、代码覆盖率、Web 输出、旧 Vue / CSS、SQL 源码生成、protodecl、本地化资源、ids.yaml、
Swift 绑定生成、TSN 原生编译、远程可下载资源等；遇到相关配置会明确失败。
`client_sql` 的 TS / C++ 绑定在支持范围内，`.sq` → SQL API 代码生成属于不同功能。
原生 workspace 关闭 Web 输出；App 模块的 npm / 图片仍走已有 Node 管线。

旧 Swift Valdi 编译器及其回退已直接从 fork 的 `valdiroutes` 分支删除：

- `compiler/compiler/Compiler/`、私有 vendor / 单测、编译器脚本和旧独立构建目标删除。
- `compiler/compiler` 只保留 runtime 使用的 `valdi.proto` 和它的 C++ protobuf 目标。
- 旧 compiler launch helper、本地／预编译选择器、编译器 toolchain 注册和私有 Swift 包依赖删除。
- 应用删除 `VALDI_COMPILER_BACKEND` 选择逻辑；设置旧环境变量不会启用其他后端。
- 原生 workspace 和自定义模块 workspace 都固定同一 fork commit，不再应用本地补丁或获取后裁剪。

内置模块的 Node action 使用本机 Node / pnpm 依赖，仍是 local、no-cache，不支持远程执行或密封工具链。
头文件改写独立使用 Bazel 注册的 Node 工具链，脚本和 Node 均是显式 action 输入，不依赖 npm。
iOS 宿主和平台代码中的 `.swift` 继续由 Xcode 正常编译。

## 2026-10-29 本地验收

- `pnpm test`：15 个脚本测试、20 个管线测试（含七模块及启动回归），以及全部绑定 golden 通过。
- `scripts/export-ios.sh debug`、`scripts/export-android.sh debug`、`pnpm build:ios`、`pnpm build:android` 通过。
- aquery 构建图：iOS 22,364 个动作中七模块使用 Node；Android 18,565 个动作中六个内置模块使用 Node。
  两端旧 Swift 编译器和 companion 动作数为 0。此轮仍有 C++ toolbox，后续替换见下节。drawing 是 iOS 原生依赖，Android 导出图不包含它。
- 44 个生成原生文件与旧编译器基线逐字节一致。重新导出的 iOS 两个 slice 和 Android 三个 ABI 原生 runtime 二进制也逐字节不变。
- iOS 26.5 arm64 模拟器、Android 36.1 arm64 / 16 KB 页模拟器：calculator 两组乘法、C++ 模块和表单数据库写入均通过。
- iOS 使用隔离的 Debug 宿主加载六个 Release 内置模块（jasmine 按上游配置保持 debug-only JS）重复上述三组回放通过。
  测试后恢复正常 Debug App。未验证完整 Release App、签名发布或物理真机。
- 修复了一次真实启动回归：模块加载器不能在初始化 require 前加载 Rolldown chunk。新增测试直接执行生成的根模块，禁止这个依赖。
- Android 首次测试被输入法 stylus 新手引导遮挡；关闭引导后通过。测试期间临时关闭手写输入以验证普通键盘，随后恢复默认值。

详细日志、动作图和报告位于忽略的 `.ci/node-runtime-*`；旧产物备份位于 `.ci/swift-removal-baseline/`。

源码清理已直接落到 fork `valdiroutes` 的 `cd0ac27261702dbd7d46d62ca35b4ba1baf8054d`。
删除后重新运行 35 个测试、全部绑定 golden、两端 Debug runtime 导出与两端 Debug App 构建，均通过。
两套 workspace 获取的源码中，`compiler/compiler` 都只剩 `BUILD.bazel` 和 `valdi.proto`；
本项目没有编译器框架 patch 或获取后裁剪。五个原生 runtime 二进制仍与清理前逐字节一致。
本次源码清理没有重复设备回放；前述模拟器结果来自同一 Node 管线的上一轮验证。

## C++ toolbox 替换

fork 提交 `67e02521ce5bcf88aa0690e300a3135cb84379a4` 删除 `valdi/compiler/toolbox/`、
`valdi_toolchain_binary.bzl`、工具专用 VM bridge 目标与 bin alias。
`rewrite_hdrs` 改由 `bzl/valdi/node_tools/rewrite_header.mjs` 执行，保留模块前缀替换、
路径扁平化、指定模块保留和原始文本扫描语义，action 名称为 `NodeValdiRewriteHeader`。
旧图标转换和 Web 路径打包入口明确失败，应用图片和宿主打包继续走现有 Node / Gradle / Xcode 流程。
`libs/image_toolbox` 属于独立图片库，不是本次删除的编译器工具。

`pnpm test` 现在还会执行 fork 自带的五项头文件测试，覆盖 Bazel 符号链接启动、重复 `-p`、
带空格路径、非法参数、非 UTF-8 注释和失败时不覆盖输出。
205 个真实头文件分别以保留目录和扁平化模式与旧工具对比，410 次输出逐字节一致。
后续升级也必须保持 aquery 中 C++ toolbox 动作数为 0，iOS 必须有 Node 头文件动作。

本次本机验证：40 项测试与全部绑定 golden 通过；两端 Debug runtime 导出、iOS Debug App 构建通过。
iOS aquery 为 16,668 个动作，含七个 Node 模块和 229 个 Node 头文件动作，旧编译器/toolbox 动作均为 0。
整个 XCFramework 的 495 个文件（包括 460 个头文件及两个原生二进制）逐字节不变；
Android 三个 ABI 原生二进制也逐字节不变。运行时指纹检查通过。
Android App 构建按用户要求委派到 Windows WSL，结果单独记录；本轮未重复设备回放。
证据位于 `.ci/node-header-migration/`。

## Windows WSL 验证与 Linux Hermes 修复

WSL Ubuntu 24.04 的首次验证完成三 ABI Debug Runtime 导出、Android APK 构建和构建图审计：
19,479 个动作中六个内置模块使用 Node，旧 Swift 编译器和 C++ toolbox 动作均为 0。
APK 中的 arm64 Runtime 与该次 WSL 导出的 AAR 内对应文件逐字节一致。
这轮使用了远端临时修复，详情和源码快照标识见 `.ci/node-header-migration/wsl-android-validation.md`。

实际发现 `hermes-compiler@260318099.0.4` 的 Linux 二进制打印 release `1.0.0`，
macOS 二进制打印 `260318099.0.4`，两者 HBC 为 99。
正式源码在 `hermes.ts` 中仅允许这个固定 Linux 组合，继续要求 npm 包版本等于 fork Runtime 版本，
其他未知横幅或该例外的 HBC 不匹配仍失败。新增回归测试后，本机 41 项测试及全部 golden 通过。
正式源码与远端临时修复不同，WSL 最终补验单独记录，已按下述正式源码和仓库配置完成。
Linux 导出时显式设置 `JAVA_HOME` 和 `ANDROID_HOME`；当前导出脚本的缺省路径仍面向 macOS。

正式 Hermes 修复已在 WSL 通过 41 项测试和全部 golden。该轮增量导出在 Maven 下载阶段受阻，
未产出最终 AAR；此前 APK 不能当作正式修复后的构建证据。
两套 workspace 现在通过根模块的 `maven.install.repositories` 选择 Google 的
`dl.google.com/dl/android/maven2` 制品地址，覆盖 `android_mvn`、
`android_ide_common_30_1_3` 和 `rules_android_maven`，避开不可达的 `maven.google.com` 入口。
依赖坐标和版本仍由原声明提供。

2026-10-30 最终验收已完成，结果见 `.ci/node-header-migration/wsl-final-maven-validation.md`：

- Mac 与 WSL 的两个 MODULE 文件及 `hermes.ts` / `hermes.test.ts` SHA256 一致。
- WSL 三 ABI Debug Runtime 导出、Android Debug APK 构建和 Runtime 指纹检查均通过。
- WSL 新 aquery 图为 19,479 个动作，六个 Node 内置模块齐备，旧 Swift 编译器与 C++ toolbox 动作均为 0。
- APK 内 arm64 Runtime 与本轮 WSL 导出的 AAR 对应条目逐字节一致；产物保留在
  `/home/runner/valdi-wsl/2026-10-29/app/`，未复制到 Mac。
- 本机最终 Maven 配置下，两端 Runtime 导出及 iOS App 构建通过；495 个 iOS 文件和三个 Android
  原生库与替换前逐字节一致，两端指纹有效。
- 最终 WSL 构建使用项目级 Maven 配置，未恢复系统代理转发或防火墙等临时改动。
- 本轮验证范围是 Debug 构建、测试和产物审计，未安装 APK、未做设备回放或完整 Release App 验证。
