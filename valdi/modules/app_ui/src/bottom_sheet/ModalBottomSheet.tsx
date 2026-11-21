import { BottomSheetBase, type BottomSheetInternalProps, type BottomSheetProps } from './BottomSheet';
import type { ModalDetent } from './bottomSheetUtils';

/** Props for {@link ModalBottomSheet}. */
export interface ModalBottomSheetProps extends Omit<BottomSheetProps, 'detents'> {
  /**
   * Snap heights available to the sheet, in ascending order. Accepts all
   * {@link BottomSheetProps.detents} forms plus `scrimOpacity` per detent.
   */
  detents: readonly ModalDetent[];
}

/**
 * Modal bottom sheet component aligned 1:1 with `@swmansion/react-native-bottom-sheet` v1.1.0.
 *
 * Presents a backdrop scrim, blocks background touches and screen-reader traversal,
 * supports scrim tap / Back / Escape dismissal (`onCloseRequest`), and renders inside
 * the nearest `BottomSheetProvider` portal (or window-wide when `windowOverlay={true}`).
 */
export function ModalBottomSheet(props: ModalBottomSheetProps) {
  return (
    <BottomSheetBase {...(props as unknown as BottomSheetInternalProps)} modal={true}>
      {props.children}
    </BottomSheetBase>
  );
}
