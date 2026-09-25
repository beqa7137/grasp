import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RovingSelectDirective } from './roving-select.directive';

@Component({
  imports: [RovingSelectDirective],
  template: `
    <div role="radiogroup" aria-label="Daily session">
      @for (option of options; track option) {
        <button role="radio" [attr.aria-checked]="picked() === option" (click)="picked.set(option)">{{ option }}</button>
      }
    </div>
    <div role="tablist" aria-label="Results">
      @for (panel of panels; track panel) {
        <button role="tab" [attr.aria-selected]="shown() === panel" (click)="shown.set(panel)">{{ panel }}</button>
      }
    </div>
  `,
})
class HostComponent {
  readonly options = ['5 min', '10 min', '20 min'];
  readonly picked = signal<string | null>('10 min');
  readonly panels = ['Tests', 'Trace'];
  readonly shown = signal('Tests');
}

function setup(picked: string | null) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.picked.set(picked);
  fixture.detectChanges();
  const all = (selector: string) => Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLButtonElement[];
  const press = (item: HTMLElement, key: string) => {
    item.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const { componentInstance: host } = fixture;
  return { fixture, radios: all('[role="radio"]'), tabs: all('[role="tab"]'), press, picked: host.picked, shown: host.shown };
}

describe('RovingSelectDirective', () => {
  it('gives the group one Tab stop, on the checked radio', () => {
    const { radios } = setup('10 min');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('puts the Tab stop on the first radio while none is checked', () => {
    const { radios } = setup(null);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves the choice and focus with the arrow keys, wrapping at the ends', () => {
    const { radios, press, picked } = setup('10 min');
    radios[1].focus();
    press(radios[1], 'ArrowRight');
    expect(picked()).toBe('20 min');
    expect(document.activeElement).toBe(radios[2]);
    press(radios[2], 'ArrowDown');
    expect(picked()).toBe('5 min');
    press(radios[0], 'ArrowLeft');
    expect(picked()).toBe('20 min');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('jumps to the first and last radio with Home and End', () => {
    const { radios, press, picked } = setup('10 min');
    press(radios[1], 'End');
    expect(picked()).toBe('20 min');
    press(radios[2], 'Home');
    expect(picked()).toBe('5 min');
  });

  it('leaves other keys and chords alone', () => {
    const { radios, picked } = setup('10 min');
    const chord = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true });
    radios[1].dispatchEvent(chord);
    radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(picked()).toBe('10 min');
    expect(chord.defaultPrevented).toBe(false);
  });

  it('gives a row of tabs one Tab stop, on the selected tab, and shows the next tab with Left and Right only', () => {
    const { tabs, press, shown } = setup('10 min');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1]);
    press(tabs[0], 'ArrowRight');
    expect(shown()).toBe('Trace');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0]);
    press(tabs[1], 'ArrowDown');
    expect(shown()).toBe('Trace');
    press(tabs[1], 'Home');
    expect(shown()).toBe('Tests');
  });

  it('writes a tab index only when it changes', () => {
    const { fixture, radios, picked } = setup('10 min');
    const observer = new MutationObserver(() => {});
    observer.observe(fixture.nativeElement, { attributeFilter: ['tabindex'], subtree: true });
    fixture.detectChanges();
    picked.set('20 min');
    fixture.detectChanges();
    const written = observer.takeRecords().map((r) => (r.target as Element).textContent!.trim());
    observer.disconnect();
    expect(written.sort()).toEqual(['10 min', '20 min']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });
});
