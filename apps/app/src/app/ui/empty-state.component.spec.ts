import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';
import { caughtUpIcon } from './icons';

@Component({
  imports: [EmptyStateComponent],
  template: `
    <g-empty-state heading="All caught up" [icon]="icon" tone="success">
      Nothing scheduled yet.
      <button action>Review anyway</button>
    </g-empty-state>
  `,
})
class HostComponent {
  readonly icon = caughtUpIcon;
}

describe('EmptyStateComponent', () => {
  it('shows a toned decorative icon, a heading, the body and its one action after it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('g-empty-state')!;
    const icon = el.querySelector('ion-icon')!;
    expect(icon.classList).toContain('success');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('h2')?.textContent).toBe('All caught up');
    expect(el.querySelector('.body')?.textContent?.trim()).toBe('Nothing scheduled yet.');
    expect(el.lastElementChild?.textContent).toBe('Review anyway');
  });
});
