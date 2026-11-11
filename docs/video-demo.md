# 原生视频演示

两端使用 Valdi 官方 `<video>` 接口和应用持有的原生播放器；运行验证范围见文末。

- [HomePage](../valdi/modules/app_pages/src/features/home/HomePage.tsx)：点击「原生视频播放器（MP4 / HLS）」（`video`）。
- App 启动直接进入 Home；该按钮进入 [routes.ts](../valdi/modules/app_pages/src/routes.ts) 的 `video` 路由，显示 [VideoPage](../valdi/modules/app_pages/src/features/video/VideoPage.tsx)「原生视频播放器」。

## 源码已实现

页面使用官方 TSX `<video>` 展示原生画面。`getHost().create(source)` 返回
每个播放器独立的 `VideoPlayer` 原生代理对象；`player.getSource()` 提供不透明的
surface URL。session ID 仅由原生资源表与 loader 使用，不再作为页面命令参数。

- Android：[ValdiHost](../android/app/src/main/java/io/valdiroutes/app/runtime/ValdiHost.kt)
  注册 [VideoLoader](../valdi/modules/app_video/android/VideoLoader.kt)，绑定
  [VideoSession](../valdi/modules/app_video/android/VideoSession.kt) 的 Media3
  `ExoPlayer` / `PlayerView`。
- iOS：[ValdiHost](../ios/ValdiRoutes/Runtime/ValdiHost.swift) 注册
  [VRVideoService](../valdi/modules/app_video/ios/VRVideoService.m)，通过
  `SCValdiVideoLoader` / `SCValdiVideoPlayer` 连接 AVPlayer。
- [VideoHost API](../valdi/modules/app_video/src/VideoHost.ts) 中的 `VideoPlayer`
  和 `VideoSubscription` 都使用 Valdi `@ExportProxy`，由真实编译器生成平台接口。

```ts
const player = await getHost().create(url);
const subscription = await player.subscribe(state => {
  // 同一播放器的原生状态、展示模式、真实进度和结束状态。
});
// <video src={player.getSource()} limitToViewport={false} ... />
await player.play();
await player.pause();
await player.setPlaybackRate(1.5); // 修改偏好倍速，不会让暂停的播放器开始播放。
await player.seekTo(2500);        // 毫秒；重复相同定位也会执行。
await player.setVolume(0);
// 页面退出时，保护该页面的桥接引用，直到原生取消订阅/释放确认完成。
await asyncWithProtectedRefsForContextId(this.renderer.contextId, async () => {
  const unsubscribing = subscription.unsubscribe();
  const releasing = player.release();
  await Promise.all([unsubscribing, releasing]);
});
```

`setVolume(volume)` 两端要求有限数且位于闭区间 `[0, 1]`，含 0 和 1；
`NaN`、正负无穷、负数和大于 1 的值均 reject，保持原音量，不以 clamp 后成功代替。
命令仍先检查播放器是否已释放，再在主线程应用有效值。

同一个对象支持多个独立订阅。订阅先发送当前快照，随后推送原生状态事件；
`unsubscribe()` 只移除对应监听，`release()` 清除所有监听并执行资源释放。
每个播放器的 `sequence` 递增，页面会忽略旧事件；换源和销毁另有 generation 保护。
`getState()` 保留为显式快照接口，演示页面不轮询它。
Valdi 的页面销毁会回收该页面的桥接引用。演示页使用官方
`asyncWithProtectedRefsForContextId` 保护完整的创建/订阅和取消订阅/释放过程，
并由该 helper 在完成或失败后配对解除保护；换源、退出时的迟到结果也在保护范围内清理。
只在销毁时发出异步释放命令还不够，已发往 JS 的回调需要在清理确认前保持可解引用。
这不延长活跃 PiP 对页面回调的持有；原生释放页面所有权时会清除监听。

原生加载、播放意图、实际播放、暂停、定位、错误、结束和展示模式变化驱动状态。
`requestedPlayback` 与 `playing` 分别表示用户意图和实际播放；`loaded`、`ended`
来自原生状态，页面不再以接近视频时长来猜测结束。播放、暂停等 Promise 完成表示
主线程已应用命令，不表示缓冲完成或已出帧。倍速由事件返回的 `playbackRate` 显示。

