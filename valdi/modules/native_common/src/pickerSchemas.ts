import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import * as v from 'valibot';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

/**
 * The arguments of `api`, as ExpoNativeRoutes' schemas.ts: every rule is checked here, once, with its default filled in.
 * Nothing after this checks again: not api.ts, not the host's AppUI, and not the replies the host sends back. A failed
 * check throws a ValiError whose message (the first issue's) becomes `<method>:fail <message>`.
 */

export const text = (fallback = '') => v.nullish(v.string(), fallback);
export const flag = (fallback: boolean) => v.nullish(v.boolean(), fallback);
export const nonblank = (message: string) => v.pipe(v.string(message), v.regex(/\S/, message));
export const buttons = { confirmText: text('确定'), cancelText: text('取消') };

// Camera-only for now: never silently ignore a request to choose an album image.
export const scanCodeRequest = v.object({
  onlyFromCamera: v.optional(v.literal(true, 'onlyFromCamera must be true; album scanning is not supported'), true),
});

const count = (maximum: number, fallback: number) =>
  v.optional(
    v.pipe(
      v.number(`count must be an integer from 1 to ${maximum}`),
      v.integer(`count must be an integer from 1 to ${maximum}`),
      v.minValue(1, `count must be an integer from 1 to ${maximum}`),
      v.maxValue(maximum, `count must be an integer from 1 to ${maximum}`),
    ),
    fallback,
  );
const sourceMessage = 'sourceType must be unique album/camera values';
export const chooseImageRequest = v.object({
  count: count(9, 9),
  sourceType: v.optional(
    v.pipe(
      v.array(v.picklist(['album', 'camera'], sourceMessage), sourceMessage),
      v.minLength(1, sourceMessage),
      v.check(items => new Set(items).size === items.length, sourceMessage),
    ),
    ['album', 'camera'],
  ),
  sizeType: v.optional(v.never('sizeType is not supported')),
});
const mimeMessage = 'mimeTypes must contain nonempty strings';
export const chooseFileRequest = v.object({
  count: count(20, 1),
  mimeTypes: v.optional(v.pipe(v.array(nonblank(mimeMessage), mimeMessage), v.minLength(1, mimeMessage)), ['*/*']),
});

export const modalRequest = v.object({
  title: text(),
  content: text(),
  showCancel: flag(true),
  ...buttons,
  editable: flag(false),
  placeholderText: text(),
  defaultText: text(),
});

const titleMessage = 'title must not be empty';
export const toastRequest = v.object({
  title: nonblank(titleMessage),
  icon: v.nullish(v.picklist(['success', 'error', 'loading', 'none'], 'unsupported icon'), 'success'),
  duration: v.nullish(
    v.pipe(v.number('invalid duration'), v.finite('invalid duration'), v.minValue(0, 'invalid duration')),
    1500,
  ),
  mask: flag(false),
});
export const loadingRequest = v.object({ title: nonblank(titleMessage), mask: flag(false) });

const menuMessage = 'itemList must contain 1 to 6 nonempty strings';
export const actionSheetRequest = v.pipe(
  v.object({
    alertText: text(),
    itemList: v.pipe(
      v.array(nonblank(menuMessage), menuMessage),
      v.minLength(1, menuMessage),
      v.maxLength(6, menuMessage),
    ),
  }),
  v.transform(({ alertText, itemList }) => ({ title: alertText, itemList })),
);

export const optionText = v.pipe(
  v.string('picker values and labels must not be empty'),
  v.minLength(1, 'picker values and labels must not be empty'),
);
export const pickerOption = v.object({ value: optionText, label: optionText });
const pickerItem = v.union(
  [
    v.pipe(
      optionText,
      v.transform(value => ({ value, label: value })),
    ),
    pickerOption,
  ],
  'picker values and labels must not be empty',
);
export const pickerOptions = v.pipe(
  v.array(pickerItem, 'options must not be empty'),
  v.minLength(1, 'options must not be empty'),
  v.check(items => new Set(items.map(item => item.value)).size === items.length, 'picker values must be unique'),
);
export const pickerRequest = v.pipe(
  v.object({ title: text(), ...buttons, options: pickerOptions, value: v.nullish(v.string()) }),
  v.transform(({ options, value, ...rest }) => ({ ...rest, options, value: value ?? options[0].value })),
  v.check(
    ({ options, value }) => options.some(item => item.value === value),
    'value must be one of the picker options',
  ),
);

export const datePickMode = v.picklist(['year', 'year-month', 'date', 'time', 'datetime'], 'unsupported picker mode');
export type DatePickMode = v.InferOutput<typeof datePickMode>;
const dateFormats: Record<DatePickMode, string> = {
  year: 'YYYY',
  'year-month': 'YYYY-MM',
  date: 'YYYY-MM-DD',
  time: 'HH:mm',
  datetime: 'YYYY-MM-DD HH:mm',
};
/** Calendar fields only, never read as an instant in the device's time zone. */
function validDate(mode: DatePickMode, value: string): boolean {
  const parsed = dayjs.utc(value, dateFormats[mode], true);
  return parsed.isValid() && (mode === 'time' || parsed.year() >= 1000);
}
export const yearMessage = 'invalid picker year range';
export const year = v.pipe(
  v.number(yearMessage),
  v.integer(yearMessage),
  v.minValue(1000, yearMessage),
  v.maxValue(9999, yearMessage),
);
export const datePickerRequest = v.pipe(
  v.object({
    title: text(),
    mode: v.nullish(datePickMode, 'date'),
    value: text(),
    ...buttons,
    minYear: v.nullish(year, () => dayjs().year() - 5),
    maxYear: v.nullish(year, () => dayjs().year() + 5),
  }),
  v.check(({ minYear, maxYear }) => minYear <= maxYear, yearMessage),
  v.check(({ mode, value }) => !value || validDate(mode, value), 'invalid picker date or time'),
);

export const bottomSheetRequest = v.object({
  title: text(),
  content: text(),
  ...buttons,
  showCancel: flag(true),
  dismissible: flag(true),
});

const imageMessage = 'urls must contain nonempty image addresses';
export const imagePreviewRequest = v.pipe(
  v.object({
    urls: v.pipe(v.array(nonblank(imageMessage), imageMessage), v.minLength(1, imageMessage)),
    current: v.nullish(v.string('current must be one of urls')),
  }),
  v.transform(({ urls, current }) => ({ urls, current: current ?? urls[0] })),
  v.check(({ urls, current }) => urls.includes(current), 'current must be one of urls'),
);
