import { StatefulComponent } from 'valdi_core/src/Component';
import { getValdiRuntime } from 'valdi_core/src/ValdiRuntimeProvider';

export class CounterPage extends StatefulComponent<{}, { count: number }> {
  state = { count: 0 };

  onCreate(): void {
    if (getValdiRuntime().getCurrentPlatform() !== 6) {
      throw new Error('The Harmony host must report the Harmony platform');
    }
  }

  private increment = () => {
    this.setState({ count: this.state.count + 1 });
    console.log(`HARMONY_COUNTER=${this.state.count}`);
  };

  onRender(): void {
    <view width="100%" height="100%" backgroundColor="#f4f1e8" alignItems="center" justifyContent="center">
      <label width={300} height={52} value="Valdi on HarmonyOS" font="system-bold 24" color="#182825" />
      <label width={300} height={44} value={`Count: ${this.state.count}`} font="system 20" color="#182825" />
      <view width={240} height={56} backgroundColor="#176b55" borderRadius={12}
        alignItems="center" justifyContent="center" onTap={this.increment}>
        <label width={190} height={34} value="Increment" font="system-semibold 20" color="#ffffff" />
      </view>
    </view>;
  }
}
