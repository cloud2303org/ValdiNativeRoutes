// Initialize a new application from this template: rebrand app identity / native host packages,
// and optionally strip optional demo modules into a minimal 6-module starter (--minimal).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { readAppConfig, validateAppConfig } from './lib/app-config.mjs';
import { generateIosProject } from './lib/ios-project.mjs';
import { syncNativeModuleRegistration } from './lib/native-modules.mjs';

const defaultRoot = path.resolve(import.meta.dirname, '..');

export const CORE_MODULES = [
  'app_foundation',
  'app_ota',
  'app_pages',
  'app_ui',
  'native_common',
  'theme_bridge',
];

const APPLE_PREFIXES = new Set(['NS', 'UI', 'AV', 'CA', 'CF', 'SC']);

const TEMPLATE_MAINTAINER_FILES = [
  'scripts/maintainer/ci.mjs',
  'scripts/maintainer/ci-linux-disk.sh',
  'scripts/maintainer/generate-lottie-demo.mjs',
  'scripts/maintainer/release.mjs',
  'scripts/maintainer/upstream.mjs',
  'scripts/maintainer/verify-node-compiler-actions.mjs',
  'scripts/maintainer/verify-runtime-actions.mjs',
];

const SHARED_ANDROID_MODULE_IMPORTS = {
  'navigation/AppRoot.kt': ['io.valdiroutes.app.ValdiOta'],
  'runtime/ValdiHost.kt': [
    'io.valdiroutes.app.BottomSheetBinders',
    'io.valdiroutes.app.ColumnWheelView',
    'io.valdiroutes.app.TimeWheelView',
    'io.valdiroutes.app.TreeWheelView',
    'io.valdiroutes.app.ValdiOta',
    'io.valdiroutes.app.ValdiWheelBinder',
  ],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deriveIosPrefix(name) {
  const capitals = name.replace(/[^A-Za-z0-9]/g, '').match(/[A-Z]/g)?.join('') ?? '';
  const alphanumeric = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  let candidate = capitals.length >= 2 ? capitals.slice(0, 4) : alphanumeric.slice(0, 2);
  if (candidate.length < 2) candidate = `${candidate}X`.slice(0, 2);
  if (!/^[A-Z]/.test(candidate)) candidate = `A${candidate}`.slice(0, 4);
  if (APPLE_PREFIXES.has(candidate)) candidate = `${candidate}X`;
  return candidate;
}

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function walkFiles(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(full, extension);
    return !extension || entry.name.endsWith(extension) ? [full] : [];
  });
}

