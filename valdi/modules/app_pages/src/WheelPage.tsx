import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from './Button';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { PageHeader } from './PageHeader';
import { Router } from './routes';
import { ColumnPicker, TimePicker, TreeNode, TreePicker, timePickerValue, treePickerValue } from './WheelPickers';

const LOCATIONS = [
  { value: 'inlet', label: '进水口' },
  { value: 'outlet', label: '出水口' },
  { value: 'tank', label: '调节池' },
  { value: 'sludge', label: '污泥池' },
];

const REGIONS: TreeNode[] = [
  {
    value: 'gd',
    label: '广东',
    children: [
      {
        value: 'gz',
        label: '广州',
        children: [
          { value: 'th', label: '天河' },
          { value: 'yx', label: '越秀' },
          { value: 'hz', label: '海珠' },
        ],
      },
      {
        value: 'sz',
        label: '深圳',
        children: [
          { value: 'ns', label: '南山' },
          { value: 'ft', label: '福田' },
        ],
      },
    ],
  },
  {
    value: 'zj',
    label: '浙江',
    children: [
      {
        value: 'hzs',
        label: '杭州',
        children: [
          { value: 'xh', label: '西湖' },
          { value: 'bj', label: '滨江' },
        ],
      },
      { value: 'nb', label: '宁波', children: [{ value: 'yz', label: '鄞州' }] },
    ],
  },
];

function regionLabels(path: readonly string[]): string {
  const labels: string[] = [];
  let level: readonly TreeNode[] = REGIONS;
  for (const value of path) {
    const node = level.find(item => item.value === value);
    if (!node) break;
    labels.push(node.label);
    level = node.children ?? [];
  }
  return labels.join(' / ');
}

interface State {
  location: string;
  date: string;
  sampledAt: string;
  region: string[];
}

/**
 * The wheel components (WheelPickers.tsx) inside a scrolling page. Opened as a sheet from itself, they show that a
 * wheel drag moves neither the scroll view nor the sheet.
 *
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRWheelPage', android: 'io.valdiroutes.pages.WheelPage'})
 */
export class WheelPage extends Page<PageViewModel, State, PageContext> {
  // Only a province, and no time: the state starts from what the wheels will show.
  state: State = {
    location: 'inlet',
    date: '2026-10-02',
    sampledAt: timePickerValue('datetime', ''),
    region: treePickerValue(REGIONS, ['zj']),
  };

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { insets, presentation } = this.viewModel;
    const { location, date, sampledAt, region } = this.state;
    const sheet = presentation === 'sheet' || presentation === 'compactSheet';

    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          paddingTop={insets.top + (sheet ? 4 : 12)}
          paddingBottom={insets.bottom + 32}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          {sheet ? (
            <label style={styles.sheetTitle} value="Sheet 里的滚轮" />
          ) : (
            <PageHeader title="页面内滚轮" subtitle="ColumnPicker / TimePicker / TreePicker" onBack={this.viewModel.presentation === 'tab' ? undefined : this.handleBack} />
          )}

          <label
            style={styles.section}
            value={`采样位置：${LOCATIONS.find(item => item.value === location)?.label ?? location}`}
          />
          <view style={styles.card}>
            <ColumnPicker options={LOCATIONS} value={location} onChange={this.handleLocation} />
          </view>

          <label style={styles.section} value={`采样日期：${date}`} />
          <view style={styles.card}>
            <TimePicker mode="date" value={date} minYear={2020} maxYear={2030} onChange={this.handleDate} />
          </view>

          <label style={styles.section} value={`地区：${regionLabels(region)}`} />
          <view style={styles.card}>
            <TreePicker data={REGIONS} value={region} onChange={this.handleRegion} />
          </view>

          <label style={styles.section} value={`采样时间：${sampledAt}`} />
          <view style={styles.card}>
            <TimePicker mode="datetime" value={sampledAt} onChange={this.handleSampledAt} />
          </view>

          {sheet ? undefined : <Button id="sheet" title="在 Sheet 里打开" onTap={this.handleSheet} />}
        </view>
      </scroll>
    </view>;
  }

  private handleLocation = (location: string) => this.setState({ location });

  private handleDate = (date: string) => this.setState({ date });

  private handleSampledAt = (sampledAt: string) => this.setState({ sampledAt });

  private handleRegion = (region: string[]) => this.setState({ region });

  private handleSheet = () => {
    this.router.push('wheels', {}, 'sheet');
  };

  private handleBack = () => {
    this.router.back();
  };
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }),
  scroll: new Style<ScrollView>({ width: '100%', height: '100%' }),
  sheetTitle: new Style<Label>({ color: '#111827', font: systemSemiboldFont(18), marginBottom: 4 }),
  section: new Style<Label>({ color: '#374151', font: systemFont(14), margin: '16 0 8 0' }),
  card: new Style<View>({ backgroundColor: 'white', borderRadius: 12, padding: '8 12' }),
};
