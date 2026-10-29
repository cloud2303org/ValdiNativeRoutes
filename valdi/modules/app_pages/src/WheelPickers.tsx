import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { View } from 'valdi_tsx/src/NativeTemplateElements';
import * as v from 'valibot';
import type { PickerOption } from './AppUIHost';
import type { DatePickMode, TreeNode } from './schemas';
import * as schema from './schemas';

export type { TreeNode } from './schemas';

/**
 * Wheels inside a page, as opposed to api.showPicker / showDatePicker, which present them in a sheet. They are the same
 * native wheels (io.nativeroutes.ui on Android, NativeRoutesUI on iOS; WheelViews.kt / WheelViews.swift host them),
 * five 40-point rows tall. A wheel owns its vertical drags, so it scrolls inside a scroll view or a sheet without
 * moving either.
 *
 * Their view models are checked by the valibot schemas in schemas.ts (columnWheel, timeWheel, treeWheel): invalid
 * options or years throw, as they do for api.showPicker. A value the wheel can't show (empty, not among the options, out
 * of range) is shown as columnPickerValue / timePickerValue / treePickerValue make it, without telling the page: start
 * the page's state from those functions so the two agree. The native wheels show what they are given and call
 * `onChange` only when the user settles them on a new selection.
 */

/** The value a ColumnPicker shows: `value` if it is one of the options, the first option otherwise. */
export function columnPickerValue(options: readonly (string | PickerOption)[], value?: string): string {
  return v.parse(schema.columnWheel, { options, value }).value;
}

/** The path a TreePicker shows: each level keeps its value if that level has it, the first option otherwise. */
export function treePickerValue(data: readonly TreeNode[], value?: readonly string[], columns?: number): string[] {
  return v.parse(schema.treeWheel, { data, value, columns }).value;
}

/** The value a TimePicker shows: the fields `value` has, now for the rest ('' is now), within the years. */
export function timePickerValue(mode: DatePickMode, value?: string, minYear?: number, maxYear?: number): string {
  return v.parse(schema.timeWheel, { mode, value, minYear, maxYear }).value;
}

export interface ColumnPickerViewModel {
  options: readonly (string | PickerOption)[];
  value?: string;
  onChange: (value: string) => void;
}

export class ColumnPicker extends Component<ColumnPickerViewModel> {
  onRender(): void {
    const { options, value } = this.viewModel;
    <custom-view
      iosClass="VRColumnWheelView"
      androidClass="io.valdiroutes.app.ColumnWheelView"
      style={styles.wheel}
      config={JSON.stringify(v.parse(schema.columnWheel, { options, value }))}
      onChange={this.handleChange}
    />;
  }

  private handleChange = (value: string) => this.viewModel.onChange(value);
}

export interface TimePickerViewModel {
  /** As api.showDatePicker: 'date' by default, values YYYY, YYYY-MM, YYYY-MM-DD, HH:mm or YYYY-MM-DD HH:mm. */
  mode?: DatePickMode;
  /** '' (or none) is now, at every render: keep the value in the page's state instead. */
  value?: string;
  /** This year minus and plus 5 by default. */
  minYear?: number;
  maxYear?: number;
  onChange: (value: string) => void;
}

export class TimePicker extends Component<TimePickerViewModel> {
  onRender(): void {
    const { mode, value, minYear, maxYear } = this.viewModel;
    const config = v.parse(schema.timeWheel, { mode, value, minYear, maxYear });
    // 'datetime' adds the date / time switch above the wheels.
    <custom-view
      iosClass="VRTimeWheelView"
      androidClass="io.valdiroutes.app.TimeWheelView"
      style={config.mode === 'datetime' ? styles.dateTimeWheel : styles.wheel}
      config={JSON.stringify(config)}
      onChange={this.handleChange}
    />;
  }

  private handleChange = (value: string) => this.viewModel.onChange(value);
}

export interface TreePickerViewModel {
  data: readonly TreeNode[];
  /** One value per level, from the top. */
  value?: readonly string[];
  /** Visible levels, 3 by default. */
  columns?: number;
  onChange: (value: string[]) => void;
}

/** Cascading wheels: changing a level resets the levels below it to their first option. */
export class TreePicker extends Component<TreePickerViewModel> {
  onRender(): void {
    const { data, value, columns } = this.viewModel;
    <custom-view
      iosClass="VRTreeWheelView"
      androidClass="io.valdiroutes.app.TreeWheelView"
      style={styles.wheel}
      config={JSON.stringify(v.parse(schema.treeWheel, { data, value, columns }))}
      onChange={this.handleChange}
    />;
  }

  private handleChange = (json: string) => this.viewModel.onChange(JSON.parse(json) as string[]);
}

const styles = {
  wheel: new Style<View>({ width: '100%', height: 200 }),
  dateTimeWheel: new Style<View>({ width: '100%', height: 244 }),
};
