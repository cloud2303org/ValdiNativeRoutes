import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { getHost } from 'app_video/src/Video';
import type { VideoPlayer, VideoState, VideoSubscription } from 'app_video/src/VideoHost';
import { createSignal, onCleanup, Show } from 'solid-js';
import { onPageHide, onPageShow, type SolidPageProps } from 'solid_native/src/bridge';
import { Device } from 'valdi_core/src/Device';
import { asyncWithProtectedRefsForContextId } from 'valdi_core/src/NativeReferences';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';

const HLS_EXAMPLE = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';
// The business sample owns the resource and chooses its platform's packaged-resource URL.
const offlineSource = (): string => (Device.isAndroid() ? 'asset:///flower.mp4' : 'bundle:///flower.mp4');

interface VideoUiState {
  playing: boolean;
  muted: boolean;
  speed: number;
}

export function VideoPage(props: SolidPageProps<PageViewModel, PageContext>) {
  usePageStatusBar(props, 'auto');

  const [source, setSource] = createSignal('');
  const [input, setInput] = createSignal(HLS_EXAMPLE);
  const [phase, setPhase] = createSignal('正在准备离线 MP4');
  const [error, setError] = createSignal('');
  const [playing, setPlaying] = createSignal(false);
  const [muted, setMuted] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [durationMs, setDurationMs] = createSignal(0);
  const [positionMs, setPositionMs] = createSignal(0);
  const [mode, setMode] = createSignal('inline');

  const host = getHost();
  let player: VideoPlayer | undefined;
  let subscription: VideoSubscription | undefined;
  let alive = true;
  let generation = 0;
  let loaded = false;
  let lastSequence = -1;
  let commandRevision = 0;
  let lastNativeState: VideoState | undefined;
  let pendingIntent: Partial<VideoUiState> = {};
  const intentRevisions = { playing: 0, speed: 0, muted: 0 };

  const closeWithProtectedRefs = async (
    targetPlayer?: VideoPlayer,
    targetSubscription?: VideoSubscription,
  ): Promise<void> => {
    const cleanup: Promise<void>[] = [];
    // Issue both native calls before awaiting: page destruction can invalidate its proxy references.
    try {
      const unsubscribe = targetSubscription?.unsubscribe();
      if (unsubscribe) cleanup.push(unsubscribe.catch(err => console.error('Video unsubscribe', String(err))));
    } catch (err) {
      console.error('Video unsubscribe', String(err));
    }
    try {
      const release = targetPlayer?.release();
      if (release) cleanup.push(release.catch(err => console.error('Video release', String(err))));
    } catch (err) {
      console.error('Video release', String(err));
    }
    await Promise.all(cleanup);
  };

  const close = (targetPlayer?: VideoPlayer, targetSubscription?: VideoSubscription): Promise<void> => {
    if (!targetPlayer && !targetSubscription) return Promise.resolve();
    // Native unsubscribe/release acknowledgements must remain callable after root destruction.
    return asyncWithProtectedRefsForContextId(props.contextId, () =>
      closeWithProtectedRefs(targetPlayer, targetSubscription),
    );
  };

  const renderState = (state: VideoState) => {
    loaded = state.loaded;
    setPositionMs(state.currentTimeMs);
    setDurationMs(state.durationMs);
    setMode(state.mode);
    setPlaying(pendingIntent.playing ?? state.requestedPlayback);
    setSpeed(pendingIntent.speed ?? state.playbackRate);
    setMuted(pendingIntent.muted ?? state.volume === 0);
    setError(state.error);
    setPhase(
      state.error
        ? '视频加载或播放失败'
        : state.ended
          ? '视频播放结束'
          : !state.loaded
            ? '正在加载视频'
            : state.playing
              ? '视频播放中'
              : state.requestedPlayback
                ? '正在缓冲视频'
                : '视频已暂停',
    );
  };

  const receiveState = (state: VideoState) => {
    if (state.sequence <= lastSequence) return;
    lastSequence = state.sequence;
    lastNativeState = state;
    renderState(state);
  };

  const loadWithProtectedRefs = async (url: string, label: string): Promise<void> => {
    const gen = ++generation;
    loaded = false;
    lastSequence = -1;
    lastNativeState = undefined;
    pendingIntent = {};
    commandRevision++;
    const old = player;
    const oldSubscription = subscription;
    player = undefined;
    subscription = undefined;
    setSource('');
    setPhase(`正在准备${label}`);
    setError('');
    setPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    setMode('inline');
    setMuted(false);
    setSpeed(1);

    let nextPlayer: VideoPlayer | undefined;
    try {
      await close(old, oldSubscription);
      if (!alive || gen !== generation) return;
      nextPlayer = await host.create(url);
      if (!alive || gen !== generation) {
        await nextPlayer.release();
        return;
      }
      player = nextPlayer;
      await nextPlayer.setPageVisible(props.viewModel().visible);
      if (!alive || gen !== generation) return;
      setSource(nextPlayer.getSource());
      setPhase(`正在加载${label}`);
      const current = nextPlayer;
      const nextSub = await nextPlayer.subscribe(state => {
        if (alive && gen === generation && player === current) receiveState(state);
      });
      if (!alive || gen !== generation || player !== nextPlayer) {
        await nextSub.unsubscribe();
        return;
      }
      subscription = nextSub;
    } catch (err) {
      if (alive && gen === generation) {
        player = undefined;
        setSource('');
        setError(String(err));
        setPhase('视频加载或播放失败');
        setPlaying(false);
        await close(nextPlayer);
      }
    }
  };

  const load = (url: string, label: string): Promise<void> => {
    // A late create/subscribe result must still be released if the page exits while awaiting it.
    return asyncWithProtectedRefsForContextId(props.contextId, () => loadWithProtectedRefs(url, label));
  };

  const updateVisibility = (visible: boolean) => {
    const active = player;
    if (active) {
      void active.setPageVisible(visible).catch(err => {
        if (alive && active === player) setError(String(err));
      });
    }
  };

  onPageShow(() => updateVisibility(true));
  onPageHide(() => updateVisibility(false));
  onCleanup(() => {
    alive = false;
    generation++;
    const activePlayer = player;
    const activeSub = subscription;
    player = undefined;
    subscription = undefined;
    void close(activePlayer, activeSub);
  });

  void load(offlineSource(), '离线 MP4');

  const command = async (operation: (active: VideoPlayer) => Promise<void>): Promise<void> => {
    const active = player;
    if (!active) return;
    const revision = ++commandRevision;
    try {
      await operation(active);
    } catch (err) {
      if (alive && active === player && revision === commandRevision) {
        setError(String(err));
      }
    }
  };

  const changeIntent = <K extends keyof VideoUiState>(
    field: K,
    value: VideoUiState[K],
    operation: (active: VideoPlayer) => Promise<void>,
  ) => {
    if (!player) return;
    const gen = generation;
    const revision = ++intentRevisions[field];
    pendingIntent = { ...pendingIntent, [field]: value };
    if (field === 'playing') setPlaying(value as boolean);
    else if (field === 'speed') setSpeed(value as number);
    else setMuted(value as boolean);

    void command(async active => {
      try {
        await operation(active);
      } finally {
        // Acknowledgement clears the local intent even if a newer native action superseded it.
        if (alive && gen === generation && revision === intentRevisions[field]) {
          delete pendingIntent[field];
          if (lastNativeState) renderState(lastNativeState);
        }
      }
    });
  };

  const handlePlayback = () => {
    if (!loaded) {
      setPhase('视频尚未就绪，请稍候');
      return;
    }
    const nextPlaying = !(pendingIntent.playing ?? playing());
    changeIntent('playing', nextPlaying, active => (nextPlaying ? active.play() : active.pause()));
  };

  const handleSeek = () => {
    const target = durationMs() / 2;
    if (target > 0) void command(active => active.seekTo(target));
  };

  const handleSpeed = () => {
    const current = pendingIntent.speed ?? speed();
    const next = current === 1 ? 1.5 : current === 1.5 ? 2 : 1;
    changeIntent('speed', next, active => active.setPlaybackRate(next));
  };

  const handleMute = () => {
    const next = !(pendingIntent.muted ?? muted());
    changeIntent('muted', next, active => active.setVolume(next ? 0 : 1));
  };

  const handleOffline = () => {
    void load(offlineSource(), '离线 MP4');
  };

  const handleHls = () => {
    setInput(HLS_EXAMPLE);
    void load(HLS_EXAMPLE, 'HLS');
  };

  const handleUrl = () => {
    const url = input().trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError('请输入完整的 HTTP(S) 视频地址');
      return;
    }
    void load(url, '视频');
  };

  const presentation = () =>
    mode() === 'fullscreen' ? '全屏' : mode() === 'pictureInPicture' ? '画中画' : '内嵌';

  const { insets } = props;

  return (
    <view accessibilityId="video-page" style={styles.page}>
      <NavigationBar title="原生视频播放器" topInset={insets.top} onBack={() => props.context.back()} />
      <scroll flexGrow={1}>
        <view
          paddingTop={tokens.space.lg}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.xl}
        >
          <label accessibilityId="video-status" style={styles.status} value={phase()} />
          <view style={styles.player}>
            <Show when={source()} keyed>
              {src => (
                <video
                  accessibilityId="video-canvas"
                  limitToViewport={false}
                  width="100%"
                  height="100%"
                  src={src}
                />
              )}
            </Show>
          </view>
          <label
            accessibilityId="video-time"
            style={styles.text}
            value={`${(positionMs() / 1000).toFixed(1)} / ${(durationMs() / 1000).toFixed(1)} 秒 · ${presentation()}`}
          />
          <Show when={error()}>
            {err => <label accessibilityId="video-error" style={styles.error} value={err()} />}
          </Show>
          <Button id="video-play" title={playing() ? '暂停视频' : '播放视频'} onTap={handlePlayback} />
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button id="video-seek" title="跳到 50%" secondary={true} onTap={handleSeek} />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button id="video-speed" title={`倍速 ${speed()}×`} secondary={true} onTap={handleSpeed} />
            </view>
          </view>
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button
                id="video-fullscreen"
                title="全屏播放"
                secondary={true}
                onTap={() => void command(active => active.enterFullscreen())}
              />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button
                id="video-pip"
                title="画中画"
                secondary={true}
                onTap={() => void command(active => active.enterPictureInPicture())}
              />
            </view>
          </view>
          <Button id="video-mute" title={muted() ? '取消静音' : '静音'} secondary={true} onTap={handleMute} />
          <view flexDirection="row">
            <view flexGrow={1} flexBasis={0} marginRight={5}>
              <Button id="video-offline" title="载入离线 MP4" secondary={true} onTap={handleOffline} />
            </view>
            <view flexGrow={1} flexBasis={0} marginLeft={5}>
              <Button id="video-hls" title="载入 HLS 示例" secondary={true} onTap={handleHls} />
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
              value={input()}
              placeholder="HTTPS 视频或 M3U8 地址"
              autocapitalization="none"
              autocorrection="none"
              onChange={event => setInput(event.text)}
            />
          </view>
          <Button id="video-load-url" title="载入 URL" secondary={true} onTap={handleUrl} />
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
    </view>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  player: new Style<View>({ height: 200, width: '100%', backgroundColor: color.playerBackground, marginBottom: 12 }),
  status: new Style<Label>({ font: systemSemiboldFont(16), color: color.text, marginBottom: 12 }),
  text: new Style<Label>({ font: systemFont(12), color: color.muted, numberOfLines: 0, marginBottom: 12 }),
  error: new Style<Label>({ font: systemFont(12), color: color.danger, numberOfLines: 0, marginBottom: 12 }),
};
