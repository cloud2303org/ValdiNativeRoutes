import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createSignal } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';

/** Checks native input -> TS onChange -> submit -> rendered result without signing in. */
export function InputCheckPage(props: SolidPageProps<PageViewModel, PageContext>) {
  usePageStatusBar(props, 'auto');

  const [draft, setDraft] = createSignal('');
  const [submitted, setSubmitted] = createSignal('');
  const [submissions, setSubmissions] = createSignal(0);

  const handleSubmit = () => {
    setSubmitted(draft());
    setSubmissions(n => n + 1);
  };

  const handleClear = () => {
    setDraft('');
  };

  const { insets } = props;

  return (
    <view style={styles.page}>
      <NavigationBar title="输入自检" topInset={insets.top} onBack={() => props.context.back()} />
      <scroll flexGrow={1}>
        <view
          style={styles.content}
          paddingLeft={insets.left + tokens.space.content}
          paddingRight={insets.right + tokens.space.content}
          paddingBottom={insets.bottom + tokens.space.content}
        >
          <label style={styles.hint} numberOfLines={0} value="输入测试文字，点击提交，再核对下方收到的内容。不发送网络请求；请勿填写密码。" />
          <view style={styles.box} limitToViewport={false}>
            <textfield
              accessibilityId="input-check-field"
              style={styles.input}
              value={draft()}
              placeholder="输入一段测试文字"
              autocapitalization="none"
              autocorrection="none"
              returnKeyText="done"
              limitToViewport={false}
              onChange={event => setDraft(event.text)}
              onReturn={handleSubmit}
            />
          </view>
          <Button id="input-check-submit" title="提交输入" onTap={handleSubmit} />
          <Button id="input-check-clear" title="清空输入" secondary={true} onTap={handleClear} />
          <label accessibilityId="input-check-count" style={styles.hint} value={`提交次数：${submissions()}`} />
          <label
            accessibilityId="input-check-result"
            style={styles.result}
            numberOfLines={0}
            value={submissions() ? `已提交：${JSON.stringify(submitted())}` : '尚未提交'}
          />
        </view>
      </scroll>
    </view>
  );
}

const styles = {
  page: new Style<View>({ width: '100%', height: '100%', backgroundColor: color.canvas }),
  content: new Style<View>({ paddingTop: tokens.space.xl }),
  hint: new Style<Label>({ font: systemFont(14), color: color.muted, marginBottom: tokens.space.lg }),
  box: new Style<View>({
    height: 54,
    borderRadius: tokens.radius.control,
    backgroundColor: color.surface,
    padding: `0 ${tokens.space.lg}`,
    marginBottom: tokens.space.lg,
  }),
  input: new Style<TextField>({ width: '100%', height: 54, font: systemFont(16), color: color.text }),
  result: new Style<Label>({ font: systemSemiboldFont(17), color: color.ink }),
};
