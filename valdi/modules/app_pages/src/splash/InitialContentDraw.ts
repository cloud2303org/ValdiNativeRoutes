import { getLastRootComponentsManager } from 'valdi_core/src/Valdi';

/**
 * The Android host owns one main runtime and requests the hook on the selected
 * root, including custom tab bars that do not derive from the Page base class.
 *
 * @ExportFunction({ios: 'VRRequestInitialContentDraw', android: 'io.valdiroutes.pages.RequestInitialContentDraw'})
 */
export function requestInitialContentDraw(contextId: string, ready: () => void): boolean {
  const root = getLastRootComponentsManager()?.rootComponents[contextId];
  if (!root) return false;
  root.renderer.onNextDraw(() => ready());
  return true;
}
