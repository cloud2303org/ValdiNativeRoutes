import { NodeContent, window, FrameCallback, KeyboardAvoidMode } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common } from '@kit.AbilityKit';
import { HarmonySystemServices } from '../platform/HarmonySystemServices';
import { HarmonyAppUIMediaService } from '../platform/HarmonyAppUIMediaService';
import valdi, { NavigationState, NavigationTab as TabItem, AppUIFeedbackHost, AppUILoadingRequest, AppUIToastRequest } from 'libvaldi_harmony.so';

class TabSurface {
  shellId: string;
  tab: TabItem;
  content: NodeContent = new NodeContent();
  constructor(shellId: string, tab: TabItem) {
    this.shellId = shellId;
    this.tab = tab;
  }
}

class PresentationFrame extends FrameCallback {
  private done: () => void;
  constructor(done: () => void) {
    super();
    this.done = done;
  }
  onFrame(_time: number): void {
    this.done();
  }
}

@Entry
@Component
struct Index {
  private content: NodeContent = new NodeContent();
  private tabBarContent: NodeContent = new NodeContent();
  private sheetNodeContent: NodeContent = new NodeContent();
  @State tabSurfaces: TabSurface[] = [];
  private hostId: number = 0;
  private viewportHeight: number = 0;
  private statusStyle: string = '';
  private foreground: boolean = true;
  private gestureBackRequested: boolean = false;
  private gestureBackWindow: window.Window | undefined = undefined;
  private previousGestureBack: boolean = true;
  // Serialize window writes: a late disable must be followed by restoration
  // when navigation/root, background or teardown changed the desired state.
  private gestureBackWork: Promise<void> = Promise.resolve();
  private keyboardWindow: window.Window | undefined = undefined;
  private keyboardEpoch: number = 0;
  private systemTop: number = 0;
  private systemBottom: number = 0;
  @State systemLeft: number = 0;
  @State systemRight: number = 0;
  // Intentional official ArkUI barHeight, also supplied as the native inset.
  // System bottom is accounted for separately; custom components choose their
  // own geometry and never participate in this value.
  private readonly officialTabBarHeight: number = 48;
  @State keyboardHeight: number = 0;
  @State bottomSafeArea: number = 0;
  private appUIEpoch: number = 0;
  private toastTimer: number = -1;
  private toastEpoch: number = 0;
  private keyboardChanged: (height: number) => void = (height: number): void => {
    this.updateKeyboardHeight(this.getUIContext().px2vp(height));
  };
  private avoidAreaChanged: (options: window.AvoidAreaOptions) => void =
    (_options: window.AvoidAreaOptions): void => {
      this.refreshInsets();
    };
  @State navigation: NavigationState = {
    tabs: [], selectedTab: '', tabShellId: '', tabBarMode: 'default',
    overlayVisible: false, sheetVisible: false, tabBarVisible: false, canGoBack: false,
    transitioning: false, interactiveBackEnabled: false, interactive: false,
    progress: 0, statusBarStyle: 'auto'
  };
  @State error: string = '';
  @State loadingVisible: boolean = false;
  @State loadingTitle: string = '';
  @State loadingMask: boolean = false;
  @State toastVisible: boolean = false;
  @State toastTitle: string = '';
  @State toastIcon: string = 'none';
  @State toastMask: boolean = false;

  private clearToast(): void {
    ++this.toastEpoch;
    if (this.toastTimer >= 0) clearTimeout(this.toastTimer);
    this.toastTimer = -1;
    this.toastVisible = false;
  }

  private feedbackFrame(show: boolean, apply: () => void): Promise<void> {
    const handle = this.hostId;
    const epoch = this.appUIEpoch;
    return new Promise<void>((resolve, reject) => {
      if (handle === 0) { reject(new Error('E_APP_UI_CLOSED:window is closed')); return; }
      if (show && !this.foreground) { reject(new Error('E_APP_UI_BACKGROUND:page is not foreground')); return; }
      apply();
      this.getUIContext().postFrameCallback(new PresentationFrame(() => {
        if (handle !== this.hostId || epoch !== this.appUIEpoch) {
          reject(new Error('E_APP_UI_CLOSED:window was replaced'));
        } else resolve();
      }));
    });
  }

