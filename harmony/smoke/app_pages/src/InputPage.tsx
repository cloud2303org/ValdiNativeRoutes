import { ElementRef } from 'valdi_core/src/ElementRef';
import { Application } from 'valdi_core/src/Application';
import { TextFieldInteractive, TextViewInteractive } from 'valdi_tsx/src/NativeTemplateElements';
import { PageContext, PageViewModel } from './Page';
import { SmokePage, SmokeState } from './SmokePage';

interface EditEvent {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  reason?: number;
}

interface InputState extends SmokeState {
  value: string;
  enabled: boolean;
  multiline: boolean;
  changes: number;
  begins: number;
  ends: number;
  returns: number;
  keyboard: number;
  normalize: boolean;
  removeOnChange: boolean;
  editorVisible: boolean;
}

/** @Component({viewModel: 'PageViewModel', context: 'PageContext'}) */
export class InputPage extends SmokePage<InputState> {
  state: InputState = {
    count: 0, result: 'Input: idle', pages: 'Stack: loading',
    value: '', enabled: true, multiline: false, changes: 0, begins: 0, ends: 0, returns: 0,
    keyboard: 0, normalize: false,
    removeOnChange: false, editorVisible: true,
  };

  private field = new ElementRef<TextFieldInteractive>();
  private area = new ElementRef<TextViewInteractive>();
  private keyboard?: { cancel(): void };

  onCreate(): void {
    super.onCreate();
    this.keyboard = Application.observeKeyboardHeight(height => {
      this.log('keyboard-height', { height });
      if (!this.isDestroyed()) this.setState({ keyboard: Math.round(height) });
    });
  }

  onDestroy(): void {
    this.keyboard?.cancel();
    super.onDestroy();
  }

  private record(kind: string, event: EditEvent): string {
    if (typeof event.text !== 'string' || !Number.isInteger(event.selectionStart) ||
        !Number.isInteger(event.selectionEnd)) {
      throw new Error(`Invalid native edit payload: ${JSON.stringify(event)}`);
    }
    this.log('input', { kind, ...event });
    return `${kind}: ${event.text} [${event.selectionStart},${event.selectionEnd}]`;
  }

  private change = (event: EditEvent): void => {
    // Valdi renders each setState immediately. Publish the controlled text and
    // its diagnostic label together to avoid an intermediate old-value render.
    this.setState({
      result: this.record('change', event), value: event.text, changes: this.state.changes + 1,
    });
  };
  private begin = (event: EditEvent): void => {
    this.setState({ result: this.record('begin', event), begins: this.state.begins + 1 });
  };
  private end = (event: EditEvent): void => {
    this.setState({ result: this.record('end', event), ends: this.state.ends + 1 });
  };
  private submit = (event: EditEvent): void => {
    this.setState({ result: this.record('return', event), returns: this.state.returns + 1 });
  };
  private selection = (event: EditEvent): void => {
    this.setState({ result: this.record('selection', event), value: event.text });
  };
  private process = (event: EditEvent): EditEvent | undefined => {
    this.log('input-processor', { ...event, normalize: this.state.normalize });
    if (this.state.removeOnChange) {
      this.setState({ editorVisible: false, removeOnChange: false });
      return undefined;
    }
    if (!this.state.normalize) return undefined;
    return { ...event, text: event.text.toUpperCase() };
  };

  private focus(focused: boolean): void {
    if (this.state.multiline) this.area.setAttribute('focused', focused);
    else this.field.setAttribute('focused', focused);
  }

  protected button(title: string, onTap: () => void): void {
    <view width="100%" height={28} marginBottom={4} backgroundColor="#176b55" borderRadius={5}
      alignItems="center" justifyContent="center" onTap={onTap}>
      <label width="96%" height={24} font="system-semibold 13" textAlign="center" color="#ffffff" value={title} />;
    </view>;
  }

  onRender(): void {
    const s = this.state;
    <view width="100%" height="100%" padding={16} backgroundColor="#f4f1e8">
      <label width="100%" height={32} font="system-bold 22" color="#182825" value="Native input contracts" />
      <label width="100%" height={28} font="system 14" color="#182825"
        value={`Changes=${s.changes} begin=${s.begins} end=${s.ends} return=${s.returns}`} />
      <label width="100%" height={24} font="system 14" color="#182825" value={`Keyboard height: ${s.keyboard}`} />
      {!s.editorVisible ? (
        <label width="100%" height={52} font="system 18" value="Editor removed by processor" />
      ) : s.multiline ? (
        <textview ref={this.area} width="100%" height={120} font="system 18"
          value={s.value} placeholder="Type multiline text" enabled={s.enabled}
          backgroundColor="#ffffff" color="#182825" placeholderColor="#697b73"
          characterLimit={80} onChange={this.change} onEditBegin={this.begin} onEditEnd={this.end}
          onReturn={this.submit} onWillChange={this.process}
          onWillDelete={event => { this.record('will-delete', event); }}
          onSelectionChange={this.selection} />
      ) : (
        <textfield ref={this.field} width="100%" height={52} font="system 18"
          value={s.value} placeholder="Type Harmony text" enabled={s.enabled}
          backgroundColor="#ffffff" color="#182825" placeholderColor="#697b73"
          characterLimit={80} returnKeyText="done" closesWhenReturnKeyPressed={true}
          onChange={this.change} onEditBegin={this.begin} onEditEnd={this.end}
          onReturn={this.submit} onWillChange={this.process}
          onWillDelete={event => { this.record('will-delete', event); }}
          onSelectionChange={this.selection} />
      )}
      <label width="100%" height={60} font="system 14" color="#182825" numberOfLines={2} value={s.result} />
      {this.button('Focus input', () => this.focus(true))}
      {this.button('Blur input', () => this.focus(false))}
      {this.button('Set text to Native 42', () => this.setState({ value: 'Native 42' }))}
      {this.button('Set supplementary Unicode text', () => this.setState({ value: 'A\u{1F600}B\u4E2D' }))}
      {this.button(`Uppercase processor: ${s.normalize}`, () => this.setState({ normalize: !s.normalize }))}
      {this.button('Select first six characters', () => {
        if (s.multiline) this.area.setAttribute('selection', [0, 6]);
        else this.field.setAttribute('selection', [0, 6]);
      })}
      {this.button(`Input enabled: ${s.enabled}`, () => this.setState({ enabled: !s.enabled }))}
      {this.button(`Editor: ${s.multiline ? 'multiline' : 'single line'}`, () => {
        this.focus(false);
        this.setState({ multiline: !s.multiline, value: '' });
      })}
      {this.button(`Remove in processor: ${s.removeOnChange}`, () =>
        this.setState({ editorVisible: true, removeOnChange: !s.removeOnChange }))}
      {this.button('Restore empty editor', () => this.setState({ editorVisible: true, value: '' }))}
      {this.button('Back from input', () => this.pageRouter.back())}
    </view>;
  }
}
