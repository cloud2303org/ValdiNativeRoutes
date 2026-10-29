/**
 * The Valdi bridge to ExpoNativeRoutes' VisionCore (C++, OpenCV mobile + ncnn, statically linked by each host).
 * Images come back as file:// PNGs in the host's cache instead of the original data URLs.
 */

/** @ExportModel({ios: 'VRVisionPrediction', android: 'io.valdiroutes.pages.VisionPrediction'}) */
export interface VisionPrediction {
  label: string;
  score: number;
}

/** @ExportModel({ios: 'VRVisionDemoResult', android: 'io.valdiroutes.pages.VisionDemoResult'}) */
export interface VisionDemoResult {
  opencvVersion: string;
  ncnnVersion: string;
  modelName: string;
  modelDescription: string;
  /** Synthetic image and OpenCV preprocessing. */
  processingMs: number;
  /** ncnn network setup, normalization and inference. */
  inferenceMs: number;
  width: number;
  height: number;
  inferenceWidth: number;
  inferenceHeight: number;
  edgePixelCount: number;
  inputImageUrl: string;
  edgeImageUrl: string;
  predictions: VisionPrediction[];
}

/** @ExportProxy({ios: 'VRVisionHost', android: 'io.valdiroutes.pages.VisionHost'}) */
export interface VisionHost {
  /** Runs on a native worker thread; `error` is '' on success. */
  runDemo(done: (error: string, result: VisionDemoResult | undefined) => void): void;
}

const HOST_KEY = '__valdiRoutesVisionHost';

/** @ExportFunction({ios: 'VRInstallVisionHost', android: 'io.valdiroutes.pages.InstallVisionHost'}) */
export function installVisionHost(host: VisionHost): void {
  (globalThis as any)[HOST_KEY] = host;
}

/** Same entry as `@native-routes/vision`'s runDemo. */
export function runDemo(): Promise<VisionDemoResult> {
  const host: VisionHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) {
    return Promise.reject(new Error('native vision is not installed'));
  }
  return new Promise((resolve, reject) => {
    host.runDemo((error, result) => (error || !result ? reject(new Error(error || 'no result')) : resolve(result)));
  });
}
