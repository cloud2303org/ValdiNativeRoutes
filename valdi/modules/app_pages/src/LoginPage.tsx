import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont, systemSemiboldFont } from 'valdi_core/src/SystemFont';
import { Label, TextField, View } from 'valdi_tsx/src/NativeTemplateElements';
import { api } from './api';
import { auth } from './auth';
import { Button } from './Button';
import { NavigationBar } from './NavigationBar';
import { PageContext, PageViewModel } from './Page';
import { Page } from './PageComponent';
import { color, tokens } from './theme';

interface State {
  account: string;
  password: string;
}

/** How long the demo's pretend sign-in request takes. */
const SIGN_IN_MS = 800;

/**
 * The first page while signed out (app.ts). There is no server: any account and password sign in with a made-up
 * token, which auth.signIn keeps and then replaces this page with the app.
 *
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRLoginPage', android: 'io.valdiroutes.pages.LoginPage'})
 */
export class LoginPage extends Page<PageViewModel, State, PageContext> {
  state: State = { account: '', password: '' };

  private signingIn = false;

  onRender(): void {
    const { insets } = this.viewModel;
    const { account, password } = this.state;

    <view style={styles.page}>
      <NavigationBar title="账号登录" topInset={insets.top} />
      <view
        style={styles.content}
        paddingBottom={insets.bottom + tokens.space.content}
        paddingLeft={insets.left + tokens.space.content}
        paddingRight={insets.right + tokens.space.content}
      >
        <label style={styles.heading} color={color.ink} value="欢迎回来" />
        <label style={styles.hint} color={color.muted} numberOfLines={0} value="演示用：账号密码随便填，登录后 token 存在 Keychain / Keystore 里，下次启动直接进首页。" />

        <label style={styles.label} color={color.text} value="账号" />
        <view style={styles.box} backgroundColor={color.surface}>
          <textfield
            style={styles.input}
            color={color.text}
            placeholderColor={color.muted}
            value={account}
            placeholder="手机号或邮箱"
            autocapitalization="none"
            autocorrection="none"
            returnKeyText="next"
            onChange={this.handleAccount}
          />
        </view>

        <label style={styles.label} color={color.text} value="密码" />
        <view style={styles.box} backgroundColor={color.surface}>
          <textfield
            style={styles.input}
            color={color.text}
            placeholderColor={color.muted}
            value={password}
            placeholder="密码"
            contentType="password"
            returnKeyText="go"
            onChange={this.handlePassword}
            onReturn={this.handleSignIn}
          />
        </view>

        <view style={styles.actions}>
          <Button id="sign-in" title="登录" onTap={this.handleSignIn} />
        </view>
      </view>
    </view>;
  }

  private handleAccount = (event: { text: string }) => this.setState({ account: event.text });

  private handlePassword = (event: { text: string }) => this.setState({ password: event.text });

  private handleSignIn = async () => {
    const account = this.state.account.trim();
    if (!account || !this.state.password) {
      await api.showToast({ title: '请填写账号和密码', icon: 'none' });
      return;
    }
    if (this.signingIn) return;
    this.signingIn = true;
    await api.showLoading({ title: '登录中', mask: true });
    this.setTimeoutDisposable(async () => {
      await api.hideLoading();
      auth.signIn(`demo.${encodeURIComponent(account)}.${Date.now()}`);
    }, SIGN_IN_MS);
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  content: new Style<View>({
    paddingTop: tokens.space.xxl,
  }),
  heading: new Style<Label>({
    font: systemBoldFont(26),
  }),
  hint: new Style<Label>({
    font: systemFont(14),
    marginTop: tokens.space.sm,
    marginBottom: tokens.space.xxl,
  }),
  label: new Style<Label>({
    font: systemSemiboldFont(14),
    marginBottom: tokens.space.sm,
  }),
  box: new Style<View>({
    height: 54,
    borderRadius: tokens.radius.control,
    padding: `0 ${tokens.space.lg}`,
    justifyContent: 'center',
    marginBottom: tokens.space.xl,
  }),
  input: new Style<TextField>({
    width: '100%',
    height: 54,
    font: systemFont(16),
  }),
  actions: new Style<View>({
    marginTop: tokens.space.sm,
  }),
};
