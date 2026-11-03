import { NodeContent, UIContext } from '@kit.ArkUI';
import { resourceManager } from '@kit.LocalizationKit';

/** Typed, per-window feedback. Methods must return an actual Promise. */
export interface AppUILoadingRequest { title: string; mask: boolean; }
export interface AppUIToastRequest { title: string; icon: string; duration: number; mask: boolean; }
export interface AppUIMediaAsset { id: string; uri: string; name: string; mimeType: string; size: number; }
export interface AppUIMediaHost {
  scanCode(): Promise<{ result: string; scanType: string }>;
  pickAttachments(source: string, limit: number, mimeTypes: string[]): Promise<{ canceled: boolean; assets: AppUIMediaAsset[] }>;
  clearAttachmentCache(): Promise<void>;
  /** Committed route identity is admission-only; pending media belongs to this window/runtime. */
  setOwner(page: string, active: boolean): void;
  close(): void;
}
export interface AppUIFeedbackHost {
  media?: AppUIMediaHost;
  showLoading(request: AppUILoadingRequest): Promise<void>;
  hideLoading(): Promise<void>;
  showToast(request: AppUIToastRequest): Promise<void>;
  hideToast(): Promise<void>;
}

/** Business mounts require a fresh services owner constructed with their UIAbilityContext.
 * initialActive defaults to true; pass the page's actual foreground state before startup.
 * systemServices is the owning PlatformServices ArkTS object, validated by native code.
 * Native .d.ts declarations cannot import an .ets implementation. */
export const mount: (content: NodeContent, resources: resourceManager.ResourceManager,
  width: number, height: number, scale: number, uiContext: UIContext, filesDir: string,
  appUIFeedback?: AppUIFeedbackHost, systemServices?: Object,
  initialActive?: boolean) => number;
export const resize: (handle: number, width: number, height: number) => void;
/** Logical vp; resize uses the full content viewport. tabBarHeight excludes system bottom. */
export interface NavigationInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
  tabBarHeight: number;
}
export const setInsets: (handle: number, insets: NavigationInsets) => void;
export const setActive: (handle: number, active: boolean) => void;
/** Host window keyboard overlap in logical points; business observes ApplicationBridge. */
export const keyboardHeightChanged: (handle: number, height: number) => void;
export const destroy: (handle: number) => Promise<void>;
export interface NavigationTab {
  route: string;
  text: string;
  icon: string;
  selectedIcon: string;
  iconData?: string;
  selectedIconData?: string;
}
export interface NavigationState {
  tabs: NavigationTab[];
  selectedTab: string;
  /** Native shell generation; stale surface registrations cannot address a new shell. */
  tabShellId: string;
  tabBarMode: 'default' | 'custom';
  /** The native push/back surface contains the displayed page or a transition. */
  overlayVisible: boolean;
  /** Separate same-window native sheet; base pages remain visible beneath it. */
  sheetVisible: boolean;
  tabBarVisible: boolean;
  canGoBack: boolean;
  transitioning: boolean;
  interactiveBackEnabled: boolean;
  interactive: boolean;
  progress: number;
  statusBarStyle: string;
  error?: string;
}
/** Object snapshots on the owning ArkTS UI thread. Replaces the prior observer. */
export const watchNavigation: (handle: number, observer: (snapshot: NavigationState) => void) => void;
/** Returns false at the root so the system can apply its normal back behavior. */
export const back: (handle: number) => boolean;
export const switchTab: (handle: number, route: string) => void;
/** Actual page roots mount in these real ArkUI TabContents outside transitions. */
export const registerTabSurface: (handle: number, shellId: string, route: string, content: NodeContent) => void;
/** Full viewport, shell-owned business Valdi component; no height measurement. */
export const registerTabBarSurface: (handle: number, content: NodeContent) => void;
/** Dedicated retained slot above page/tab surfaces and below loading/toast. */
export const registerSheetSurface: (handle: number, content: NodeContent) => void;
/** One coherent observation in vp; systemBottom excludes tab height. */
export const setSheetWindowMetrics: (handle: number, fullWindowHeight: number,
  availableViewportHeight: number, keyboardOverlap: number, systemBottom: number) => void;
