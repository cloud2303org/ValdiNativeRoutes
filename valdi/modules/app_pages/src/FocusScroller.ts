import { ElementRef } from 'valdi_core/src/ElementRef';
import { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import { ElementFrame } from 'valdi_tsx/src/Geometry';
import { ScrollViewInteractive } from 'valdi_tsx/src/NativeTemplateElements';

/** Space kept between the focused input and the edge of the scroll. */
const MARGIN = 16;

/**
 * Keeps the focused input inside its scroll's visible area. ValdiScrollView does not scroll to a focused child on
 * its own, so when the host shrinks the page for the keyboard the input would end up below the visible area.
 *
 * Wire `scrollRef`, `onScroll` and `onLayout` to the `<scroll>`, and report focus from the inputs.
 */
export class FocusScroller {
  readonly scrollRef = new ElementRef<ScrollViewInteractive>();
  private focused?: IRenderedElement;
  private offsetY = 0;

  focus(element: IRenderedElement | undefined): void {
    this.focused = element;
    this.follow();
  }

  blur(element: IRenderedElement | undefined): void {
    if (this.focused === element) {
      this.focused = undefined;
    }
  }

  onScroll = (event: ScrollEvent): void => {
    this.offsetY = event.y;
  };

  /** The scroll got resized, e.g. the host shrank the page while the keyboard animates in. */
  onLayout = (_frame: ElementFrame): void => {
    this.follow();
  };

  private follow(): void {
    const scroll = this.scrollRef.single();
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

  private positionInScroll(scroll: IRenderedElement, element: IRenderedElement): { top: number; bottom: number } | undefined {
    // Frames are relative to the parent, so summing them up to the scroll gives the position in its content.
    let top = 0;
    let current: IRenderedElement | undefined = element;
    while (current && current !== scroll) {
      top += current.frame.y;
      current = current.parent;
    }
    return current === scroll ? { top, bottom: top + element.frame.height } : undefined;
  }

  private scrollTo(scroll: IRenderedElement<ScrollViewInteractive>, offsetY: number): void {
    if (offsetY !== this.offsetY) {
      this.offsetY = offsetY;
      scroll.setAttribute('contentOffsetY', offsetY);
    }
  }
}
