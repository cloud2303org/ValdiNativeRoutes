import { getHost } from 'app_video/src/Video';
import type { VideoPlayer, VideoState, VideoSubscription } from 'app_video/src/VideoHost';
import { asyncWithProtectedRefsForContextId } from 'valdi_core/src/NativeReferences';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { color, tokens } from '../../components/theme';

const HLS_EXAMPLE = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';

interface State {
  source: string;
  input: string;
  phase: string;
  error: string;
  playing: boolean;
  muted: boolean;
  speed: number;
  durationMs: number;
  positionMs: number;
  mode: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRVideoPage', android: 'io.valdiroutes.pages.VideoPage'})
 */
export class VideoPage extends Page<PageViewModel, State, PageContext> {
  state: State = {
    source: '',
    input: HLS_EXAMPLE,
    phase: '正在准备离线 MP4',
    error: '',
    playing: false,
    muted: false,
    speed: 1,
    durationMs: 0,
    positionMs: 0,
    mode: 'inline',
  };

  private readonly host = getHost();
  private player?: VideoPlayer;
  private subscription?: VideoSubscription;
  private alive = false;
  private generation = 0;
  private loaded = false;
  private lastSequence = -1;
  private commandRevision = 0;
  private lastNativeState?: VideoState;
  private pendingIntent: Partial<Pick<State, 'playing' | 'speed' | 'muted'>> = {};
  private intentRevisions = { playing: 0, speed: 0, muted: 0 };

  onCreate(): void {
    this.alive = true;
    void this.load(this.host.getDemoSource(), '离线 MP4');
  }

  onShow(): void {
    this.updateVisibility(true);
  }

  onHide(): void {
    this.updateVisibility(false);
  }

  onDestroy(): void {
    this.alive = false;
    this.generation++;
    const player = this.player;
    const subscription = this.subscription;
    this.player = undefined;
    this.subscription = undefined;
    void this.close(player, subscription);
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { source, input, phase, error, playing, muted, speed, durationMs, positionMs, mode } = this.state;
    const presentation = mode === 'fullscreen' ? '全屏' : mode === 'pictureInPicture' ? '画中画' : '内嵌';

    <view accessibilityId="video-page" style={styles.page}>
      <NavigationBar title="原生视频播放器" topInset={insets.top} onBack={this.handleBack} />
      <scroll flexGrow={1}>
        <view
          paddingTop={tokens.space.lg}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.xl}
        >
          <label accessibilityId="video-status" style={styles.status} value={phase} />
          <view style={styles.player}>
            {!!source && (
              <video
                key={source}
                accessibilityId="video-canvas"
                limitToViewport={false}
                width="100%"
                height="100%"
                src={source}

              />
            )}
          </view>
          <label
            accessibilityId="video-time"
            style={styles.text}
            value={`${(positionMs / 1000).toFixed(1)} / ${(durationMs / 1000).toFixed(1)} 秒 · ${presentation}`}
          />
          {!!error && <label accessibilityId="video-error" style={styles.error} value={error} />}
          <Button id="video-play" title={playing ? '暂停视频' : '播放视频'} onTap={this.handlePlayback} />
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button id="video-seek" title="跳到 50%" secondary={true} onTap={this.handleSeek} />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button id="video-speed" title={`倍速 ${speed}×`} secondary={true} onTap={this.handleSpeed} />
            </view>
          </view>
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button id="video-fullscreen" title="全屏播放" secondary={true} onTap={this.handleFullscreen} />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button id="video-pip" title="画中画" secondary={true} onTap={this.handlePiP} />
            </view>
          </view>
          <Button id="video-mute" title={muted ? '取消静音' : '静音'} secondary={true} onTap={this.handleMute} />
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button id="video-offline" title="载入离线 MP4" secondary={true} onTap={this.handleOffline} />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button id="video-hls" title="载入 HLS 示例" secondary={true} onTap={this.handleHls} />
            </view>
          </view>
          <view
            height={46}
            backgroundColor={color.surface}
            borderRadius={tokens.radius.control}
            paddingLeft={12}
            paddingRight={12}
            marginBottom={10}
          >
            <textfield
              accessibilityId="video-url"
              width="100%"
              height="100%"
              color={color.text}
              font={systemFont(14)}
              value={input}
              placeholder="HTTPS 视频或 M3U8 地址"
              autocapitalization="none"
              autocorrection="none"
              onChange={this.handleInput}
            />
          </view>
          <Button id="video-load-url" title="载入 URL" secondary={true} onTap={this.handleUrl} />
          <label
            style={styles.text}
            value="MP4 随 App 打包，可离线播放。HLS 示例需要网络；直播通常不能定位到固定的 50%。"
          />
          <label
            style={styles.text}
            value="普通离页或后台会暂停；全屏和画中画保留同一个播放器。关闭页面释放资源，活跃画中画则在关闭后释放。"
          />
        </view>
      </scroll>
    </view>;
  }

