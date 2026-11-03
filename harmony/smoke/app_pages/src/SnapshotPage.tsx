import { Base64 } from 'coreutils/src/Base64';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { View } from 'valdi_tsx/src/NativeTemplateElements';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';

interface SnapshotState extends SmokeState {
  image?: string;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class SnapshotPage extends SmokePage<SnapshotState> {
  private target = new ElementRef<View>();
  private captureGeneration = 0;

  state: SnapshotState = { count: 0, result: 'Snapshot: ready', pages: 'Stack: loading' };

  onDestroy(): void {
    ++this.captureGeneration;
    super.onDestroy();
  }

  private capture = async (): Promise<void> => {
    const generation = ++this.captureGeneration;
    this.setState({ result: 'Snapshot: pending' });
    try {
      const encoded = await this.target.single()?.takeSnapshot();
      const bytes = encoded ? Base64.toByteArray(encoded) : undefined;
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      const valid = !!bytes && bytes.length > 24 &&
        signature.every((value, index) => bytes[index] === value) &&
        bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82;
      const width = valid ? this.dimension(bytes!, 16) : 0;
      const height = valid ? this.dimension(bytes!, 20) : 0;
      const success = valid && width > 0 && height > 0;
      this.log('snapshot', { success, bytes: bytes?.length ?? 0, width, height });
      if (!this.isDestroyed() && generation === this.captureGeneration) {
        this.setState({
          result: success ? `Snapshot: passed (${width}x${height})` : 'Snapshot: failed',
          image: success ? `data:image/png;base64,${encoded}` : undefined,
        });
      }
    } catch (error) {
      this.log('snapshot', { success: false, error: String(error) });
      if (!this.isDestroyed() && generation === this.captureGeneration) {
        this.setState({ result: 'Snapshot: failed' });
      }
    }
  };

  private dimension(bytes: Uint8Array, offset: number): number {
    return bytes[offset] * 16777216 + bytes[offset + 1] * 65536 +
      bytes[offset + 2] * 256 + bytes[offset + 3];
  }

  private inspectReferences = async (): Promise<void> => {
    const element = this.target.single();
    const node = element?.getNativeNode();
    const legacy = await element?.getNativeView();
    const success = node !== undefined && node !== null && typeof node !== 'number' &&
      legacy !== undefined && legacy !== null && typeof legacy !== 'number';
    this.log('native-reference', { success, nodeType: typeof node, legacyType: typeof legacy });
    if (!this.isDestroyed()) this.setState({ result: `Native refs: ${success ? 'passed' : 'failed'}` });
  };

  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 12}
      paddingLeft={16} paddingRight={16}>
      {this.header('Native snapshots and refs')}
      <view ref={this.target} width="100%" height={120} backgroundColor="#176b55"
        accessibilityId="smoke-snapshot-target" flexDirection="row">
        <view width="50%" height="100%" backgroundColor="#e4b449"
          alignItems="center" justifyContent="center">
          <label value="PNG A" font="system-bold 22" color="#182825" />
        </view>
        <view width="50%" height="100%" alignItems="center" justifyContent="center">
          <label value="PNG B" font="system-bold 22" color="#ffffff" />
        </view>
      </view>
      <label width="100%" height={34} font="system 16" color="#182825" value={this.state.result} />
      {this.button('Capture native PNG', () => { void this.capture(); })}
      {this.button('Inspect native refs', () => { void this.inspectReferences(); })}
      {this.state.image ? <image width="100%" height={120} src={this.state.image} objectFit="contain" /> : undefined}
      {this.button('Back from snapshots', () => this.pageRouter.back())}
    </view>;
  }
}
