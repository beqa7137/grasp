import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CheckComponent } from './check.component';

@Component({
  imports: [CheckComponent],
  template: `<g-check [(checked)]="on" [disabled]="off()">100 virtual nodes</g-check>`,
})
class HostComponent {
  readonly on = signal(false);
  readonly off = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, input: el.querySelector('input')!, host: fixture.componentInstance };
}

describe('CheckComponent', () => {
  it('keeps a native checkbox, labelled by its text, with the drawn box hidden from screen readers', () => {
    const { el, input } = setup();
    expect(input.type).toBe('checkbox');
    expect(input.closest('label')?.textContent?.trim()).toBe('100 virtual nodes');
    expect(el.querySelector('.box')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggles through the model, and follows it', () => {
    const { fixture, input, host } = setup();
    input.click();
    fixture.detectChanges();
    expect(host.on()).toBe(true);
    host.on.set(false);
    fixture.detectChanges();
    expect(input.checked).toBe(false);
  });

  it('passes disabled to the input', () => {
    const { fixture, input, host } = setup();
    host.off.set(true);
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });
});
