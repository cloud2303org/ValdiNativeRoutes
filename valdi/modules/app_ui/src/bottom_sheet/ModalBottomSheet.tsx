import { Component } from 'valdi_core/src/Component';

import { BottomSheet, BottomSheetProps } from './BottomSheet';
import { ModalDetent } from './bottomSheetUtils';

/** Props for {@link ModalBottomSheet}. */
export interface ModalBottomSheetProps extends Omit<BottomSheetProps, 'detents'> {
  /**
   * Snap heights available to the sheet, in ascending order. Accepts all
   * {@link BottomSheetProps.detents} forms plus `scrimOpacity` per detent.
   */
  detents: readonly ModalDetent[];
}

/**
 * Modal bottom sheet component aligned 1:1 with `@swmansion/react-native-bottom-sheet` v1.0.0.
 *
 * Presents a backdrop scrim, blocks background touches and screen-reader traversal,
 * supports scrim tap / Back / Escape dismissal (`onCloseRequest`), and renders inside
 * the nearest `BottomSheetProvider` portal (or window-wide when `windowOverlay={true}`).
 */
export class ModalBottomSheet extends Component<ModalBottomSheetProps> {
  override onRender(): void {
    const props = { ...this.viewModel, modal: true } as unknown as BottomSheetProps;
    <BottomSheet {...props}>
      <slot />
    </BottomSheet>;
  }
}