JS 页面没有状态 `setInterval` 或进度计时器。Android 仍按 250 ms 读取真实播放器
位置上报进度；iOS 使用 AVPlayer 的 250 ms 周期时间观察器。iOS PiP 启动/恢复保留
8 秒/5 秒失败超时，只返回失败，不伪造启动成功或播放完成。完成来自 Media3 的
`STATE_ENDED` 或 AVPlayer 的真实结束通知，定位与时长均使用毫秒。

全屏与 PiP 复用同一播放器和解码器：Android 的
[VideoPresentation](../valdi/modules/app_video/android/VideoPresentation.kt)
移动同一个 `PlayerView`；iOS 全屏的 `AVPlayerViewController` 使用原来的
`AVPlayer`，PiP 使用该播放器的 layer。退出全屏恢复内嵌展示。

Android 内嵌画面启用 Media3 原生控制栏，点击视频可显示播放/暂停、进度和全屏按钮；
原生按钮与 TS 对象控制同一个播放器。内嵌容器实现官方 `ValdiTouchTarget`，按官方 WebView
相同的契约把本地坐标的触摸事件交给原生子视图；普通 `FrameLayout` 不会自动获得这条通路。
PiP 请求时才为该播放器创建 Media3 `MediaSession`，
向系统提供原生媒体控制，退出或失败时释放 session；不新建解码器，也不启动后台播放服务。
PiP 快捷操作使用明确的 Play/Pause 命令，重复 Play 不会变成 Pause。显式播放命令会重新交给
Media3 处理音频焦点，即使 `playWhenReady` 已为 true；普通可见性刷新不会反复重试。

普通页面隐藏或 App 进入后台会暂停，保留播放意图供恢复时协调；前台全屏及原生
PiP 转场有专门的可见性处理。页面销毁或切换片源调用 `release`，清除回调并释放资源；
全屏本身不构成延迟释放的例外。**活跃 PiP** 可以接管生命周期，页面释放后在
PiP 关闭时销毁播放器：
iOS 严格检查 `pictureInPictureActive`，仅请求或等待 PiP 不保留资源；
Android 的 `isLivePip` 还保护已发起的 `pipPending` 系统转场，实际 `mode` 等待
Activity 回调确认，停止/销毁路径负责清理。点击按钮或能力标记不等于 PiP 已启动。

## 片源与边界

初始加载随业务模块 `app_pages` 打包的
[flower.mp4](../valdi/modules/app_pages/assets/flower.mp4)。
Android 通过 [Gradle assets 配置](../android/app/build.gradle.kts) 使用
`asset:///flower.mp4`；iOS 的 [资源配置](../ios/Generated/Modules.yml) 将资源复制进
bundle，业务页面传入 `bundle:///flower.mp4`，由通用
[资源解析器](../valdi/modules/app_video/ios/VRVideoSource.m) 使用
`NSBundle.mainBundle URLForResource:withExtension:` 查找完整文件名，无远程兜底。
Xcode 复制资源时可能将目录展平；这里按 bundle 根资源查找，不拼接源码模块路径。
`VideoHost` 只提供 `create(source)`，不包含演示片源方法，`app_video` 不携带示例资源。
[flower.source.json](../valdi/modules/app_pages/assets/flower.source.json) 记录 MDN
`interactive-examples` 的固定 commit、`live-examples/media/cc0-videos/flower.mp4`
路径及哈希；许可记录为 CC0-1.0，全文保存在
[MDN-LICENSE.txt](../valdi/modules/app_pages/assets/MDN-LICENSE.txt)。本次移动保持原始字节，
回归测试核对 Git blob SHA-1 和文件 SHA-256；本次没有重新构建资源包。

iOS `bundle:///filename` 仅接受一个非隐藏的根资源名：ASCII 字母、数字、`_`、`-`、
`.`，首字符不能为 `.`。目录、相对路径、百分号转义、authority、query、fragment
均拒绝，缺失资源或目录也 reject。此入口用于已打包资源，不增加任意路径解析能力；
原来的 HTTPS/已有 file URL 入口保持原策略。Valdi 核心 Asset API 提供资源加载，
本次未发现可以直接返回此类打包文件 URL 给 `create(source)` 的现有接口。

