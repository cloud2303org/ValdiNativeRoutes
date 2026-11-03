import type { PickerOption } from './AppUIHost';

/**
 * Data passed atomically to the embedded native column picker.
 * @ExportModel({ios: 'VRColumnWheelConfig', android: 'io.valdiroutes.pages.ColumnWheelConfig'})
 */
export interface ColumnWheelConfig {
  options: PickerOption[];
  value: string;
}

/**
 * Normalized date/time data; independent of sheet presentation options.
 * @ExportModel({ios: 'VRTimeWheelConfig', android: 'io.valdiroutes.pages.TimeWheelConfig'})
 */
export interface TimeWheelConfig {
  mode: string;
  value: string;
  minYear: number;
  maxYear: number;
}

/**
 * @ExportModel({ios: 'VRWheelTreeNode', android: 'io.valdiroutes.pages.WheelTreeNode'})
 */
export interface WheelTreeNode {
  value: string;
  label: string;
  children?: WheelTreeNode[];
}

/**
 * @ExportModel({ios: 'VRTreeWheelConfig', android: 'io.valdiroutes.pages.TreeWheelConfig'})
 */
export interface TreeWheelConfig {
  data: WheelTreeNode[];
  value: string[];
  columns: number;
}
