# app_ota

OTA 的类型、JS 接口、原生客户端、下载器、工厂及 C 编解码器统一放在本模块维护。
`nativeBuild: "host"` 表示它随原生 App 编译，启动前就能选择更新包。
Android 使用 Kotlin + JNI，iOS 使用 Swift + Objective-C；共享 codec 由宿主链接，
不需要迁入 ValdiRuntime。

```text
app_ota/
  src/                    强类型 OtaHost、状态模型和 Promise 接口
  android/                Kotlin 客户端、下载和工厂
    cpp/                  JNI 和 CMake 构建入口
    ota.gradle            生成 APK 内的 OTA 配置和单测源码接入
  ios/                    Swift 客户端、工厂和模块资源提供器
    project.yml           codec 静态库、应用链接和 OTA 配置生成阶段
  native/                 共享 C codec、vendor、许可证和测试
  tests/android/          随模块接入的 Android 客户端和 split 单测
  module.json             平台依赖、工厂和构建声明
```

## 启用与使用

1. 在根 `package.json` 的 `valdi.modules` 中保留 `app_ota`。
2. Android 的 `app/build.gradle.kts` 保留末尾按模块选择加载 `android/ota.gradle`
   的接线。Kotlin 源码、JSON 依赖、工厂和 CMake 会按模块声明接入。
3. iOS 执行 `node scripts/ios-project.mjs`，生成的 `Modules.yml` 会引入本模块的
   `ios/project.yml`，包含 codec 目标、依赖和配置生成阶段。
4. 宿主 `runtime/ValdiHost.kt` / `Runtime/ValdiHost.swift` 在创建 runtime 前调用
   `ValdiOta.start(...)`，把返回值交给 `customModuleProvider`；成功完成 StartApp
   和路由解析后后台调用 `ValdiOta.checkForUpdate()`。
5. 宿主 `navigation/AppRoot.kt` / `Navigation/AppRoot.swift` 读取 tab 等原生图片时，
   先调用 `ValdiOta.image(...)`，再回退到安装包资源。

现有模板已包含这些调用。Android 保留 `io.valdiroutes.app` 包名和 JNI 类名，
iOS 保留现有 ObjC 名称；移动文件不改变原生接口身份。
工厂由生成的模块注册代码负责，宿主无需再手动注册 `OtaModuleFactory`。

```ts
import { getInfo, checkForUpdate } from 'app_ota/src';

const current = await getInfo();
const afterCheck = await checkForUpdate();
// afterCheck.pendingBundleVersion 在下次冷启动生效。
```

Release 构建配置 Android `-PvaldiOtaUrl=https://updates.example.com/app`，
iOS 配置 `VALDI_OTA_URL`。Debug 或空 URL 使用安装包内容，不检查远端更新。
签名密钥、发布命令、版本和协议见 [OTA 使用说明](../../../docs/ota.md)。

## 完整停用

启停时手动调整宿主即可：

1. 移除业务代码中对 `app_ota/src` 的导入和调用，再从根 `valdi.modules` 删除 `app_ota`。
2. Android `ValdiHost.kt` 删除 `ValdiOta.start(app)` 和后台检查调用，
   创建 `ValdiRuntimeManager` 时省略 `customModuleProvider` 参数；没有其他使用时移除
   `kotlin.concurrent.thread` 导入。`AppRoot.kt` 删除 `ValdiOta.image(...)` 及文件图片分支，
   保留内联图片和 `painterResource` 安装包资源路径。
3. iOS `ValdiHost.swift` 删除 `ValdiOta.start()`、`customModuleProvider` 赋值和后台检查；
   `AppRoot.swift` 的图片读取直接使用现有 `UIImage(named:in:compatibleWith:)` 安装包路径。
4. 重新生成绑定和工程并构建：

   ```sh
   node tools/valdi-rolldown/node_modules/tsx/dist/cli.mjs \
     tools/valdi-rolldown/codegen.ts \
     --kotlin-out android/app/generated/valdi \
     --objc-out ios/Generated/valdi --objc-framework ValdiRuntime \
     --cpp-modules-out valdi/modules
   node scripts/native-modules.mjs
   node scripts/ios-project.mjs
   pnpm build:android
   pnpm build:ios
   ```

iOS 命令在 macOS 执行。模块停用后，它的工厂、平台源码、JSON 依赖、CMake 目标、
iOS codec 目标、配置生成阶段和 Android OTA 单测退出构建。模块目录可以保留，也可以删除。
Android 按选择加载的 Gradle 接线可保留；完全删除 OTA 时也可以一起移除。

只把 URL 设为空会关闭在线更新，仍保留整个模块。完整移除使用上述步骤。
本模块是宿主实现，单独启停或修改它只需重新构建 App；
同时修改 runtime、Polyglot C++ 或其模块选择时才需要手动重新导出 AAR / XCFramework。
没有额外的项目级 prebuild。

根 `scripts/ota*.mjs`、发布脚本和 `ota/` 下的密钥、工具、构建及发布产物属于发布工具和工作数据，
不编译进 App；保留这些目录不代表 OTA 客户端启用。

## 验证

```sh
python3 android/app/src/test/ValdiOtaRun.py
sh ios/Tests/run-ota-client-tests.sh
sh valdi/modules/app_ota/native/tests/run.sh
```

完整平台客户端测试需要本机 `hdiffz`，可通过 `VALDI_HDIFFZ` 指定；
Android `OTA_FULL_ONLY=1`、iOS `OTA_TEST_WITHOUT_CODEC=1` 可单独验证无 codec 的路径。
