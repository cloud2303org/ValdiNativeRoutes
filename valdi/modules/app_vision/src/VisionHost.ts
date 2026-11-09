import { withGlobalNativeRefs } from 'valdi_core/src/NativeReferences';
import { getHost } from './Vision';

/**
 * Typed Polyglot C++ bridge to VisionCore, OpenCV and ncnn, statically linked into ValdiRuntime.
 * Work runs on the runtime worker queue; images return as file:// PNGs in the native disk cache.
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

/** Same entry as `@native-routes/vision`'s runDemo. */
export function runDemo(): Promise<VisionDemoResult> {
  return new Promise((resolve, reject) => {
    withGlobalNativeRefs('vision.runDemo', () => {
      getHost().runDemo((error, result) =>
        error || !result ? reject(new Error(error || 'no result')) : resolve(result),
      );
    });
  });
}
