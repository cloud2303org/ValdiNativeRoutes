import res from 'app_pages/res';
import { addAssetLoadObserver, Asset, AssetOutputType, AssetSubscription } from 'valdi_core/src/Asset';
import { ImageFilters } from 'valdi_core/src/utils/ImageFilter';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';
import { httpsControlImage } from './NetworkFixtures';

interface ImageState extends SmokeState {
  source: number;
  fit: number;
  loaded: number;
  failed: number;
  decoded: string;
  filter: number;
  direct?: Asset;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class ImagePage extends SmokePage<ImageState> {
  private subscriptions: AssetSubscription[] = [];

  onDestroy(): void {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
    this.subscriptions = [];
    super.onDestroy();
  }

  private useDecoded(index: number): void {
    this.subscriptions.push(addAssetLoadObserver(index === 0 ? res.tabHomeOn : res.tabComponentsOn,
      (asset, error) => {
        if (this.isDestroyed()) return;
        if (!asset || asset instanceof Uint8Array || error) {
          this.loaded(false, error);
          return;
        }
        // The native image binder accepts LoadedAsset handles in addition to catalog assets.
        this.setState({ direct: asset as unknown as Asset, filter: 0, result: `Direct image: ${index}` });
        this.log('image-direct-source', { index });
      }, AssetOutputType.IMAGE_HARMONY));
  }

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={30} marginBottom={4} backgroundColor="#176b55" borderRadius={5}
      alignItems="center" justifyContent="center" onTap={onTap}
      accessibilityId={`smoke-image-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityLabel={title}>
      <label width="96%" height={26} font="system-semibold 14" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  state: ImageState = {
    count: 0, result: 'Image: pending', pages: 'Stack: loading',
    source: 0, fit: 0, loaded: 0, failed: 0, decoded: 'Not decoded', filter: 0,
  };

  private loaded = (success: boolean, error?: string): void => {
    this.log('image-load', { success, error: error ?? null, source: this.state.source });
    this.setState({
      loaded: this.state.loaded + (success ? 1 : 0),
      failed: this.state.failed + (success ? 0 : 1),
      result: success ? 'Image: loaded' : 'Image: failed',
    });
  };

  onRender(): void {
    const s = this.state;
    const { insets } = this.viewModel;
    const fits = ['contain', 'cover', 'fill', 'none'] as const;
    const sources = [res.tabHomeOn, res.tabComponentsOn, httpsControlImage,
      'data:image/png;base64,bm90IGFuIGltYWdl'] as const;
    const filters = [undefined, ImageFilters.invert(), ImageFilters.grayscale(),
      ImageFilters.compose(ImageFilters.invert(), ImageFilters.blur(3))];
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 16} paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      <label width="100%" height={34} font="system-bold 22" color="#182825" value="Native image contracts" />
      <label width="100%" height={28} font="system 15" color="#182825"
        value={`Loaded=${s.loaded} failed=${s.failed} / ${s.decoded}`} />
      <image width="100%" height={160} src={s.direct ?? sources[s.source]} objectFit={fits[s.fit]}
        filter={filters[s.filter]}
        backgroundColor="#d6e6d8" onAssetLoad={this.loaded}
        onImageDecoded={(width, height) => {
          this.log('image-decoded', { width, height });
          this.setState({ decoded: `${width}x${height}` });
        }} />
      <label width="100%" height={28} font="system 15" color="#182825" value={s.result} />
      {this.button(`Image source: ${['packaged home', 'packaged components', 'HTTPS control', 'invalid bytes'][s.source]}`,
        () => this.setState({ source: (s.source + 1) % sources.length, direct: undefined }))}
      {this.button(`Image fit: ${fits[s.fit]}`, () => this.setState({ fit: (s.fit + 1) % fits.length }))}
      {this.button(`Image filter: ${['none', 'invert', 'grayscale', 'invert and blur'][s.filter]}`, () => {
        const filter = (s.filter + 1) % filters.length;
        this.log('image-filter-request', { filter });
        this.setState({ filter, direct: undefined });
      })}
      {this.button('Use decoded home image', () => this.useDecoded(0))}
      {this.button('Use decoded components image', () => this.useDecoded(1))}
      <label width="100%" height={32} font={res.robotoMonoRegular(20)} color="#182825"
        value="Packaged font: 0123 WMi" />
      <view width="100%" flexDirection="row" alignItems="flex-start">
        <label font={res.robotoMonoRegular(20)} color="#182825" value="iiii" marginRight={20}
          onLayout={frame => this.log('font-measure', { sample: 'narrow', ...frame })} />
        <label font={res.robotoMonoRegular(20)} color="#182825" value="WWWW"
          onLayout={frame => this.log('font-measure', { sample: 'wide', ...frame })} />
      </view>
      {this.button('Open native snapshots and refs', () => this.pageRouter.push('snapshot'))}
      {this.button('Back from images', () => this.pageRouter.back())}
    </view>;
  }
}