「载入 HLS 示例」使用 [VideoPage 的 `HLS_EXAMPLE`](../valdi/modules/app_pages/src/features/video/VideoPage.tsx)
所指向的 Apple 示例，也可输入视频 URL。离线 MP4 无需网络；远程 MP4/HLS 需要网络。
[模块配置](../valdi/modules/app_video/module.json) 包含 Media3 HLS 依赖与 iOS
AVFoundation/AVKit、后台音频声明。当前不提供 DRM 或自定义请求头。
页面接受 HTTP(S)，但 iOS host 仅接受 HTTPS 或已有本地文件；跨平台远程演示使用 HTTPS。
直播/未知时长可能报告 `durationMs = 0`，页面此时不执行 50% 定位；
HLS 可定位范围和倍速行为受原生播放器及流本身限制。

PiP 受系统能力、设置、窗口/播放就绪状态及设备支持约束；能力检测通过不保证启动成功。
模拟器结果不能代替物理设备验证，本文不宣称所有设备或系统均支持 PiP。

## 手动宿主接线、原生访问与停用

模块依赖/选配与宿主视频展示接线是两件事。Theme/AppUI 继续作为默认基础模块，
AppUI 保持完整聚合；视频能力的停用不要求拆分 AppUI，也不修改 `AppContext`。
以下路径由宿主维护，复制或移除视频模块时需要一起核对。

Android：

1. 保留 [模块配置](../valdi/modules/app_video/module.json) 与生成的
   `VideoNativeModuleFactory` / `VideoModuleFactoryImpl` 注册。
   [ValdiHost.init](../android/app/src/main/java/io/valdiroutes/app/runtime/ValdiHost.kt)
   在访问 `VideoModuleFactoryImpl.requireHost()` 前先调用生成的
   `ValdiNativeModules.registerFactories(app)`。宿主 `videoHost` getter 返回这个共享实例，
   不能另外创建一个 host 给 loader。
2. 同一个 `videoHost.loader` 通过 `runtimeManager.registerAssetLoader(...)` 注册；
   它只解析 `valdi-video://` 的会话 URL。Media3 普通源加载与这个 surface URL 不混用。
   Gradle 还需包含模块 Kotlin、`android/res`、Media3 ExoPlayer/HLS/session/UI 依赖和
   生成的代理接口；`VideoSession` / `VideoPresentation` 当前引用宿主 `io.valdiroutes.app.R`，
   迁移原生 namespace 时需相应调整资源引用。
3. [MainActivity](../android/app/src/main/java/io/valdiroutes/app/MainActivity.kt)
   在创建时调用 `videoHost.attach(this) { videoFullscreen = it }`，
   `onResume` / `onPause` / `onStop` 传入相同 Activity；
   `onDestroy` 调用 `detach(this)`。这负责前后台、失效 Activity 与 PiP 结束后的释放，
   不能只留 loader 或只转发页面可见性。
4. Activity 的 `onPictureInPictureModeChanged(Boolean, Configuration)` 必须转发给
   `videoHost.onPictureInPictureModeChanged(this, ...)`，由实际系统回调确认 PiP 模式。
   Compose 的 `videoFullscreen` 状态驱动 `BackHandler`，
   注册在导航返回处理之后，调用 `exitFullscreenFromBack()`，先退出全屏再处理页面返回。
5. [宿主 manifest](../android/app/src/main/AndroidManifest.xml) 的 Activity 保留
   `supportsPictureInPicture="true"`、`resizeableActivity="true"` 和屏幕/方向变化对应的
   `configChanges`。现有完整值还包含 keyboard、navigation、uiMode、density 等宿主用途，
   停用视频时不能整项删除。远程源需要 INTERNET 权限；其他模块也可能使用它。
   PiP 控制接收器由 `VideoPresentation` 动态注册并在 dispose 时注销，
   保留 `valdi-video-control` scheme、包名/session 校验与不可变 PendingIntent；
   无需另加 manifest receiver 或后台播放 service。

iOS：

