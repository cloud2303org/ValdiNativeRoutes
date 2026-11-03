import { PageContext, PageViewModel } from './Page';
import { router } from './navigation';
import { SmokePage } from './SmokePage';
import { addAssetLoadObserver, AssetOutputType, AssetSubscription, getLoadedAssetMetadata } from 'valdi_core/src/Asset';
import res from 'app_pages/res';
import { openDatabase } from 'client_sql/src/ClientSQLNative';
import { httpsControlImage } from './NetworkFixtures';
import { customTabContentPadding } from './TabBarLayout';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class HomePage extends SmokePage {
  private assets: AssetSubscription[] = [];
  private checkingResources = false;
  private cancelResourceCheck?: () => void;

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={32} marginBottom={5} backgroundColor="#176b55" borderRadius={5}
      alignItems="center" justifyContent="center" onTap={onTap}
      accessibilityId={`smoke-home-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityLabel={title}>
      <label width="96%" height={28} font="system-semibold 14" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  onDestroy(): void {
    this.assets.forEach(asset => asset.unsubscribe());
    this.assets = [];
    this.cancelResourceCheck?.();
    this.cancelResourceCheck = undefined;
    super.onDestroy();
  }

  private checkResources = async (): Promise<void> => {
    if (this.checkingResources) return;
    this.checkingResources = true;
    this.assets.forEach(asset => asset.unsubscribe());
    this.assets = [];
    const requests = [
      { name: 'rawfile bytes', source: 'valdi-rawfile://app_pages/tab_home_on', type: AssetOutputType.BYTES },
      { name: 'packaged decode', source: res.tabHomeOn, type: AssetOutputType.IMAGE_HARMONY },
      { name: 'HTTPS decode', source: httpsControlImage,
        type: AssetOutputType.IMAGE_HARMONY },
    ];
    try {
      for (const request of requests) {
        if (this.isDestroyed()) return;
        this.setState({ result: `Resources: ${request.name} pending` });
        const success = await new Promise<boolean>(resolve => {
          this.cancelResourceCheck = () => resolve(false);
          this.assets.push(addAssetLoadObserver(request.source, (asset, error) => {
            if (this.isDestroyed()) return;
            this.cancelResourceCheck = undefined;
            const metadata = asset && !(asset instanceof Uint8Array) ? getLoadedAssetMetadata(asset) : undefined;
            const ok = !error && (request.type === AssetOutputType.BYTES
              ? asset instanceof Uint8Array && asset.length > 8 && asset[0] === 137 && asset[1] === 80
              : metadata?.type === 'image' && typeof metadata.width === 'number' &&
                typeof metadata.height === 'number' && metadata.width > 0 && metadata.height > 0);
            const details = asset instanceof Uint8Array ? { bytes: asset.length } :
              metadata ?? {};
            this.log('resource-check', { name: request.name, success: ok, error: error ?? null, ...details });
            this.setState({ result: `Resources: ${request.name} ${ok ? 'passed' : 'failed'}` });
            resolve(ok);
          }, request.type));
        });
        if (!success) return;
      }
      if (!this.isDestroyed()) this.setState({ result: 'Resources: all three passed' });
    } finally {
      this.checkingResources = false;
    }
  };

  private checkSQL = async (): Promise<void> => {
    const db = openDatabase('harmony_qa.sqlite', 1,
      ['CREATE TABLE proof (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)'], []);
    try {
      await new Promise<void>((resolve, reject) => db.execute(
        'INSERT INTO proof(id, value) VALUES(1, 1) ON CONFLICT(id) DO UPDATE SET value=value+1',
        undefined, (_value, error) => error ? reject(new Error(error)) : resolve()));
      const rows = await new Promise<unknown[]>((resolve, reject) => db.query(
        'SELECT value FROM proof WHERE id=1', undefined,
        (value, error) => error ? reject(new Error(error)) : resolve(value ?? [])));
      const value = (rows[0] as { value?: number } | undefined)?.value;
      if (!Number.isInteger(value) || value! < 1) throw new Error('Invalid SQLite result');
      this.log('sql-check', { value });
      if (!this.isDestroyed()) this.setState({ result: `SQL persistent count: ${value}` });
    } catch (error) {
      this.log('sql-check-failed', { message: String(error) });
      if (!this.isDestroyed()) this.setState({ result: 'SQL check failed' });
    } finally {
      db.close((_value, error) => {
        if (error) this.log('sql-close-failed', { message: error });
      });
    }
  };

  onRender(): void {
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + customTabContentPadding() + 8}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      {this.header('Harmony routes / Home')}
      <label width="100%" height={30} value={`Home count: ${this.state.count}`} font="system-bold 20" color="#182825" />
      <label width="100%" height={30} value={this.state.result} font="system 16" color="#374151" />
      {this.button('Increment home', this.increment)}
      {this.button('Push typed detail for result', this.openDetail)}
      {this.button('Switch to retained tab', () => router.switchTab('second'))}
      {this.button('Open stack actions', () => router.push('stack'))}
      {this.button('Open native animations', () => router.push('animation'))}
      {this.button('Open native gestures', () => router.push('gesture'))}
      {this.button('Open native scrolling', () => router.push('scroll'))}
      {this.button('Open native images and fonts', () => router.push('image'))}
      {this.button('Open native text input', () => router.push('input'))}
      {this.button('Open native text and HTTP', () => router.push('foundation'))}
      {this.button('Check native resource pipeline', this.checkResources)}
      {this.button('Check persistent native SQL', this.checkSQL)}
      {this.button('Configure Tab presentation', () => router.push('tabBar'))}
    </view>;
  }
}