  private close(player?: VideoPlayer, subscription?: VideoSubscription): Promise<void> {
    if (!player && !subscription) return Promise.resolve();
    // Native unsubscribe/release acknowledgements must remain callable after root destruction.
    return asyncWithProtectedRefsForContextId(
      this.renderer.contextId, () => this.closeWithProtectedRefs(player, subscription),
    );
  }

  private async closeWithProtectedRefs(player?: VideoPlayer, subscription?: VideoSubscription): Promise<void> {
    const cleanup: Promise<void>[] = [];
    // Issue both native calls before awaiting: page destruction can invalidate its proxy references.
    try {
      const unsubscribe = subscription?.unsubscribe();
      if (unsubscribe) cleanup.push(unsubscribe.catch(error => console.error('Video unsubscribe', String(error))));
    } catch (error) {
      console.error('Video unsubscribe', String(error));
    }
    try {
      const release = player?.release();
      if (release) cleanup.push(release.catch(error => console.error('Video release', String(error))));
    } catch (error) {
      console.error('Video release', String(error));
    }
    await Promise.all(cleanup);
  }

  private load(url: string, label: string): Promise<void> {
    // A late create/subscribe result must still be released if the page exits while awaiting it.
    return asyncWithProtectedRefsForContextId(this.renderer.contextId, () => this.loadWithProtectedRefs(url, label));
  }

  private async loadWithProtectedRefs(url: string, label: string): Promise<void> {
    const generation = ++this.generation;
    this.loaded = false;
    this.lastSequence = -1;
    this.lastNativeState = undefined;
    this.pendingIntent = {};
    this.commandRevision++;
    const old = this.player;
    const oldSubscription = this.subscription;
    this.player = undefined;
    this.subscription = undefined;
    this.setState({
      source: '', phase: `正在准备${label}`, error: '', playing: false,
      positionMs: 0, durationMs: 0, mode: 'inline', muted: false, speed: 1,
    });
    let player: VideoPlayer | undefined;
    try {
      await this.close(old, oldSubscription);
      if (!this.alive || generation !== this.generation) return;
      player = await this.host.create(url);
      if (!this.alive || generation !== this.generation) {
        await player.release();
        return;
      }
      this.player = player;
      await player.setPageVisible(this.viewModel.visible);
      if (!this.alive || generation !== this.generation) return;
      this.setState({ source: player.getSource(), phase: `正在加载${label}` });
      const current = player;
      const subscription = await player.subscribe(state => {
        if (this.alive && generation === this.generation && this.player === current) this.receiveState(state);
      });
      if (!this.alive || generation !== this.generation || this.player !== player) {
        await subscription.unsubscribe();
        return;
      }
      this.subscription = subscription;
    } catch (error) {
      if (this.alive && generation === this.generation) {
        this.player = undefined;
        this.setState({ source: '', error: String(error), phase: '视频加载或播放失败', playing: false });
        await this.close(player);
      }
    }
  }

  private updateVisibility(visible: boolean): void {
    const player = this.player;
    if (player) void player.setPageVisible(visible).catch(error => {
      if (this.alive && player === this.player) this.setState({ error: String(error) });
    });
  }

  private receiveState(state: VideoState): void {
    if (state.sequence <= this.lastSequence) return;
    this.lastSequence = state.sequence;
    this.lastNativeState = state;
    this.renderState(state);
  }

