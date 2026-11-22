import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'app_ui/src/keyboard';
import type { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { createSignal, For, Show } from 'solid-js';
import type { SolidPageProps } from 'solid_native/src/bridge';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { PageHeader } from '../../components/PageHeader';
import { usePageStatusBar } from '../../components/usePageStatusBar';
import { color, tokens } from '../../components/theme';
import { Router } from '../../router';
import type { FormLayout } from './types';

const SCROLL_FIELDS = ['姓名', '电话', '邮箱', '公司', '城市', '街道', '门牌号', '邮编'];
const NOTES = '备注';
const MESSAGE = '消息';

type FormViewModel = Omit<PageViewModel, 'route' | 'params'> & {
  route: 'form';
  params: { layout: FormLayout };
};

/**
 * Keyboard test page demonstrating `app_ui` native keyboard components (`KeyboardAwareScrollView` and
 * `KeyboardAvoidingView`) without host-level container resizing.
 */
export function FormPage(props: SolidPageProps<FormViewModel, PageContext>) {
  const router = new Router(props.context);
  usePageStatusBar(props, 'auto');

  const [values, setValues] = createSignal<Record<string, string>>({});

  const handleChange = (id: string, text: string) => {
    setValues(prev => ({ ...prev, [id]: text }));
  };

  const handleBack = () => {
    router.back();
  };

  const handleSubmit = () => {
    const filled = Object.values(values()).filter(value => value.trim().length > 0).length;
    const summary = `表单提交了 ${filled} 项`;
    router.finish<'form'>({ summary });
  };

  const { insets } = props;

  return (
    <Show
      when={props.params.layout === 'scroll'}
      fallback={
        // Bottom input avoids the keyboard via KeyboardAvoidingView translate-with-padding (zero Yoga relayout).
        <KeyboardAvoidingView
          style={styles.plainPage}
          behavior="translate-with-padding"
          keyboardVerticalOffset={-insets.bottom}
          paddingTop={insets.top + 12}
          paddingBottom={insets.bottom + 16}
          paddingLeft={insets.left + 20}
          paddingRight={insets.right + 20}
        >
          <PageHeader
            title="底部输入框"
            subtitle="KeyboardAvoidingView 抬起输入框"
            onBack={handleBack}
          />
          <view style={styles.spacer} />
          <label style={styles.hint} value={`已输入 ${(values()[MESSAGE] ?? '').length} 个字`} />
          <FormField
            id={MESSAGE}
            label={MESSAGE}
            value={values()[MESSAGE] ?? ''}
            returnKeyText="send"
            onReturn={handleSubmit}
            onChange={handleChange}
          />
          <Button id="submit" title="发送" onTap={handleSubmit} />
        </KeyboardAvoidingView>
      }
    >
      <view style={styles.page}>
        <KeyboardAwareScrollView
          style={styles.scroll}
          dismissKeyboardOnDrag={true}
          bottomOffset={16}
        >
          <view
            paddingTop={insets.top + 12}
            paddingBottom={insets.bottom + 24}
            paddingLeft={insets.left + 20}
            paddingRight={insets.right + 20}
          >
            <PageHeader
              title="长表单"
              subtitle="点最下面的备注，看它会不会被键盘挡住"
              onBack={handleBack}
            />
            <For each={SCROLL_FIELDS}>
              {field => (
                <FormField
                  id={field}
                  label={field}
                  value={values()[field] ?? ''}
                  onChange={handleChange}
                />
              )}
            </For>
            <FormField
              id={NOTES}
              label={NOTES}
              value={values()[NOTES] ?? ''}
              multiline={true}
              onChange={handleChange}
            />
            <Button id="submit" title="提交" onTap={handleSubmit} />
          </view>
        </KeyboardAwareScrollView>
      </view>
    </Show>
  );
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  scroll: new Style<View>({
    width: '100%',
    height: '100%',
  }),
  plainPage: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  spacer: new Style<View>({
    flexGrow: 1,
  }),
  hint: new Style<Label>({
    color: color.muted,
    font: systemFont(tokens.font.section),
    marginBottom: tokens.space.sm,
  }),
};
