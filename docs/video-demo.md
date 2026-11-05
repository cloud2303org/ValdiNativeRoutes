# 原生视频演示

两端使用 Valdi 官方 `<video>` 接口和应用持有的原生播放器；运行验证范围见文末。

- [HomePage](../valdi/modules/app_pages/src/HomePage.tsx)：点击「原生视频播放器（MP4 / HLS）」（`video`）。
- [LoginPage](../valdi/modules/app_pages/src/LoginPage.tsx)：未登录也可点击「视频播放器」（`video-check`）。
- 两者进入 [routes.ts](../valdi/modules/app_pages/src/routes.ts) 的 `video` 路由，显示 [VideoPage](../valdi/modules/app_pages/src/VideoPage.tsx)「原生视频播放器」。

## 源码已实现

页面使用官方 TSX `<video>` 展示原生画面。`getHost().create(source)` 返回
每个播放器独立的 `VideoPlayer` 原生代理对象；`player.getSource()` 提供不透明的
surface URL。session ID 仅由原生资源表与 loader 使用，不再作为页面命令参数。

- Android：[ValdiHost](../android/app/src/main/java/io/valdiroutes/app/ValdiHost.kt)
  注册 [VideoLoader](../valdi/modules/app_video/android/VideoLoader.kt)，绑定
  [VideoSession](../valdi/modules/app_video/android/VideoSession.kt) 的 Media3
  `ExoPlayer` / `PlayerView`。
- iOS：[ValdiHost](../ios/ValdiRoutes/ValdiHost.swift) 注册
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

普通页面隐藏或 App 进入后台会暂停，保留播放意图供恢复时协调；前台全屏及原生
PiP 转场有专门的可见性处理。页面销毁或切换片源调用 `release`，清除回调并释放资源；
全屏本身不构成延迟释放的例外。**活跃 PiP** 可以接管生命周期，页面释放后在
PiP 关闭时销毁播放器：
iOS 严格检查 `pictureInPictureActive`，仅请求或等待 PiP 不保留资源；
Android 的 `isLivePip` 还保护已发起的 `pipPending` 系统转场，实际 `mode` 等待
Activity 回调确认，停止/销毁路径负责清理。点击按钮或能力标记不等于 PiP 已启动。

## 片源与边界

初始加载随 App 打包的 [flower.mp4](../valdi/modules/app_video/assets/flower.mp4)。
Android 通过 [Gradle assets 配置](../android/app/build.gradle.kts) 使用
`asset:///flower.mp4`；iOS 的 [资源配置](../ios/Generated/Modules.yml) 将资源复制进
bundle，`getDemoSource()` 返回本地文件 URL，无远程兜底。
[source.json](../valdi/modules/app_video/assets/source.json) 记录 MDN
`interactive-examples` 的固定 commit、`live-examples/media/cc0-videos/flower.mp4`
路径及哈希；许可记录为 CC0-1.0，全文保存在
[MDN-LICENSE.txt](../valdi/modules/app_video/assets/MDN-LICENSE.txt)。下载时核对了原始
Git blob 和文件 SHA-256，构建后再次检查了本地文件与来源记录。

「载入 HLS 示例」使用 [VideoPage 的 `HLS_EXAMPLE`](../valdi/modules/app_pages/src/VideoPage.tsx)
所指向的 Apple 示例，也可输入视频 URL。离线 MP4 无需网络；远程 MP4/HLS 需要网络。
[模块配置](../valdi/modules/app_video/module.json) 包含 Media3 HLS 依赖与 iOS
AVFoundation/AVKit、后台音频声明。当前不提供 DRM 或自定义请求头。
页面接受 HTTP(S)，但 iOS host 仅接受 HTTPS 或已有本地文件；跨平台远程演示使用 HTTPS。
直播/未知时长可能报告 `durationMs = 0`，页面此时不执行 50% 定位；
HLS 可定位范围和倍速行为受原生播放器及流本身限制。

PiP 受系统能力、设置、窗口/播放就绪状态及设备支持约束；能力检测通过不保证启动成功。
模拟器结果不能代替物理设备验证，本文不宣称所有设备或系统均支持 PiP。

## 此前 session 接口的验证，2026-11-05

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