1. [ValdiHost](../ios/ValdiRoutes/Runtime/ValdiHost.swift) 在主线程为 runtime 生命周期持有
   一个 `VRVideoService`，将同一个实例放入 `SCValdiConfiguration.videoLoaders`。
   生成工厂注册必须包在
   `videoService.registerModules { VRRegisterNativeModules(runtime) }` 内；
   `VideoModuleFactory` 的同步初始化从此注册作用域取得相同 service。
   不要分别给模块和 loader 创建 service，否则会话 URL 无法找到对应播放器。
2. 保留 `app_video/ios` 全部源码（包含通用 `VRVideoSource.h/.m`）、
   生成的 AppVideo/AppVideoTypes 接口、`VRVideoModuleFactory`、
   `ValdiModuleImports.h` 对 `VRVideoService.h` 的导入，以及宿主 bridging header 对生成导入的引用。
   宿主资源配置包含业务模块 assets，AVFoundation/AVKit/UIKit 来自模块元数据；
   [Modules.yml](../ios/Generated/Modules.yml) 和工程文件由父任务重新生成。
3. 模块元数据声明 `UIBackgroundModes` 的 `audio`，配合 AVAudioSession playback category
   支持 PiP。`VRVideoService` 自身观察后台/前台和音频中断；
   AVPlayerViewController、AVPictureInPictureController 的 delegate 负责关闭全屏、
   PiP 转场与恢复。当前无需另加 SceneDelegate/AppDelegate 或导航 Back 的视频回调，
   也不能绕过这些 delegate 强行重建播放器。普通 native modal 返回仍由模块处理。

保留能力但不需要演示时，删除业务视频路由/入口、`VideoPage` 和这三个 sample 资源即可，
原生模块、loader/factory 和宿主生命周期接线继续保留。Android 原生代码可直接通过
`VideoModuleFactoryImpl.requireHost()` 取得共享 `VideoHostImpl`，调用 `create(source)`
返回 `Promise<VideoPlayer>`；iOS 原生调用方使用宿主持有的同一个 `VRVideoService`，
以 `[service createWithSource:source]` 取得 `SCValdiPromise<id<VRVideoPlayer>>`。
原生调用也可使用同一组播放、订阅、状态和释放接口；ObjC 的释放 selector 是
`releaseObject`，不调用 NSObject 的 `release`。原生 inline 展示仍通过已注册的官方
video loader 绑定 `player.getSource()` 对应的表面，保留全屏/PiP 的同一播放器所有权。
创建命令后仍需遵守主线程接线与 promise 完成语义，不通过 JS 页面或 `AppContext` 访问播放器。

完全停用 `app_video` 时，手动移除业务导入/路由/入口和 sample 资源，调整根模块选择及业务
依赖，再重新生成原生注册、接口和工程资源配置。Android 同时移除 `ValdiHost` 的 video
imports/getter/loader 注册，以及 Activity 的 video 状态、attach/detach、三个生命周期转发、
PiP 回调转发和全屏 BackHandler；只删除专属视频的 Activity 属性，保留其他宿主功能需要的
configChanges/权限。iOS 同时移除 service 属性、videoLoaders 配置和注册作用域包装，
继续直接调用生成的模块注册函数；删除专属导入/源码接线。AV 框架、后台 audio mode、
INTERNET 仅在没有其他消费者时移除。生成注册文件和工程文件不手工修改，
不能仅关模块选择却留下这些静态宿主引用。

本次修改不改上述宿主文件。父任务需重新生成两端 `VideoHost` 接口以删除旧演示方法，
刷新 `ios/Generated/Modules.yml` / Xcode 工程以使用 `app_pages/assets` 并移除旧 assets 路径；
Gradle 和 iOS 工程从全部启用模块收集 assets，包括没有原生实现的业务模块；资源根仍是 `flower.mp4`。
视频来源清单命名为 `flower.source.json`，避免 iOS 扁平资源目录与 Lottie 的 `source.json` 冲突。
这些原生 bundle/assets 文件随 App 构建，单独的 JS OTA 不会替换它们。
宿主 build.gradle 的旧示例注释仍提到 app_video，父任务可同步修正文案。
此处保持默认启用配置，所以不需要删除当前 Activity/ValdiHost 接线。

