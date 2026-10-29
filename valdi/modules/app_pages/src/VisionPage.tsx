import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { ImageView, Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { BUILD_INFO, CppStats, sha256, stats } from './cpp/Cpp';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { PageHeader } from './PageHeader';
import { Router } from './routes';
import { runDemo, VisionDemoResult } from './vision/VisionHost';

const CHANNEL_NAMES: Record<string, string> = {
  'R channel': '红色通道 R',
  'G channel': '绿色通道 G',
  'B channel': '蓝色通道 B',
};

interface CppResult {
  buildInfo: string;
  hash: string;
  stats: CppStats;
}

interface State {
  loading: boolean;
  result?: VisionDemoResult;
  error?: string;
  cpp?: CppResult;
  cppError?: string;
}

/** What the C++ section hashes and summarizes. */
const CPP_TEXT = 'Valdi + C++';
const CPP_VALUES = [3, 1, 4, 1, 5, 9, 2, 6];

/**
 * After ExpoNativeRoutes' src/pages/vision: OpenCV makes a gray image and Canny edges from a synthetic picture, ncnn
 * runs a tiny real network on it. Both are C++ in the host, called through VisionHost.
 *
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRVisionPage', android: 'io.valdiroutes.pages.VisionPage'})
 */
export class VisionPage extends Page<PageViewModel, State, PageContext> {
  state: State = { loading: false };

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets } = this.viewModel;
    const { loading, result, error, cpp, cppError } = this.state;
    const status = loading
      ? '正在执行 OpenCV 与 ncnn…'
      : result
        ? '计算完成'
        : error
          ? '计算失败，可重试'
          : '点击运行，查看真实计算结果';

    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          paddingTop={insets.top + 12}
          paddingBottom={insets.bottom + 32}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <PageHeader title="OpenCV 与 ncnn" subtitle="图像处理与 CPU 推理" onBack={this.handleBack} />
          <label
            style={styles.body}
            numberOfLines={0}
            value="生成一张彩色图，用 OpenCV 转灰度、提取 Canny 边缘，再由 ncnn 计算 RGB 三通道的全局平均和 Softmax 响应。"
          />
          <label
            style={styles.muted}
            numberOfLines={0}
            value="这是验证原生计算链路的例子，没有训练权重，三通道结果不代表物体类别。输入由原生生成，无需相机或相册权限。"
          />
          <Button id="run" title={loading ? '正在计算' : '运行示例'} onTap={this.handleRun} />
          <label style={styles.status} value={status} />
          {error && <label key="error" style={styles.error} numberOfLines={0} value={error} />}
          {result && (
            <view key="result">
              <view style={styles.card}>
                <label style={styles.cardTitle} value="运行信息" />
                <label style={styles.line} value={`OpenCV Mobile：${result.opencvVersion}`} />
                <label style={styles.line} value={`ncnn：${result.ncnnVersion}`} />
                <label style={styles.line} value={`图片：${result.width} × ${result.height}`} />
                <label style={styles.line} value={`推理输入：${result.inferenceWidth} × ${result.inferenceHeight}`} />
                <label style={styles.line} value={`边缘像素：${result.edgePixelCount}`} />
                <label style={styles.line} value={`OpenCV 处理：${result.processingMs.toFixed(2)} ms`} />
                <label style={styles.line} value={`ncnn 推理：${result.inferenceMs.toFixed(2)} ms`} />
              </view>
              <view style={styles.card}>
                <label style={styles.cardTitle} value="合成原图" />
                <image style={styles.image} aspectRatio={result.width / result.height} src={result.inputImageUrl} />
              </view>
              <view style={styles.card}>
                <label style={styles.cardTitle} value="Canny 边缘图" />
                <image style={styles.image} aspectRatio={result.width / result.height} src={result.edgeImageUrl} />
              </view>
              <view style={styles.card}>
                <label style={styles.cardTitle} value="ncnn 三通道响应" />
                <label style={styles.muted} value={result.modelName} />
                <label style={styles.muted} numberOfLines={0} value={result.modelDescription} />
                {result.predictions.forEach(prediction => (
                  <view key={prediction.label} style={styles.response}>
                    <label style={styles.line} value={CHANNEL_NAMES[prediction.label] ?? prediction.label} />
                    <label style={styles.score} value={`${(prediction.score * 100).toFixed(2)}%`} />
                  </view>
                ))}
              </view>
            </view>
          )}

          <label style={styles.section} value="C++ 绑定（@ExportModule）" />
          <label
            style={styles.muted}
            numberOfLines={0}
            value="cpp/Cpp.d.ts 的模块由 C++ 实现，和 Valdi 运行时编在一起。JS 直接同步调用，参数和返回值由生成的 C++ 绑定转换。"
          />
          <Button id="cpp" title="调用 C++ 模块" onTap={this.handleCpp} />
          {cppError && <label key="cppError" style={styles.error} numberOfLines={0} value={cppError} />}
          {cpp && (
            <view key="cpp" style={styles.card}>
              <label style={styles.line} numberOfLines={0} value={`编译：${cpp.buildInfo}`} />
              <label style={styles.line} numberOfLines={0} value={`sha256("${CPP_TEXT}")：${cpp.hash}`} />
              <label
                style={styles.line}
                numberOfLines={0}
                value={`stats([${CPP_VALUES.join(', ')}])：count ${cpp.stats.count} · mean ${cpp.stats.mean} · min ${cpp.stats.min} · max ${cpp.stats.max}`}
              />
            </view>
          )}
        </view>
      </scroll>
    </view>;
  }

  private handleBack = () => {
    this.router.back();
  };

  private handleCpp = () => {
    try {
      this.setState({ cpp: { buildInfo: BUILD_INFO, hash: sha256(CPP_TEXT), stats: stats(CPP_VALUES) }, cppError: undefined });
    } catch (cause) {
      this.setState({ cpp: undefined, cppError: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  private handleRun = async () => {
    if (this.state.loading) return;
    this.setState({ loading: true, error: undefined, result: undefined });
    try {
      const result = await runDemo();
      this.setState({ loading: false, result });
    } catch (cause) {
      this.setState({ loading: false, error: cause instanceof Error ? cause.message : String(cause) });
    }
  };
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  body: new Style<Label>({ color: '#374151', font: systemFont(15), marginBottom: 8 }),
  muted: new Style<Label>({ color: '#6b7280', font: systemFont(13), marginBottom: 8 }),
  section: new Style<Label>({ color: '#111827', font: systemSemiboldFont(17), margin: '20 0 8 0' }),
  status: new Style<Label>({ color: '#374151', font: systemFont(14), margin: '4 0 12 0' }),
  error: new Style<Label>({ color: '#d92d20', font: systemFont(14), marginBottom: 12 }),
  card: new Style<View>({ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 12 }),
  cardTitle: new Style<Label>({ color: '#111827', font: systemSemiboldFont(16), marginBottom: 8 }),
  line: new Style<Label>({ color: '#1f2937', font: systemFont(14), marginBottom: 4 }),
  score: new Style<Label>({ color: '#1e62d0', font: systemSemiboldFont(14) }),
  image: new Style<ImageView>({ width: '100%', objectFit: 'contain', backgroundColor: '#f3f4f6', borderRadius: 8 }),
  response: new Style<View>({ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }),
};
