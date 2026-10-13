import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChipComponent, orderChips } from './chip.component';

@Component({
  imports: [ChipComponent],
  template: `<g-chip tone="danger">Hard</g-chip><a g-chip href="/x">Hashing</a>`,
})
class HostComponent {}

describe('ChipComponent', () => {
  it('orders chips pattern, then difficulty, then complexity', () => {
    const chips = [
      { kind: 'complexity' as const, label: 'O(n)' },
      { kind: 'difficulty' as const, label: 'Easy' },
      { kind: 'pattern' as const, label: 'Two pointers' },
    ];
    expect(orderChips(chips).map((c) => c.label)).toEqual(['Two pointers', 'Easy', 'O(n)']);
    expect(chips[0].label).toBe('O(n)');
  });

  it('carries its tone as a class, and works on a link', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const [label, link] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('g-chip, [g-chip]'));
    expect(label.classList).toContain('danger');
    expect(link.tagName).toBe('A');
    expect(link.classList).toContain('neutral');
    expect(link.textContent).toBe('Hashing');
  });
});
