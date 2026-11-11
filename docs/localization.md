# Inline 本地化

Node 构建、编辑器和 `pnpm dev` 支持官方 Inline localization：每个模块维护
`strings/strings-*.json`，生成的 `src/Strings.ts` 调用
`valdi_core/src/LocalizableStrings` 的 `buildInlineModule`。JSON 随模块归档，
语言选择、模板替换和字符串缓存由官方 `valdi_core` 实现处理。
这是默认提供、由业务按需采用的构建能力；没有 `strings/strings-*.json` 的模块沿用原构建流程。
主页已接入中英文切换，文案位于 `app_pages/strings/`；
现有其他功能文案没有做全量翻译迁移。

## 模块文件与使用

在根 `package.json` 的 `valdi.modules` 中启用的模块下添加：

```text
valdi/modules/example/
  src/
  strings/
    strings-en.json       # 必需：定义访问器与参数的基准，也是官方默认回退语言
    strings-zh-CN.json    # 可选翻译，使用连字符分隔 locale
```

`strings-en.json` 使用官方字符串记录格式，而不是直接的 key/string 映射：

```json
{
  "screen_title": { "defaultMessage": "Example" },
  "welcome_user": { "defaultMessage": "Hello, {name}" },
  "item_count": { "defaultMessage": "{count%d} items" }
}
```

对应的 `strings-zh-CN.json`：

```json
{
  "screen_title": { "defaultMessage": "示例" },
  "welcome_user": { "defaultMessage": "你好，{name}" },
  "item_count": { "defaultMessage": "{count%d} 项" }
}
```

在业务 TS / TSX 中使用默认导出。跨模块导入沿用模块路径，模块内也可使用相对路径：

```ts
import Strings from 'example/src/Strings';

Strings.screenTitle();          // string；无参数文案也是方法
Strings.welcomeUser('Alex');    // string 参数
Strings.itemCount(3);           // number 参数
```

英文文件的 key 决定访问器；下划线 key 转为 camelCase，例如 `screen_title` → `screenTitle`。
生成的 TypeScript 接口检查 key、参数数量与类型。`{name}` / `{name%s}` 为 `string`，
`{count%d}` 为 `number`；参数按占位符出现顺序传入。翻译中同一 key 的占位符名称、
类型和出现顺序必须与英文一致，因为官方 Inline resolver 按位置替换。
非法 JSON、缺少英文基准、格式错误、访问器重名和参数不一致会使生成失败。

生成文件位于 `tools/valdi-rolldown/.gen/<module>/src/Strings.ts`，通过模块的生成目录映射为
`<module>/src/Strings`；不要在模块的手写 `src/` 下再放同名 `Strings.ts` / `Strings.d.ts`。
没有约定 JSON 的模块不生成访问器；删除最后一个 JSON 会清理本工具拥有的旧生成文件，
仍然引用它的代码需要同步修改。

## 编辑器与日常开发

日常开发直接在仓库根目录运行：

```sh
pnpm dev         # 首次构建自动生成 Strings，随后监听 src/、res/、strings/
```

不需要每次修改翻译后手动生成。只打包时运行：

```sh
pnpm build       # 类型检查并打包 TS 与 Inline JSON，也会自动生成 Strings
```

完整 Valdi 类型和实际编译仍要求先运行 `node scripts/prepare-valdi.mjs`。
仅修改文案或占位符不需要重新导出原生运行时。

dev 监听 JSON 的新增、修改、删除以及 `strings/` 目录变化；重建前更新生成文件，
并刷新引用该访问器的 TypeScript 程序。纯文案变化可能保持生成的接口和 TS 文件不变，
但会更新归档 JSON 与 `src/Strings.js` 的内容摘要，让 dev 发送访问器变更，
供运行时重载后重新建立官方 resolver 的 JSON / 字符串缓存。
验证失败时修复 JSON 或调用方，再保存重试；不要手改生成文件来绕过错误。

界面更新沿用 Valdi 官方开发热重载：运行时先替换 JSON 与 JavaScript 资源，
`ModuleLoader` 卸载变更的 `Strings` 模块及依赖它的模块，再由
`RootComponentsManager` 的热重载回调重建受影响页面的组件树并重新渲染。
页面不需要额外订阅翻译变化；这也不保证保留组件内部的临时状态。
这是开发文件更新触发的刷新，与运行中调用 `overrideLocales()` 手动切换语言不同；
运行中的语言切换由下面的 Zustand 订阅通知页面刷新。

