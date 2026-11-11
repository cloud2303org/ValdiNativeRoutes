# 同步 Valdi 上游

框架源码维护在 [Valdi fork](https://github.com/cloud2303org/Valdi/tree/valdiroutes) 的 `valdiroutes` 分支。
应用仓库保留页面、原生宿主、Node 编译管线和应用 C++；通过 `valdi/MODULE.bazel` 的
`VALDI_REPOSITORY` / `VALDI_COMMIT` 获取 fork 的完整源码。同一提交的 registry 在 `valdi/.bazelrc` 中固定。
不跟随浮动分支。应用不选择或链接 ClientSQL，不集成 Drizzle 或替代 SQL 引擎；
两个 Bazel workspace 直接获取固定 fork，不再应用 ClientSQL 原生扩展补丁。
fork 中未被应用选择的上游模块源码继续保留。应用自己的 rules_python
依赖规则补丁和 npm CLI patch 仍在应用仓库，继续计入相应构建输入。

当前上游基线为 `Snapchat/Valdi/main` 的 `b527b091ea98b4952b1a525388d0c0b66ca04940`
（2026-11-08）；应用使用的 fork 提交以两个 workspace 的 `VALDI_COMMIT` 为准。
本次通过 `git pull --no-rebase` 完整合入上一基线 `9b7a20d5` 之后的 32 项提交，
包括实验性 SDL3 Linux 宿主和计算器、Protobuf 单字段读取与解码配置、
Android 手势和日期格式更新、iOS worker 枚举、Promise 回调归因，以及 ClientSQL
关闭最后一个连接后重新打开时的 schema 缓存修复。
此前合入的官方 Web renderer、浏览器开发工具和 Web 测试继续保留。
框架继续使用 Hermes `260318099.0.4`，保留原生 Promise/字节码边界、OTA 资源钩子和 Windows 工具链修复。
旧 Swift Valdi 编译器、回退实现及 C++ toolbox 继续删除；模块编译和导出头文件使用应用的 Node 后端。
TGFX 实验单独保存在 fork 的 `experiment/tgfx-prototype-20261104` 分支，未合入维护分支。
补丁到提交的对应关系、后续同步要求见 fork 的 [VALDI_FORK.md](https://github.com/cloud2303org/Valdi/blob/valdiroutes/VALDI_FORK.md)。

## 先在框架 fork 合并上游

在 fork 的干净 checkout 中执行；应用工作区有未提交内容时，使用独立 clone / worktree：

```sh
git remote add upstream https://github.com/Snapchat/Valdi.git  # 首次配置
git switch valdiroutes
git config pull.rebase false
git pull --no-rebase --no-ff upstream main
```

这样保留双方历史并产生 merge commit。需要先验证再提交时，给 `pull` 加上 `--no-commit`，
检查完成后执行 `git commit`。浅克隆需要先补齐共同祖先所需的历史。
分支继续跟踪 `origin/valdiroutes`，同步官方改动时显式指定 `upstream main`。

解决源码冲突，逐项判断 Hermes、资源加载和导出规则的自定义修改是否仍然需要。
上游已实现的修复可以移除对应自定义代码；需要保留的改动按新 API 适配。
更新 fork 的 `VALDI_FORK.md` 上游基线记录，推送 `valdiroutes`，取得完整的 40 位 commit SHA。
维护分支保留提交历史；不要通过强制同步覆盖自定义提交。

## 在应用 CI 试跑 fork 提交

GitHub Actions 的 **Application CI → Run workflow** 选择应用分支：

- `valdi_commit` 留空：验证应用已固定的 fork 提交。
- 填入完整的 fork commit SHA：只在 runner 中一起切换源码和 registry，运行相同的 npm、Android、iOS 任务。
- `widgets_tag` 可选，填写 `valdi_commit` 时可一并指定；默认保留现有 Widgets 版本。

试跑不会提交、推送、改写本地 pin 或更新 vendored 源码。框架 fork 中的上游 Actions 保持关闭，
验证入口在应用 CI，不执行上游整套示例构建或发布流程。

每条任务的 `app-<target>-<run id>` artifact 包含：

- `prepare.log`：源码获取、依赖解析失败的位置。
- `upstream-pin.diff`：候选 fork commit、registry 和解析后 `MODULE.bazel.lock` 的变化。
- `upstream/vendor.md` 和 `.diff`：应用使用的 companion 文件与 fork 源码的差异。
- `test.log`：Kotlin、Objective-C、C++ golden 差异及适配测试。
- `export.log`、`build.log`：运行时和宿主构建结果；原生任务还包含 APK 或模拟器 App。

报告产生 warning 供审查，不自动接受差异。报告只比较已有 vendored 文件；上游新增文件、绑定生成语义
仍需源码审查。绑定 golden、编译错误会使任务失败。

## 在应用升级分支落地

从最新 `main` 建立干净的升级分支，执行：

```sh
node scripts/upstream.mjs pin <FORK_COMMIT> [WIDGETS_TAG]
pnpm install --frozen-lockfile
node scripts/prepare-valdi.mjs
node scripts/upstream.mjs report
pnpm test
pnpm build
```

`pin` 只接受不可变的完整 commit SHA，验证源码仓库与 registry 原 pin 一致后同步修改
`valdi/` 和 `module-build/` 中的源码 pin 与 registry。
内部 Bazel 子模块共用相同 archive URL / prefix。源码准备会获取 fork，并由 Bazel 更新 lockfile。

按下表适配 Node 移植部分，再手动重新导出 Android/iOS 运行时，运行
`pnpm build:android`、`pnpm build:ios`。提交应用 pin、registry、lockfile 和适配代码；CI 与设备验证通过后，
落地应用 `main`。已启用模块的视觉等原生依赖由原生构建自动检查并按需准备。
框架提交变化后应主动重新导出运行时，即使迁移前后源码行为一致；构建不计算源码指纹或自动重新导出。

| 维护位置 | 升级时关注的内容 | 验证方式 |
| --- | --- | --- |
| fork 的框架源码和 `third-party/hermes_v1/` | 现有自定义修改、Hermes 版本/API、原生导出规则 | 源码合并、运行时导出与设备验证 |
| `tools/valdi-rolldown/hermes.ts`、工具 package/lock | fork 中的模块包装/文件头、Hermes 编译设置和版本 | 固定官方 compiler 版本，协议检查和 Release 装载验证 |
| `tools/valdi-rolldown/vendor/companion/` | fork 的 `compiler/companion/src/` JSX 转换语义 | 差异报告、ESM 导入适配、源码审查 |
| `tools/valdi-rolldown/codegen/` | Swift parser、models、Kotlin/ObjC/C++ 生成器和模板 | 移植语义，对比 fork 中提交的 golden |
| fork 的 `bzl/valdi/`、应用 `valdi/bzl/node_compiler/`、`tools/valdi-rolldown/runtime-module.ts` | Node 规则输出声明、provider、内置模块配置；保留旧编译器源码删除 | 选中模块的真实编译与 golden、两端 runtime 导出、action graph 和设备验证 |
| `tools/valdi-rolldown/{pipeline,valdiTs,archive,resources}.ts` | 模块归档、运行时加载和资源协议 | 适配测试、Debug/Release 模块与设备检查 |
| `valdi/patches/@snap__valdi@1.2.1.patch` | npm CLI 的 Bazel 参数和 export 行为 | CLI 独立升级时审查 patch 和 pnpm lock |
| `android/`、`ios/`、模块 `cpp/` | 框架 API、模块注册、生成绑定 ABI | 匹配运行时编译、设备验证 |

golden 使用 fork 中已提交的编译器输出，不运行 Swift 编译器。
构建与 golden 不覆盖全部运行时行为；Release / OTA 使用前另外检查精简 Hermes、字节码、图片及原生桥接。

## Web 与原生的升级边界

保留 fork 的完整官方 Web 源码和测试。原生运行库导出的 `enable_web` 仍为空；
浏览器输出通过独立 Node 入口验证，不能给原生模块编译规则打开 Web 开关后就认为浏览器包已生成。
`web_renderer` 的假 DOM 单元测试、真实浏览器 bootstrap 和应用硬件服务的浏览器实现分别验证。
运行 `pnpm build:web` 可使用当前准备好的固定版本源码打包官方 HelloWorld；
输出位于 `tools/valdi-rolldown/web/.local/dist/`。入口、官方 renderer 测试及通用 Bazel Web
导出尚未接通的边界见 `tools/valdi-rolldown/web/README.md`。

本次上游新增 `runtime.withCallbackAttribution`，并要求
`withGlobalNativeRefs(attribution, callback)` 提供来源标记。更新后的模块必须与本次原生运行库一起发布；
旧 AAR/XCFramework 不能作为新模块的兼容性验证。
`ValdiRuntimeProvider` 的 Web 引导保留原生 runtime 检测，带 `location` 的原生 worker 不会因此误启浏览器运行时。
