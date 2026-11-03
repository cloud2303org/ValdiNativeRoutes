import { DragEvent, PinchEvent, RotateEvent, TouchEvent, TouchEventState } from 'valdi_tsx/src/GestureEvents';
import { makeMainThreadCallback } from 'valdi_core/src/utils/FunctionUtils';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';

interface GestureState extends SmokeState {
  mode: number;
  disabled: boolean;
  allow: boolean;
  capture: boolean;
  parentEnabled: boolean;
  hit: boolean;
  customHit: boolean;
  parentHit: boolean;
  delayed: boolean;
  removeInPredicate: boolean;
  tap: number;
  double: number;
  long: number;
  child: number;
  parent: number;
  rawStart: number;
  rawEnd: number;
  drag: number;
  pinch: number;
  rotate: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  syncEnabled: boolean;
  syncDelayChange: boolean;
  syncDelay: number;
  syncStarts: number;
  syncEnds: number;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class GesturePage extends SmokePage<GestureState> {
  state = {
    count: 0, result: 'Gesture: idle', pages: 'Stack: loading',
    mode: 0, disabled: false, allow: true, capture: false,
    parentEnabled: true, hit: true, customHit: false, parentHit: true,
    delayed: false, removeInPredicate: false,
    tap: 0, double: 0, long: 0, child: 0, parent: 0,
    rawStart: 0, rawEnd: 0, drag: 0, pinch: 0, rotate: 0,
    dx: 0, dy: 0, scale: 1, rotation: 0,
    syncEnabled: true, syncDelayChange: false, syncDelay: 0, syncStarts: 0, syncEnds: 0,
  };

  private record(kind: string, event: TouchEvent): void {
    if (typeof event.pointerCount !== 'number' || !Number.isFinite(event.x) || !Number.isFinite(event.y) ||
        !Number.isFinite(event.absoluteX) || !Number.isFinite(event.absoluteY) ||
        !event.pointerLocations.every(pointer => typeof pointer.pointerId === 'number')) {
      throw new Error(`Invalid native ${kind} payload`);
    }
    this.log('gesture', { kind, ...event });
    const names = ['Started', 'Changed', 'Ended'];
    this.setState({ result: `${kind}: ${names[event.state]} pointers=${event.pointerCount}` });
  }

  private predicate = (event: TouchEvent): boolean => {
    this.log('predicate', { allow: this.state.allow, ...event });
    if (this.state.removeInPredicate) {
      this.setState({ removeInPredicate: false, mode: (this.state.mode + 1) % 6 });
      this.log('predicate-removed-target');
    }
    return this.state.allow;
  };

  private onTap = (event: TouchEvent): void => {
    this.record('Tap', event);
    this.setState({ tap: this.state.tap + 1 });
  };
  private onDouble = (event: TouchEvent): void => {
    this.record('Double', event);
    this.setState({ double: this.state.double + 1 });
  };
  private onLong = (event: TouchEvent): void => {
    this.record('Long', event);
    if (event.state === TouchEventState.Started) this.setState({ long: this.state.long + 1 });
  };
  private onDrag = (event: DragEvent): void => {
    this.record('Drag', event);
    this.setState({
      dx: event.deltaX, dy: event.deltaY,
      drag: this.state.drag + (event.state === TouchEventState.Started ? 1 : 0),
    });
  };
  private onPinch = (event: PinchEvent): void => {
    this.record('Pinch', event);
    this.setState({
      scale: event.scale,
      pinch: this.state.pinch + (event.state === TouchEventState.Started ? 1 : 0),
    });
  };
  private onRotate = (event: RotateEvent): void => {
    this.record('Rotate', event);
    this.setState({
      rotation: event.rotation,
      rotate: this.state.rotate + (event.state === TouchEventState.Started ? 1 : 0),
    });
  };
  private onTouch = (event: TouchEvent): void => { this.record('Touch', event); };
  private onStart = (event: TouchEvent): void => {
    this.record('TouchStart', event);
    this.setState({ rawStart: this.state.rawStart + 1 });
  };
  private onEnd = (event: TouchEvent): void => {
    this.record('TouchEnd', event);
    this.setState({ rawEnd: this.state.rawEnd + 1 });
  };
  private hitTest = (event: TouchEvent): boolean => {
    const allow = this.state.hit && event.x >= -45 && event.x <= 180 && event.y >= -30 && event.y <= 100;
    this.log('hit-test', { allow, ...event });
    return allow;
  };
  private rejectHit = (): boolean => false;
  private syncStart = makeMainThreadCallback((event: TouchEvent): void => {
    this.record('SyncStart', event);
    this.setState({ syncStarts: this.state.syncStarts + 1 });
    if (this.state.syncDelayChange) this.setState({ syncDelay: this.state.syncDelay + 0.05 });
  });
  private syncAll = makeMainThreadCallback((event: TouchEvent): void => {
    this.record('SyncAll', event);
    if (event.state === TouchEventState.Ended && !this.state.syncDelayChange) {
      this.setState({ syncEnabled: false });
    }
  });
  private syncEnd = makeMainThreadCallback((event: TouchEvent): void => {
    this.record('SyncEnd', event);
    this.setState({ syncEnds: this.state.syncEnds + 1, syncEnabled: false });
  });

  private text(value: string, height = 28): void {
    <label width="100%" height={height} value={value} font="system 15" color="#182825" />;
  }

  private target(title: string): void {
    <label width="100%" height={40} value={title} font="system-bold 18"
      color="#ffffff" textAlign="center" />;
  }

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={32} marginBottom={4} backgroundColor="#176b55" borderRadius={6}
      alignItems="center" justifyContent="center" onTap={onTap}>
      <label width="96%" height={28} font="system-semibold 14" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  onRender(): void {
    const s = this.state;
    <view width="100%" height="100%" backgroundColor="#f4f1e8" padding={16}>
      <label width="100%" height={34} value="Native gesture contracts" font="system-bold 22" color="#182825" />
      {this.text(`${this.viewModel.route} / ${this.viewModel.pageId}`, 22)}
      {this.text(`Mode: ${['Tap and press', 'Drag and touch', 'Pinch and rotate', 'Hit and extension', 'Nested arbitration', 'Synchronous reentry'][s.mode]}`)}
      {this.text(s.result, 34)}
      {this.button('Next gesture mode', () => this.setState({ mode: (s.mode + 1) % 6 }))}
      {s.mode < 3 ? this.button(`Disabled: ${s.disabled}`, () => this.setState({ disabled: !s.disabled })) : undefined}
      {s.mode < 3 ? this.button(`Predicate allows: ${s.allow}`, () => this.setState({ allow: !s.allow })) : undefined}
      {s.mode === 0 ? this.button(`Remove target in predicate: ${s.removeInPredicate}`,
        () => this.setState({ removeInPredicate: !s.removeInPredicate })) : undefined}
      {s.mode === 0 ? (
        <view width="100%" height={190} backgroundColor="#176b55" justifyContent="center"
          onTap={this.onTap} onTapDisabled={s.disabled} onTapPredicate={this.predicate}
          onDoubleTap={this.onDouble} onDoubleTapDisabled={s.disabled} onDoubleTapPredicate={this.predicate}
          onLongPress={this.onLong} onLongPressDisabled={s.disabled} onLongPressPredicate={this.predicate}
          longPressDuration={0.45}>
          {this.target('Tap / double / hold target')}
        </view>
      ) : undefined}
      {s.mode === 0 ? this.text(`Tap=${s.tap} Double=${s.double} Long=${s.long}`) : undefined}
      {s.mode === 1 ? this.button(`Touch delay: ${s.delayed ? '0.3s' : '0s'}`,
        () => this.setState({ delayed: !s.delayed })) : undefined}
      {s.mode === 1 ? (
        <view width="100%" height={170} backgroundColor="#176b55" justifyContent="center"
          onDrag={this.onDrag} onDragDisabled={s.disabled} onDragPredicate={this.predicate}
          onTouch={this.onTouch} onTouchStart={this.onStart} onTouchEnd={this.onEnd}
          onTouchDelayDuration={s.delayed ? 0.3 : 0}>
          {this.target('Drag and raw touch target')}
        </view>
      ) : undefined}
      {s.mode === 1 ? this.text(`Drag=${s.drag} dx=${Math.round(s.dx)} dy=${Math.round(s.dy)}`) : undefined}
      {s.mode === 1 ? this.text(`Raw start=${s.rawStart} end=${s.rawEnd}`) : undefined}
      {s.mode === 2 ? (
        <view width="100%" height={250} backgroundColor="#176b55" justifyContent="center"
          onPinch={this.onPinch} onPinchDisabled={s.disabled} onPinchPredicate={this.predicate}
          onRotate={this.onRotate} onRotateDisabled={s.disabled} onRotatePredicate={this.predicate}>
          {this.target('Two finger transform target')}
          <view width={80} height={60} alignSelf="center" backgroundColor="#f4c15d"
            scaleX={s.scale} scaleY={s.scale} rotation={s.rotation} />
        </view>
      ) : undefined}
      {s.mode === 2 ? this.text(`Pinch=${s.pinch} scale=${s.scale.toFixed(2)}`) : undefined}
      {s.mode === 2 ? this.text(`Rotate=${s.rotate} radians=${s.rotation.toFixed(2)}`) : undefined}
      {s.mode === 3 ? this.button(`Parent touchEnabled: ${s.parentEnabled}`,
        () => this.setState({ parentEnabled: !s.parentEnabled })) : undefined}
      {s.mode === 3 ? this.button(`Parent hitTest allows: ${s.parentHit}`,
        () => this.setState({ parentHit: !s.parentHit })) : undefined}
      {s.mode === 3 ? this.button(`Custom child hitTest: ${s.customHit}`,
        () => this.setState({ customHit: !s.customHit })) : undefined}
      {s.mode === 3 ? this.button(`Child hitTest allows: ${s.hit}`,
        () => this.setState({ hit: !s.hit })) : undefined}
      {s.mode === 3 ? (
        <view width="100%" height={190} backgroundColor="#ddd6bc" touchEnabled={s.parentEnabled}
          hitTest={s.parentHit ? undefined : this.rejectHit}
          justifyContent="center" alignItems="center">
          <view width={150} height={70} backgroundColor="#176b55" touchAreaExtension={30}
            touchAreaExtensionLeft={45} hitTest={s.customHit ? this.hitTest : undefined} onTap={this.onTap}>
            {this.target('Extended target')}
          </view>
        </view>
      ) : undefined}
      {s.mode === 3 ? this.text(`Tap=${s.tap}; extension 30pt / left 45pt`) : undefined}
      {s.mode === 4 ? this.button(`Child captures: ${s.capture}`,
        () => this.setState({ capture: !s.capture })) : undefined}
      {s.mode === 4 ? (
        <view width="100%" height={230} backgroundColor="#c95032" padding={24}
          onDrag={event => {
            this.record('ParentDrag', event);
            if (event.state === TouchEventState.Started) this.setState({ parent: this.state.parent + 1 });
          }}>
          {this.target('Parent drag target')}
          <view width="100%" height={120} backgroundColor="#176b55" justifyContent="center"
            onDragPredicate={() => this.state.capture} onDrag={event => {
              this.record('ChildDrag', event);
              if (event.state === TouchEventState.Started) this.setState({ child: this.state.child + 1 });
            }}>
            {this.target('Child drag target')}
          </view>
        </view>
      ) : undefined}
      {s.mode === 4 ? this.text(`Parent=${s.parent} Child=${s.child}`) : undefined}
      {s.mode === 5 ? this.button(`Change delay on start: ${s.syncDelayChange}`,
        () => this.setState({ syncDelayChange: !s.syncDelayChange, syncDelay: 0 })) : undefined}
      {s.mode === 5 ? this.button('Enable reentry target', () => this.setState({ syncEnabled: true })) : undefined}
      {s.mode === 5 ? (
        <view width="100%" height={170} backgroundColor={s.syncEnabled ? '#176b55' : '#68736f'}
          justifyContent="center" touchEnabled={s.syncEnabled} onTouchStart={this.syncStart}
          onTouch={this.syncAll} onTouchEnd={this.syncEnd} onTouchDelayDuration={s.syncDelay}>
          {this.target('Synchronous raw touch target')}
        </view>
      ) : undefined}
      {s.mode === 5 ? this.text(`Sync start=${s.syncStarts} end=${s.syncEnds}; enabled=${s.syncEnabled}`) : undefined}
      {this.button('Push detail for edge back result', this.openDetail)}
      {this.text(this.state.result)}
      {this.button('Back to routes', () => this.pageRouter.back())}
    </view>;
  }
}
