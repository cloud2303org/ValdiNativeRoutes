import { ElementFrame } from 'valdi_tsx/src/Geometry';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';

interface RefreshState extends SmokeState {
  refreshing: boolean;
  enabled: boolean;
  requests: number;
  finishes: number;
  taps: number;
  offset: number;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class RefreshPage extends SmokePage<RefreshState> {
  state: RefreshState = {
    count: 0, result: 'Refresh: ready', pages: 'Stack: loading',
    refreshing: false, enabled: true, requests: 0, finishes: 0, taps: 0, offset: 0,
  };

  private requestRefresh = (): void => {
    const requests = this.state.requests + 1;
    this.log('refresh-request', { requests, enabled: this.state.enabled });
    this.setState({
      requests,
      refreshing: this.state.enabled,
      result: this.state.enabled ? `Refresh: request ${requests}` : 'Refresh: unexpected disabled callback',
    });
  };

  private finishRefresh = (): void => {
    if (!this.state.refreshing) return;
    const finishes = this.state.finishes + 1;
    this.setState({ refreshing: false, finishes, result: `Refresh: completed ${finishes}` });
    this.log('refresh-complete', { finishes });
  };

  private headerLayout = (frame: ElementFrame): void => {
    this.log('refresh-header-layout', { ...frame, expectedTop: this.viewModel.insets.top + 12 });
  };

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={30} marginBottom={4} backgroundColor="#176b55" borderRadius={5}
      alignItems="center" justifyContent="center" onTap={onTap}
      accessibilityId={`smoke-refresh-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityLabel={title}>
      <label width="96%" height={26} font="system-semibold 14" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  onRender(): void {
    const s = this.state;
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 12} paddingBottom={insets.bottom + 12}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      <label width="100%" height={32} font="system-bold 22" color="#182825"
        value="Native pull to refresh" onLayout={this.headerLayout} />
      <label width="100%" height={26} font="system 14" color="#182825"
        value={`Requests=${s.requests} finishes=${s.finishes} taps=${s.taps} offset=${s.offset}`} />
      <label width="100%" height={24} font="system 14" color="#182825"
        value={`Refreshing=${s.refreshing} enabled=${s.enabled}`} />
      <label width="100%" height={40} font="system 14" color="#374151" numberOfLines={2}
        value="Pull the list down from its top. The page owns refreshing; Finish stops the native spinner." />
      {this.button('Finish refresh', this.finishRefresh)}
      {this.button(`Refresh enabled: ${s.enabled}`, () => this.setState({ enabled: !s.enabled }))}
      {this.button('Start controlled refresh', () => {
        this.log('refresh-programmatic-start');
        this.setState({ refreshing: true, result: 'Refresh: controlled start' });
      })}
      <custom-view harmonyClass="ArkUIRefreshView" width="100%" height={260}
        refreshing={s.refreshing} enabled={s.enabled} onRefresh={this.requestRefresh}
        accessibilityId="smoke-refresh-container">
        <scroll width="100%" height="100%" horizontal={false} showsVerticalScrollIndicator={true}
          onScrollEnd={event => {
            this.setState({ offset: Math.round(event.y) });
            this.log('refresh-scroll-end', { offset: event.y });
          }}>
          {Array.from({ length: 16 }, (_, index) => (
            <view key={`refresh-row-${index}`} width="100%" height={64}
              backgroundColor={index % 2 ? '#e6deca' : '#d6e6d8'}
              alignItems="center" justifyContent="center"
              accessibilityId={`smoke-refresh-row-${index}`}
              onTap={() => {
                this.setState({ taps: this.state.taps + 1 });
                this.log('refresh-row-tap', { index });
              }}>
              <label width="94%" height={28} font="system-bold 18" textAlign="center" color="#182825"
                value={`Refresh row ${index}`} />
              <label width="94%" height={20} font="system 13" textAlign="center" color="#374151"
                value={`Data revision ${s.finishes}`} />
            </view>
          ))}
        </scroll>
      </custom-view>
      <label width="100%" height={28} font="system 15" color="#182825" value={s.result} />
      {this.button('Back from refresh', () => this.pageRouter.back())}
    </view>;
  }
}