  private showAppUILoading(request: AppUILoadingRequest): Promise<void> {
    return this.feedbackFrame(true, () => {
      this.loadingTitle = request.title;
      this.loadingMask = request.mask;
      this.loadingVisible = true;
    });
  }

  private hideAppUILoading(): Promise<void> {
    return this.feedbackFrame(false, () => { this.loadingVisible = false; });
  }

  private showAppUIToast(request: AppUIToastRequest): Promise<void> {
    return this.feedbackFrame(true, () => {
      this.clearToast();
      this.toastTitle = request.title;
      this.toastIcon = request.icon;
      this.toastMask = request.mask;
      this.toastVisible = true;
      const handle = this.hostId;
      const epoch = this.appUIEpoch;
      const toastEpoch = this.toastEpoch;
      this.toastTimer = setTimeout(() => {
        if (handle === this.hostId && epoch === this.appUIEpoch && toastEpoch === this.toastEpoch) this.clearToast();
      }, Math.min(request.duration, 2147483647));
    });
  }

  private hideAppUIToast(): Promise<void> {
    return this.feedbackFrame(false, () => this.clearToast());
  }

  private fail(message: string): void {
    this.error = message;
    hilog.error(0xFF00, 'ValdiHarmony', '%{public}s', message);
  }

  private observe(next: NavigationState): void {
    try {
      const modeChanged = this.navigation.tabBarMode !== next.tabBarMode;
      this.navigation = next;
      this.syncTabSurfaces(next);
      if (modeChanged) this.publishInsets();
      this.error = next.error ?? '';
      this.applyStatusStyle(next.statusBarStyle);
      this.applyGestureBackPolicy();
    } catch (err) {
      this.fail(String(err));
    }
  }

  private syncTabSurfaces(next: NavigationState): void {
    if (next.tabBarMode !== 'default' || next.tabShellId.length === 0) {
      if (this.tabSurfaces.length > 0) this.tabSurfaces = [];
      return;
    }
    if (this.tabSurfaces.length === next.tabs.length &&
      this.tabSurfaces.every((surface: TabSurface, index: number): boolean =>
        surface.shellId === next.tabShellId && this.tabKey(surface.tab) === this.tabKey(next.tabs[index]))) {
      return;
    }
    const surfaces: TabSurface[] = next.tabs.map((tab: TabItem): TabSurface => new TabSurface(next.tabShellId, tab));
    // Publish owners before native callbacks can reenter observe().
    this.tabSurfaces = surfaces;
    for (let i = 0; i < surfaces.length; ++i) {
      const surface: TabSurface = surfaces[i];
      if (this.hostId === 0 || this.navigation.tabShellId !== next.tabShellId) return;
      valdi.registerTabSurface(this.hostId, surface.shellId, surface.tab.route, surface.content);
    }
  }

  private selectedTabIndex(): number {
    const index: number = this.tabSurfaces.findIndex((surface: TabSurface): boolean =>
      surface.tab.route === this.navigation.selectedTab);
    return Math.max(0, index);
  }

  private officialBarVisible(): boolean {
    return this.navigation.tabBarVisible && this.keyboardHeight === 0;
  }

  private admitOfficialTab(shellId: string, index: number): boolean {
    if (shellId !== this.navigation.tabShellId) return false;
    const surface: TabSurface = this.tabSurfaces[index];
    if (surface === undefined || surface.shellId !== this.navigation.tabShellId) return false;
    if (surface.tab.route !== this.navigation.selectedTab) this.selectTab(surface.tab.route);
    return surface.shellId === this.navigation.tabShellId && surface.tab.route === this.navigation.selectedTab;
  }

