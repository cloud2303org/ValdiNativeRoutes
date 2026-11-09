import * as v from 'valibot';
import {
  appUIHost,
  AttachmentSource,
  BottomSheetRequest,
  DatePickerMode,
  ModalReply,
  ModalRequest,
  PickerOption,
  PresentationReply,
  ScanCodeReply,
  ToastRequestIcon,
} from './AppUIHost';
import * as schema from 'native_common/src/pickerSchemas';

export interface ApiSuccess {
  errMsg: string;
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

const toastIcons: Record<ToastIcon, ToastRequestIcon> = {
  success: ToastRequestIcon.Success,
  error: ToastRequestIcon.Error,
  loading: ToastRequestIcon.Loading,
  none: ToastRequestIcon.None,
};

const datePickerModes: Record<DatePickMode, DatePickerMode> = {
  year: DatePickerMode.Year,
  'year-month': DatePickerMode.YearMonth,
  date: DatePickerMode.Date,
  time: DatePickerMode.Time,
  datetime: DatePickerMode.DateTime,
};

export function appUIApi(
  fail: (method: string, cause: unknown) => Error = (method, cause) =>
    new Error(`${method}:fail ${cause instanceof Error ? cause.message : String(cause)}`),
) {
  async function invoke<T extends object>(method: string, run: () => Promise<T>): Promise<T & ApiSuccess> {
    try {
      return { ...(await run()), errMsg: `${method}:ok` };
    } catch (cause) {
      throw fail(method, cause);
    }
  }

  async function pick(source: AttachmentSource, limit: number, mimeTypes: string[]) {
    const reply = await appUIHost().pickAttachments(source, limit, mimeTypes);
    if (reply.canceled || !reply.assets.length) throw new Error('cancel');
    return reply.assets;
  }

  const uiApi = {
    /** Resolves once the dialog has closed: `confirm` or `cancel` (also when its page goes away). */
    showModal(options: ShowModalOptions = {}): Promise<ModalResult> {
      return invoke('showModal', async () => {
        const request = v.parse(schema.modalRequest, options);
        const { confirm, cancel, content } = await appUIHost().showModal(request);
        return { confirm, cancel, content };
      });
    },

    /** Camera only: onlyFromCamera may be omitted or true. Closing the scanner fails with 'scanCode:fail cancel'. */
    scanCode(options: ScanCodeOptions = {}): Promise<ScanCodeResult> {
      return invoke('scanCode', async () => {
        v.parse(schema.scanCodeRequest, options);
        const { result, scanType } = await appUIHost().scanCode();
        return { result, scanType };
      });
    },

    /** With both sources an action sheet asks first; the camera returns one photo. */
    chooseImage(options: ChooseImageOptions = {}): Promise<ChooseImageResult> {
      return invoke('chooseImage', async () => {
        const { count, sourceType } = v.parse(schema.chooseImageRequest, options);
        let source = sourceType[0];
        if (sourceType.length > 1) {
          const reply = await appUIHost().showActionSheet({
            title: '',
            itemList: sourceType.map(value => (value === 'album' ? '从相册选择' : '拍照')),
          });
          if (reply.cancel) throw new Error('cancel');
          source = sourceType[reply.index];
        }
        const assets = await pick(
          source === 'album' ? AttachmentSource.Photos : AttachmentSource.Camera,
          source === 'camera' ? 1 : count,
          ['image/*'],
        );
        return {
          tempFilePaths: assets.map(asset => asset.uri),
          tempFiles: assets.map(asset => ({ path: asset.uri, size: asset.size })),
        };
      });
    },

    chooseFile(options: ChooseFileOptions = {}): Promise<ChooseFileResult> {
      return invoke('chooseFile', async () => {
        const { count, mimeTypes } = v.parse(schema.chooseFileRequest, options);
        const assets = await pick(AttachmentSource.Files, count, mimeTypes);
        return {
          tempFilePaths: assets.map(asset => asset.uri),
          tempFiles: assets.map(asset => ({
            path: asset.uri,
            size: asset.size,
            name: asset.name,
            type: asset.mimeType,
          })),
        };
      });
    },

    /** Clears only picker-owned copies; call when no page still uses their paths. */
    clearAttachmentCache(): Promise<ApiSuccess> {
      return invoke('clearAttachmentCache', async () => {
        await appUIHost().clearAttachmentCache();
        return {};
      });
    },

    /** Resolves with the chosen tapIndex; cancelling rejects with 'showActionSheet:fail cancel'. */
    showActionSheet(options: ShowActionSheetOptions): Promise<ActionSheetResult> {
      return invoke('showActionSheet', async () => {
        const request = v.parse(schema.actionSheetRequest, options);
        const reply = await appUIHost().showActionSheet(request);
        if (reply.cancel) throw new Error('cancel');
        return { tapIndex: reply.index };
      });
    },

    /** Cancelling resolves normally with cancel: true, value '' and index -1. */
    showPicker(options: ShowPickerOptions): Promise<PickerResult> {
      return invoke('showPicker', async () => {
        const request = v.parse(schema.pickerRequest, options);
        const { confirm, cancel, value, index } = await appUIHost().showPicker(request);
        // A cancel carries no selection, whatever was highlighted or passed in.
        return cancel ? { confirm: false, cancel: true, value: '', index: -1 } : { confirm, cancel, value, index };
      });
    },

    showDatePicker(options: ShowDatePickerOptions = {}): Promise<DatePickerResult> {
      return invoke('showDatePicker', async () => {
        const request = v.parse(schema.datePickerRequest, options);
        const { confirm, cancel, value } = await appUIHost().showDatePicker({
          ...request,
          mode: datePickerModes[request.mode],
        });
        return { confirm, cancel, value: cancel ? '' : value };
      });
    },

    showBottomSheet(options: ShowBottomSheetOptions = {}): Promise<BottomSheetResult> {
      return invoke('showBottomSheet', async () => {
        const request = v.parse(schema.bottomSheetRequest, options);
        const { confirm, cancel } = await appUIHost().showBottomSheet(request);
        return { confirm, cancel };
      });
    },

    /** Completes when the preview is closed or its page goes away. */
    previewImage(options: PreviewImageOptions): Promise<ApiSuccess> {
      return invoke('previewImage', async () => {
        const request = v.parse(schema.imagePreviewRequest, options);
        await appUIHost().previewImage(request);
        return {};
      });
    },

    /** Resolves once the toast is on screen; it hides itself after `duration` ms. */
    showToast(options: ShowToastOptions): Promise<ApiSuccess> {
      return invoke('showToast', async () => {
        const request = v.parse(schema.toastRequest, options);
        await appUIHost().showToast({ ...request, icon: toastIcons[request.icon] });
        return {};
      });
    },

    hideToast(): Promise<ApiSuccess> {
      return invoke('hideToast', async () => {
        await appUIHost().hideToast();
        return {};
      });
    },

    /** Stays until hideLoading; a toast shows above it. */
    showLoading(options: ShowLoadingOptions): Promise<ApiSuccess> {
      return invoke('showLoading', async () => {
        const request = v.parse(schema.loadingRequest, options);
        await appUIHost().showLoading(request);
        return {};
      });
    },

    hideLoading(): Promise<ApiSuccess> {
      return invoke('hideLoading', async () => {
        await appUIHost().hideLoading();
        return {};
      });
    },
  };

  return uiApi;
}
