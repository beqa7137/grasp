import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HandleComponent, nearestIndex } from './handle.component';

@Component({
  imports: [HandleComponent],
  template: `
    <div class="frame">
      <g-handle
        label="Hit rate"
        [values]="values"
        [positions]="positions"
        [cross]="40"
        [valuetext]="value() + '% hits'"
        [disabled]="disabled()"
        [(value)]="value"
      />
    </div>
  `,
})
class Host {
  readonly values = [50, 90, 99, 99.9];
  readonly positions = [10, 60, 110, 160];
  readonly value = signal(90);
  readonly disabled = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const handle = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('g-handle')!;
  const key = (k: string) => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, handle, key, value: fixture.componentInstance.value };
}

describe('HandleComponent', () => {
  it('finds the nearest snap', () => {
    expect(nearestIndex([10, 60, 110], 0)).toBe(0);
    expect(nearestIndex([10, 60, 110], 84)).toBe(1);
    expect(nearestIndex([10, 60, 110], 90)).toBe(2);
  });

  it('is a slider named in words, drawn at its value, with a 44px target centred on it', () => {
    const { handle } = setup();
    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.tabIndex).toBe(0);
    expect(handle.getAttribute('aria-label')).toBe('Hit rate');
    expect(handle.getAttribute('aria-valuenow')).toBe('90');
    expect(handle.getAttribute('aria-valuemin')).toBe('50');
    expect(handle.getAttribute('aria-valuemax')).toBe('99.9');
    expect(handle.getAttribute('aria-valuetext')).toBe('90% hits');
    expect(handle.style.transform).toBe('translate(38px, 18px)');
  });

  it('steps through the snaps with the arrow keys, Home and End, and stops at the ends', () => {
    const { key, value, handle } = setup();
    key('ArrowRight');
    expect(value()).toBe(99);
    key('ArrowUp');
    key('ArrowRight');
    expect(value()).toBe(99.9);
    key('Home');
    expect(value()).toBe(50);
    key('ArrowLeft');
    expect(value()).toBe(50);
    key('End');
    expect(value()).toBe(99.9);
    expect(handle.getAttribute('aria-valuetext')).toBe('99.9% hits');
  });

  it('takes no keys or drags while disabled, and says so', () => {
    const { fixture, handle, key, value } = setup();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    key('ArrowRight');
    handle.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(value()).toBe(90);
    expect(handle.getAttribute('aria-disabled')).toBe('true');
  });

  it('tracks a drag snap by snap from where the pointer is in its frame', () => {
    const { fixture, handle, value } = setup();
    const frame = handle.parentElement!;
    frame.getBoundingClientRect = () => ({ left: 100, top: 0 }) as DOMRect;
    const pointer = (type: string, clientX: number) => {
      handle.dispatchEvent(new MouseEvent(type, { clientX, button: 0, bubbles: true }));
      fixture.detectChanges();
    };
    pointer('pointerdown', 160);
    pointer('pointermove', 205);
    expect(value()).toBe(99);
    pointer('pointermove', 100);
    expect(value()).toBe(50);
    pointer('pointerup', 100);
    pointer('pointermove', 260);
    expect(value()).toBe(50);
  });
});
