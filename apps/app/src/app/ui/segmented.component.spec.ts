import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SegmentedComponent } from './segmented.component';

@Component({
  imports: [SegmentedComponent],
  template: `<g-segmented label="Theme" [options]="options" [(value)]="value" />`,
})
class HostComponent {
  readonly options = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  readonly value = signal('light');
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const radios = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const press = (key: string) => {
    (document.activeElement ?? radios[0]).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, el, radios, press, value: fixture.componentInstance.value };
}

const checked = (radios: HTMLElement[]) =>
  radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent?.trim());

describe('SegmentedComponent', () => {
  it('is a named radio group with the selected option checked and the only Tab stop', () => {
    const { el, radios } = setup();
    expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
    expect(checked(radios)).toEqual(['Light']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves and selects with the arrow keys, wrapping, and Home and End', () => {
    const { radios, press, value } = setup();
    radios[1].focus();
    press('ArrowRight');
    expect(value()).toBe('dark');
    expect(document.activeElement).toBe(radios[2]);
    press('ArrowDown');
    expect(value()).toBe('system');
    press('ArrowLeft');
    expect(value()).toBe('dark');
    press('Home');
    expect(value()).toBe('system');
    press('End');
    expect(value()).toBe('dark');
    expect(checked(radios)).toEqual(['Dark']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('selects on a click and reports it through the model', () => {
    const { fixture, radios, value } = setup();
    radios[0].click();
    fixture.detectChanges();
    expect(value()).toBe('system');
    expect(checked(radios)).toEqual(['System']);
  });
});
