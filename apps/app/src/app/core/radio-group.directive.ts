import { Directive, ElementRef, afterEveryRender, inject } from '@angular/core';

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The ARIA radio group keyboard pattern for a group of `role="radio"` buttons: one Tab stop, on the checked radio or else
 * the first, and the arrow keys, Home and End move to another radio and select it.
 */
@Directive({
  selector: '[role="radiogroup"]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class RadioGroupDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    afterEveryRender({ write: () => this.setTabStop() });
  }

  onKeydown(e: KeyboardEvent) {
    const radios = this.radios();
    const from = radios.indexOf(e.target as HTMLElement);
    if (from < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : e.key in STEPS ? from + STEPS[e.key] : null;
    if (to === null) return;
    e.preventDefault();
    const next = radios[(to + radios.length) % radios.length];
    this.setTabStop(next);
    next.focus();
    if (next.getAttribute('aria-checked') !== 'true') next.click();
  }

  private radios(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>('[role="radio"]'));
  }

  private setTabStop(stop?: HTMLElement) {
    const radios = this.radios();
    const target = stop ?? radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0];
    for (const radio of radios) radio.tabIndex = radio === target ? 0 : -1;
  }
}