  private interceptOfficialTabs(event: TouchEvent): HitTestMode {
    if (!this.navigation.overlayVisible) return HitTestMode.Default;
    // During a native transition the active TabContent is temporarily empty.
    // Pass its page region to the lower animation surface; an admitted real
    // official-bar touch must consume rather than also hit that sibling page.
    if (this.officialBarVisible() && event.touches.length > 0 &&
      event.touches[0].y >= this.viewportHeight - this.officialTabBarHeight - this.bottomSafeArea) {
      return HitTestMode.BLOCK_HIERARCHY;
    }
    return HitTestMode.BLOCK_DESCENDANTS;
  }

  private applyGestureBackPolicy(): void {
    const requested: boolean = this.hostId > 0 && this.foreground && this.navigation.interactiveBackEnabled;
    if (requested === this.gestureBackRequested) {
      return;
    }
    this.gestureBackRequested = requested;
    this.gestureBackWork = this.gestureBackWork.then(async () => {
      if (this.gestureBackRequested) {
        if (this.gestureBackWindow !== undefined) {
          return;
        }
        const context = this.getUIContext().getHostContext();
        if (context === undefined) {
          return;
        }
        const main = await window.getLastWindow(context);
        if (!this.gestureBackRequested) {
          return;
        }
        this.previousGestureBack = main.isGestureBackEnabled();
        // Retain ownership before the async write, including its failure path,
        // so cleanup can restore the exact original value.
        this.gestureBackWindow = main;
        await main.setGestureBackEnabled(false);
      } else if (this.gestureBackWindow !== undefined) {
        await this.gestureBackWindow.setGestureBackEnabled(this.previousGestureBack);
        this.gestureBackWindow = undefined;
      }
    }).catch((err: Error) => {
      hilog.error(0xFF00, 'ValdiHarmony', 'Back gesture window policy: %{public}s', String(err));
    });
  }

  private observeKeyboard(): void {
    const epoch = ++this.keyboardEpoch;
    const context = this.getUIContext().getHostContext();
    if (context === undefined) {
      return;
    }
    window.getLastWindow(context).then((main: window.Window) => {
      if (epoch !== this.keyboardEpoch || this.hostId === 0) {
        return;
      }
      main.on('keyboardHeightChange', this.keyboardChanged);
      main.on('avoidAreaChange', this.avoidAreaChanged);
      this.keyboardWindow = main;
      this.refreshInsets();
    }).catch((err: Error) => {
      hilog.error(0xFF00, 'ValdiHarmony', 'Keyboard observation: %{public}s', String(err));
    });
  }

