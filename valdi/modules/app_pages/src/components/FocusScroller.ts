import type { NativeElement } from 'solid_native/src/native-tree';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { ScrollEvent } from 'valdi_tsx/src/GestureEvents';

/** Space kept between the focused input and the edge of the scroll. */
const MARGIN = 16;

/**
 * Keeps the focused input inside its scroll's visible area. ValdiScrollView does not scroll to a focused child on
 * its own, so when the host shrinks the page for the keyboard the input would end up below the visible area.
 *
 * Wire `scrollRef`, `onScroll` and `onLayout` to the `<scroll>`, and report focus from the inputs.
 */
export class FocusScroller {
  private scrollEl?: NativeElement;
  private focused?: NativeElement;
  private offsetY = 0;

  readonly scrollRef = (el: NativeElement): void => {
    this.scrollEl = el;
  };

  focus(element: NativeElement | undefined): void {
    this.focused = element;
    this.follow();
  }

  blur(element: NativeElement | undefined): void {
    if (this.focused === element) {
      this.focused = undefined;
    }
  }

  onScroll = (event: ScrollEvent): void => {
    this.offsetY = event.y;
    if (this.scrollEl) {
      this.scrollEl.props.contentOffsetY = event.y;
    }
  };

  /** The scroll got resized, e.g. the host shrank the page while the keyboard animates in. */
  onLayout = (_frame: ElementFrame): void => {
    this.follow();
  };

  private follow(): void {
    const scroll = this.scrollEl;
    if (!scroll) {
      return;
    }
    const height = scroll.frame.height;
    let next = this.offsetY;
    const target = this.focused && this.positionInScroll(scroll, this.focused);
    if (target) {
      if (target.bottom + MARGIN > next + height) {
        next = target.bottom + MARGIN - height;
      } else if (target.top - MARGIN < next) {
        next = target.top - MARGIN;
      }
    }
    // Growing back after the keyboard hides leaves the offset past the end; Valdi doesn't clamp it.
    const content = scroll.children[0]?.frame.height ?? 0;
    this.scrollTo(scroll, Math.max(Math.min(next, content - height), 0));
  }

  private positionInScroll(
    scroll: NativeElement,
    element: NativeElement,
  ): { top: number; bottom: number } | undefined {
    // Frames are relative to the parent, so summing them up to the scroll gives the position in its content.
    let top = 0;
    let current: NativeElement | undefined = element;
    while (current && current !== scroll) {
      top += current.frame.y;
      current = current.parent;
    }
    return current === scroll ? { top, bottom: top + element.frame.height } : undefined;
  }

  private scrollTo(scroll: NativeElement, offsetY: number): void {
    if (offsetY !== this.offsetY) {
      this.offsetY = offsetY;
      scroll.props.contentOffsetY = undefined;
      scroll.tree.set(scroll, 'contentOffsetY', offsetY);
    }
  }
}
