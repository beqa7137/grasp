import { Directive, ElementRef, HostAttributeToken, afterEveryRender, inject } from '@angular/core';

interface Pattern {
  item: string;
  selected: string;
  steps: Record<string, number>;
}

const PATTERNS: Record<string, Pattern> = {
  radiogroup: { item: '[role="radio"]', selected: 'aria-checked', steps: { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } },
  tablist: { item: '[role="tab"]', selected: 'aria-selected', steps: { ArrowRight: 1, ArrowLeft: -1 } },
};

/**
 * The ARIA keyboard pattern for a radio group or a row of tabs: one Tab stop, on the selected item or else the first, and
 * the arrow keys, Home and End move to another item and select it.
 */
@Directive({
  selector: '[role="radiogroup"], [role="tablist"]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class RovingSelectDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly pattern = PATTERNS[inject(new HostAttributeToken('role'))];

  constructor() {
    afterEveryRender({ write: () => this.setTabStop() });
  }

  onKeydown(e: KeyboardEvent) {
    const items = this.items();
    const from = items.indexOf(e.target as HTMLElement);
    if (from < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const { steps } = this.pattern;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key in steps ? from + steps[e.key] : null;
    if (to === null) return;
    e.preventDefault();
    const next = items[(to + items.length) % items.length];
    this.setTabStop(next);
    next.focus();
    if (!this.isSelected(next)) next.click();
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(this.pattern.item));
  }

  private isSelected(item: HTMLElement): boolean {
    return item.getAttribute(this.pattern.selected) === 'true';
  }

  private setTabStop(stop?: HTMLElement) {
    const items = this.items();
    const target = stop ?? items.find((item) => this.isSelected(item)) ?? items[0];
    for (const item of items) {
      const tabIndex = item === target ? 0 : -1;
      if (item.tabIndex !== tabIndex) item.tabIndex = tabIndex;
    }
  }
}
