import { TestBed } from '@angular/core/testing';
import { DisclosureComponent } from './disclosure.component';

function setup(open = false) {
  const fixture = TestBed.createComponent(DisclosureComponent);
  fixture.componentRef.setInput('summary', 'How the loop works');
  fixture.componentRef.setInput('open', open);
  fixture.detectChanges();
  const details = (fixture.nativeElement as HTMLElement).querySelector('details')!;
  return { fixture, details, disclosure: fixture.componentInstance };
}

describe('DisclosureComponent', () => {
  it('is a native details whose summary carries the text and a decorative chevron', () => {
    const { details } = setup();
    const summary = details.querySelector('summary')!;
    expect(summary.textContent?.trim()).toBe('How the loop works');
    expect(summary.querySelector('ion-icon.chevron')?.getAttribute('aria-hidden')).toBe('true');
    expect(details.open).toBe(false);
  });

  it('opens from its input and reports a toggle back through the model', () => {
    const { fixture, details, disclosure } = setup(true);
    expect(details.open).toBe(true);
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(disclosure.open()).toBe(false);
  });
});
