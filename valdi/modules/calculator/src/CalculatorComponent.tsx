import res from 'calculator/res';
import dayjs from 'dayjs';
import { StatefulComponent } from 'valdi_core/src/Component';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { multiply } from './Calculator';

/**
 * A UI for the official polyglot bridge template. No dependency on app_pages.
 * @Component({})
 * @ExportModel({ios: 'CalculatorRootView', android: 'com.snap.modules.calculator.CalculatorRootView'})
 */
export class CalculatorComponent extends StatefulComponent<
  { insets?: { top: number; bottom: number } },
  { result: string }
> {
  state = { result: 'Ready' };

  onRender(): void {
    <view padding={24} paddingTop={(this.viewModel.insets?.top ?? 0) + 24} backgroundColor="#f8fafc" flexGrow={1}>
      <label value="Calculator" font={systemSemiboldFont(26)} color="#0f172a" />
      <image src={res.calculator} width={40} height={40} marginTop={16} />
      <label value="Native multiply" font={systemFont(16)} marginTop={12} />
      <label value={`npm dayjs: ${dayjs('2026-10-29').format('YYYY-MM-DD')}`} font={systemFont(14)} marginTop={8} />
      <label
        accessibilityId="calculator-result"
        value={this.state.result}
        font={systemSemiboldFont(24)}
        marginTop={24}
      />
      <view
        accessibilityId="calculator-multiply"
        onTap={this.calculate}
        padding={16}
        marginTop={24}
        backgroundColor="#2563eb"
        borderRadius={12}
      >
        <label value="6 × 7" font={systemSemiboldFont(18)} color="white" />
      </view>
      <view
        accessibilityId="calculator-negative"
        onTap={this.calculateNegative}
        padding={16}
        marginTop={12}
        backgroundColor="#dbeafe"
        borderRadius={12}
      >
        <label value="-3 × 2.5" font={systemSemiboldFont(18)} color="#0f172a" />
      </view>
    </view>;
  }

  private calculate = (): void => {
    this.setState({ result: `6 × 7 = ${multiply(6, 7)}` });
  };
  private calculateNegative = (): void => {
    this.setState({ result: `-3 × 2.5 = ${multiply(-3, 2.5)}` });
  };
}
