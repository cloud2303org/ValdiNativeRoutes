// Business-owned layout values. Native receives neither height nor content padding.
export const CUSTOM_TAB_HEIGHT = 56;
export const TALL_TAB_HEIGHT = 88;

let contentPadding = 0;

export function customTabContentPadding(): number {
  return contentPadding;
}

export function setCustomTabContentPadding(value: number): void {
  contentPadding = value;
}