## 本次聚焦源码回归，2026-11-09

执行：

```sh
python3 valdi/modules/app_video/tests/run_native_tests.py
cd tools/valdi-rolldown
node --import tsx --test video.test.ts
```

原生 runner 离线使用本机 clang/Foundation 和缓存 Kotlin compiler；
iOS 逐字提取生产 `setVolume` 与真实主队列 `perform:` 包装编译，
只替代 AVPlayer/session 与 Valdi promise 边界。Android 编译完整的生产
`VideoPlayerImpl.kt`，替代 host/session/promise 边界。测试有效边界、近边界、
非有限数、拒绝后无音量修改，以及已释放播放器的拒绝；iOS 另检查拒绝不发状态事件。
原先 iOS 在 `-0.01` 上成功的 RED 已复现，修复后通过。
资源测试编译完整生产 Foundation 解析器，在临时 bundle 中验证根资源、另一种文件名、
HTTPS/file 原策略及 35 个无效/缺失资源输入。TS 测试执行真实页面的初次加载、离线重载与
销毁，覆盖两端 URL 选择和 unsubscribe/release 提交顺序，并核对移动资源的两个哈希。

以上原生三组、TS 四项（含页面/契约类型检查）均通过；未执行完整 App 构建、导出、根 bindings 生成、设备操作或
打包后资源验证。测试没有验证 Media3/AVPlayer 解码、Valdi/JNI marshalling 或 PiP 运行行为。
下文保留历史验证范围，不将历史设备结果当成本次资源迁移后的运行证据。

## 此前 session 接口的验证，2026-11-05

以下设备记录均保留当时安装包与入口的历史结果。相关 E2E 已于 2026-11-10 改为从
Home 进入和返回，仍保留原 QA App ID 及播放检查；此次入口迁移未执行设备重放。

- Android arm64/API 36 模拟器：Debug APK 编译、安装成功。已看到离线视频实际画面、
  约 5.1 秒时长与推进进度，执行了播放/暂停、定位、全屏往返并保留 2.5 秒位置，
  以及真实 HLS 解码和约 15 秒进度。进入系统 PiP 后可见视频浮窗，回前台恢复内嵌。
  前后台测量和退出重进也已执行；静音、倍速只检查了控件状态，未测声学输出或实际倍率。
- Android 的自动化树曾把截图中正确的 2.5 秒定位报告成旧的 4.4 秒。保留了这个
  失败回放及成对证据，未将它当成产品定位失败，也未宣称视频全流程两遍通过。
  PiP 播放中关闭、页面释放后的 PiP 最终清理，以及完全滚出视口的回归仍未完成运行证明。
- iOS arm64/iOS 26.5 模拟器：Debug 运行库和独立 `io.valdiroutes.mediaqa` App
  编译成功，未覆盖现有 App 数据。离线播放、自然结束、50% 定位、全屏往返保留位置的
  流程连续两次通过，每次 16/16，零警告。片尾测试曾发现自动零速率被重新写回的缺陷，
  已修复并用同一结束状态断言验证；完成事件仍由 AVPlayer 的真实结束通知驱动。
- iOS 已看到 HLS 实际画面和持续进度，并执行前后台与退出重进。当前模拟器明确拒绝
  PiP，返回 `Picture in Picture is unavailable on this device`；这里只验证了能力拒绝，
  **没有 iOS PiP 启动、恢复或关闭的运行通过结论**。

状态协调分别保存用户意图和实际播放状态。iOS 不对未知的自动零速率立即重放正速率，
只在目标速率不同时写入 AVPlayer；系统的直播边缘降速另行保留。当前没有引入
`expo-video`、Expo Modules 或 Nitro `HybridObject` 依赖；外层继续使用 Valdi 类型接口。

证据目录为 `/tmp/valdi-media-demo-20261105/android-video-qa/` 和
`/tmp/valdi-media-demo-20261105/ios-video-qa/`。完整诊断记录包含未通过的能力/工具检查，
不能当成完整通过记录。可重复的 iOS 离线/全屏流程为
`.argent/e2e/media-ios-video-offline-fullscreen-20261105.yaml`。
最终安装包哈希、离线/全屏回归摘要及保留的失败诊断索引见
`/tmp/valdi-media-demo-20261105/validation-final.json`；汇总记录不替代原始工具输出。

