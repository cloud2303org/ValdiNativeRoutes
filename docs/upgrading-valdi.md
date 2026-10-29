# 同步 Valdi 上游

框架源码维护在 [Valdi fork](https://github.com/cloud2303org/Valdi/tree/valdiroutes) 的 `valdiroutes` 分支。
应用仓库保留页面、原生宿主、Node 编译管线和应用 C++；通过 `valdi/MODULE.bazel` 的
`VALDI_REPOSITORY` / `VALDI_COMMIT` 获取 fork 的完整源码。同一提交的 registry 在 `valdi/.bazelrc` 中固定。
不跟随浮动分支，也不再从应用仓库应用框架补丁。
应用自己的 rules_python 依赖规则补丁和 npm CLI patch 仍在应用仓库，继续计入相应构建输入。

当前上游基线为 `Snapchat/Valdi` 的 `beta-0.2.1`（`f26bee4dc170b6c929f71d4dd07d44e033f47176`）。
初次迁移对应 fork 提交 `4fb1c1af7aacc8b77d2fdb2fc0c38752ae847ef3`；11 项框架修改和 Hermes 构建输入已迁入 fork。
当前固定提交 `67e02521ce5bcf88aa0690e300a3135cb84379a4` 已删除旧 Swift Valdi 编译器及回退实现、C++ toolbox；模块规则固定调用应用的 Node 后端，导出头文件也改用 Node。
补丁到提交的对应关系、后续同步要求见 fork 的 [VALDI_FORK.md](https://github.com/cloud2303org/Valdi/blob/valdiroutes/VALDI_FORK.md)。

## 先在框架 fork 合并上游

在 fork 的干净 checkout 中执行；应用工作区有未提交内容时，使用独立 clone / worktree：

```sh
git remote add upstream https://github.com/Snapchat/Valdi.git  # 首次配置
git fetch upstream --tags
git switch -c upgrade/valdi-TAG origin/valdiroutes
git merge --no-ff TAG
```

解决源码冲突，逐项判断 Hermes、资源加载和导出规则的自定义修改是否仍然需要。
上游已实现的修复可以移除对应自定义代码；需要保留的改动按新 API 适配。
更新 fork 的 `VALDI_FORK.md` 上游基线记录，推送升级分支，取得完整的 40 位 commit SHA。
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

`pin` 只接受不可变的完整 commit SHA，验证源码仓库与 registry 原 pin 一致后才同时修改两处。
内部 Bazel 子模块共用相同 archive URL / prefix。源码准备会获取 fork，并由 Bazel 更新 lockfile。

按下表适配 Node 移植部分，再重新导出 Android/iOS 运行时、准备视觉依赖，运行
`pnpm build:android`、`pnpm build:ios`。提交应用 pin、registry、lockfile 和适配代码；CI 与设备验证通过后，
合入 fork 的维护分支及应用 `main`。框架提交变化会触发运行时重新导出，即使迁移前后源码行为一致。

| 维护位置 | 升级时关注的内容 | 验证方式 |
| --- | --- | --- |
| fork 的框架源码和 `third-party/hermes_v1/` | 11 项自定义修改、Hermes 版本/API、原生导出规则 | 源码合并、运行时导出与设备验证 |
| `tools/valdi-rolldown/hermes.ts`、工具 package/lock | fork 中的模块包装/文件头、Hermes 编译设置和版本 | 固定官方 compiler 版本，协议检查和 Release 装载验证 |
| `tools/valdi-rolldown/vendor/companion/` | fork 的 `compiler/companion/src/` JSX 转换语义 | 差异报告、ESM 导入适配、源码审查 |
| `tools/valdi-rolldown/codegen/` | Swift parser、models、Kotlin/ObjC/C++ 生成器和模板 | 移植语义，对比 fork 中提交的 golden |
| fork 的 `bzl/valdi/`、应用 `valdi/bzl/node_compiler/`、`tools/valdi-rolldown/runtime-module.ts` | Node 规则输出声明、provider、内置模块配置；保留旧编译器源码删除 | 七模块真实编译、44 文件 golden、两端 runtime 导出、action graph 和设备验证 |
| `tools/valdi-rolldown/{pipeline,valdiTs,archive,resources}.ts` | 模块归档、运行时加载和资源协议 | 适配测试、Debug/Release 模块与设备检查 |
| `valdi/modules/app_pages/src/sqlgen/`（过渡源码） | 原生 SQLite 连接和事务接口 | Drizzle 接入前保留文件标识和存储行为 |
| `valdi/patches/@snap__valdi@1.2.1.patch` | npm CLI 的 Bazel 参数和 export 行为 | CLI 独立升级时审查 patch 和 pnpm lock |
| `android/`、`ios/`、`valdi/native/` | 框架 API、模块注册、生成绑定 ABI | 匹配运行时编译、设备验证 |

golden 使用 fork 中已提交的编译器输出，不运行 Swift 编译器。
构建与 golden 不覆盖全部运行时行为；Release / OTA 使用前另外检查精简 Hermes、字节码、图片及原生桥接。
