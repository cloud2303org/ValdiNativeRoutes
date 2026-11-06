import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, TextField, TextFieldReturnKeyText, TextView, View } from 'valdi_tsx/src/NativeTemplateElements';

export interface FormFieldViewModel {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  /** Single-line only; the return key always closes the keyboard. */
  returnKeyText?: TextFieldReturnKeyText;
  onReturn?: (id: string) => void;
  onChange: (id: string, text: string) => void;
  /** Reports the field's element so a FocusScroller can keep it visible. */
  onFocus?: (element: IRenderedElement | undefined) => void;
  onBlur?: (element: IRenderedElement | undefined) => void;
}

export class FormField extends Component<FormFieldViewModel> {
  private fieldRef = new ElementRef();

  onRender(): void {
    const { id, label, value, multiline, returnKeyText } = this.viewModel;
    // limitToViewport={false}: while the host shrinks the page for the keyboard, the focused input can be outside the
    // visible area for a few frames. Valdi would then remove its native view, which drops focus and hides the keyboard.
    <view ref={this.fieldRef} style={styles.field} limitToViewport={false}>
      <label style={styles.label} value={label} />
      <view style={multiline ? styles.multilineBox : styles.box} limitToViewport={false}>
        {multiline ? (
          <textview
            key={id}
            style={styles.multilineInput}
            value={value}
            placeholder="多行输入，回车换行"
            returnType="linereturn"
            limitToViewport={false}
            onChange={this.handleChange}
            onEditBegin={this.handleEditBegin}
            onEditEnd={this.handleEditEnd}
          />
        ) : (
          <textfield
            key={id}
            style={styles.input}
            value={value}
            placeholder={`填写${label}`}
            returnKeyText={returnKeyText ?? 'done'}
            limitToViewport={false}
            onChange={this.handleChange}
            onReturn={this.handleReturn}
            onEditBegin={this.handleEditBegin}
            onEditEnd={this.handleEditEnd}
          />
        )}
      </view>
    </view>;
  }

  private handleChange = (event: { text: string }) => {
    this.viewModel.onChange(this.viewModel.id, event.text);
  };

  private handleReturn = () => {
    this.viewModel.onReturn?.(this.viewModel.id);
  };

  private handleEditBegin = () => {
    this.viewModel.onFocus?.(this.fieldRef.single());
  };

  private handleEditEnd = () => {
    this.viewModel.onBlur?.(this.fieldRef.single());
  };
}

const boxBase = new Style<View>({
  padding: '0 12',
  borderRadius: 10,
  backgroundColor: 'white',
  justifyContent: 'center',
});

const styles = {
  field: new Style<View>({
    marginBottom: 14,
  }),
  label: new Style<Label>({
    color: '#374151',
    font: systemSemiboldFont(14),
    marginBottom: 6,
  }),
  box: boxBase.extend({ height: 44 }),
  multilineBox: boxBase.extend({ height: 120, padding: '8 12' }),
  input: new Style<TextField>({
    width: '100%',
    height: 44,
    font: systemFont(16),
    color: '#111827',
    placeholderColor: '#9ca3af',
  }),
  multilineInput: new Style<TextView>({
    width: '100%',
    height: '100%',
    font: systemFont(16),
    color: '#111827',
    placeholderColor: '#9ca3af',
  }),
};
