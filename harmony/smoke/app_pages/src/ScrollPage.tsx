import { ElementRef } from 'valdi_core/src/ElementRef';
import { ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import { ScrollViewInteractive } from 'valdi_tsx/src/NativeTemplateElements';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';

interface ScrollState extends SmokeState {
  horizontal: boolean;
  enabled: boolean;
  paging: boolean;
  rows: number;
  offset: number;
  taps: number;
  starts: number;
  ends: number;
  growOnDrag: boolean;
  snap: boolean;
  stopOnTouch: boolean;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class ScrollPage extends SmokePage<ScrollState> {
  state: ScrollState = {
    count: 0, result: 'Scroll: idle', pages: 'Stack: loading',
    horizontal: false, enabled: true, paging: false, rows: 24,
    offset: 0, taps: 0, starts: 0, ends: 0, growOnDrag: false, snap: false, stopOnTouch: false,
  };

  private scroll = new ElementRef<ScrollViewInteractive>();

  private record(kind: string, event: ScrollEvent): void {
    if (![event.x, event.y, event.velocityX, event.velocityY].every(Number.isFinite)) {
      throw new Error(`Invalid native scroll payload: ${JSON.stringify(event)}`);
    }
    this.log('scroll', { kind, ...event });
    this.setState({ offset: Math.round(this.state.horizontal ? event.x : event.y) });
  }

  private move(offset: number, animated: boolean): void {
    this.scroll.setAttribute('contentOffsetAnimated', animated);
    this.scroll.setAttribute(this.state.horizontal ? 'contentOffsetX' : 'contentOffsetY', offset);
    this.log('scroll-request', { offset, animated, horizontal: this.state.horizontal });
  }

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={30} marginBottom={4} backgroundColor="#176b55" borderRadius={5}
      alignItems="center" justifyContent="center" onTap={onTap}
      accessibilityId={`smoke-scroll-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityLabel={title}>
      <label width="96%" height={26} font="system-semibold 14" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  onRender(): void {
    const s = this.state;
    const { insets } = this.viewModel;
    <view width="100%" height="100%" backgroundColor="#f4f1e8"
      paddingTop={insets.top + 16} paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 16} paddingRight={insets.right + 16}>
      <view width="100%" height={32} flexDirection="row" alignItems="center">
        <label width="74%" height={32} font="system-bold 20" color="#182825" value="Native scroll contracts" />
        <view width="26%" height={28} backgroundColor="#176b55" borderRadius={5}
          alignItems="center" justifyContent="center"
          accessibilityId="smoke-scroll-open-refresh" accessibilityLabel="Open native refresh"
          onTap={() => this.pageRouter.push('refresh')}>
          <label width="100%" height={24} font="system-semibold 14" textAlign="center" color="#ffffff"
            value="Refresh" />
        </view>
      </view>
      <label width="100%" height={24} font="system 14" color="#182825"
        value={`Offset=${s.offset} taps=${s.taps} starts=${s.starts} ends=${s.ends}`} />
      {this.button(`Axis: ${s.horizontal ? 'horizontal' : 'vertical'}`, () => {
        this.setState({ horizontal: !s.horizontal, offset: 0 });
      })}
      {this.button(`Scroll enabled: ${s.enabled}`, () => this.setState({ enabled: !s.enabled }))}
      {this.button(`Paging: ${s.paging}`, () => this.setState({ paging: !s.paging }))}
      {this.button('Scroll to 600 immediately', () => this.move(600, false))}
      {this.button('Scroll to 0 animated', () => this.move(0, true))}
      {this.button(`Rows: ${s.rows}`, () => this.setState({ rows: s.rows === 24 ? 40 : 24 }))}
      {this.button(`Grow during drag: ${s.growOnDrag}`, () => this.setState({ growOnDrag: !s.growOnDrag }))}
      {this.button(`Snap to 100: ${s.snap}`, () => this.setState({ snap: !s.snap }))}
      {this.button(`Stop on touch: ${s.stopOnTouch}`, () => this.setState({ stopOnTouch: !s.stopOnTouch }))}
      <scroll key={s.horizontal ? 'horizontal' : 'vertical'} ref={this.scroll}
        width="100%" height={260} horizontal={s.horizontal}
        scrollEnabled={s.enabled} pagingEnabled={s.paging} bounces={false}
        stopScrollingOnTouch={s.stopOnTouch}
        showsVerticalScrollIndicator={true} showsHorizontalScrollIndicator={true}
        onScroll={event => this.record('change', event)}
        onDragStart={event => {
          this.record('drag-start', event);
          this.setState({ starts: this.state.starts + 1 });
          if (this.state.growOnDrag && this.state.rows === 24) {
            this.log('scroll-grow-during-drag');
            this.setState({ rows: 40 });
          }
        }}
        onDragEnding={event => {
          this.record('drag-ending', event);
          return this.state.snap
            ? { x: Math.round(event.x / 100) * 100, y: Math.round(event.y / 100) * 100 }
            : undefined;
        }}
        onDragEnd={event => this.record('drag-end', event)}
        onScrollEnd={event => {
          this.record('end', event);
          this.setState({ ends: this.state.ends + 1 });
        }}
        onContentSizeChange={event => this.log('scroll-content-size', { ...event })}>
        {Array.from({ length: s.rows }, (_, index) => (
          <view key={`row-${index}`} width={s.horizontal ? 180 : '100%'} height={s.horizontal ? 240 : 64}
            backgroundColor={index % 2 ? '#e6deca' : '#d6e6d8'}
            justifyContent="center" alignItems="center"
            onTap={() => {
              this.setState({ taps: this.state.taps + 1, result: `Tapped row ${index}` });
              this.log('scroll-row-tap', { index });
            }}>
            <label width="94%" height={30} font="system-bold 18" color="#182825"
              textAlign="center" value={`Scroll row ${index}`} />
          </view>
        ))}
      </scroll>
      <label width="100%" height={28} font="system 15" color="#182825" value={s.result} />
      {this.button('Back from scroll', () => this.pageRouter.back())}
    </view>;
  }
}
