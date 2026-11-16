import dayjs from 'dayjs';
import type { WheelTreeNode } from './WheelHost';
import {
  type DatePickMode,
  normalizePickerOptions,
  type PickerOptionItem,
} from 'native_common/src/pickerSchemas';

// The wheel components (WheelPickers.tsx) take the same options and years as the presented pickers. A value they can't
// show is not an error there: it becomes the first option, the first path, or the current date and time.

export function columnWheel({
  options,
  value,
}: {
  options: readonly (string | PickerOptionItem)[];
  value?: string | null;
}) {
  const items = normalizePickerOptions(options);
  return {
    options: items,
    value: items.some(item => item.value === value) ? (value as string) : items[0].value,
  };
}

export type TreeNode = WheelTreeNode;

export function treeWheel({
  data,
  value,
  columns,
}: {
  data: readonly TreeNode[];
  value?: readonly string[] | null;
  columns?: number | null;
}) {
  if (!data?.length) throw new Error('data must not be empty');
  const cols = Math.max(1, columns ?? 3);
  const selectedValues = value ?? [];
  const path: string[] = [];
  let level: readonly TreeNode[] = data;
  while (level.length && path.length < cols) {
    const selected = level.find(node => node.value === selectedValues[path.length]) ?? level[0];
    path.push(selected.value);
    level = selected.children ?? [];
  }
  return { data: data as TreeNode[], value: path, columns: cols };
}

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

export function timeWheel({
  mode,
  value,
  minYear,
  maxYear,
}: {
  mode?: DatePickMode | null;
  value?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
}) {
  const currentYear = dayjs().year();
  const resolvedMode: DatePickMode = mode ?? 'date';
  const min = minYear ?? currentYear - 5;
  const max = Math.max(min, maxYear ?? currentYear + 5);
  return {
    mode: resolvedMode,
    value: wheelTime(resolvedMode, value ?? '', min, max),
    minYear: min,
    maxYear: max,
  };
}
