import { Show } from 'solid-js';
import type { NativeElement } from 'solid_native/src/native-tree';
import { Style } from 'valdi_core/src/Style';
import { systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import type { Label, TextField, TextFieldReturnKeyText, TextView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { color, tokens } from './theme';

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
  onFocus?: (element: NativeElement | undefined) => void;
  onBlur?: (element: NativeElement | undefined) => void;
}

export function FormField(props: FormFieldViewModel) {
  let fieldEl: NativeElement | undefined;

  const handleEditBegin = () => props.onFocus?.(fieldEl);
  const handleEditEnd = () => props.onBlur?.(fieldEl);

  return (
    // limitToViewport={false}: while the host shrinks the page for the keyboard, the focused input can be outside the
    // visible area for a few frames. Valdi would then remove its native view, which drops focus and hides the keyboard.
    <view ref={el => { fieldEl = el; }} style={styles.field} limitToViewport={false}>
      <label style={styles.label} value={props.label} />
      <view style={props.multiline ? styles.multilineBox : styles.box} limitToViewport={false}>
        <Show
          when={props.multiline}
          fallback={
            <textfield
              style={styles.input}
              value={props.value}
              placeholder={`填写${props.label}`}
              returnKeyText={props.returnKeyText ?? 'done'}
              limitToViewport={false}
              onChange={event => props.onChange(props.id, event.text)}
              onReturn={() => props.onReturn?.(props.id)}
              onEditBegin={handleEditBegin}
              onEditEnd={handleEditEnd}
            />
          }
        >
          <textview
            style={styles.multilineInput}
            value={props.value}
            placeholder="多行输入，回车换行"
            returnType="linereturn"
            limitToViewport={false}
            onChange={event => props.onChange(props.id, event.text)}
            onEditBegin={handleEditBegin}
            onEditEnd={handleEditEnd}
          />
        </Show>
      </view>
    </view>
  );
}

const boxBase = new Style<View>({
  padding: `0 ${tokens.space.md}`,
  borderRadius: tokens.radius.compact,
  backgroundColor: color.surface,
  justifyContent: 'center',
});

const styles = {
  field: new Style<View>({
    marginBottom: tokens.space.md + 2,
  }),
  label: new Style<Label>({
    color: color.text,
    font: systemSemiboldFont(tokens.font.section + 1),
    marginBottom: tokens.space.tight,
  }),
  box: boxBase.extend({ height: 44 }),
  multilineBox: boxBase.extend({ height: 120, padding: `${tokens.space.sm} ${tokens.space.md}` }),
  input: new Style<TextField>({
    width: '100%',
    height: 44,
    font: systemFont(tokens.font.button),
    color: color.ink,
    placeholderColor: color.chevron,
  }),
  multilineInput: new Style<TextView>({
    width: '100%',
    height: '100%',
    font: systemFont(tokens.font.button),
    color: color.ink,
    placeholderColor: color.chevron,
  }),
};