function pruneEmptyParents(startDir, stopDir) {
  let current = startDir;
  const resolvedStop = path.resolve(stopDir);
  while (current && path.resolve(current) !== resolvedStop && path.resolve(current).startsWith(`${resolvedStop}${path.sep}`)) {
    if (!existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (readdirSync(current).length > 0) break;
    rmSync(current, { recursive: true, force: true });
    current = path.dirname(current);
  }
}

function relocateDirectoryContents(fromDir, toDir, stopDir) {
  if (!existsSync(fromDir) || path.resolve(fromDir) === path.resolve(toDir)) return;
  const tempDir = `${stopDir}.relocating-${process.pid}`;
  rmSync(tempDir, { recursive: true, force: true });
  renameSync(fromDir, tempDir);
  pruneEmptyParents(path.dirname(fromDir), stopDir);
  mkdirSync(path.dirname(toDir), { recursive: true });
  renameSync(tempDir, toDir);
}

function syncSharedAndroidImports(source, imports, needed) {
  let lines = source.split('\n');
  lines = lines.filter(line => !imports.some(imp => line.trim() === `import ${imp}`));
  if (needed) {
    const packageIndex = lines.findIndex(line => /^package\s+/.test(line));
    let insertAt = packageIndex >= 0 ? packageIndex + 1 : 0;
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;
    const importLines = imports.map(imp => `import ${imp}`);
    lines.splice(insertAt, 0, ...importLines);
  }
  return lines.join('\n');
}

function relocateAndroidNamespace(root, prevNamespace, nextNamespace) {
  const prevRel = prevNamespace.split('.').join('/');
  const nextRel = nextNamespace.split('.').join('/');
  for (const setName of ['main', 'test']) {
    const javaRoot = path.join(root, `android/app/src/${setName}/java`);
    if (!existsSync(javaRoot)) continue;
    const fromDir = path.join(javaRoot, prevRel);
    const toDir = path.join(javaRoot, nextRel);
    relocateDirectoryContents(fromDir, toDir, javaRoot);
    const pkgPattern = new RegExp(`^package\\s+${escapeRegExp(prevNamespace)}(\\.[A-Za-z0-9_.]+)?\\b`, 'm');
    const importPattern = new RegExp(`^import\\s+${escapeRegExp(prevNamespace)}\\.`, 'gm');
    for (const file of walkFiles(toDir, '.kt')) {
      let content = readFileSync(file, 'utf8')
        .replace(pkgPattern, `package ${nextNamespace}$1`)
        .replace(importPattern, `import ${nextNamespace}.`);
      if (setName === 'main') {
        const relativeFile = path.relative(toDir, file).split(path.sep).join('/');
        const sharedImports = SHARED_ANDROID_MODULE_IMPORTS[relativeFile];
        if (sharedImports) {
          content = syncSharedAndroidImports(content, sharedImports, nextNamespace !== 'io.valdiroutes.app');
        }
      }
      writeFileSync(file, content);
    }
  }
}

function renameIosHostTarget(root, prevName, nextName) {
  const iosRoot = path.join(root, 'ios');
  if (!existsSync(iosRoot) || prevName === nextName) return;
  const prevDir = path.join(iosRoot, prevName);
  const nextDir = path.join(iosRoot, nextName);
  if (existsSync(prevDir)) {
    const prevHeader = path.join(prevDir, `${prevName}-Bridging-Header.h`);
    if (existsSync(prevHeader)) {
      renameSync(prevHeader, path.join(prevDir, `${nextName}-Bridging-Header.h`));
    }
    renameSync(prevDir, nextDir);
  }
  rmSync(path.join(iosRoot, `${prevName}.xcodeproj`), { recursive: true, force: true });

  const projectYml = path.join(iosRoot, 'project.yml');
  if (existsSync(projectYml)) {
    const updated = readFileSync(projectYml, 'utf8')
      .replace(new RegExp(`(\\s*-\\s*path:\\s*)${escapeRegExp(prevName)}\\b`), `$1${nextName}`)
      .replace(
        new RegExp(`(SWIFT_OBJC_BRIDGING_HEADER:\\s*)${escapeRegExp(prevName)}/${escapeRegExp(prevName)}-Bridging-Header\\.h\\b`),
        `$1${nextName}/${nextName}-Bridging-Header.h`,
      );
    writeFileSync(projectYml, updated);
  }

  for (const scriptName of ['run-route-payload-tests.sh', 'run-startup-splash-state-tests.sh']) {
    const scriptFile = path.join(iosRoot, 'Tests', scriptName);
    if (!existsSync(scriptFile)) continue;
    const updated = readFileSync(scriptFile, 'utf8').replaceAll(`$ios_dir/${prevName}/`, `$ios_dir/${nextName}/`);
    writeFileSync(scriptFile, updated);
  }
}

function writeMinimalStarterPages(appPagesDir, displayName) {
  for (const entry of ['assets', 'cpp', 'module.json', 'src/cpp', 'src/database', 'src/state', 'src/features',
    'res/tab_device@3x.png', 'res/tab_device_on@3x.png']) {
    rmSync(path.join(appPagesDir, entry), { recursive: true, force: true });
  }

  const buildBazel = path.join(appPagesDir, 'BUILD.bazel');
  if (existsSync(buildBazel)) {
    const cleaned = readFileSync(buildBazel, 'utf8')
      .split('\n')
      .filter(line => !line.includes('//modules/app_vision:'))
      .join('\n');
    writeFileSync(buildBazel, cleaned);
  }

  const write = (relative, content) => {
    const file = path.join(appPagesDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  write('src/services/api.ts', `import { appUIApi } from 'app_ui/src/api';

export type * from 'app_ui/src/api';

export class ApiError extends Error {
  readonly errMsg: string;
  constructor(method: string, cause: unknown) {
    super(\`\${method}:fail \${cause instanceof Error ? cause.message : String(cause)}\`);
    this.name = 'ApiError';
    this.errMsg = this.message;
  }
}

const fail = (method: string, cause: unknown) => new ApiError(method, cause);

export type AppApi = ReturnType<typeof appUIApi>;

let ui: AppApi | undefined;

export const api: AppApi = new Proxy({} as Record<string, unknown>, {
  get(cache, prop, receiver) {
    if (typeof prop !== 'string') return Reflect.get(cache, prop, receiver);
    if (Object.prototype.hasOwnProperty.call(cache, prop)) return cache[prop];
    if (prop === 'then' || prop === 'toJSON') return undefined;
    const group = (ui ??= appUIApi(fail));
    if (!(prop in group)) return undefined;
    const value = Reflect.get(group, prop);
    cache[prop] = value;
    return value;
  },
}) as unknown as AppApi;
`);

  write('src/routes.ts', `import res from 'app_pages/res';
import { defineRoutes, valdiPage } from 'app_foundation/src/navigation/config';
import { DetailPage } from './features/detail/DetailPage';
import { ExplorePage } from './features/explore/ExplorePage';
import { HomePage } from './features/home/HomePage';

export const routes = defineRoutes({
  navigation: {
    animation: 'default',
    android: { animation: 'slideRight', durationMs: 300 },
  },
  pages: {
    home: valdiPage({ component: HomePage, title: '首页' }),
    explore: valdiPage({ component: ExplorePage, title: '示例' }),
    detail: valdiPage<{ id: number; from: string }, { visited: number }>({ component: DetailPage, title: '详情' }),
  },
  tabs: {
    initial: 'home',
    items: [
      { route: 'home', text: '首页', icon: res.tabHome, selectedIcon: res.tabHomeOn },
      { route: 'explore', text: '示例', icon: res.tabComponents, selectedIcon: res.tabComponentsOn },
    ],
  },
});
`);

  const escapedTitle = JSON.stringify(displayName);
  write('src/features/home/HomePage.tsx', `import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { getInfo } from 'app_ota/src';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { color, tokens } from '../../components/theme';
import { Router, type RouteViewModel } from '../../router';
import { api } from '../../services/api';

interface State {
  bundleVersion: string;
  lastResult: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRHomePage', android: 'io.valdiroutes.pages.HomePage'})
 */
export class HomePage extends Page<PageViewModel, State, PageContext> {
  declare readonly viewModel: Readonly<RouteViewModel<'home'>>;

  state: State = { bundleVersion: '-', lastResult: '尚未打开详情页' };

  private get router(): Router {
    return new Router(this.context);
  }

  onCreate(): void {
    void getInfo()
      .then(info => this.setState({ bundleVersion: info.bundleVersion }))
      .catch(() => {});
  }

  onRender(): void {
    const { insets } = this.viewModel;
    <view style={styles.page}>
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingTop={insets.top + tokens.space.lg}
          paddingBottom={insets.bottom + tokens.space.xl}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
        >
          <PageHeader title={${escapedTitle}} subtitle={\`Bundle: \${this.state.bundleVersion}\`} />
          <label style={styles.note} numberOfLines={0} value={this.state.lastResult} />
          <Button id="detail" title="打开详情页（带返回值）" onTap={this.handleOpenDetail} />
          <Button id="modal" title="打开原生确认弹窗" secondary={true} onTap={this.handleModal} />
          <Button id="toast" title="显示原生 Toast" secondary={true} onTap={this.handleToast} />
        </view>
      </scroll>
    </view>;
  }

  private handleOpenDetail = async () => {
    const result = await this.router.pushForResult('detail', { id: 1, from: '首页' });
    if (result) {
      this.setState({ lastResult: \`详情页返回：最深访问到第 \${result.visited} 层\` });
    }
  };

  private handleModal = async () => {
    const reply = await api.showModal({ title: '欢迎使用', content: '原生导航与 AppUI 已就绪。' });
    if (reply.confirm) {
      await api.showToast({ title: '已确认', icon: 'success' });
    }
  };

  private handleToast = () => {
    void api.showToast({ title: 'Hello Valdi', icon: 'none' });
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: 0,
    flexGrow: 1,
  }),
  content: new Style<View>({}),
  note: new Style<Label>({
    color: color.muted,
    font: systemFont(14),
    marginBottom: tokens.space.lg,
  }),
};
`);

  write('src/features/explore/ExplorePage.tsx', `import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { color, tokens } from '../../components/theme';
import { router, type RouteViewModel } from '../../router';
import { api } from '../../services/api';

interface State {
  selected: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRExplorePage', android: 'io.valdiroutes.pages.ExplorePage'})
 */
export class ExplorePage extends Page<PageViewModel, State, PageContext> {
  declare readonly viewModel: Readonly<RouteViewModel<'explore'>>;

  state: State = { selected: '未选择' };

  onRender(): void {
    const { insets } = this.viewModel;
    <view style={styles.page}>
      <NavigationBar title="交互示例" topInset={insets.top} />
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingBottom={insets.bottom + tokens.space.xl}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
        >
          <label style={styles.note} value={\`当前选择：\${this.state.selected}\`} />
          <Button id="picker" title="原生滚轮选择器" onTap={this.handlePicker} />
          <Button id="sheet" title="原生操作菜单" secondary={true} onTap={this.handleActionSheet} />
          <Button id="home" title="切换到首页 Tab" secondary={true} onTap={this.handleSwitchHome} />
        </view>
      </scroll>
    </view>;
  }

  private handlePicker = async () => {
    const result = await api.showPicker({
      title: '选择环境',
      options: ['开发环境', '预发环境', '生产环境'],
    });
    if (result.confirm) {
      this.setState({ selected: result.value });
    }
  };

  private handleActionSheet = async () => {
    try {
      const items = ['刷新数据', '复制链接', '分享页面'] as const;
      const result = await api.showActionSheet({ itemList: items });
      this.setState({ selected: items[result.tapIndex] ?? '未知' });
    } catch {
      // User dismissed action sheet.
    }
  };

  private handleSwitchHome = () => {
    router.switchTab('home');
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: 0,
    flexGrow: 1,
  }),
  content: new Style<View>({
    paddingTop: tokens.space.lg,
  }),
  note: new Style<Label>({
    color: color.text,
    font: systemFont(15),
    marginBottom: tokens.space.lg,
  }),
};
`);

  write('src/features/detail/DetailPage.tsx', `import { Style } from 'valdi_core/src/Style';
import { systemFont } from 'valdi_core/src/SystemFont';
import { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { PageContext, PageViewModel } from 'app_foundation/src/page/Page';
import { Page } from 'app_foundation/src/page/PageComponent';
import { Button } from '../../components/Button';
import { NavigationBar } from '../../components/NavigationBar';
import { color, tokens } from '../../components/theme';
import { Router, router, type RouteViewModel } from '../../router';

interface State {
  deepest: number;
  pages: string;
}

/**
 * @Component({viewModel: 'PageViewModel', context: 'PageContext'})
 * @ExportModel({ios: 'VRDetailPage', android: 'io.valdiroutes.pages.DetailPage'})
 */
export class DetailPage extends Page<PageViewModel, State, PageContext> {
  declare readonly viewModel: Readonly<RouteViewModel<'detail'>>;

  state: State = { deepest: 0, pages: '' };

  private get router(): Router {
    return new Router(this.context);
  }

  onCreate(): void {
    void router.getCurrentPages().then(stack => {
      this.setState({ pages: \`当前栈：\${stack.map(item => item.route).join(' → ')}\` });
    });
  }

  onRender(): void {
    const { insets, pageId } = this.viewModel;
    const { id, from } = this.viewModel.params;
    const deepest = Math.max(this.state.deepest, id);

    <view style={styles.page}>
      <NavigationBar title={\`详情 #\${id}\`} topInset={insets.top} onBack={this.handleBack} />
      <scroll style={styles.scroll}>
        <view
          style={styles.content}
          paddingBottom={insets.bottom + tokens.space.xl}
          paddingLeft={insets.left + tokens.space.lg}
          paddingRight={insets.right + tokens.space.lg}
        >
          <label style={styles.text} value={\`来自 \${from} · \${pageId}\`} />
          <label style={styles.text} numberOfLines={0} value={this.state.pages} />
          <Button id="next" title={\`继续压栈详情 #\${id + 1}\`} onTap={this.handleNext} />
          <Button id="finish" title={\`带结果返回（第 \${deepest} 层）\`} secondary={true} onTap={this.handleFinish} />
          <Button id="root" title="回到根页面" secondary={true} onTap={this.handlePopToRoot} />
        </view>
      </scroll>
    </view>;
  }

  private handleBack = () => {
    this.router.back();
  };

  private handleNext = async () => {
    const { id } = this.viewModel.params;
    const result = await this.router.pushForResult('detail', { id: id + 1, from: \`详情 #\${id}\` });
    if (result) {
      this.setState({ deepest: Math.max(this.state.deepest, result.visited) });
    }
  };

  private handleFinish = () => {
    const { id } = this.viewModel.params;
    this.router.finish<'detail'>({ visited: Math.max(this.state.deepest, id) });
  };

  private handlePopToRoot = () => {
    router.popToRoot();
  };
}

const styles = {
  page: new Style<View>({
    width: '100%',
    height: '100%',
    backgroundColor: color.canvas,
  }),
  scroll: new Style<ScrollView>({
    width: '100%',
    height: 0,
    flexGrow: 1,
  }),
  content: new Style<View>({
    paddingTop: tokens.space.md,
  }),
  text: new Style<Label>({
    color: color.text,
    font: systemFont(15),
    marginBottom: tokens.space.md,
  }),
};
`);
}

function applyMinimalTrim(root, nextApp) {
  const modulesRoot = path.join(root, 'valdi/modules');
  const coreSet = new Set(CORE_MODULES);
  if (existsSync(modulesRoot)) {
    for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || coreSet.has(entry.name)) continue;
      const moduleDir = path.join(modulesRoot, entry.name);
      const configFile = path.join(moduleDir, 'module.json');
      const iosName = existsSync(configFile)
        ? (JSON.parse(readFileSync(configFile, 'utf8')).iosModuleName ?? entry.name)
        : entry.name;
      rmSync(path.join(root, 'android/app/generated/valdi', `${entry.name}.kt`), { force: true });
      rmSync(path.join(root, 'ios/Generated/valdi', iosName), { recursive: true, force: true });
      rmSync(path.join(root, 'ios/Generated/valdi', `${iosName}Types`), { recursive: true, force: true });
      rmSync(path.join(root, 'tools/valdi-rolldown/.gen', entry.name), { recursive: true, force: true });
      rmSync(moduleDir, { recursive: true, force: true });
    }
  }

  for (const dir of ['vision', '.argent', 'scripts/e2e', 'scripts/tests', 'tools/valdi-rolldown/tests']) {
    rmSync(path.join(root, dir), { recursive: true, force: true });
  }
  for (const file of TEMPLATE_MAINTAINER_FILES) {
    rmSync(path.join(root, file), { force: true });
  }

  const nsRel = nextApp.native.androidNamespace.split('.').join('/');
  const androidMainDir = path.join(root, 'android/app/src/main/java', nsRel);
  rmSync(path.join(androidMainDir, 'features'), { recursive: true, force: true });
  const appKt = path.join(androidMainDir, 'App.kt');
  if (existsSync(appKt)) {
    const cleaned = readFileSync(appKt, 'utf8')
      .split('\n')
      .filter(line => !line.includes('NativeExamples.registerScreens()'))
      .join('\n');
    writeFileSync(appKt, cleaned);
  }

  const iosAppDir = path.join(root, 'ios', nextApp.name);
  rmSync(path.join(iosAppDir, 'Features'), { recursive: true, force: true });
  const appSwift = path.join(iosAppDir, 'App.swift');
  if (existsSync(appSwift)) {
    const cleaned = readFileSync(appSwift, 'utf8')
      .split('\n')
      .filter(line => !line.includes('NativeExamples.registerScreens()'))
      .join('\n');
    writeFileSync(appSwift, cleaned);
  }

  const appPagesDir = path.join(modulesRoot, 'app_pages');
  if (existsSync(appPagesDir)) {
    writeMinimalStarterPages(appPagesDir, nextApp.displayName);
  }
}

function runRolldownStep(root, args) {
  const rolldownDir = path.join(root, 'tools/valdi-rolldown');
  const tsx = path.join(rolldownDir, 'node_modules/tsx/dist/cli.mjs');
  if (!existsSync(tsx)) return false;
  const result = spawnSync(process.execPath, [tsx, ...args], {
    cwd: rolldownDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`valdi-rolldown ${args[0]} failed:\n${result.stderr || result.stdout}`);
  }
  return true;
}

function hasCommand(binary) {
  return spawnSync('which', [binary], { stdio: 'ignore' }).status === 0;
}

export function initApp(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const pkgFile = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const prevApp = readAppConfig(root);

  const nameChanged = options.name !== undefined && options.name !== prevApp.name;
  const targetName = options.name ?? prevApp.name;
  const targetDisplayName = options.displayName ?? (nameChanged ? targetName : prevApp.displayName);
  const targetAppId = options.appId ?? prevApp.android.applicationId;
  const targetIosId = options.iosId ?? (options.appId !== undefined ? options.appId : prevApp.ios.bundleIdentifier);
  const targetNamespace = options.namespace ?? (options.appId !== undefined ? options.appId : prevApp.native.androidNamespace);
  const targetIosPrefix = options.iosPrefix ?? (nameChanged && prevApp.native.iosPrefix === 'VR'
    ? deriveIosPrefix(targetName)
    : prevApp.native.iosPrefix);

  const nextApp = validateAppConfig({
    name: targetName,
    displayName: targetDisplayName,
    ...(Object.hasOwn(prevApp, 'icon') ? { icon: prevApp.icon } : {}),
    android: { applicationId: targetAppId },
    ios: { bundleIdentifier: targetIosId },
    native: { androidNamespace: targetNamespace, iosPrefix: targetIosPrefix },
  }, root);

  const minimal = Boolean(options.minimal);
  const actions = [];
  if (prevApp.name !== nextApp.name) actions.push(`Rename app target: ${prevApp.name} -> ${nextApp.name}`);
  if (prevApp.displayName !== nextApp.displayName) actions.push(`Set launcher displayName: ${nextApp.displayName}`);
  if (prevApp.android.applicationId !== nextApp.android.applicationId) {
    actions.push(`Set Android applicationId: ${nextApp.android.applicationId}`);
  }
  if (prevApp.ios.bundleIdentifier !== nextApp.ios.bundleIdentifier) {
    actions.push(`Set iOS bundleIdentifier: ${nextApp.ios.bundleIdentifier}`);
  }
  if (prevApp.native.androidNamespace !== nextApp.native.androidNamespace) {
    actions.push(`Relocate Android host namespace: ${prevApp.native.androidNamespace} -> ${nextApp.native.androidNamespace}`);
  }
  if (prevApp.native.iosPrefix !== nextApp.native.iosPrefix) {
    actions.push(`Set new-module iOS prefix: ${nextApp.native.iosPrefix}`);
  }
  if (minimal) {
    actions.push(`Slim project to minimal starter (${CORE_MODULES.join(', ')})`);
  }

  if (options.dryRun) {
    return { prevApp, nextApp, minimal, dryRun: true, actions };
  }

  if (prevApp.name !== nextApp.name) {
    pkg.name = toKebabCase(nextApp.name);
  }
  pkg.valdi = {
    ...pkg.valdi,
    app: nextApp,
    ...(minimal ? { modules: [...CORE_MODULES] } : {}),
  };
  if (minimal && pkg.scripts) {
    delete pkg.scripts['release:pack'];
    delete pkg.scripts['test:e2e:android'];
    delete pkg.scripts['test:e2e:ios'];
  }
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

  if (prevApp.native.androidNamespace !== nextApp.native.androidNamespace) {
    relocateAndroidNamespace(root, prevApp.native.androidNamespace, nextApp.native.androidNamespace);
  }
  if (prevApp.name !== nextApp.name) {
    renameIosHostTarget(root, prevApp.name, nextApp.name);
  }
  if (minimal) {
    applyMinimalTrim(root, nextApp);
  }

  if (!options.skipSync) {
    syncNativeModuleRegistration(root);
    const hasSources = existsSync(path.join(root, 'valdi/.valdi-sources')) ||
      existsSync(path.join(root, 'valdi/bazel-valdi/external/valdi+'));
    if (hasSources) {
      runRolldownStep(root, ['tsconfig.ts']);
      if (minimal) {
        const codegenArgs = [
          'codegen.ts',
          ...(existsSync(path.join(root, 'android/app')) ? ['--kotlin-out', path.join(root, 'android/app/generated/valdi')] : []),
          ...(existsSync(path.join(root, 'ios')) ? ['--objc-out', path.join(root, 'ios/Generated/valdi'), '--objc-framework', 'ValdiRuntime'] : []),
          '--cpp-modules-out', path.join(root, 'valdi/modules'),
        ];
        runRolldownStep(root, codegenArgs);
      }
    }
    if (process.platform === 'darwin' && !options.skipIosProject &&
        existsSync(path.join(root, 'ios/project.yml')) && hasCommand('xcodegen')) {
      generateIosProject(root);
    }
  }

  return { prevApp, nextApp, minimal, dryRun: false, actions };
}

function printHelp() {
  console.log(`Usage: pnpm init-app [options]

Options:
  --name <AppName>           App target & Xcode scheme identifier (e.g. AcmeApp)
  --display-name <Title>     Launcher display name on Android & iOS (e.g. "Acme 应用")
  --app-id <id>              Android applicationId (defaults --ios-id & --namespace if omitted)
  --ios-id <id>              iOS bundleIdentifier (defaults to --app-id)
  --namespace <package>      Android host Kotlin namespace (defaults to --app-id)
  --ios-prefix <PREFIX>      iOS class prefix for new modules (2-10 uppercase chars, e.g. AC)
  --minimal                  Strip optional demo/hardware modules into a clean 6-module starter
  --dry-run                  Validate and preview planned changes without writing files
  --skip-ios-project         Skip regenerating Xcode project on macOS
  --yes, -y                  Run non-interactively using provided flags / defaults
  --help, -h                 Show this help message

Examples:
  pnpm init-app --name AcmeApp --display-name "Acme" --app-id com.acme.app
  pnpm init-app --name AcmeApp --app-id com.acme.app --minimal`);
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ['--name', 'name'],
    ['--display-name', 'displayName'],
    ['--app-id', 'appId'],
    ['--ios-id', 'iosId'],
    ['--namespace', 'namespace'],
    ['--ios-prefix', 'iosPrefix'],
    ['--root', 'root'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--minimal') {
      options.minimal = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-sync') {
      options.skipSync = true;
    } else if (arg === '--skip-ios-project') {
      options.skipIosProject = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (valueFlags.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Option ${arg} requires a value.`);
      }
      options[valueFlags.get(arg)] = value;
      i++;
    } else {
      throw new Error(`Unknown option: ${arg} (run with --help for usage)`);
    }
  }
  return options;
}

async function promptInteractive(root) {
  const current = readAppConfig(root);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (label, fallback) => {
      const answer = (await rl.question(`${label} (${fallback}): `)).trim();
      return answer || fallback;
    };
    const name = await ask('App target name', current.name);
    const defaultDisplay = name !== current.name ? name : current.displayName;
    const displayName = await ask('Launcher display name', defaultDisplay);
    const appId = await ask('Android applicationId', current.android.applicationId);
    const defaultIosId = appId !== current.android.applicationId ? appId : current.ios.bundleIdentifier;
    const iosId = await ask('iOS bundleIdentifier', defaultIosId);
    const defaultNs = appId !== current.android.applicationId ? appId : current.native.androidNamespace;
    const namespace = await ask('Android host namespace', defaultNs);
    const defaultPrefix = name !== current.name && current.native.iosPrefix === 'VR'
      ? deriveIosPrefix(name)
      : current.native.iosPrefix;
    const iosPrefix = await ask('New-module iOS prefix', defaultPrefix);
    const minimalAnswer = (await rl.question('Slim to minimal starter (--minimal)? (y/N): ')).trim().toLowerCase();
    return {
      name,
      displayName,
      appId,
      iosId,
      namespace,
      iosPrefix,
      minimal: minimalAnswer === 'y' || minimalAnswer === 'yes',
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }
  const hasExplicitAction = ['name', 'displayName', 'appId', 'iosId', 'namespace', 'iosPrefix', 'minimal']
    .some(key => parsed[key] !== undefined);
  let finalOptions = parsed;
  if (!hasExplicitAction && !parsed.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const answers = await promptInteractive(parsed.root ?? defaultRoot);
    finalOptions = { ...parsed, ...answers };
  }
  const result = initApp(finalOptions);
  if (!result.actions.length) {
    console.log('App configuration is already up to date.');
    return;
  }
  console.log(result.dryRun ? 'Planned changes (--dry-run):' : 'Initialized app:');
  for (const action of result.actions) {
    console.log(`  - ${action}`);
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