## 按需手动切换语言

官方 `overrideLocales(Strings, () => [Locale.parse('zh-CN')])` 只修改传入的 `Strings` 的语言解析器，
并清除其字符串缓存，不会自动通知页面渲染，也不会修改其他模块的 `Strings`。
`app_pages/src/services/localization.ts` 先调用它，再更新项目已有的 Zustand store 通知订阅页面，
页面调用 `setState` 刷新，并用 `registerDisposable` 在销毁时自动取消订阅；
主页的语言区域提供 English、简体中文与跟随系统三个选项。

若要让多个已打开或缓存页面一起刷新，需要业务共享语言状态，并由相关页面订阅更新，
分别触发渲染。主页已经接入；选择在本次 JS 模块生命周期内保留，没有做跨启动持久化。
`removeOverrideLocales(Strings)` 可恢复官方默认语言解析，调用后同样需要触发渲染。
已有字符串值不会自动变化，渲染时应重新调用 `Strings` 的访问器。

## npm i18n

官方 Inline 是可选的文案解析方案。业务也可以使用 npm i18n 库管理文案与语言匹配，
并通过现有 Zustand store 通知页面刷新。

## 官方语言匹配

默认使用官方 `LocaleResolver`：优先读取设备 locale 列表，列表为空时尝试 `Intl`，
依 locale 优先顺序匹配语言，同优先级下语言加地区的匹配优先于仅语言匹配；
没有匹配语言或没有 locale 时回退到英文。没有另建应用层语言匹配算法。

英文回退是**选择整个 locale 文件**时的规则，不是逐 key 的英文补齐。
若选中的翻译文件没有某个英文 key，官方字符串模块返回该 key；因此发布前应补齐翻译。
当前官方匹配器按语言与地区评分，不单独按 script 评分；文件名允许带 script
不代表提供额外的 script 优先级。
官方 resolver 会缓存已选择的 JSON 和解析后的字符串。主页可以手动切换语言，
没有添加自动响应系统语言变化的应用逻辑。

## 原生构建、Release 与 OTA

`node_valdi_module` 自动把本模块 `strings/strings-*.json` 声明为 debug / release
action 输入，并随模块依赖传递；已有 BUILD 不需要逐个补上 strings。
可选 `strings` 参数只覆盖 Bazel 的输入声明，Node 编译器仍按约定目录发现 JSON。
Gradle 的模块打包和绑定检查输入也包含这些 JSON，文件新增、修改、删除会改变输入集合或内容。
iOS 的现有模块编译、绑定检查与打包阶段设置了 `basedOnDependencyAnalysis: false`，
每次构建都会执行，不需要为字符串增加 Xcode 输入清单。

Debug / Release 都把原始 JSON 保留为 `.valdimodule` 内的 `strings/strings-<locale>.json`；
Release 只对 JavaScript 条目生成 Hermes 字节码，JSON 仍供官方 Inline resolver 按归档路径读取。
Bazel 适配器在临时模块中准备字符串输入，并把生成访问器放到输出的
`resources/ts/src/Strings.ts`，供依赖模块编译使用。
OTA 随其负责更新的模块归档携带这些 JSON，不额外生成原生资源或另行下发翻译文件。
当前只有 `app_pages` 参与 OTA；其他模块中的字符串随原生安装包交付，见 [OTA 说明](ota.md)。

## 范围与验证边界

本能力不生成 Android `strings.xml` 或 iOS `Localizable.strings`，不添加原生文本桥
或全 App 文案替换。宿主原生界面仍使用原有文本。
主页接入已通过模块构建、iOS Simulator 构建，以及中文 locale 的 iOS 模拟器录制和完整回放：
English → 简体中文 → English → 跟随系统，均检查了实际问候文案。
回放文件为 `.argent/e2e/home-language-switch-20261110.yaml`；
其中跟随系统的断言要求设备默认 locale 匹配中文。
Android 测试模拟器出现启动超时与系统磁盘 I/O 错误，本次没有完成 Android 页面验证；
没有验证 OTA 冷启动或运行期间系统 locale 变化。
