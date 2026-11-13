# 三个验证入口修复（2026-11-13）

框架修复已提交并推送为 `70fa9c63a04fbbaa2ddafb53400c0eea6fd5ca27`，基于
`7414d7b3c2e8cd29626c4eb7ea34323a6cd9c9f8`。应用两套 Bazel workspace 的源码和 registry
pin 一起更新。验证结束时应用侧测试、pin、锁文件和文档未暂存、未提交；
这些改动现纳入 `v0.1.4` 源码发行。

## 修复与证据

| 问题 | 修复 | 已验证结果 |
| --- | --- | --- |
| Web 三处 TS2322 | 移除三个私有编码 helper 的 `Uint8Array` 返回注解，让 TS 5.9 保留 `ArrayBuffer` backing 类型；公共接口不变 | 真实源码 50 项检查通过，Web 打包通过；修复前后三处 helper 的发射 JavaScript 逐字节相同 |
| SnapDrawing Bazel 资源定位崩溃 | 使用 `rules_cc` runfiles 和仓库映射；支持目录与 manifest，保留精确 checkout-root fallback；资源缺失给出诊断并退出 1 | 原 Bazel 入口通过；307 项执行通过，保留 1 项原有禁用测试；新增 12 项资源/路径回归 |
| 回调归因测试依赖旧生成器 | 聚焦目标使用真实 Node 生成的四个 Debug 模块归档，经 Bazel runfiles 加载并注册；移除该目标的旧 native module 资源依赖 | 11 项 Hermes 行为测试和 1 项资源注册回归通过；原测试断言和三引擎参数均保留 |

回调测试资源的名称和字节缓冲区由测试环境持有，注册表只借用其地址。
首次复核发现重复 `SetUp()` 会扩容缓冲区并重复注册；新增回归先复现注册数从 4 变为 12、24，
随后通过成功注册后的幂等保护修正。加载失败时不发布部分注册，后续初始化仍可重试。
第二轮只读复核未发现新的具体 P1/P2。

三个原生目标均使用 `--nocache_test_results --gtest_repeat=2
--gtest_recreate_environments_when_repeating=true` 强制执行两轮：

- `@valdi//snap_drawing:test`：每轮 307 项通过，1 项原有禁用。
- `@valdi//valdi:test_callback_attribution`：每轮 12 项通过。当前运行库仅编入 Hermes，
  QuickJS/JSCore 的 22 项沿用原有可用性判断跳过，不算执行通过。
- `@valdi//valdi:test_nsh_runtime`：每轮 2 项通过，验证共享资源规则未破坏原 NativeWeb 测试。

完整根测试通过：508 个 Node 测试、172 个嵌套上游 Jasmine 用例、
新接入的 50 项 Unicode 检查，以及类型检查和 10 组绑定 golden。
Unicode 回归位于 `tools/valdi-rolldown/web-unicode.test.ts`，由根 `pnpm test` 显式传入选定框架路径。

原始日志、XML 与复核相关证据保存在 `/tmp/valdi-three-fixes-20261113/`：

- `web/verification.json`：类型错误 RED/GREEN、推断类型和相同发射代码哈希。
- `node-tests-final.log`：完整 Node、Unicode、类型检查与 golden 结果。
- `snap/bazel-final.log`：实际 SnapDrawing Bazel 入口通过。
- `callback/before.log`：旧静态资源生成入口的分析阶段失败，非行为 RED。
- `callback/repeat-red.log`：新增重复注册回归的实际行为失败。
- `native-repeat-green.log`、`native-results.json`、`*-repeat-green.xml`：三个目标的两轮实际执行。

## 最终固定 archive 验证

以下结果来自实际下载的 `70fa9c63a04fbbaa2ddafb53400c0eea6fd5ca27` archive 和 registry，
不使用本地框架 override：

| 检查 | 结果 | 日志/清单 |
| --- | --- | --- |
| 下载源码 | 123 个变更存续文件与提交一致，6 个删除路径不存在 | `pinned-source-check.json` |
| 标准 `pnpm build:web` | 通过 | `web-pinned.log` |
| 三个原生目标，强制重复两轮 | 全部通过；计数和跳过/禁用范围与上文一致 | `native-pinned.log`、`native-pinned-results.json` |
| `pnpm build` | 通过 | `modules-pinned.log` |
| Android Debug 运行库导出 | 三种 ABI 通过 | `export-android-pinned.log` |
| iOS Debug 运行库导出 | 真机 arm64、模拟器 arm64/x86_64 切片与 Swift 包装通过 | `export-ios-pinned.log` |
| Android Debug APK | 通过 | `host-android-pinned.log` |
| iOS Debug 模拟器 App | 通过 | `host-ios-pinned.log` |
| vendored 源码比较 | 规范化既有导入适配后 0 项差异 | `vendor-pinned/vendor.md` |
| 四处 pin 与两个锁文件 | 一致；锁文件只有预期的 registry 和上游 NDK API 变更 | `final-checks.json` |

根完整测试使用修复后的本地提交源码；该源码已与最终下载 archive 核对一致。
`pinned-status.json` 保存最终命令、工作目录、退出码与日志路径；
`artifacts-final.json` 保存本轮 AAR、XCFramework 切片、APK、App 二进制及 Debug dylib 的 SHA-256 和架构信息。
原生 XML/日志另存为 `*-pinned.xml` / `*-pinned.log`，保留了两轮实际执行输出。

复现三个原生目标的固定版本检查：

```sh
cd valdi
bazel test \
  @valdi//snap_drawing:test \
  @valdi//valdi:test_callback_attribution \
  @valdi//valdi:test_nsh_runtime \
  --config=stable_exec --jobs=10 --test_output=errors \
  --nocache_test_results \
  --test_arg=--gtest_repeat=2 \
  --test_arg=--gtest_recreate_environments_when_repeating=true
```

## 范围

修复针对上述三个入口，不放宽 TypeScript 检查，不恢复旧 Swift 编译器，不替换真实模块或降低原断言。
Unicode 发射代码保持不变；原实现的非空 UTF-32 编码和手动 UTF-8 fallback 功能限制不在本次类型修复范围。
回调资源环境只链接到聚焦测试目标，未改变整个旧 integration suite 的资源机制。
本次没有设备安装、真机/UI 执行或性能测量；原生证据来自主机上的真实编译与测试运行。
