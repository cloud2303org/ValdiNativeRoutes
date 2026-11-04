import dayjs from 'dayjs';
import * as v from 'valibot';
import type { WheelTreeNode } from './WheelHost';
import {
  text,
  optionText,
  pickerOptions,
  datePickMode,
  type DatePickMode,
  year,
  yearMessage,
} from 'native_common/src/pickerSchemas';
export * from 'native_common/src/pickerSchemas';

// The wheel components (WheelPickers.tsx) take the same options and years as the presented pickers. A value they can't
// show is not an error there: it becomes the first option, the first path, or the current date and time.

export const columnWheel = v.pipe(
  v.object({ options: pickerOptions, value: v.nullish(v.string()) }),
  v.transform(({ options, value }) => ({
    options,
    value: options.some(item => item.value === value) ? (value as string) : options[0].value,
  })),
);

export type TreeNode = WheelTreeNode;
const treeNode: v.GenericSchema<TreeNode> = v.object({
  value: optionText,
  label: optionText,
  children: v.optional(v.array(v.lazy(() => treeNode))),
});
export const treeWheel = v.pipe(
  v.object({
    data: v.pipe(v.array(treeNode, 'data must not be empty'), v.minLength(1, 'data must not be empty')),
    value: v.nullish(v.array(v.string()), []),
    columns: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1, 'columns must be at least 1')), 3),
  }),
  v.transform(({ data, value, columns }) => {
    // Each level keeps its value if that level has it, the first option otherwise.
    const path: string[] = [];
    let level: readonly TreeNode[] = data;
    while (level.length && path.length < columns) {
      const selected = level.find(node => node.value === value[path.length]) ?? level[0];
      path.push(selected.value);
      level = selected.children ?? [];
    }
    return { data, value: path, columns };
  }),
);

const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** The fields `value` has, now for the rest, clamped to the years and to real dates; as the native wheels read it. */
function wheelTime(mode: DatePickMode, value: string, minYear: number, maxYear: number): string {
  const now = dayjs();
  let [year, month, day, hour, minute] = [now.year(), now.month() + 1, now.date(), now.hour(), now.minute()];
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(value))) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[4] !== undefined) [hour, minute] = [Number(match[4]), Number(match[5])];
  } else if ((match = /^(\d{4})-(\d{2})$/.exec(value))) {
    [year, month] = [Number(match[1]), Number(match[2])];
  } else if ((match = /^(\d{4})$/.exec(value))) {
    year = Number(match[1]);
  } else if ((match = /^(\d{2}):(\d{2})$/.exec(value))) {
    [hour, minute] = [Number(match[1]), Number(match[2])];
  }
  year = clamp(year, minYear, maxYear);
  month = clamp(month, 1, 12);
  day = clamp(day, 1, new Date(year, month, 0).getDate());
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const time = `${pad(clamp(hour, 0, 23))}:${pad(clamp(minute, 0, 59))}`;
  return { year: `${year}`, 'year-month': `${year}-${pad(month)}`, date, time, datetime: `${date} ${time}` }[mode];
}
export const timeWheel = v.pipe(
  v.object({
    mode: v.nullish(datePickMode, 'date'),
    value: text(),
    minYear: v.nullish(year, () => dayjs().year() - 5),
    maxYear: v.nullish(year, () => dayjs().year() + 5),
  }),
  v.check(({ minYear, maxYear }) => minYear <= maxYear, yearMessage),
  v.transform(({ mode, value, minYear, maxYear }) => ({
    mode,
    value: wheelTime(mode, value, minYear, maxYear),
    minYear,
    maxYear,
  })),
);
