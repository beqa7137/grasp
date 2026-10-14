import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChartAxis } from './chart-frame.component';
import { HistogramComponent } from './histogram.component';

@Component({
  imports: [HistogramComponent],
  template: `
    <g-histogram
      heading="Latency"
      summary="Latency of the run"
      [width]="300"
      [height]="220"
      [x]="x"
      [y]="y"
      [bins]="bins"
      [ghost]="ghost"
      [p50]="20"
      [p99]="300"
      [format]="ms"
    />
  `,
})
class Host {
  readonly x: ChartAxis = { min: 1, max: 1000, ticks: [1, 1000], format: (v) => `${v}`, log: true };
  readonly y: ChartAxis = { min: 0, max: 0.5, ticks: [0, 0.5], format: (v) => `${v * 100}%` };
  readonly bins = [
    { from: 10, to: 100, share: 0.4 },
    { from: 100, to: 1000, share: 0.1 },
  ];
  readonly ghost = [{ from: 1, to: 10, share: 0.3 }];
  readonly ms = (v: number) => `${v} ms`;
}

describe('HistogramComponent', () => {
  it('draws this run as bars, the previous one as a dashed outline, and names p50 and p99 in the legend', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.bars rect')).toHaveLength(2);
    expect(el.querySelector('path.ghost')).not.toBeNull();
    expect([...el.querySelectorAll('.legend li')].map((l) => l.textContent!.trim())).toEqual([
      'this run',
      'previous run',
      'p50 20 ms',
      'p99 300 ms',
    ]);
    expect(el.querySelectorAll('line.marker')).toHaveLength(2);
  });
});
