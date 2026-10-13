import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/** Read once per field, not at import, so a test can stand in for a browser without `field-sizing`. */
const sizesItself = () => typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content') === true;

/**
 * The text field skin (REDESIGN.md 3.2): no native resize grip, and the field grows with its text. `field-sizing: content`
 * does that where supported, and it ignores `rows`, so a field sets its least height with `min-height` and its most with
 * `max-height`, past which it scrolls. Elsewhere (WebKit) the field takes its scroll height after it renders, on each
 * input, and when a form control writes its value.
 */
@Directive({
  selector: 'textarea[gTextarea]',
  host: { class: 'g-textarea', '(input)': 'fit()' },
})
export class TextareaDirective {
  private readonly el: HTMLTextAreaElement = inject(ElementRef).nativeElement;
  private readonly sizesItself = sizesItself();

  constructor() {
    if (this.sizesItself) return;
    afterNextRender({ write: () => this.fit() });
    const control = inject(NgControl, { optional: true, self: true });
    const written = control?.valueChanges?.subscribe(() => this.fit());
    if (written) inject(DestroyRef).onDestroy(() => written.unsubscribe());
  }

  fit() {
    if (this.sizesItself) return;
    const el = this.el;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }
}
