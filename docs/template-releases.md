# 下载模板与升级

根目录 `package.json` 的 `version` 是模板发行版本。
它不修改 Android `versionName`、iOS `MARKETING_VERSION` 或 OTA `bundleVersion`。
模板版本发布后保留原 tag；修复使用新的版本和 tag。

## 使用下载的版本

从 GitHub Releases 下载 `ValdiNativeRoutes-v<版本>.zip` 或 `.tar.gz` 并解压。
发布包中的 `TEMPLATE_RELEASE.json` 记录对应源码提交和框架 / 编译器版本。
文件校验和在同页的 `SHA256SUMS` 中。

先修改根目录 `package.json`：

- `valdi.app.name` 和 `displayName`：应用名和显示名称。
- `valdi.app.android.applicationId`：Android 安装包 ID。
- `valdi.app.ios.bundleIdentifier`：iOS Bundle ID。
- `valdi.app.icon`：图标 PNG，默认 `assets/app-icon.png`。
- 初次保留 `native.androidNamespace` / `native.iosPrefix`；
  它们与已有原生源码、JNI 和类型名关联，不会自动重命名。
- 初次保留 `valdi.modules`，之后按业务依赖调整。

```sh
pnpm install --frozen-lockfile

# 新应用需要 OTA 时，在第一次构建前生成自己的密钥：
node scripts/ota.mjs keygen

# 手动导出所需平台的 Debug runtime（获取固定框架源码并生成绑定）：
scripts/export-android.sh debug
# 或 macOS：
scripts/export-ios.sh debug

pnpm android
# 或 macOS：
pnpm ios
```

需要 Node 24 和项目固定的 pnpm。Android 还需要 JDK 17、Android SDK
和 Bazel；iOS 还需要 macOS、Xcode、XcodeGen。
运行时由上述脚本手动导出；原生构建自动准备已启用模块声明的依赖并编译模块库和宿主源码。
Windows 使用 `scripts/windows/export-android.ps1 -Config debug`。
HDiff 桌面工具仅差分发布时需要；可提前运行 `pnpm ota:tool`。
平台详细前置条件见 `build-and-ci.md` 和 `windows-native-build.md`。

源码包可直接用于开发，但不包含依赖缓存、OTA 私钥、APK / IPA
或预编译运行时。下载后仍需安装依赖和首次原生构建。

## 保留后续升级路径

长期维护的应用建议从固定 tag 克隆，而不是删除 Git 历史：

```sh
git clone --branch v0.1.0 https://github.com/cloud2303org/ValdiNativeRoutes.git MyApp
cd MyApp
git remote rename origin template
git switch -c main
# 再把自己的仓库添加为 origin。
```

新版本发布后，在干净的升级分支中选择对应 tag 合并：

```sh
git fetch template --tags
git switch -c upgrade/template-next
git merge <新的模板tag>
pnpm install --frozen-lockfile
pnpm test
scripts/export-android.sh debug
pnpm build:android
# macOS 下还验证 iOS：
scripts/export-ios.sh debug
pnpm build:ios
```

合并仍需审查业务与模板代码的冲突。当前没有自动 SDK 升级器，
`scripts/upstream.mjs pin` 只切换 Valdi fork，并不更新整个模板。
从 ZIP 建立的新仓库不会自动拥有模板的公共 Git 历史；
发布元数据保留了来源提交，但不等于能自动无冲突地合并。

## 维护者发布

1. 更新根 `package.json` 的模板版本。
2. 编写 `docs/releases/v<版本>.md`。
3. 完成测试和相应原生构建，提交并推送源码。
4. 创建与版本一致的 `v<版本>` tag 并推送。

`Template Release` workflow 测试打包逻辑，从 tag 的精确提交生成
ZIP / tar.gz、版本元数据和校验和，然后发布到 GitHub Releases。
打包不读取工作区中的依赖缓存和未提交文件。
常规分支 CI 负责完整测试及原生构建；Release workflow 不重复执行原生构建，
也不会把源码发布成功当作所有平台的运行验证。

本地预览发行包：

```sh
pnpm release:pack --ref v0.1.0 --out .release
```

输出目录必须不存在。此命令只打包，不提交、不推送、不上传。
