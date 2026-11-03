import { TextDecoder, TextEncoder } from 'coreutils/src/unicode/TextCoding';
import { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import { AttributedTextBuilder } from 'valdi_core/src/utils/AttributedTextBuilder';
import { HTTPClient } from 'valdi_http/src/HTTPClient';
import { HTTPMethod, HTTPResponse } from 'valdi_http/src/HTTPTypes';
import { PageContext, PageViewModel } from './Page';
import { SmokePage } from './SmokePage';

const styledText = new AttributedTextBuilder()
  .append('Native ', { font: 'system-bold 24', color: '#176b55' })
  .append('styled ', { font: 'system-italic 24', color: '#b54324' })
  .append('text', { textDecoration: 'underline', color: '#224a91' })
  .append('\nCJK \u4e2d\u6587 / emoji \ud83d\ude42 / RTL \u0645\u0631\u062d\u0628\u0627')
  .build();

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class FoundationPage extends SmokePage {
  private client = new HTTPClient('https://echo.apifox.com');
  private request?: CancelablePromise<HTTPResponse>;
  private generation = 0;

  onDestroy(): void {
    ++this.generation;
    this.request?.cancel?.();
    this.request = undefined;
    super.onDestroy();
  }

  private run = async (method: string): Promise<void> => {
    const generation = ++this.generation;
    this.request?.cancel?.();
    const binary = method === 'PUT';
    const body = binary
      ? new Uint8Array([0, 1, 127, 128, 255, 0, 66])
      : new TextEncoder().encode('{"probe":"valdi-harmony","enabled":false}');
    this.setState({ result: `${method}: pending` });
    // The pinned JS enum predates PATCH; the native request ABI uses a method string.
    const request = this.client.perform(method.toLowerCase(), method as HTTPMethod, {
      'Content-Type': binary ? 'application/octet-stream' : 'application/json',
    }, body);
    this.request = request;
    try {
      const response = await request;
      const bytes = response.body ?? new Uint8Array();
      const text = new TextDecoder().decode(bytes.slice().buffer);
      const echoed = JSON.parse(text);
      const success = response.statusCode === 200 && (binary
        ? echoed.data === 'data:application/octet-stream;base64,AAF/gP8AQg=='
        : echoed.json?.probe === 'valdi-harmony' && echoed.json?.enabled === false);
      this.log('http-echo', { method, success, status: response.statusCode,
        uploadedBytes: body.length, receivedBytes: bytes.length });
      if (!this.isDestroyed() && generation === this.generation) {
        this.setState({ result: `${method}: ${success ? 'passed' : 'failed'} (${response.statusCode})` });
      }
    } catch (error) {
      this.log('http-echo', { method, success: false, error: String(error) });
      if (!this.isDestroyed() && generation === this.generation) {
        this.setState({ result: `${method}: failed` });
      }
    } finally {
      if (generation === this.generation) this.request = undefined;
    }
  };

  private cancel = async (): Promise<void> => {
    const generation = ++this.generation;
    this.request?.cancel?.();
    const request = this.client.get('get');
    this.request = request;
    request.cancel?.();
    let success = false;
    try {
      await request;
    } catch (error) {
      success = error instanceof Error && error.message === 'Request was cancelled';
    }
    this.log('http-cancel', { success });
    if (!this.isDestroyed() && generation === this.generation) {
      this.request = undefined;
      this.setState({ result: `Cancel: ${success ? 'passed' : 'failed'}` });
    }
  };

  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 12}
      paddingLeft={16} paddingRight={16}>
      <label width="100%" height={34} font="system-bold 22" color="#182825" value="Native text and HTTP" />
      <label width="100%" height={100} font="system 20" value={styledText}
        numberOfLines={0} lineHeight={1.2}
        onLayout={frame => this.log('rich-label-layout', { ...frame })} />
      <label width="100%" font="system 15" color="#182825" numberOfLines={0}
        letterSpacing={1} lineHeightAbsolute={25} textAlign="justified"
        value="One native paragraph supplies both drawing and measurement. This label wraps with fixed line height."
        onLayout={frame => this.log('text-measure-layout', { ...frame })} />
      <label width="100%" height={36} font="system 16" color="#374151" value={this.state.result} />
      {this.button('POST JSON echo', () => { void this.run('POST'); })}
      {this.button('PUT binary echo', () => { void this.run('PUT'); })}
      {this.button('PATCH JSON echo', () => { void this.run('PATCH'); })}
      {this.button('Cancel native HTTP', () => { void this.cancel(); })}
      {this.button('Back from native foundation', () => this.pageRouter.back())}
    </view>;
  }
}
