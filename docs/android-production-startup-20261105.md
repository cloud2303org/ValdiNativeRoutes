# Android 生产配置启动测量 · 2026-11-05

已构建并在 Windows `valdi_test` AVD 验证生产优化配置：Valdi `production` / `-c opt` / `--strip=always`，Android arm64，Release Hermes 模块，R8 Release 宿主。仍使用项目的本地测试签名。完整源码、日志与产物索引在 `/tmp/valdi-production-startup-20261105/validation-final.json`。

## 实际构建与包绑定

- Framework pin: `f5b41aed4780dab6899d74ca755acb411879a315`，包含当前 ClientSQL/Drizzle 补丁。
- Android 配置依赖选中 `hermes_lean`。HermesJavaScriptContext.cpp 实际编译命令包含 `-Oz`、`-DNDEBUG`、`-DHERMESVM_LEAN`，没有 `HERMES_API` 或开发 debugger 宏。Hermes 版本仍为 `260318099.0.4`。
- Valdi 原生构建通过，约 500 秒。宿主第一次构建因 Google Maven activity 1.0.0 下载 EOF 失败；复用同一 URL 的本地已缓存文件后重试通过。未绕过依赖或检查。
- 从最终 APK 实际解包检查 16 个模块、248 个 JavaScript 条目，均为 Hermes HBC 99，没有 raw JS 条目。
- JVM 测试 80 通过、9 跳过、0 失败/错误。源码计时审查无具体 P1/P2；这不替代运行证据。
- 原 APK 73,438,454 bytes，新 APK 41,598,047 bytes。原 APK 已是 R8 Release 宿主，但含 Debug Valdi native；这是两种实际包的比较，不是纯 Hermes 单因素收益。
- APK 中 arm64 Valdi 库从 44,666,320 降至 13,084,848 bytes；其他打包原生库大小保持一致。新 APK 的库哈希与导出 AAR 完全一致。
- 新 APK SHA256: `2cfb26b9e544c16090661a4a8687b6a3103b28d666a34a6788bb84cfd4398a81`。Windows 已安装文件哈希一致。只导出/打包 arm64，和 App 的 abiFilters 一致；不能用三 ABI 旧 AAR 与单 ABI 新 AAR 的 ZIP 大小当作出货收益。

## 条件与时钟

Windows AVD `127.0.0.1:15555`，Android API 36，x86_64/arm64-v8a，实际 App 为 arm64，经过 ARM64 转译。本轮保留登录、数据库和系统文件缓存，先做一次不计入统计的预热，再用同一条 Argent 路径重启进程三次。PID 分别是 32636、2858、4432；都不同于各自之前的 PID。构建在测量前结束，未操作 Meizu/iOS。

阶段用设备 `elapsedRealtimeNanos()`，进程起点使用 `Process.getStartElapsedRealtime()` 的毫秒精度锚点。所有区间的起终点/时长一致。以下是墙上经过时间，不是 CPU 时间。嵌套阶段是包含关系，探针开销未扣除，各行不能相加。`hosts.request_to_js_callback` 包含创建/排队/调度，不能全部当作线程空闲或纯排队。

| 阶段 | 中位数（秒） | 最小–最大（秒） |
| --- | ---: | ---: |
| Application 初始化（包含下列原生子阶段） | 2.589 | 2.073–3.052 |
| 加载 Valdi 动态库 | 1.187 | 0.959–1.616 |
| 注册生成的原生工厂 | 0.168 | 0.163–0.355 |
| 创建 RuntimeManager | 0.357 | 0.323–0.556 |
| 首次取得 mainRuntime | 0.186 | 0.148–0.363 |
| 请求 JS scope → JS 回调（含创建/排队/调度） | 3.512 | 3.240–4.959 |
| 解析 InstallVisionHost 导出 | 1.649 | 1.138–2.773 |
| 解析 StartApp 导出/依赖 | 2.537 | 1.610–3.328 |
| 执行 StartApp | 1.185 | 0.912–2.113 |
| 解码和校验路由 | 0.019 | 0.006–0.021 |
| JS 回调内部总耗时（包含上述 JS 子阶段） | 5.989 | 5.524–6.607 |
| 首页 inflateViewAsync 同步调用 | 0.243 | 0.208–0.307 |
| 首页请求 → Valdi context-render 回调 | 4.764 | 4.574–5.535 |

