# Valdi 官方更新接入（2026-11-01）

本次将 Snapchat/Valdi `main` 的 `4aa98f01a46e65ead03a8fc8cc1c21e04f2a465d`
合入维护 fork，包括 `beta-0.2.1` 之后的全部 55 个官方提交。
维护提交为 `15feb6530ceecb971f4c8519ea8ab77474b959db`。
应用的 `valdi`、`module-build` 及其 registry 必须固定到同一维护提交，
由 `node scripts/upstream.mjs pin COMMIT` 一起更新。

## 保留的项目定制

- Hermes 保持 `260318099.0.4` 和已修复的旧适配器，包括 Promise ownership、
  debugger 生命周期、GC/teardown 和内置 HBC 校验；JSI 实验保持独立。
- 模块使用现有 Node/Rolldown 编译链，不恢复旧 Swift 编译器。
- iOS 自定义模块同时支持现有 OTA 图片 URL 和上游可选的模块内容 identity。
- XCFramework 保留 arm64 与 x86_64 模拟器切片，兼容现有 Swift 和模块构建路径。
- 上游模块缓存、卸载 worklist、末尾 GC、orphan Worker 等开关保持上游默认值。

## Node 编译配套改动

vendored `JSXProcessor.ts` 对齐官方版本，仅保留 TypeScript 的 ESM default-import 适配。
它与本次更新的 JSXBootstrap、Renderer 和 delegate 配套，支持
`<custom-view viewFactory={...}>`、lazy 工厂视图以及平台 class 的互斥校验。

`lazyImport` 现在接收回调：

```ts
const module = lazyImport<typeof import('./Feature')>(() => require('./Feature', true));
```

保留项目对副作用导入和外部模块 lazy proxy 的处理。新增测试实际执行
Rolldown 的压缩/未压缩产物和官方 ModuleLoader，覆盖延迟加载、缓存、相对路径、
外部模块、副作用顺序及 npm 共享 chunk。

## 验证入口

`pnpm test` 包含以下新增测试：

- `jsx-upstream.test.ts`：真实运行时类型、Node JSX lowering 和产物调用顺序。
- `lazy-import.test.ts`：实际 bundle 与官方 ModuleLoader/LazyImport 的组合行为。
- `upstream-runtime.test.ts`：执行未修改的官方 Jasmine specs，包含 Renderer 104 项、
  ElementLayoutDispatcher 9 项和 ModuleLoader unload 10 项。

后者从源码执行测试，不把 `test/` 文件重新打入生产运行时。维护 fork 中对应的新增
C++ fixture 调用因此迁至该 Node 验证入口；它不代表 Hermes 或设备上的 UI 验证。

从 `valdi/` 工作区可运行维护 fork 的原生检查：

```sh
bazel test @valdi//bzl/valdi:common_test \
  @valdi//third-party/hermes_v1:check_internal_bytecode_test \
  @valdi//valdi:test_hermes_boundary \
  @valdi//valdi:test_module_archive_cache \
  @valdi//src/valdi_modules/src/valdi/valdi_core:jsx_platform_test
```

通用 `test_runtime` 仍依赖旧测试模块全集；Node 后端没有声称支持这些模块。
独立 `test_module_archive_cache` 直接运行官方缓存、mmap、Zstd、Result 测试，
无需旧模块编译器。

框架或编译器更新后，应重新导出 AAR/XCFramework，再构建宿主应用。
当前导出脚本生成绑定，并在 runtime 的 `valdi_ota.json` 中仅记录平台/配置。
构建不计算源码指纹或自动重新导出；OTA 的原生 API 兼容性由发布者按平台和 App 版本负责。
