# 同步 Valdi 上游

本项目通过 Bazel archive 依赖 Valdi。我们自己的应用、Node 编译管线、宿主和运行时补丁在本仓库，
升级时切换依赖版本并适配这些改动。上游的整套 CI、Swift 应用编译入口和 npm 发布流程无需复制过来。

## 先在 CI 试跑

在 GitHub Actions 的 **Application CI → Run workflow** 中选择包含当前修改的分支：

- `upstream_tag` 留空：验证仓库已固定的版本。
- 填入明确的 Valdi tag：只在 runner 中切换 Valdi 和 registry，保留我们的全部补丁，跑相同的三条任务。
- `widgets_tag` 可选，只有填写 `upstream_tag` 时使用；默认保留现有 Widgets 版本，它是独立项目。

试跑不会提交、推送、改写本地版本或更新 vendored 源码。下载每条任务的 `app-<target>-<run id>` artifact：

- `prepare.log`：下载、模块解析和补丁应用失败的位置。
- `upstream-pin.diff`：版本、registry 和该任务解析后的 `MODULE.bazel.lock` 变化。
- `upstream/vendor.md` 和 `.diff`：我们使用的 companion / ClientSQL 文件与候选上游的差异。
- `test.log`：Kotlin、Objective-C、C++ golden 差异，以及构建前置检查测试。
- `host-tools.log`、`export.log`、`build.log`：匹配工具、运行时和宿主构建结果。

companion 的 TypeScript / source-map 默认导入适配会先归一化，因此当前版本应为 0 处差异。
报告只比较我们已有的 vendored 文件；上游新增文件、代码生成语义和依赖变化仍需阅读源码。
报告产生 warning，供升级审查使用，不自动接受变化。补丁冲突、golden 差异和构建错误会直接使任务失败。

## 在升级分支落地

1. 在升级分支运行 `node scripts/upstream.mjs pin <VALDI_TAG> [WIDGETS_TAG]`。
   脚本一起修改 `valdi/MODULE.bazel` 的 `VALDI_TAG` 和 `valdi/.bazelrc` 的 registry URL；
   内部子模块的 archive 已共用 `VALDI_URL` / `VALDI_PREFIX`，无需逐个换版本。
2. 运行 `pnpm install --frozen-lockfile`、`node scripts/prepare-valdi.mjs`。
   Bazel 应用 `valdi/bzl/patches/valdi/` 中的补丁并刷新 lock。补丁已被上游实现时，核对语义后从
   `MODULE.bazel` 移除对应条目和补丁文件；仍需保留的改动则重新适配。不要为了通过 fetch 直接删掉冲突补丁。
3. 运行 `node scripts/upstream.mjs report`，查看 `.ci/upstream/`。
   按下表同步真正发生变化的部分，然后运行 `pnpm test`，审查 golden 差异和生成绑定。
4. 在 `valdi/` 构建 toolbox 和 SQLite validator（命令见 README），然后在根目录运行 `pnpm build`。
   重新导出两端运行时，准备视觉依赖，运行 `pnpm build:android`、`pnpm build:ios`。
5. 提交源代码、补丁、版本 pin 和更新后的 `valdi/MODULE.bazel.lock`；通过正常 PR CI 后，再在设备上检查
   导航、输入、图片、SQL、原生桥接和热重载。Release / OTA 使用前另外验证匹配配置的运行时与 Hermes 字节码。

| 我们维护的位置 | 升级时关注的上游内容 | 同步方式 |
| --- | --- | --- |
| `valdi/bzl/patches/valdi/` | 补丁目标文件、Hermes VM/编译器接口、导出规则 | 保留补丁栈，逐个判断保留、改写或移除 |
| `valdi/third_party/hermes_v1/` | Hermes pin、构建参数、ABI | 与适配补丁一起审查，重新导出运行时 |
| `tools/valdi-rolldown/vendor/companion/` | `compiler/companion/src/` 的 JSXProcessor、AST 及其依赖 | 按报告移植变化，保留 ESM 导入适配和本地声明 |
| `tools/valdi-rolldown/vendor/clientsql/` | `compiler/clientsql/src/` | 同步使用的 Python 文件，核对 validator 的版本与协议 |
| `tools/valdi-rolldown/codegen/` | Swift 编译器的 parser、models、Kotlin/ObjC/C++ 生成器及模板 | 把语义变化移植到 TypeScript，再对照候选上游 golden |
| `tools/valdi-rolldown/{pipeline,valdiTs,archive,resources,sqlgen}.ts` | 模块归档格式、运行时加载协议、资源/SQL 约定 | 逐项适配我们自己的 Node 管线 |
| `valdi/patches/@snap__valdi@1.2.1.patch` | npm CLI 的 Bazel 参数、export 行为 | CLI 独立升级时核对 patch，更新 pnpm lock |
| `android/`、`ios/`、`valdi/native/` | 原生运行时 API、模块注册、生成绑定 ABI | 用匹配的新运行时编译并进行设备验证 |

golden 使用候选上游源码中已提交的编译器输出，不运行它的 Swift 编译器。
因此 golden 是我们代码生成器的兼容性门槛；它不覆盖所有上游功能，也不能替代运行时、UI、Release 和 OTA 验证。
