/**
 * Color of the status bar's content (time, battery) over the page, which draws its own background under it:
 * 'auto' follows the theme, dark icons on light and light ones on dark; 'light' for a page that is dark whatever the
 * theme (a camera, a photo), 'dark' for one that is always light.
 */
export type StatusBarStyle = 'auto' | 'light' | 'dark';

export type ShowReason = 'navigation' | 'tab' | 'foreground';
export type HideReason = 'covered' | 'tab' | 'background';

/** Runs while the page is visible; the function it returns, if any, undoes it when the page hides or goes away. */
export type VisibleEffect = () => void | (() => void);
