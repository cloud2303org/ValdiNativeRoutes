import { getHost } from './AppUI';
/**
 * The contract between `api` (api.ts) and the native AppUI of each host. Requests arrive validated and with their
 * defaults filled in; the host only presents them. Native Promises settle once without retaining a callback from the
 * calling page, so page teardown cannot strand the app-wide presentation queue.
 */

/**
 * @ExportModel({ios: 'VRModalRequest', android: 'io.valdiroutes.app_ui.ModalRequest'})
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
 * @ExportModel({ios: 'VRModalReply', android: 'io.valdiroutes.app_ui.ModalReply'})
 */
export interface ModalReply {
  confirm: boolean;
  cancel: boolean;
  /** The edited text for an editable modal, '' otherwise. */
  content: string;
}

/**
 * @ExportModel({ios: 'VRToastRequest', android: 'io.valdiroutes.app_ui.ToastRequest'})
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
 * @ExportModel({ios: 'VRLoadingRequest', android: 'io.valdiroutes.app_ui.LoadingRequest'})
 */
export interface LoadingRequest {
  title: string;
  mask: boolean;
}

/**
 * Shared reply of the action sheet, pickers, bottom sheet and image preview, as in ExpoNativeRoutes' AppUIAdapter.
 * Exactly one of confirm/cancel is true; `value` and `index` are the selection (or the image shown last).
 *
 * @ExportModel({ios: 'VRPresentationReply', android: 'io.valdiroutes.app_ui.PresentationReply'})
 */
export interface PresentationReply {
  confirm: boolean;
  cancel: boolean;
  value: string;
  index: number;
}

/**
 * @ExportModel({ios: 'VRActionSheetRequest', android: 'io.valdiroutes.app_ui.ActionSheetRequest'})
 */
export interface ActionSheetRequest {
  /** Text above the menu ('' for none). */
  title: string;
  itemList: string[];
}

/**
 * @ExportModel({ios: 'VRPickerOption', android: 'io.valdiroutes.app_ui.PickerOption'})
 */
export interface PickerOption {
  value: string;
  label: string;
}

/**
 * @ExportModel({ios: 'VRPickerRequest', android: 'io.valdiroutes.app_ui.PickerRequest'})
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
 * @ExportModel({ios: 'VRDatePickerRequest', android: 'io.valdiroutes.app_ui.DatePickerRequest'})
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
 * @ExportModel({ios: 'VRBottomSheetRequest', android: 'io.valdiroutes.app_ui.BottomSheetRequest'})
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
 * @ExportModel({ios: 'VRImagePreviewRequest', android: 'io.valdiroutes.app_ui.ImagePreviewRequest'})
 */
export interface ImagePreviewRequest {
  urls: string[];
  /** One of urls. */
  current: string;
}

/**
 * @ExportModel({ios: 'VRAttachmentAsset', android: 'io.valdiroutes.app_ui.AttachmentAsset'})
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
 * @ExportModel({ios: 'VRAttachmentSelection', android: 'io.valdiroutes.app_ui.AttachmentSelection'})
 */
export interface AttachmentSelection {
  canceled: boolean;
  assets: AttachmentAsset[];
}

/**
 * @ExportModel({ios: 'VRScanCodeReply', android: 'io.valdiroutes.app_ui.ScanCodeReply'})
 */
export interface ScanCodeReply {
  result: string;
  /** QR_CODE, EAN_13, EAN_8, CODE_128, CODE_39 or UPC_A. */
  scanType: string;
}

/**
 * Implemented by the host's AppUI. The modal is shown on whatever page is on top when its turn in the queue comes.
 *
 * @ExportProxy({ios: 'VRAppUIHost', android: 'io.valdiroutes.app_ui.AppUIHost'})
 */
export interface AppUIHost {
  /** Resolves after the dialog has finished closing. */
  showModal: (request: ModalRequest) => Promise<ModalReply>;
  /** The rest share showModal's queue and page ownership; each resolves after its presentation has closed. */
  showActionSheet: (request: ActionSheetRequest) => Promise<PresentationReply>;
  showPicker: (request: PickerRequest) => Promise<PresentationReply>;
  showDatePicker: (request: DatePickerRequest) => Promise<PresentationReply>;
  showBottomSheet: (request: BottomSheetRequest) => Promise<PresentationReply>;
  previewImage: (request: ImagePreviewRequest) => Promise<PresentationReply>;
  /** Native camera scanner over the whole app, not a route; closing it rejects with 'cancel'. */
  scanCode: () => Promise<ScanCodeReply>;
  /** source: 'photos', 'camera' or 'files'. Cancelling answers canceled: true. */
  pickAttachments: (source: string, limit: number, mimeTypes: string[]) => Promise<AttachmentSelection>;
  /** Deletes only the picker's own cached copies. */
  clearAttachmentCache: () => Promise<void>;
  showToast: (request: ToastRequest) => Promise<void>;
  hideToast: () => Promise<void>;
  showLoading: (request: LoadingRequest) => Promise<void>;
  hideLoading: () => Promise<void>;
}

export function appUIHost(): AppUIHost {
  return getHost();
}
