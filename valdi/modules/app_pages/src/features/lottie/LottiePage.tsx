import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Base64 } from 'coreutils/src/Base64';
import { createSignal, onCleanup, Show } from 'solid-js';
import { onPageHide, type SolidPageProps } from 'solid_native/src/bridge';
import { makeAssetFromBytes, type Asset } from 'valdi_core/src/Asset';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { AnimatedImageOnProgressEvent, Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { LOTTIE_DEMO_BASE64, LOTTIE_DEMO_LICENSE, LOTTIE_DEMO_SOURCE } from './demoData';

const PROGRESS_INTERVAL_MS = 200;
const SPEEDS = [0.5, 1, 2];

export function LottiePage(props: SolidPageProps<PageViewModel, PageContext>) {
  usePageStatusBar(props, 'auto');

  const [paused, setPaused] = createSignal(true);
  const [speed, setSpeed] = createSignal(1);
  const [loop, setLoop] = createSignal(true);
  const [mountGeneration, setMountGeneration] = createSignal(1);
  const [seekTime, setSeekTime] = createSignal(0);
  const [load, setLoad] = createSignal<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = createSignal('');
  const [time, setTime] = createSignal<number | undefined>(undefined);
  const [duration, setDuration] = createSignal<number | undefined>(undefined);
  const [ended, setEnded] = createSignal(false);
  const [action, setAction] = createSignal('初始暂停');
  const [showLicense, setShowLicense] = createSignal(false);

  // Scoped to this page. Do not put a native asset in a module-level cache.
  let asset: Asset | undefined;
  try {
    const bytes = Base64.toByteArray(LOTTIE_DEMO_BASE64);
    asset = makeAssetFromBytes(bytes);
  } catch (err) {
    setLoad('error');
    setError(String(err));
  }

  let disposed = false;
  let currentGeneration = 1;
  let pendingProgress: AnimatedImageOnProgressEvent | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let lastProgressUpdate = -Infinity;

  const acceptsCallback = (generation: number) => !disposed && generation === currentGeneration;

  const clearProgress = () => {
    if (progressTimer !== undefined) clearTimeout(progressTimer);
    progressTimer = undefined;
    pendingProgress = undefined;
  };

  const flushProgress = () => {
    const progress = pendingProgress;
    pendingProgress = undefined;
    if (!progress || disposed || !props.viewModel().visible) return;
    lastProgressUpdate = Date.now();
    const reachedEnd = !loop() && progress.time >= progress.duration && (!paused() || ended());
    setTime(progress.time);
    setDuration(progress.duration);
    setEnded(reachedEnd);
    if (reachedEnd) {
      setPaused(true);
    }
  };

  const makeCallbacks = (generation: number) => ({
    onAssetLoad: (success: boolean, errorMessage?: string) => {
      if (!acceptsCallback(generation)) return;
      setLoad(success ? 'loaded' : 'error');
      setError(success ? '' : errorMessage ?? '动画资源加载失败');
    },
    onProgress: (event: AnimatedImageOnProgressEvent) => {
      if (
        !acceptsCallback(generation) ||
        !props.viewModel().visible ||
        !Number.isFinite(event.time) ||
        !Number.isFinite(event.duration) ||
        event.duration <= 0
      ) {
        return;
      }
      pendingProgress = { time: event.time, duration: event.duration };
      if (progressTimer !== undefined) return;
      const remaining = PROGRESS_INTERVAL_MS - (Date.now() - lastProgressUpdate);
      if (remaining <= 0) {
        flushProgress();
      } else {
        progressTimer = setTimeout(() => {
          progressTimer = undefined;
          if (acceptsCallback(generation)) flushProgress();
        }, remaining);
      }
    },
  });

  onPageHide(() => {
    // advanceRate gates to zero via props.viewModel().visible; retain the user's pause preference.
    clearProgress();
  });

  onCleanup(() => {
    disposed = true;
    currentGeneration++;
    clearProgress();
    // The routed host tears down the animatedimage, releasing its native resource.
    asset = undefined;
  });

  const remountAt = (targetTime: number, nextAction: string, nextPaused = true) => {
    clearProgress();
    // Incrementing generation forces <Show keyed> to recreate <animatedimage> so currentTime applies cleanly.
    // Generation guards reject callbacks queued by the previous element.
    currentGeneration++;
    setSeekTime(targetTime);
    setPaused(nextPaused);
    setEnded(false);
    setTime(undefined);
    setDuration(undefined);
    setLoad('loading');
    setError('');
    setAction(nextAction);
    setMountGeneration(currentGeneration);
  };

  const nextSpeed = () => SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length];

  const handlePlay = () => {
    if (disposed) return;
    if (ended()) {
      remountAt(0, '已请求从起点播放', false);
    } else {
      const nextPaused = !paused();
      setPaused(nextPaused);
      setAction(nextPaused ? '已请求暂停' : '已请求播放');
    }
  };

  const handleRestart = () => {
    if (!disposed) remountAt(0, '已请求重置到 0.00 s · 暂停');
  };

  const handleSeek = () => {
    if (disposed) return;
    const total = duration() ?? LOTTIE_DEMO_SOURCE.durationSeconds;
    remountAt(total / 2, `已请求定位 50%（${(total / 2).toFixed(2)} s）· 暂停`);
  };

  const handleSpeed = () => {
    if (disposed) return;
    const next = nextSpeed();
    setSpeed(next);
    setAction(`已设置速度 ${next}×`);
  };

  const handleLoop = () => {
    if (disposed) return;
    const next = !loop();
    setLoop(next);
    setAction(`已${next ? '开启' : '关闭'}循环`);
  };

  const handleLicense = () => {
    if (!disposed) setShowLicense(v => !v);
  };

  const statusText = () => {
    const playback = !props.viewModel().visible
      ? 'HIDDEN · 自动暂停'
      : ended()
        ? 'ENDED'
        : paused()
          ? 'PAUSED'
          : 'PLAYING';
    const assetState = load() === 'error' ? `ERROR · ${error()}` : load() === 'loaded' ? 'LOADED' : 'LOADING';
    return `${playback} · ${assetState}\n${action()}`;
  };

  const { insets } = props;

  return (
    <view accessibilityId="lottie-page" style={styles.page}>
      <NavigationBar title="Lottie 动画" topInset={insets.top} onBack={() => props.context.back()} />
      <scroll style={styles.scroll}>
        <view
          paddingTop={tokens.space.md}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.lg}
        >
          <view style={styles.card}>
            <Show when={asset ? mountGeneration() : 0} keyed>
              {gen => {
                const callbacks = makeCallbacks(gen);
                return (
                  <animatedimage
                    accessibilityId="lottie-canvas"
                    width="100%"
                    height="100%"
                    src={asset}
                    objectFit="contain"
                    limitToViewport={false}
                    advanceRate={props.viewModel().visible && !paused() ? speed() : 0}
                    loop={loop()}
                    currentTime={seekTime()}
                    onAssetLoad={callbacks.onAssetLoad}
                    onProgress={callbacks.onProgress}
                  />
                );
              }}
            </Show>
          </view>
          <label accessibilityId="lottie-status" style={styles.status} value={statusText()} />
          <label
            accessibilityId="lottie-time"
            style={styles.caption}
            value={
              time() === undefined || duration() === undefined
                ? '回调时间：-- / -- s（等待进度回调）'
                : `回调时间：${time()!.toFixed(2)} / ${duration()!.toFixed(2)} s`
            }
          />
          <Button id="lottie-play" title={paused() ? '播放' : '暂停'} onTap={handlePlay} />
          <Button id="lottie-restart" title="重置到起点（暂停）" secondary={true} onTap={handleRestart} />
          <Button id="lottie-seek" title="定位 50%（暂停）" secondary={true} onTap={handleSeek} />
          <Button
            id="lottie-speed"
            title={`速度 ${speed()}× · 切换到 ${nextSpeed()}×`}
            secondary={true}
            onTap={handleSpeed}
          />
          <Button id="lottie-loop" title={`循环：${loop() ? '开' : '关'}`} secondary={true} onTap={handleLoop} />
          <label
            style={styles.caption}
            value="离开可见页面时自动暂停，回来后沿用播放选择；退出页面释放动画。"
          />
          <label
            style={styles.caption}
            value={`gatin · lottie-web · MIT\n${LOTTIE_DEMO_SOURCE.width} × ${LOTTIE_DEMO_SOURCE.height} · ${LOTTIE_DEMO_SOURCE.frameRate} fps · ${LOTTIE_DEMO_SOURCE.durationSeconds} s（源文件）`}
          />
          <Button
            id="lottie-license"
            title={showLicense() ? '收起 MIT 许可' : '查看 MIT 许可'}
            secondary={true}
            onTap={handleLicense}
          />
          <Show when={showLicense()}>
            <label style={styles.license} value={LOTTIE_DEMO_LICENSE} />
          </Show>
        </view>
      </scroll>
    </view>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  scroll: new Style<ScrollView>({ width: '100%', height: 0, flexGrow: 1 }),
  card: new Style<View>({
    width: '100%',
    height: 200,
    backgroundColor: color.surface,
    borderRadius: tokens.radius.control,
    marginBottom: tokens.space.md,
  }),
  status: new Style<Label>({
    font: systemSemiboldFont(tokens.font.section),
    color: color.text,
    numberOfLines: 0,
    marginBottom: tokens.space.sm,
  }),
  caption: new Style<Label>({
    font: systemFont(tokens.font.body),
    color: color.muted,
    numberOfLines: 0,
    marginBottom: tokens.space.md,
  }),
  license: new Style<Label>({
    font: systemFont(tokens.font.body),
    color: color.text,
    numberOfLines: 0,
  }),
};