以上不构成真机、DRM、自定义鉴权、后台音频、性能、声学或内存泄漏验证。

## 对象与事件接口迁移

本轮将 session 命令接口替换为每播放器原生代理和共享事件订阅，未引入 Nitro、
Expo Modules 或 Web renderer。上面的运行结果是迁移前证据；本轮构建、审查与
回归记录保存在 `/tmp/valdi-video-objects-20261105/`，以最终验证索引为准。

- 最终 Android/iOS Debug App 编译通过，Release Hermes 模块编译通过。
  全套测试为 45 + 5 + 194 + 8 项通过，绑定 goldens 一致；194 项中包含新增的两项
  Objective-C selector/真实 Foundation ARC 回归。TS `release()` 在 iOS 映射为
  `releaseObject`，避免与 NSObject 的内存管理 selector 冲突。
- iOS 最终包的暂停倍速、静音、定位和退出回归连续两次 17/17，无警告；
  离线播放、真实自然结束、定位和全屏位置保持连续两次 16/16，无警告。
- Android 最终包的定位、全屏返回、退出到 Home、重新打开归零回归连续两次
  25/25，零失败/错误/跳过。每次保留三条 Home idle 警告，视频和全屏 readiness
  无警告；这是有边界的退出回归，不是完整视频功能的零警告 QA。
- 本轮曾在两端实际发现页面退出崩溃。Android 日志明确指出 disposed 的
  `subscribe()` 回调引用；iOS 崩溃栈确认 Valdi JS 线程未处理错误。
  修复使用官方引用保护覆盖异步清理窗口，没有延时释放、屏蔽 fatal handler
  或制造回调。原始崩溃、修复前页面源码和诊断流程均保留；最终退出检查通过。
- 原生对象、独立订阅、多监听者 payload 隔离、序列、取消订阅/释放清理已做源码审查。
  运行回归覆盖演示页面的单个订阅者；未宣称已运行多订阅者压力或泄漏仪器验证。
  HLS/PiP 的迁移前运行证据保持单独标注，本轮没有重新建立完整 HLS/PiP 真机结论。

最终索引：`/tmp/valdi-video-objects-20261105/validation-final.json`。

## Meizu 20 原生控制与 PiP 修复，2026-11-05

已在 Meizu 20 / Android API 36 安装修复包，使用覆盖安装保留登录与现有数据库。
本轮仅调整 Android。实际发现内嵌控制栏未启用，且普通容器缺少
`ValdiTouchTarget`，导致开启控制栏后原生按钮仍收不到 Valdi 根视图转发的触摸。
两处均已修复；全屏按钮按目标模式处理，避免 Media3 同步回调造成递归切换。
PiP 使用同一播放器的 MediaSession，显式 Play 允许重新请求音频焦点。

- 最终包完成一次不中断回归：23 项通过，零失败、错误或跳过，55.7 秒。
  覆盖内嵌原生播放/暂停、原生全屏往返、退出重进归零、HLS 与实际进入 PiP。
  保留四条 idle 警告，其中暂停视频页的稳定性警告尚未定位；不是两遍完整 QA 结论。
- 系统媒体 Pause 后记录位置 42,998 ms；系统 Play 后记录实际
  `PLAYING`、213,796 ms。中间另记录到 HLS 缓冲状态。
  这是系统媒体指令的运行证据，不代表已验证所有 Flyme 浮窗菜单按钮。
- 内嵌原生按钮未进入 Valdi 虚拟可访问性树；部分自动化使用实际 Android
  原生视图树给出的坐标。可重复流程保留这一工具限制。
- Android JVM 测试 80 项通过、9 项跳过；原生模块生成器测试 1 项通过。
  最终 APK 为 R8 优化、不可调试的 Release **宿主**，仍链接现有 Debug Valdi
  原生运行库，不能称为完整原生 Release 构建。
