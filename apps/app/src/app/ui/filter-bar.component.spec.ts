import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterBarComponent } from './filter-bar.component';

@Component({
  imports: [FilterBarComponent],
  template: `
    <g-filter-bar [results]="results()" [active]="active()" (reset)="active.set(0)">
      <span chips>Easy</span>
      <label><input type="checkbox" /> Easy</label>
    </g-filter-bar>
  `,
})
class HostComponent {
  readonly results = signal('51 problems');
  readonly active = signal(1);
}

// jsdom has no modal dialogs; these stand in for the browser's, which fires close whenever an open dialog closes.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

describe('FilterBarComponent', () => {
  it('says how many filters are on and announces the result count', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('g-filter-bar > button')!;
    expect(button.getAttribute('aria-label')).toBe('Filters, 1 on');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(el.querySelector('[role="status"]')?.textContent).toBe('51 problems');
    expect(el.querySelector('.chips')?.textContent).toBe('Easy');

    fixture.componentInstance.results.set('12 problems');
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')?.textContent).toBe('12 problems');
  });

  it('shows the filters in its sheet, where Reset clears them and Show closes it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('g-filter-bar > button')!.click();
    fixture.detectChanges();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('input[type="checkbox"]')).not.toBeNull();

    const [reset, show] = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.actions button'));
    expect(show.textContent?.trim()).toBe('Show 51 problems');
    reset.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.active()).toBe(0);
    expect(reset.disabled).toBe(true);
    expect(el.querySelector('g-filter-bar > button')?.getAttribute('aria-label')).toBe('Filters');
    show.click();
    fixture.detectChanges();
    expect(dialog.open).toBe(false);
  });
});
