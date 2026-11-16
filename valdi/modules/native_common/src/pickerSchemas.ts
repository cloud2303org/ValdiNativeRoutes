/**
 * Shared option normalizers and default fillers for `app_ui` and inline wheel components.
 * TypeScript enforces static parameter types; runtime logic fills defaults and normalizes union shapes for native hosts.
 */

export type DatePickMode = 'year' | 'year-month' | 'date' | 'time' | 'datetime';
export type ToastIcon = 'success' | 'error' | 'loading' | 'none';

export interface PickerOptionItem {
  value: string;
  label: string;
}

export function normalizePickerOptions(options: readonly (string | PickerOptionItem)[]): PickerOptionItem[] {
  if (!options?.length) throw new Error('options must not be empty');
  return options.map(item =>
    typeof item === 'string' ? { value: item, label: item } : { value: item.value, label: item.label },
  );
}

export function scanCodeRequest(options?: { onlyFromCamera?: boolean } | null) {
  if (options?.onlyFromCamera === false) {
    throw new Error('onlyFromCamera must be true; album scanning is not supported');
  }
  return { onlyFromCamera: true as const };
}

export function chooseImageRequest(options?: {
  count?: number;
  sourceType?: readonly ('album' | 'camera')[];
} | null) {
  return {
    count: options?.count ?? 9,
    sourceType: options?.sourceType?.length ? [...options.sourceType] : (['album', 'camera'] as ('album' | 'camera')[]),
  };
}

export function chooseFileRequest(options?: {
  count?: number;
  mimeTypes?: readonly string[];
} | null) {
  return {
    count: options?.count ?? 1,
    mimeTypes: options?.mimeTypes?.length ? [...options.mimeTypes] : ['*/*'],
  };
}

export function modalRequest(options?: {
  title?: string | null;
  content?: string | null;
  showCancel?: boolean | null;
  confirmText?: string | null;
  cancelText?: string | null;
  editable?: boolean | null;
  placeholderText?: string | null;
  defaultText?: string | null;
} | null) {
  return {
    title: options?.title ?? '',
    content: options?.content ?? '',
    showCancel: options?.showCancel ?? true,
    confirmText: options?.confirmText ?? '确定',
    cancelText: options?.cancelText ?? '取消',
    editable: options?.editable ?? false,
    placeholderText: options?.placeholderText ?? '',
    defaultText: options?.defaultText ?? '',
  };
}

export function toastRequest(options: {
  title: string;
  icon?: ToastIcon | null;
  duration?: number | null;
  mask?: boolean | null;
}) {
  return {
    title: options?.title ?? '',
    icon: options?.icon ?? ('success' as ToastIcon),
    duration: options?.duration ?? 1500,
    mask: options?.mask ?? false,
  };
}

export function loadingRequest(options: { title: string; mask?: boolean | null }) {
  return {
    title: options?.title ?? '',
    mask: options?.mask ?? false,
  };
}

export function actionSheetRequest(options: { alertText?: string | null; itemList: readonly string[] }) {
  if (!options?.itemList?.length) throw new Error('itemList must not be empty');
  return {
    title: options.alertText ?? '',
    itemList: [...options.itemList],
  };
}

export function pickerRequest(options: {
  title?: string | null;
  confirmText?: string | null;
  cancelText?: string | null;
  options: readonly (string | PickerOptionItem)[];
  value?: string | null;
}) {
  const items = normalizePickerOptions(options?.options);
  return {
    title: options?.title ?? '',
    confirmText: options?.confirmText ?? '确定',
    cancelText: options?.cancelText ?? '取消',
    options: items,
    value: options?.value ?? items[0].value,
  };
}

export function datePickerRequest(options?: {
  title?: string | null;
  mode?: DatePickMode | null;
  value?: string | null;
  confirmText?: string | null;
  cancelText?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
} | null) {
  const currentYear = new Date().getFullYear();
  return {
    title: options?.title ?? '',
    mode: options?.mode ?? ('date' as DatePickMode),
    value: options?.value ?? '',
    confirmText: options?.confirmText ?? '确定',
    cancelText: options?.cancelText ?? '取消',
    minYear: options?.minYear ?? currentYear - 5,
    maxYear: options?.maxYear ?? currentYear + 5,
  };
}

export function imagePreviewRequest(options: { urls: readonly string[]; current?: string | null }) {
  if (!options?.urls?.length) throw new Error('urls must not be empty');
  const urls = [...options.urls];
  return {
    urls,
    current: options.current ?? urls[0],
  };
}
