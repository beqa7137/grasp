import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RadioGroupDirective } from './radio-group.directive';

@Component({
  imports: [RadioGroupDirective],
  template: `
    <div role="radiogroup" aria-label="Daily session">
      @for (option of options; track option) {
        <button role="radio" [attr.aria-checked]="picked() === option" (click)="picked.set(option)">{{ option }}</button>
      }
    </div>
  `,
})
class HostComponent {
  readonly options = ['5 min', '10 min', '20 min'];
  readonly picked = signal<string | null>('10 min');
}

function setup(picked: string | null) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.picked.set(picked);
  fixture.detectChanges();
  const radios = Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
  const press = (radio: HTMLElement, key: string) => {
    radio.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, radios, press, picked: fixture.componentInstance.picked };
}

describe('RadioGroupDirective', () => {
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
});