- 系统冷启动首帧样本：原 Debug 包 966/724 ms，最终宿主包 309/228/180 ms。
  样本数量有限、构建类型不同，且首帧不等于完整可交互时间；
  MMKV 改为首次使用时打开，不能据此单独归因或宣称正式性能收益。
- 最终 Perfetto 仍记录到最长约 83 ms 的帧。Release 宿主未配置 shell
  profiling，采样没有可用调用栈；视频入场卡顿尚未完全解决。
  前后采集时长与操作节奏不同，不比较总卡顿数量或给出改善百分比。

最终 APK SHA-256：
`498bcdcdb5a25344db211338da43fafd99ce05d32de75794bd85af208f57f923`。
证据与最终源码绑定见 `/tmp/valdi-meizu-video-fix-20261105/validation-final.json`；
详细报告为该目录的 `REPORT.md`。验证后手机停留在离线 MP4 暂停的 0.0/5.1 秒，
未留下 HLS 后台播放。

## Windows 跟进：PiP 按钮与首页首帧，2026-11-05

用户随后确认 Meizu 的浮窗暂停按钮仍不可用。此前系统媒体 Pause/Play 的结果，
不能验证浮窗自定义 `RemoteAction` 的点击路径；此前“已修复”的表述超出了运行证据。

跟进发现按钮的 PendingIntent 带有 `valdi-video-control://` URI，而广播接收器
原先只匹配 action。已为过滤器补上对应 scheme，保留包名限制、不可变 PendingIntent
和 session 校验，并把四个 PiP 图标改为无边框的填充矢量。源码审查通过。
Windows 已读取实际 SystemUI 的 Play/Back/Forward 按钮及原生边界；一次原生坐标
点击尝试前后的 MediaSession 都仍为暂停零位置，因此**没有建立实际按钮播放/暂停
成功的运行结论**，也没有把系统媒体键再次当作按钮替代验证。

用户的 `9801.mp4` 显示首页相邻内容帧中，上安全区从 0 变为 41，下安全区从 57
变为 81，第一个蓝色按钮下移约 116 个原视频像素。宿主原先把尚未交付的 Compose
安全区默认值传入页面，随后真实系统栏尺寸到达并触发第二次布局。现在 Activity
先监听原生 WindowInsets，收到实际回调后才创建页面；首页、默认底栏与自定义底栏
使用同一份系统栏/刘海尺寸。合法的全零回调仍被接受；没有加入延时或猜测的初值。
IME 继续使用原有动画与处理路径。

诊断包记录修复前页面创建时 top=0、随后更新为 24；修复后创建时即为 top=24。
最终包已经在 Windows 模拟器覆盖安装并核对 APK 哈希。重启前的录屏尝试受设备
控制超时等问题影响，没有建立有效首帧结论。随后按用户要求正常关闭、冷启动 Windows
的 `valdi_test` AVD，保留数据；Android 开机后系统 UI 曾报告无响应，选择等待后恢复。
重启后的 Argent 录屏包含首页显示过程：首个捕获到的首页内容帧即为 top=24、
bottom=80，随后约 38 秒的 1,153 个内容视频帧中，七个蓝色按钮纵向位置一致，
未观察到先用零上安全区再补尺寸的跳动。相邻前一捕获帧仍为空内容和底栏。
这是一次最终包录屏观察，不是两遍完整 QA，也不保证捕获到所有原生呈现帧；
系统之后合法交付的新尺寸仍会更新页面。本次修复未安装到 Meizu。

Windows 最终 APK SHA-256：
`0ca40f0a5b62735fc454d9435be3330e197df574d195540818e5dee5b68437b9`。
构建通过，JVM 测试 80 项通过、9 项跳过；仍为 Release 宿主配现有 Debug 原生
运行库。Windows 是 x86_64 模拟器，运行 ARM64 库时存在转译，诊断耗时不能外推
到 Meizu。视频创建中的 ExoPlayer 构造和 PlayerView 膨胀均有主线程耗时；
启动的 JS 回调前长间隔尚未完全归因，未宣称启动或入场卡顿已解决。

证据目录：`/tmp/valdi-video-windows-followup-20261105/`。临时 PerfStages、
profileable 声明和长视频调试入口已移除，默认资源保持原始离线花朵视频。
