import { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { Button } from '../../components/Button';
import { api } from '../../services/api';
import { getAppDb } from '../../services/database';
import { FocusScroller } from '../../components/FocusScroller';
import { FormField } from '../../components/FormField';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { PageHeader } from '../../components/PageHeader';
import { Router, readParams } from '../../routing/index';

const SCROLL_FIELDS = ['姓名', '电话', '邮箱', '公司', '城市', '街道', '门牌号', '邮编'];
const NOTES = '备注';
const MESSAGE = '消息';

interface State {
  values: Record<string, string>;
}

/**
 * Keyboard test page. The page never reads the keyboard height: the host shrinks its viewport,
 * so all it has to do is lay out inside its bounds.
 *
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRFormPage', android: 'io.valdiroutes.pages.FormPage'})
 */
export class FormPage extends Page<PageViewModel, State, PageContext> {
  state: State = { values: {} };

  private focusScroller = new FocusScroller();

  private get router(): Router {
    return new Router(this.context);
  }

  onRender(): void {
    const { layout } = readParams<'form'>(this.viewModel);
    if (layout === 'scroll') {
      this.renderScrollForm();
    } else {
      this.renderPlainForm();
    }
  }

  private renderScrollForm(): void {
    const { insets } = this.viewModel;
    const { values } = this.state;
    <view style={styles.page}>
      <scroll
        ref={this.focusScroller.scrollRef}
        style={styles.scroll}
        dismissKeyboardOnDrag={true}
        onScroll={this.focusScroller.onScroll}
        onLayout={this.focusScroller.onLayout}
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
            onBack={this.handleBack}
          />
          {SCROLL_FIELDS.forEach(field => {
            <FormField
              key={field}
              id={field}
              label={field}
              value={values[field] ?? ''}
              onChange={this.handleChange}
              onFocus={this.handleFocus}
              onBlur={this.handleBlur}
            />;
          })}
          <FormField
            id={NOTES}
            label={NOTES}
            value={values[NOTES] ?? ''}
            multiline={true}
            onChange={this.handleChange}
            onFocus={this.handleFocus}
            onBlur={this.handleBlur}
          />
          <Button id="submit" title="提交" onTap={this.handleSubmit} />
        </view>
      </scroll>
    </view>;
  }

  private renderPlainForm(): void {
    const { insets } = this.viewModel;
    const { values } = this.state;
    // The input sits at the bottom, so it rides up with the bottom edge when the host shrinks the page.
    <view
      style={styles.plainPage}
      paddingTop={insets.top + 12}
      paddingBottom={insets.bottom + 16}
      paddingLeft={insets.left + 20}
      paddingRight={insets.right + 20}
    >
      <PageHeader
        title="底部输入框"
        subtitle="没有 scroll，输入框贴着底部"
        onBack={this.handleBack}
      />
      <view style={styles.spacer} />
      <label style={styles.hint} value={`已输入 ${(values[MESSAGE] ?? '').length} 个字`} />
      <FormField
        id={MESSAGE}
        label={MESSAGE}
        value={values[MESSAGE] ?? ''}
        returnKeyText="send"
        onReturn={this.handleSubmit}
        onChange={this.handleChange}
      />
      <Button id="submit" title="发送" onTap={this.handleSubmit} />
    </view>;
  }

  private handleChange = (id: string, text: string) => {
    this.setState({ values: { ...this.state.values, [id]: text } });
  };

  private handleFocus = (element: IRenderedElement | undefined) => {
    this.focusScroller.focus(element);
  };

  private handleBlur = (element: IRenderedElement | undefined) => {
    this.focusScroller.blur(element);
  };

  private handleBack = () => {
    this.router.back();
  };

  private handleSubmit = async () => {
    const filled = Object.values(this.state.values).filter(value => value.trim().length > 0).length;
    const summary = `表单提交了 ${filled} 项`;
    try {
      await getAppDb().insertSubmission(summary, Date.now());
      this.router.finish<'form'>({ summary });
    } catch (error) {
      await api.showToast({ title: `保存失败：${error instanceof Error ? error.message : String(error)}`, icon: 'error' });
    }
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: '100%',
  }),
  plainPage: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  }),
  spacer: new Style<View>({
    flexGrow: 1,
  }),
  hint: new Style<Label>({
    color: '#6b7280',
    font: systemFont(13),
    marginBottom: 8,
  }),
};