  private refreshInsets(): void {
    const main = this.keyboardWindow;
    if (main === undefined || this.hostId === 0) return;
    try {
      const system = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      const cutout = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
      const indicator = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      const ui = this.getUIContext();
      // These areas overlap; union their edge extents instead of adding them.
      this.systemTop = ui.px2vp(Math.max(system.topRect.height, cutout.topRect.height, indicator.topRect.height));
      this.systemBottom = ui.px2vp(Math.max(system.bottomRect.height, cutout.bottomRect.height,
        indicator.bottomRect.height));
      this.systemLeft = ui.px2vp(Math.max(system.leftRect.width, cutout.leftRect.width, indicator.leftRect.width));
      this.systemRight = ui.px2vp(Math.max(system.rightRect.width, cutout.rightRect.width, indicator.rightRect.width));
      this.bottomSafeArea = this.systemBottom;
      const keyboard = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_KEYBOARD);
      this.updateKeyboardHeight(ui.px2vp(keyboard.bottomRect.height));
    } catch (err) {
      this.fail(`Safe area: ${String(err)}`);
    }
  }

  private updateKeyboardHeight(height: number): void {
    if (this.hostId === 0) return;
    this.keyboardHeight = this.foreground ? Math.max(0, height) : 0;
    valdi.keyboardHeightChanged(this.hostId, this.keyboardHeight);
    this.publishInsets();
  }

  private publishInsets(): void {
    if (this.hostId === 0) return;
    const keyboardVisible = this.keyboardHeight > 0;
    valdi.setInsets(this.hostId, {
      top: this.systemTop,
      bottom: keyboardVisible ? 0 : this.systemBottom,
      left: this.systemLeft,
      right: this.systemRight,
      tabBarHeight: keyboardVisible || this.navigation.tabBarMode === 'custom' ? 0 : this.officialTabBarHeight
    });
    this.publishSheetMetrics();
  }

  private publishSheetMetrics(): void {
    if (this.hostId === 0) return;
    // RESIZE changes the content viewport. Read the window independently; adding
    // keyboard height to that viewport double-counts partial/overlay keyboards.
    const main = this.keyboardWindow;
    const fullHeight: number = main === undefined ? this.viewportHeight :
      this.getUIContext().px2vp(main.getWindowProperties().windowRect.height);
    // A rotation may publish its new window rect before the corresponding area
    // callback. Keep the last coherent sheet observation until that callback.
    if (this.viewportHeight > fullHeight) return;
    valdi.setSheetWindowMetrics(this.hostId, fullHeight, this.viewportHeight, this.keyboardHeight, this.systemBottom);
  }

  private applyStatusStyle(style: string): void {
    if (style === this.statusStyle) {
      return;
    }
    this.statusStyle = style;
    const context = this.getUIContext().getHostContext();
    if (context === undefined) {
      return;
    }
    const dark = context.resourceManager.getConfigurationSync().colorMode === 0;
    const color = style === 'light' || (style === 'auto' && dark) ? '#ffffff' : '#182825';
    window.getLastWindow(context).then((main: window.Window) => {
      if (this.hostId > 0 && this.statusStyle === style) {
        main.setWindowSystemBarProperties({ statusBarContentColor: color }).catch((err: Error) => {
          hilog.error(0xFF00, 'ValdiHarmony', 'Status bar: %{public}s', String(err));
        });
      }
    }).catch((err: Error) => {
      hilog.error(0xFF00, 'ValdiHarmony', 'Window: %{public}s', String(err));
    });
  }

  private layout(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }
    this.viewportHeight = height;
    try {
      if (this.hostId > 0) {
        valdi.resize(this.hostId, width, height);
        this.publishSheetMetrics();
        return;
      }
      const context = this.getUIContext().getHostContext();
      if (context === undefined) {
        throw new Error('Ability context is unavailable');
      }
      // A fresh service owner belongs to this RuntimeHost and this UIAbility.
      // Native retains it through the JS shutdown fence and releases it on UI.
      const services = new HarmonySystemServices(context as common.UIAbilityContext);
      const media = new HarmonyAppUIMediaService(context as common.UIAbilityContext);
      const feedback: AppUIFeedbackHost = {
        media: media,
        showLoading: (request: AppUILoadingRequest): Promise<void> => this.showAppUILoading(request),
        hideLoading: (): Promise<void> => this.hideAppUILoading(),
        showToast: (request: AppUIToastRequest): Promise<void> => this.showAppUIToast(request),
        hideToast: (): Promise<void> => this.hideAppUIToast()
      };
      try {
        this.hostId = valdi.mount(this.content, context.resourceManager,
          width, height, this.getUIContext().vp2px(1), this.getUIContext(), context.filesDir,
          feedback, services, this.foreground);
      } catch (err) {
        media.close();
        services.close();
        throw new Error(String(err));
      }
      valdi.registerSheetSurface(this.hostId, this.sheetNodeContent);
      valdi.registerTabBarSurface(this.hostId, this.tabBarContent);
      valdi.watchNavigation(this.hostId, (state: NavigationState) => this.observe(state));
      this.publishInsets();
      this.observeKeyboard();
    } catch (err) {
      this.fail(String(err));
    }
  }

  private selectTab(route: string): void {
    try {
      if (this.hostId > 0) {
        valdi.switchTab(this.hostId, route);
      }
    } catch (err) {
      this.fail(String(err));
    }
  }

  private icon(tab: TabItem): ResourceStr {
    const selected = tab.route === this.navigation.selectedTab;
    const inline: string | undefined = selected ? (tab.selectedIconData ?? tab.iconData) : tab.iconData;
    if (inline !== undefined && inline.length > 0) {
      return inline.startsWith('data:') ? inline : `data:image/png;base64,${inline}`;
    }
    const name: string = selected ? (tab.selectedIcon ?? tab.icon) : tab.icon;
    return $rawfile(`tab-icons/${name}.png`);
  }

  private tabKey(tab: TabItem): string {
    return [tab.route, tab.text, tab.icon ?? '', tab.selectedIcon ?? '',
      tab.iconData ?? '', tab.selectedIconData ?? '']
      .map((value: string): string => `${value.length}:${value}`).join('|');
  }

  onBackPress(): boolean {
    try {
      return this.hostId > 0 && valdi.back(this.hostId);
    } catch (err) {
      this.fail(String(err));
      return true;
    }
  }

  onPageShow(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    this.foreground = true;
    if (this.hostId > 0) {
      this.statusStyle = '';
      valdi.setActive(this.hostId, true);
      this.applyStatusStyle(this.navigation.statusBarStyle);
      this.applyGestureBackPolicy();
      this.refreshInsets();
    }
  }

  onPageHide(): void {
    this.foreground = false;
    this.updateKeyboardHeight(0);
    this.applyGestureBackPolicy();
    if (this.hostId > 0) {
      valdi.setActive(this.hostId, false);
    }
  }

  aboutToDisappear(): void {
    ++this.appUIEpoch;
    this.clearToast();
    this.loadingVisible = false;
    ++this.keyboardEpoch;
    if (this.keyboardWindow !== undefined) {
      try {
        this.keyboardWindow.off('keyboardHeightChange', this.keyboardChanged);
        this.keyboardWindow.off('avoidAreaChange', this.avoidAreaChanged);
      } catch (err) {
        hilog.error(0xFF00, 'ValdiHarmony', 'Keyboard cleanup: %{public}s', String(err));
      }
      this.keyboardWindow = undefined;
    }
    const handle = this.hostId;
    this.foreground = false;
    if (handle > 0) {
      try {
        const teardown: Promise<void> = valdi.destroy(handle);
        // Native has claimed cleanup ownership; a rejected Promise still means
        // teardown completed. Keep the handle if the synchronous call fails.
        this.hostId = 0;
        teardown.catch((err: Error) => {
          hilog.error(0xFF00, 'ValdiHarmony', 'Teardown failed: %{public}s', String(err));
        });
      } catch (err) {
        hilog.error(0xFF00, 'ValdiHarmony', 'Teardown failed: %{public}s', String(err));
      }
    }
    this.applyGestureBackPolicy();
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Stack() {
        ContentSlot(this.content)
      }
      .width('100%')
      .height('100%')
      .visibility(this.navigation.overlayVisible ? Visibility.Visible : Visibility.Hidden)
      if (this.navigation.tabBarMode === 'default' && this.tabSurfaces.length > 0) {
        // These TabContents own the retained Valdi page roots. During a native
        // push/back only, roots move to the lower transition surface; the real
        // official bar stays above that animation until native settlement.
        // Key the container itself by shell generation, as well as its pages.
        // A late event from a disposed Tabs cannot select a replacement shell.
        ForEach(this.tabSurfaces.slice(0, 1), (anchor: TabSurface) => {
          Tabs({ barPosition: BarPosition.End, index: this.selectedTabIndex() }) {
            ForEach(this.tabSurfaces, (surface: TabSurface) => {
              TabContent() {
                Stack() {
                  ContentSlot(surface.content)
                }
                .width('100%')
                .height('100%')
                .hitTestBehavior(this.navigation.overlayVisible ? HitTestMode.Transparent : HitTestMode.Default)
              }
              .tabBar(BottomTabBarStyle.of(this.icon(surface.tab), surface.tab.text)
                .padding({ bottom: this.keyboardHeight > 0 ? 0 : this.bottomSafeArea }))
            }, (surface: TabSurface): string => `${surface.shellId}:${this.tabKey(surface.tab)}`)
          }
          .width('100%')
          .height('100%')
          .barMode(BarMode.Fixed)
          // The parent already lays out into the full system viewport; avoid the
          // Tabs default bottom expansion adding a second safe-area extension.
          .expandSafeArea([], [])
          .barOverlap(true)
          .barBackgroundBlurStyle(BlurStyle.Thick, { colorMode: ThemeColorMode.SYSTEM })
          // Include the separately published system obstruction in the rendered
          // bar. BottomTabBarStyle's padding leaves exactly 48vp for its controls.
          .barHeight(this.officialBarVisible() ? this.officialTabBarHeight + this.bottomSafeArea : 0)
          .scrollable(false)
          .animationDuration(0)
          .onContentWillChange((_current: number, incoming: number): boolean =>
            this.admitOfficialTab(anchor.shellId, incoming))
          .visibility(this.navigation.tabBarVisible || !this.navigation.overlayVisible ?
            Visibility.Visible : Visibility.Hidden)
          .hitTestBehavior(this.navigation.overlayVisible ? HitTestMode.Transparent : HitTestMode.Default)
          .onTouchIntercept((event: TouchEvent): HitTestMode => this.interceptOfficialTabs(event))
        }, (anchor: TabSurface): string => anchor.shellId)
      }
      Stack() {
        ContentSlot(this.tabBarContent)
      }
      .width('100%')
      .height('100%')
      .position({ x: 0, y: 0 })
      .visibility(this.navigation.tabBarMode === 'custom' && this.officialBarVisible() ?
        Visibility.Visible : Visibility.Hidden)
      .hitTestBehavior(HitTestMode.Transparent)
      Stack() {
        ContentSlot(this.sheetNodeContent)
      }
      .width('100%')
      .height('100%')
      .position({ x: 0, y: 0 })
      .visibility(this.navigation.sheetVisible ? Visibility.Visible : Visibility.Hidden)
      .hitTestBehavior(this.navigation.sheetVisible ? HitTestMode.Default : HitTestMode.None)
      if (this.error.length > 0) {
        Text(this.error).fontSize(16).fontColor('#b82020').padding(24)
          .backgroundColor('#fff2ed')
      }
      if (this.loadingVisible) {
        Column() {
          Column({ space: 12 }) {
            LoadingProgress().width(36).height(36).color('#ffffff')
            if (this.loadingTitle.length > 0) {
              Text(this.loadingTitle).fontSize(16).fontColor('#ffffff')
            }
          }
          .padding(24)
          .borderRadius(12)
          .backgroundColor('#dd182825')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(this.loadingMask ? '#33000000' : '#00000000')
        .hitTestBehavior(this.loadingMask ? HitTestMode.Block : HitTestMode.None)
        .accessibilityText(this.loadingTitle.length > 0 ? this.loadingTitle : 'Loading')
      }
      if (this.toastVisible) {
        Column() {
          Column({ space: 8 }) {
            if (this.toastIcon === 'loading') {
              LoadingProgress().width(30).height(30).color('#ffffff')
            } else if (this.toastIcon === 'success' || this.toastIcon === 'error') {
              Text(this.toastIcon === 'success' ? '✓' : '✕').fontSize(30).fontColor('#ffffff')
            }
            Text(this.toastTitle).fontSize(16).fontColor('#ffffff')
          }
          .padding(20)
          .borderRadius(12)
          .backgroundColor('#ee182825')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .hitTestBehavior(this.toastMask ? HitTestMode.Block : HitTestMode.None)
        .accessibilityText(this.toastTitle)
      }
    }
    .width(LayoutPolicy.matchParent)
    .height(LayoutPolicy.matchParent)
    .onAreaChange((_previous: Area, area: Area) => {
      this.layout(Number(area.width), Number(area.height));
    })
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.ALL])
  }
}
