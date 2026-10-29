import * as v from 'valibot';
import {
  AttachmentSelection,
  appUIHost,
  BottomSheetRequest,
  ModalReply,
  ModalRequest,
  PickerOption,
  PresentationReply,
  ScanCodeReply,
} from './AppUIHost';
import { bluetoothApi } from './ble/extension';
import { createNFCExtension } from './nfc/extension';
import * as schema from './schemas';
import { storageApi } from './storage';
import { createWifiExtension } from './wifi/extension';

/**
 * Mini-program style UI API: every method returns a Promise whose result carries `errMsg` ('showModal:ok'); a failure
 * rejects with an ApiError ('showModal:fail …'); the storage methods (storage.ts) are synchronous and throw it. There are
 * no success/fail/complete callbacks. The arguments are
 * checked and defaulted once, by the valibot schemas in schemas.ts; the host's AppUI and its replies are trusted.
 *
 * ```ts
 * const answer = await api.showModal({ title: '重命名设备', editable: true, defaultText: '采样设备' });
 * if (answer.confirm) console.log(answer.content);
 * ```
 */

export interface ApiSuccess {
  errMsg: string;
}

export class ApiError extends Error {
  readonly errMsg: string;

  constructor(method: string, cause: unknown) {
    super(`${method}:fail ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ApiError';
    this.errMsg = this.message;
  }
}

export type ModalResult = ModalReply & ApiSuccess;
export type ShowModalOptions = Partial<ModalRequest>;
export type ToastIcon = 'success' | 'error' | 'loading' | 'none';
export type ShowToastOptions = { title: string; icon?: ToastIcon; duration?: number; mask?: boolean };
export type ShowLoadingOptions = { title: string; mask?: boolean };

export type ActionSheetResult = { tapIndex: number } & ApiSuccess;
export type ShowActionSheetOptions = {
  itemList: readonly string[];
  /** Optional text above the menu, matching the mini-program alertText option. */
  alertText?: string;
};
export type PickerResult = PresentationReply & ApiSuccess;
export type ShowPickerOptions = {
  title?: string;
  options: readonly (string | PickerOption)[];
  value?: string;
  confirmText?: string;
  cancelText?: string;
};
export type DatePickMode = schema.DatePickMode;
export type DatePickerResult = Pick<PresentationReply, 'confirm' | 'cancel' | 'value'> & ApiSuccess;
export type ShowDatePickerOptions = {
  title?: string;
  mode?: DatePickMode;
  value?: string;
  minYear?: number;
  maxYear?: number;
  confirmText?: string;
  cancelText?: string;
};
export type BottomSheetResult = Pick<PresentationReply, 'confirm' | 'cancel'> & ApiSuccess;
/** Text presentation; custom content belongs in a page or sheet route. */
export type ShowBottomSheetOptions = Partial<BottomSheetRequest>;
export type PreviewImageOptions = { urls: readonly string[]; current?: string };

export type ScanCodeResult = ScanCodeReply & ApiSuccess;
export type ScanCodeOptions = { onlyFromCamera?: true };
export type ChooseImageResult = { tempFilePaths: string[]; tempFiles: { path: string; size: number }[] } & ApiSuccess;
export type ChooseImageOptions = { count?: number; sourceType?: readonly ('album' | 'camera')[] };
export type ChooseFileResult = {
  tempFilePaths: string[];
  tempFiles: { path: string; size: number; name: string; type: string }[];
} & ApiSuccess;
export type ChooseFileOptions = { count?: number; mimeTypes?: readonly string[] };

async function invoke<T extends object>(method: string, run: () => Promise<T>): Promise<T & ApiSuccess> {
  try {
    return { ...(await run()), errMsg: `${method}:ok` };
  } catch (cause) {
    throw new ApiError(method, cause);
  }
}

/** Wraps one host call: `done(error)` with '' for success. */
function call<T>(start: (done: (error: string, value?: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    start((error, value) => (error ? reject(new Error(error)) : resolve(value as T)));
  });
}

async function pick(source: 'photos' | 'camera' | 'files', limit: number, mimeTypes: string[]) {
  const reply = await call<AttachmentSelection>(done => appUIHost().pickAttachments(source, limit, mimeTypes, done));
  if (reply.canceled || !reply.assets.length) throw new Error('cancel');
  return reply.assets;
}

const uiApi = {
  /** Resolves once the dialog has closed: `confirm` or `cancel` (also when its page goes away). */
  showModal(options: ShowModalOptions = {}): Promise<ModalResult> {
    return invoke('showModal', async () => {
      const request = v.parse(schema.modalRequest, options);
      const { confirm, cancel, content } = await call<ModalReply>(done => appUIHost().showModal(request, done));
      return { confirm, cancel, content };
    });
  },

  /** Camera only: onlyFromCamera may be omitted or true. Closing the scanner fails with 'scanCode:fail cancel'. */
  scanCode(options: ScanCodeOptions = {}): Promise<ScanCodeResult> {
    return invoke('scanCode', async () => {
      v.parse(schema.scanCodeRequest, options);
      const { result, scanType } = await call<ScanCodeReply>(done => appUIHost().scanCode(done));
      return { result, scanType };
    });
  },

  /** With both sources an action sheet asks first; the camera returns one photo. */
  chooseImage(options: ChooseImageOptions = {}): Promise<ChooseImageResult> {
    return invoke('chooseImage', async () => {
      const { count, sourceType } = v.parse(schema.chooseImageRequest, options);
      let source = sourceType[0];
      if (sourceType.length > 1) {
        const reply = await call<PresentationReply>(done =>
          appUIHost().showActionSheet(
            { title: '', itemList: sourceType.map(value => (value === 'album' ? '从相册选择' : '拍照')) },
            done,
          ),
        );
        if (reply.cancel) throw new Error('cancel');
        source = sourceType[reply.index];
      }
      const assets = await pick(source === 'album' ? 'photos' : 'camera', source === 'camera' ? 1 : count, ['image/*']);
      return {
        tempFilePaths: assets.map(asset => asset.uri),
        tempFiles: assets.map(asset => ({ path: asset.uri, size: asset.size })),
      };
    });
  },

  chooseFile(options: ChooseFileOptions = {}): Promise<ChooseFileResult> {
    return invoke('chooseFile', async () => {
      const { count, mimeTypes } = v.parse(schema.chooseFileRequest, options);
      const assets = await pick('files', count, mimeTypes);
      return {
        tempFilePaths: assets.map(asset => asset.uri),
        tempFiles: assets.map(asset => ({ path: asset.uri, size: asset.size, name: asset.name, type: asset.mimeType })),
      };
    });
  },

  /** Clears only picker-owned copies; call when no page still uses their paths. */
  clearAttachmentCache(): Promise<ApiSuccess> {
    return invoke('clearAttachmentCache', async () => {
      await call<void>(done => appUIHost().clearAttachmentCache(done));
      return {};
    });
  },

  /** Resolves with the chosen tapIndex; cancelling rejects with 'showActionSheet:fail cancel'. */
  showActionSheet(options: ShowActionSheetOptions): Promise<ActionSheetResult> {
    return invoke('showActionSheet', async () => {
      const request = v.parse(schema.actionSheetRequest, options);
      const reply = await call<PresentationReply>(done => appUIHost().showActionSheet(request, done));
      if (reply.cancel) throw new Error('cancel');
      return { tapIndex: reply.index };
    });
  },

  /** Cancelling resolves normally with cancel: true, value '' and index -1. */
  showPicker(options: ShowPickerOptions): Promise<PickerResult> {
    return invoke('showPicker', async () => {
      const request = v.parse(schema.pickerRequest, options);
      const { confirm, cancel, value, index } = await call<PresentationReply>(done =>
        appUIHost().showPicker(request, done),
      );
      // A cancel carries no selection, whatever was highlighted or passed in.
      return cancel ? { confirm: false, cancel: true, value: '', index: -1 } : { confirm, cancel, value, index };
    });
  },

  showDatePicker(options: ShowDatePickerOptions = {}): Promise<DatePickerResult> {
    return invoke('showDatePicker', async () => {
      const request = v.parse(schema.datePickerRequest, options);
      const { confirm, cancel, value } = await call<PresentationReply>(done =>
        appUIHost().showDatePicker(request, done),
      );
      return { confirm, cancel, value: cancel ? '' : value };
    });
  },

  showBottomSheet(options: ShowBottomSheetOptions = {}): Promise<BottomSheetResult> {
    return invoke('showBottomSheet', async () => {
      const request = v.parse(schema.bottomSheetRequest, options);
      const { confirm, cancel } = await call<PresentationReply>(done => appUIHost().showBottomSheet(request, done));
      return { confirm, cancel };
    });
  },

  /** Completes when the preview is closed or its page goes away. */
  previewImage(options: PreviewImageOptions): Promise<ApiSuccess> {
    return invoke('previewImage', async () => {
      const request = v.parse(schema.imagePreviewRequest, options);
      await call<PresentationReply>(done => appUIHost().previewImage(request, done));
      return {};
    });
  },

  /** Resolves once the toast is on screen; it hides itself after `duration` ms. */
  showToast(options: ShowToastOptions): Promise<ApiSuccess> {
    return invoke('showToast', async () => {
      const request = v.parse(schema.toastRequest, options);
      await call<void>(done => appUIHost().showToast(request, done));
      return {};
    });
  },

  hideToast(): Promise<ApiSuccess> {
    return invoke('hideToast', async () => {
      await call<void>(done => appUIHost().hideToast(done));
      return {};
    });
  },

  /** Stays until hideLoading; a toast shows above it. */
  showLoading(options: ShowLoadingOptions): Promise<ApiSuccess> {
    return invoke('showLoading', async () => {
      const request = v.parse(schema.loadingRequest, options);
      await call<void>(done => appUIHost().showLoading(request, done));
      return {};
    });
  },

  hideLoading(): Promise<ApiSuccess> {
    return invoke('hideLoading', async () => {
      await call<void>(done => appUIHost().hideLoading(done));
      return {};
    });
  },
};

const wifiApi = createWifiExtension();
const nfcApi = { getNFCAdapter: createNFCExtension().getNFCAdapter };

/**
 * UI, storage (storage.ts), Bluetooth (ble/), Wi-Fi (wifi/) and NFC (nfc/), one object for every page. It lives as
 * long as the app: nothing here is released with a page, business code stops or closes what it started.
 */
export const api = {
  ...uiApi,
  ...storageApi((method, cause) => new ApiError(method, cause)),
  ...bluetoothApi(),
  ...wifiApi,
  ...nfcApi,
};
