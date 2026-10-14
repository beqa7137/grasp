import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartFrameComponent, type ChartAxis, type ChartSeries } from './chart-frame.component';

const AXIS: ChartAxis = { min: 0, max: 10, ticks: [0, 5, 10], format: (v) => `${v} s` };
const LOAD: ChartAxis = { min: 0, max: 100, ticks: [0, 100], format: (v) => `${v}/s` };

@Component({
  imports: [ChartFrameComponent],
  template: `
    <g-chart-frame
      heading="Load"
      summary="Load falls"
      [width]="300"
      [height]="220"
      [x]="x"
      [y]="y"
      [series]="series()"
      [threshold]="{ value: 40, label: 'capacity' }"
      [spans]="[{ from: 0, to: 4, label: 'over to 4 s' }]"
      [markers]="[{ at: 9.5, label: 'warm at 9.5 s', tone: 'final' }]"
      [empty]="series().length ? undefined : 'Nothing yet'"
      [table]="{ head: ['t', 'load'], rows: rows }"
      [tableRow]="1"
      [playheadValues]="series().length ? [0, 5, 10] : []"
      playheadLabel="Time after the flush"
      playheadText="at the playhead"
      [disabled]="locked()"
      [(playhead)]="at"
    />
  `,
})
class Host {
  readonly x = AXIS;
  readonly y = LOAD;
  readonly series = signal<ChartSeries[]>([]);
  readonly rows = [
    ['0 s', '100/s'],
    ['5 s', '45/s'],
  ];
  readonly at = signal(0);
  readonly locked = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

const texts = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.trim());
const draw = (fixture: ReturnType<typeof setup>['fixture'], host: Host) => {
  host.series.set([
    {
      id: 'l',
      tone: 'critical',
      label: 'load',
      points: [
        [0, 100],
        [5, 45],
        [10, 40],
      ],
    },
  ]);
  fixture.detectChanges();
};

describe('ChartFrameComponent', () => {
  it('draws fixed axes, its legend and its empty state before there is data, with no gridlines or playhead', () => {
    const { el } = setup();
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Load falls');
    expect(texts(el, '.tick')).toEqual(['0/s', '100/s', '0 s', '5 s', '10 s']);
    expect(texts(el, '.empty tspan')).toEqual(['Nothing yet']);
    expect(el.querySelectorAll('.grid')).toHaveLength(0);
    expect(texts(el, '.legend li')).toEqual(['capacity']);
    expect(el.querySelector('g-handle')).toBeNull();
  });

  it('names series, threshold, span and marker in a legend off the plot, and ticks the span end and the marker in their tones', () => {
    const { fixture, el, host } = setup();
    draw(fixture, host);
    expect(el.querySelector('.line')!.getAttribute('d')).toMatch(/^M36 8L/);
    expect(texts(el, '.legend li')).toEqual(['load', 'capacity', 'over to 4 s', 'warm at 9.5 s']);
    expect(texts(el, '.tick.critical')).toEqual(['4 s']);
    expect(texts(el, '.tick.final')).toEqual(['9.5 s']);
    // 10 s gives way to the marker 9.5 s beside it; 5 s stays.
    expect(texts(el, 'text.tick:not(.critical):not(.final)').slice(2)).toEqual(['0 s', '5 s']);
    expect(el.querySelectorAll('.grid')).toHaveLength(2);
    expect(el.querySelectorAll('line.marker')).toHaveLength(1);
  });

  it('puts its playhead on a track under the time ticks, and moves it by keyboard unless disabled', () => {
    const { fixture, el, host } = setup();
    draw(fixture, host);
    const handle = el.querySelector<HTMLElement>('g-handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Time after the flush');
    expect(handle.getAttribute('aria-valuetext')).toBe('at the playhead');
    const tickY = Number([...el.querySelectorAll('text.tick')].find((t) => t.textContent!.trim() === '0 s')!.getAttribute('y'));
    expect(Number(/translate\([-\d.]+px, ([-\d.]+)px\)/.exec(handle.style.transform)![1]) + 22 - 28).toBeGreaterThan(tickY);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.at()).toBe(5);
    host.locked.set(true);
    fixture.detectChanges();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.at()).toBe(5);
    expect(handle.getAttribute('aria-disabled')).toBe('true');
  });

  it('swaps the drawing for its data table in the same box, with the playhead row marked', () => {
    const { fixture, el } = setup();
    const toggle = el.querySelector<HTMLButtonElement>('.toggle')!;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('svg[role="img"]')).toBeNull();
    expect(texts(el, 'td')).toEqual(['0 s', '100/s', '5 s', '45/s']);
    expect(texts(el, 'tr[aria-current="true"] td')).toEqual(['5 s', '45/s']);
    expect(el.querySelector<HTMLElement>('g-data-table')!.style.height).toBe(`${220 - 28 - 52}px`);
  });

  it('draws a log axis with equal room per decade, bars with a ghost outline, and a span in its own tone', () => {
    @Component({
      imports: [ChartFrameComponent],
      template: `
        <g-chart-frame
          heading="Latency"
          summary="Latency"
          [width]="300"
          [height]="220"
          [x]="{ min: 1, max: 1000, ticks: [1, 10, 100, 1000], format: fmt, log: true }"
          [y]="{ min: 0, max: 1, ticks: [0, 1], format: fmt }"
          [bars]="[
            {
              id: 'now',
              tone: 'current',
              label: 'this run',
              items: [
                { from: 1, to: 10, value: 0.5 },
                { from: 10, to: 100, value: 0 },
              ],
            },
            { id: 'was', tone: 'muted', label: 'previous run', ghost: true, items: [{ from: 1, to: 10, value: 1 }] },
          ]"
          [spans]="[{ from: 1, to: 10, label: 'a spike', tone: 'considering' }]"
        />
      `,
    })
    class LogHost {
      readonly fmt = (v: number) => String(v);
    }
    const fixture = TestBed.createComponent(LogHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tickX = (label: string) =>
      Number(
        [...el.querySelectorAll('text.tick')]
          .find((t) => t.getAttribute('text-anchor') === 'middle' && t.textContent!.trim() === label)!
          .getAttribute('x'),
      );
    expect(tickX('10') - tickX('1')).toBeCloseTo(tickX('100') - tickX('10'), 5);
    expect(el.querySelectorAll('.bars rect')).toHaveLength(1);
    expect(el.querySelector('path.ghost')!.getAttribute('d')).toMatch(/^M36 \d+V8H/);
    expect(el.querySelector('rect.span')!.getAttribute('class')).toContain('considering');
    expect(texts(el, '.legend li')).toEqual(['this run', 'previous run', 'a spike']);
  });
});
