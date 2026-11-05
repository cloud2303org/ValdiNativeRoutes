import type { VideoHost } from './VideoHost';

/** @ExportModule({ios: 'VRVideoNativeModule', android: 'io.valdiroutes.video.VideoNativeModule'}) */
export declare function getHost(): VideoHost;