## 到达时间点与显示边界

- 路由就绪：从进程起点算，中位数 **13.377 秒**，范围 **12.938–14.308 秒**。
- Valdi 首个 context-render 回调：从进程起点算，中位数 **19.904 秒**，范围 **18.916–21.159 秒**。
- 此回调后的首次根视图 dispatchDraw 返回：从进程起点算，中位数 **21.256 秒**，范围 **20.125–22.565 秒**。实际 dispatchDraw 本身中位数只有约 **12 ms**。
- Android 系统 `Displayed` 初始显示指标：中位数 **14.219 秒**，范围 **13.833–15.821 秒**。系统的计时起点和进程锚点不同，且它只表示初始显示，不能当作所有业务内容已绘制。TTID/TTFD 定义参见 Android 官方 App startup time 文档。

源码确认 Valdi inflation completion 在 transaction submission 之前调用，因此上述 root 回调及后续 draw 不证明该事务已应用、GPU 完成或 Home 已呈现。本轮没有添加或制造 `reportFullyDrawn`，没有给出精确的业务可交互 TTFD。Argent 三轮完整回放分别约 57.1、50.9、70.2 秒，其中含远程服务、截图和查询开销，不是 App 启动用时。

## 正常模式可视验证

三次统计回放均 4/4 通过，0 失败/错误/跳过；每次 idle 都因为在 7.5 秒内只读到 1–2 次内容而无法判断是否稳定，警告保留。后续 Calculator 硬身份检查通过；不宣称无警告完整 QA。

另做一次排除在统计之外的正常生产模式回放：把 `log.tag.ValdiStartup` 恢复原空值后重启到新 PID 6573，新 PID 没有计时日志，正常使用原始 ValdiRootView。录屏明确区分重启前旧首页、空白/启动过程、重启后新首页。首个捕获的新首页内容帧显示 top=24/bottom=80，其后 320 个内容视频帧（约 10.6 秒）七个蓝色按钮纵向位置一致，未观察到原先零上安全区补值造成的整页下移。该录像是一个 30fps 捕获观察，不保证拿到全部原生呈现帧，录屏的第 79.3 秒也不是 App 启动耗时。

## 结论与后续测量方向

生产运行库和包体收益明确；这个 Windows 转译环境中的启动仍慢。主要大段是 JS scope 回调前 3.512 秒、JS 回调内部 5.989 秒（含 Vision 导出解析 1.649 秒、StartApp 解析 2.537 秒及执行 1.185 秒），以及页面请求到首个 context-render 回调 4.764 秒。当前探针不足以把这些段再分解成纯计算、类加载、I/O 或调度，也不能单独归因给 Drizzle 或 renderer。无同条件旧运行库对照，不能据此前诊断日志宣称启动加速百分比。

默认计时关闭，可在下次启动前设置 `adb -s 127.0.0.1:15555 shell setprop log.tag.ValdiStartup DEBUG` 开启；INFO 本身默认可记录，所以同时检查 DEBUG。当前已恢复原设置并重新启动正常进程，日志采集和录屏已结束，Argent 服务保留，Windows 停留已登录首页。

本机 `android/app/libs` 当前为生产 runtime 和 release 导出凭据。继续使用 JS 源码/开发调试时需要切回匹配的 Debug 导出。Meizu 本轮未更新。无真机启动时间、功耗、FPS、内存泄漏、完整播放器或生产发行审批结论。
