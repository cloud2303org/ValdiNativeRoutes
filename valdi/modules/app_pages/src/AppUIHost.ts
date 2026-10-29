/**
 * The contract between `api` (api.ts) and the native AppUI of each host. Requests arrive validated and with their
 * defaults filled in; the host only presents them. Every callback is called exactly once; `error` is '' on success.
 */

/**
 * @ExportModel({ios: 'VRModalRequest', android: 'io.valdiroutes.pages.ModalRequest'})
 */
export interface ModalRequest {
  title: string;
  content: string;
  showCancel: boolean;
  confirmText: string;
  cancelText: string;
  editable: boolean;
  placeholderText: string;
  defaultText: string;
}

/**
 * @ExportModel({ios: 'VRModalReply', android: 'io.valdiroutes.pages.ModalReply'})
 */
export interface ModalReply {
  confirm: boolean;
  cancel: boolean;
  /** The edited text for an editable modal, '' otherwise. */
  content: string;
}

/**
 * @ExportModel({ios: 'VRToastRequest', android: 'io.valdiroutes.pages.ToastRequest'})
 */
export interface ToastRequest {
  title: string;
  /** 'success', 'error', 'loading' or 'none'. */
  icon: string;
  /** Milliseconds. */
  duration: number;
  mask: boolean;
}

/**
 * @ExportModel({ios: 'VRLoadingRequest', android: 'io.valdiroutes.pages.LoadingRequest'})
 */
export interface LoadingRequest {
  title: string;
  mask: boolean;
}

/**
 * Shared reply of the action sheet, pickers, bottom sheet and image preview, as in ExpoNativeRoutes' AppUIAdapter.
 * Exactly one of confirm/cancel is true; `value` and `index` are the selection (or the image shown last).
 *
 * @ExportModel({ios: 'VRPresentationReply', android: 'io.valdiroutes.pages.PresentationReply'})
 */
export interface PresentationReply {
  confirm: boolean;
  cancel: boolean;
  value: string;
  index: number;
}

/**
 * @ExportModel({ios: 'VRActionSheetRequest', android: 'io.valdiroutes.pages.ActionSheetRequest'})
 */
export interface ActionSheetRequest {
  /** Text above the menu ('' for none). */
  title: string;
  itemList: string[];
}

/**
 * @ExportModel({ios: 'VRPickerOption', android: 'io.valdiroutes.pages.PickerOption'})
 */
export interface PickerOption {
  value: string;
  label: string;
}

/**
 * @ExportModel({ios: 'VRPickerRequest', android: 'io.valdiroutes.pages.PickerRequest'})
 */
export interface PickerRequest {
  title: string;
  confirmText: string;
  cancelText: string;
  options: PickerOption[];
  /** One of the option values. */
  value: string;
}

/**
 * @ExportModel({ios: 'VRDatePickerRequest', android: 'io.valdiroutes.pages.DatePickerRequest'})
 */
export interface DatePickerRequest {
  title: string;
  /** 'year', 'year-month', 'date', 'time' or 'datetime'. */
  mode: string;
  /** YYYY, YYYY-MM, YYYY-MM-DD, HH:mm or YYYY-MM-DD HH:mm; '' for now. */
  value: string;
  confirmText: string;
  cancelText: string;
  minYear: number;
  maxYear: number;
}

/**
 * @ExportModel({ios: 'VRBottomSheetRequest', android: 'io.valdiroutes.pages.BottomSheetRequest'})
 */
export interface BottomSheetRequest {
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
  dismissible: boolean;
}

/**
 * @ExportModel({ios: 'VRImagePreviewRequest', android: 'io.valdiroutes.pages.ImagePreviewRequest'})
 */
export interface ImagePreviewRequest {
  urls: string[];
  /** One of urls. */
  current: string;
}

/**
 * @ExportModel({ios: 'VRAttachmentAsset', android: 'io.valdiroutes.pages.AttachmentAsset'})
 */
export interface AttachmentAsset {
  id: string;
  /** A file:// copy in the picker's own cache (clearAttachmentCache removes it). */
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * @ExportModel({ios: 'VRAttachmentSelection', android: 'io.valdiroutes.pages.AttachmentSelection'})
 */
export interface AttachmentSelection {
  canceled: boolean;
  assets: AttachmentAsset[];
}

/**
 * @ExportModel({ios: 'VRScanCodeReply', android: 'io.valdiroutes.pages.ScanCodeReply'})
 */
export interface ScanCodeReply {
  result: string;
  /** QR_CODE, EAN_13, EAN_8, CODE_128, CODE_39 or UPC_A. */
  scanType: string;
}

/**
 * Implemented by the host's AppUI. The modal is shown on whatever page is on top when its turn in the queue comes.
 *
 * @ExportModel({ios: 'VRAppUIHost', android: 'io.valdiroutes.pages.AppUIHost'})
 */
export interface AppUIHost {
  /** Resolves after the dialog has finished closing. */
  showModal: (request: ModalRequest, done: (error: string, reply: ModalReply) => void) => void;
  /** The rest share showModal's queue and page ownership; each resolves after its presentation has closed. */
  showActionSheet: (request: ActionSheetRequest, done: (error: string, reply: PresentationReply) => void) => void;
  showPicker: (request: PickerRequest, done: (error: string, reply: PresentationReply) => void) => void;
  showDatePicker: (request: DatePickerRequest, done: (error: string, reply: PresentationReply) => void) => void;
  showBottomSheet: (request: BottomSheetRequest, done: (error: string, reply: PresentationReply) => void) => void;
  previewImage: (request: ImagePreviewRequest, done: (error: string, reply: PresentationReply) => void) => void;
  /** Native camera scanner over the whole app, not a route; closing it is error 'cancel'. */
  scanCode: (done: (error: string, reply: ScanCodeReply) => void) => void;
  /** source: 'photos', 'camera' or 'files'. Cancelling answers canceled: true. */
  pickAttachments: (
    source: string,
    limit: number,
    mimeTypes: string[],
    done: (error: string, selection: AttachmentSelection) => void,
  ) => void;
  /** Deletes only the picker's own cached copies. */
  clearAttachmentCache: (done: (error: string) => void) => void;
  showToast: (request: ToastRequest, done: (error: string) => void) => void;
  hideToast: (done: (error: string) => void) => void;
  showLoading: (request: LoadingRequest, done: (error: string) => void) => void;
  hideLoading: (done: (error: string) => void) => void;
}

// On globalThis rather than in this module: Valdi may unload a module once no page uses it, and a reloaded module
// would come back without the host.
const HOST_KEY = '__valdiRoutesAppUIHost';

/**
 * Called by the host whenever it starts its UI (with the route table), like getRoutesJson.
 *
 * @ExportFunction({ios: 'VRInstallAppUI', android: 'io.valdiroutes.pages.InstallAppUI'})
 */
export function installAppUI(host: AppUIHost): void {
  (globalThis as any)[HOST_KEY] = host;
}

export function appUIHost(): AppUIHost {
  const host: AppUIHost | undefined = (globalThis as any)[HOST_KEY];
  if (!host) {
    throw new Error('native AppUI is not installed');
  }
  return host;
}
