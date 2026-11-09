/** @ExportEnum({ios: 'VRVideoMode', android: 'io.valdiroutes.video.VideoMode'}) */
export enum VideoMode {
  Inline = 'inline',
  Fullscreen = 'fullscreen',
  PictureInPicture = 'pictureInPicture',
}

/** @ExportModel({ios: 'VRVideoState', android: 'io.valdiroutes.video.VideoState'}) */
export interface VideoState {
  currentTimeMs: number;
  durationMs: number;
  playing: boolean;
  /** Latest user/native-control intent, independent of buffering or visibility suspension. */
  requestedPlayback: boolean;
  mode: VideoMode;
  supportsPictureInPicture: boolean;
  error: string;
  loaded: boolean;
  /** Set only by the native player's genuine completion event; cleared by seeking/replay. */
  ended: boolean;
  volume: number;
  playbackRate: number;
  /** Monotonically increasing per-player event sequence. */
  sequence: number;
}

/**
 * @ExportProxy({ios: 'VRVideoSubscription', android: 'io.valdiroutes.video.VideoSubscription'})
 */
export interface VideoSubscription {
  /** Idempotent. Detaches this listener without stopping the player. */
  unsubscribe(): Promise<void>;
}

/**
 * One native player, shared by its inline surface, fullscreen and PiP.
 * @ExportProxy({ios: 'VRVideoPlayer', android: 'io.valdiroutes.video.VideoPlayer'})
 */
export interface VideoPlayer {
  /** Opaque source for the official <video> surface; session identifiers stay native. */
  getSource(): string;
  play(): Promise<void>;
  pause(): Promise<void>;
  /** Sets a finite positive preferred speed without changing play/pause intent. Resolves after native application. */
  setPlaybackRate(rate: number): Promise<void>;
  seekTo(timeMs: number): Promise<void>;
  /** Sets a finite volume in [0, 1]. Rejects invalid input without changing volume. */
  setVolume(volume: number): Promise<void>;
  setPageVisible(visible: boolean): Promise<void>;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
  /** Explicit snapshot, not required for ongoing state delivery. */
  getState(): Promise<VideoState>;
  /** Sends a current snapshot and then ordered native state/progress events. Multiple listeners are supported. */
  subscribe(listener: (state: VideoState) => void): Promise<VideoSubscription>;
  /** Idempotent. Clears listeners and releases resources; active PiP owns its remaining lifetime. */
  release(): Promise<void>;
}

/**
 * @ExportProxy({ios: 'VRVideoHost', android: 'io.valdiroutes.video.VideoHost'})
 */
export interface VideoHost {
  /**
   * Creates a player for a caller-owned source. iOS accepts HTTPS, existing file URLs,
   * or bundle:///filename for a packaged root resource (ASCII letters, digits, _, -, .;
   * no leading dot, directories, escaping, authority, query, or fragment).
   * Android accepts asset, HTTP(S), file and content URLs.
   */
  create(source: string): Promise<VideoPlayer>;
}
