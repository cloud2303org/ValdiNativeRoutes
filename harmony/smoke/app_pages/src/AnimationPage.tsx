import { AnimationCurve, AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { CancellableAnimation } from 'valdi_core/src/CancellableAnimation';
import { PageContext, PageViewModel } from './Page';
import { router } from './navigation';
import { SmokePage } from './SmokePage';

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class AnimationPage extends SmokePage {
  state = { count: 0, result: 'Animation: idle', pages: 'Stack: loading' };
  private animation?: CancellableAnimation;
  private generation = 0;

  onCreate(): void {
    super.onCreate();
    this.registerDisposable(() => {
      this.generation++;
      this.animation?.cancel();
      this.animation = undefined;
    });
  }

  private run(options: AnimationOptions): void {
    const generation = ++this.generation;
    this.animation?.cancel();
    const target = this.state.count === 0 ? 1 : 0;
    const started = Date.now();
    this.setState({ result: 'Animation: running' });
    this.animation = this.createAnimation({
      ...options,
      beginFromCurrentState: true,
      completion: canceled => {
        this.log('animation-complete', { canceled, elapsedMs: Date.now() - started, generation });
        if (!this.isDestroyed() && generation === this.generation) {
          this.animation = undefined;
          this.setState({ result: canceled ? 'Animation: canceled' : 'Animation: finished' });
        }
      },
    }, () => this.setState({ count: target }));
    this.log('animation-start', { target, generation });
    void this.animation.start();
  }

  private cancel = (): void => {
    this.animation?.cancel();
  };

  onRender(): void {
    const expanded = this.state.count > 0;
    <view width="100%" height="100%" backgroundColor="#f4f1e8" padding={16}>
      {this.header('Native property animations')}
      <label width="100%" height={30} value={this.state.result} font="system 16" color="#374151" />
      <view width="100%" height={120} justifyContent="center">
        <view width={expanded ? 270 : 100} height={expanded ? 86 : 56}
          marginLeft={expanded ? 18 : 0} backgroundColor={expanded ? '#c95032' : '#176b55'}
          borderRadius={expanded ? 28 : 6} opacity={expanded ? 0.55 : 1}
          translationX={expanded ? 12 : 0} scaleX={expanded ? 0.92 : 1}>
          <label width="100%" height={36} value={expanded ? 'Expanded' : 'Compact'}
            font="system-semibold 16" textAlign="center" color="#ffffff" />
        </view>
      </view>
      {this.button('Animate layout + opacity (1.2s)', () =>
        this.run({ duration: 1.2, curve: AnimationCurve.EaseInOut }))}
      {this.button('Animate custom cubic (1.2s)', () =>
        this.run({ duration: 1.2, controlPoints: [0.2, 0.8, 0.2, 1] }))}
      {this.button('Animate spring', () => this.run({ stiffness: 220, damping: 22 }))}
      {this.button('Start slow animation (5s)', () => this.run({ duration: 5, curve: AnimationCurve.Linear }))}
      {this.button('Cancel active animation', this.cancel)}
      {this.button('Back to routes', () => this.pageRouter.back())}
      {this.button('Push zoom detail', () => router.push('detail', { id: 99, from: 'animation' },
        'push', { harmony: { animation: 'zoom', durationMs: 500 } }))}
    </view>;
  }
}
