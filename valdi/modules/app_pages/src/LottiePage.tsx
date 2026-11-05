import { Base64 } from 'coreutils/src/Base64';
import { Asset, makeAssetFromBytes } from 'valdi_core/src/Asset';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { AnimatedImageOnProgressEvent, Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { LOTTIE_DEMO_BASE64, LOTTIE_DEMO_LICENSE, LOTTIE_DEMO_SOURCE } from './lottieDemoData';
import { NavigationBar } from './NavigationBar';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { color, tokens } from './theme';

interface State {
  paused: boolean;
  speed: number;
  loop: boolean;
  generation: number;
  seekTime: number;
  load: 'loading' | 'loaded' | 'error';
  error: string;
  time?: number;
  duration?: number;
  ended: boolean;
  action: string;
  showLicense: boolean;
}

const PROGRESS_INTERVAL_MS = 200;
const SPEEDS = [0.5, 1, 2];

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRLottiePage', android: 'io.valdiroutes.pages.LottiePage'})
 */
export class LottiePage extends Page<PageViewModel, State, PageContext> {
  state: State = {
    paused: true,
    speed: 1,
    loop: true,
    generation: 0,
    seekTime: 0,
    load: 'loading',
    error: '',
    ended: false,
    action: '初始暂停',
    showLicense: false,
  };

  // Scoped to this page. Do not put a native asset in a module-level cache.
  private asset?: Asset;
  private disposed = false;
  private generation = 0;
  private pendingProgress?: AnimatedImageOnProgressEvent;
  private progressTimer?: ReturnType<typeof setTimeout>;
  private lastProgressUpdate = -Infinity;
  private onAssetLoad?: (success: boolean, errorMessage?: string) => void;
  private onProgress?: (event: AnimatedImageOnProgressEvent) => void;

  onCreate(): void {
    this.prepareCallbacks();
    try {
      this.asset = makeAssetFromBytes(Base64.toByteArray(LOTTIE_DEMO_BASE64));
    } catch (error) {
      this.setState({ load: 'error', error: String(error) });
    }
  }

  onHide(): void {
    // The next render gates advanceRate to zero; retain the user's pause preference.
    this.clearProgress();
  }

  onDestroy(): void {
    this.disposed = true;
    this.generation++;
    this.clearProgress();
    this.onAssetLoad = undefined;
    this.onProgress = undefined;
    // The routed host tears down the animatedimage, releasing its native resource.
    this.asset = undefined;
  }

  onRender(): void {
    const { insets, visible } = this.viewModel;
    const { paused, speed, loop, generation, seekTime, showLicense, time, duration } = this.state;

    <view accessibilityId="lottie-page" style={styles.page}>
      <NavigationBar title="Lottie 动画" topInset={insets.top} onBack={this.handleBack} />
      <scroll style={styles.scroll}>
        <view
          paddingTop={tokens.space.md}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.lg}
        >
          <view style={styles.card}>
            {this.asset && (
              <animatedimage
                key={`gatin-${generation}`}
                accessibilityId="lottie-canvas"
                width="100%"
                height="100%"
                src={this.asset}
                objectFit="contain"
                limitToViewport={false}
                advanceRate={visible && !paused ? speed : 0}
                loop={loop}
                currentTime={seekTime}
                onAssetLoad={this.onAssetLoad}
                onProgress={this.onProgress}
              />
            )}
          </view>
          <label accessibilityId="lottie-status" style={styles.status} value={this.status()} />
          <label
            accessibilityId="lottie-time"
            style={styles.caption}
            value={time === undefined || duration === undefined
              ? '回调时间：-- / -- s（等待进度回调）'
              : `回调时间：${time.toFixed(2)} / ${duration.toFixed(2)} s`}
          />
          <Button id="lottie-play" title={paused ? '播放' : '暂停'} onTap={this.handlePlay} />
          <Button id="lottie-restart" title="重置到起点（暂停）" secondary={true} onTap={this.handleRestart} />
          <Button id="lottie-seek" title="定位 50%（暂停）" secondary={true} onTap={this.handleSeek} />
          <Button
            id="lottie-speed"
            title={`速度 ${speed}× · 切换到 ${this.nextSpeed()}×`}
            secondary={true}
            onTap={this.handleSpeed}
          />
          <Button id="lottie-loop" title={`循环：${loop ? '开' : '关'}`} secondary={true} onTap={this.handleLoop} />
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
            title={showLicense ? '收起 MIT 许可' : '查看 MIT 许可'}
            secondary={true}
            onTap={this.handleLicense}
          />
          {showLicense && <label key="license" style={styles.license} value={LOTTIE_DEMO_LICENSE} />}
        </view>
      </scroll>
    </view>;
  }

  private status(): string {
    const { load, error, paused, ended, action } = this.state;
    const playback = !this.viewModel.visible ? 'HIDDEN · 自动暂停' : ended ? 'ENDED' : paused ? 'PAUSED' : 'PLAYING';
    const asset = load === 'error' ? `ERROR · ${error}` : load === 'loaded' ? 'LOADED' : 'LOADING';
    return `${playback} · ${asset}\n${action}`;
  }

  private acceptsCallback(generation: number): boolean {
    return !this.disposed && !this.isDestroyed() && generation === this.generation;
  }

  private prepareCallbacks(): void {
    const generation = this.generation;
    this.onAssetLoad = (success, errorMessage) => {
      if (!this.acceptsCallback(generation)) return;
      this.setState({
        load: success ? 'loaded' : 'error',
        error: success ? '' : errorMessage ?? '动画资源加载失败',
      });
    };
    this.onProgress = event => {
      if (!this.acceptsCallback(generation) || !this.viewModel.visible ||
          !Number.isFinite(event.time) || !Number.isFinite(event.duration) || event.duration <= 0) return;
      this.pendingProgress = { time: event.time, duration: event.duration };
      if (this.progressTimer !== undefined) return;
      const remaining = PROGRESS_INTERVAL_MS - (Date.now() - this.lastProgressUpdate);
      if (remaining <= 0) {
        this.flushProgress();
      } else {
        this.progressTimer = setTimeout(() => {
          this.progressTimer = undefined;
          if (this.acceptsCallback(generation)) this.flushProgress();
        }, remaining);
      }
    };
  }

  private flushProgress(): void {
    const progress = this.pendingProgress;
    this.pendingProgress = undefined;
    if (!progress || this.disposed || this.isDestroyed() || !this.viewModel.visible) return;
    this.lastProgressUpdate = Date.now();
    const ended = !this.state.loop && progress.time >= progress.duration &&
      (!this.state.paused || this.state.ended);
    this.setState({
      time: progress.time,
      duration: progress.duration,
      ended,
      ...(ended ? { paused: true } : {}),
    });
  }

  private clearProgress(): void {
    if (this.progressTimer !== undefined) clearTimeout(this.progressTimer);
    this.progressTimer = undefined;
    this.pendingProgress = undefined;
  }

  private remountAt(time: number, action: string, paused = true): void {
    this.clearProgress();
    // Changing the key forces currentTime to be applied even for the same target.
    // Generation guards also reject callbacks queued by the previous element.
    this.generation++;
    this.prepareCallbacks();
    this.setState({
      generation: this.generation,
      seekTime: time,
      paused,
      ended: false,
      time: undefined,
      duration: undefined,
      load: 'loading',
      error: '',
      action,
    });
  }

  private handlePlay = () => {
    if (this.disposed || this.isDestroyed()) return;
    if (this.state.ended) {
      this.remountAt(0, '已请求从起点播放', false);
    } else {
      const paused = !this.state.paused;
      this.setState({ paused, action: paused ? '已请求暂停' : '已请求播放' });
    }
  };

  private handleRestart = () => {
    if (!this.disposed && !this.isDestroyed()) this.remountAt(0, '已请求重置到 0.00 s · 暂停');
  };

  private handleSeek = () => {
    if (this.disposed || this.isDestroyed()) return;
    const duration = this.state.duration ?? LOTTIE_DEMO_SOURCE.durationSeconds;
    this.remountAt(duration / 2, `已请求定位 50%（${(duration / 2).toFixed(2)} s）· 暂停`);
  };

  private nextSpeed(): number {
    return SPEEDS[(SPEEDS.indexOf(this.state.speed) + 1) % SPEEDS.length];
  }

  private handleSpeed = () => {
    if (this.disposed || this.isDestroyed()) return;
    const speed = this.nextSpeed();
    this.setState({ speed, action: `已设置速度 ${speed}×` });
  };

  private handleLoop = () => {
    if (this.disposed || this.isDestroyed()) return;
    const loop = !this.state.loop;
    this.setState({ loop, action: `已${loop ? '开启' : '关闭'}循环` });
  };

  private handleLicense = () => {
    if (!this.disposed && !this.isDestroyed()) this.setState({ showLicense: !this.state.showLicense });
  };

  private handleBack = () => this.context.back();
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
