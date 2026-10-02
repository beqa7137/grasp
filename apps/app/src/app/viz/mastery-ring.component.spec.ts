import { TestBed } from '@angular/core/testing';
import { MasteryRingComponent } from './mastery-ring.component';

function arc(value: number): SVGCircleElement {
  const fixture = TestBed.createComponent(MasteryRingComponent);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.fg');
}

describe('MasteryRingComponent', () => {
  it.each([0, 0.004])('draws no arc at %s, which reads as 0%', (value) => {
    const fg = arc(value);
    expect(fg.classList).toContain('empty');
    expect(fg.getAttribute('stroke-dasharray')?.startsWith('0 ')).toBe(true);
  });

  it('draws an arc from 1%', () => {
    const fg = arc(0.01);
    expect(fg.classList).not.toContain('empty');
    expect(parseFloat(fg.getAttribute('stroke-dasharray')!)).toBeCloseTo(0.01 * 2 * Math.PI * 16);
  });
});