  private renderState(state: VideoState): void {
    this.loaded = state.loaded;
    this.setState({
      positionMs: state.currentTimeMs,
      durationMs: state.durationMs,
      mode: state.mode,
      playing: this.pendingIntent.playing ?? state.requestedPlayback,
      speed: this.pendingIntent.speed ?? state.playbackRate,
      muted: this.pendingIntent.muted ?? state.volume === 0,
      error: state.error,
      phase: state.error ? '视频加载或播放失败'
        : state.ended ? '视频播放结束'
        : !state.loaded ? '正在加载视频'
        : state.playing ? '视频播放中'
        : state.requestedPlayback ? '正在缓冲视频' : '视频已暂停',
    });
  }

  private changeIntent<K extends 'playing' | 'speed' | 'muted'>(
    field: K, value: State[K], operation: (player: VideoPlayer) => Promise<void>,
  ): void {
    if (!this.player) return;
    const generation = this.generation;
    const revision = ++this.intentRevisions[field];
    this.pendingIntent = { ...this.pendingIntent, [field]: value };
    this.setState({ ...this.pendingIntent });
    void this.command(async player => {
      try {
        await operation(player);
      } finally {
        // Acknowledgement clears the local intent even if a newer native action superseded it.
        if (this.alive && generation === this.generation && revision === this.intentRevisions[field]) {
          delete this.pendingIntent[field];
          if (this.lastNativeState) this.renderState(this.lastNativeState);
        }
      }
    });
  }

  private async command(operation: (player: VideoPlayer) => Promise<void>): Promise<void> {
    const player = this.player;
    if (!player) return;
    const revision = ++this.commandRevision;
    try {
      await operation(player);
    } catch (error) {
      if (this.alive && player === this.player && revision === this.commandRevision) {
        this.setState({ error: String(error) });
      }
    }
  }

  private handlePlayback = (): void => {
    if (!this.loaded) {
      this.setState({ phase: '视频尚未就绪，请稍候' });
      return;
    }
    const playing = !(this.pendingIntent.playing ?? this.state.playing);
    this.changeIntent('playing', playing, player => playing ? player.play() : player.pause());
  };
  private handleSeek = (): void => {
    const target = this.state.durationMs / 2;
    if (target > 0) void this.command(player => player.seekTo(target));
  };
  private handleSpeed = (): void => {
    const current = this.pendingIntent.speed ?? this.state.speed;
    const speed = current === 1 ? 1.5 : current === 1.5 ? 2 : 1;
    this.changeIntent('speed', speed, player => player.setPlaybackRate(speed));
  };
  private handleMute = (): void => {
    const muted = !(this.pendingIntent.muted ?? this.state.muted);
    this.changeIntent('muted', muted, player => player.setVolume(muted ? 0 : 1));
  };
  private handleInput = (event: { text: string }): void => this.setState({ input: event.text });
  private handleOffline = (): void => { void this.load(this.host.getDemoSource(), '离线 MP4'); };
  private handleHls = (): void => { this.setState({ input: HLS_EXAMPLE }); void this.load(HLS_EXAMPLE, 'HLS'); };
  private handleUrl = (): void => {
    const url = this.state.input.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      this.setState({ error: '请输入完整的 HTTP(S) 视频地址' });
      return;
    }
    void this.load(url, '视频');
  };
  private handleFullscreen = (): void => { void this.command(player => player.enterFullscreen()); };
  private handlePiP = (): void => { void this.command(player => player.enterPictureInPicture()); };
  private handleBack = (): void => this.context.back();
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  player: new Style<View>({ height: 200, width: '100%', backgroundColor: '#101828', marginBottom: 12 }),
  status: new Style<Label>({ font: systemSemiboldFont(16), color: color.text, marginBottom: 12 }),
  text: new Style<Label>({ font: systemFont(12), color: color.muted, numberOfLines: 0, marginBottom: 12 }),
  error: new Style<Label>({ font: systemFont(12), color: color.danger, numberOfLines: 0, marginBottom: 12 }),
};
