import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CACHE_EXPERIMENTS } from '@grasp/engine';
import { CacheWidgetComponent } from './cache-widget.component';

@Component({
  imports: [CacheWidgetComponent],
  template: `<app-cache-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = CACHE_EXPERIMENTS;
}

const STORM = CACHE_EXPERIMENTS.findIndex((e) => e.id === 'miss-storm');
const NINE = CACHE_EXPERIMENTS.findIndex((e) => e.id === 'each-nine');

function setup({ width = 694, motion = false } = {}) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: width + 2 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  // Frames never come, so a play started with motion stays running until something interrupts it.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  Element.prototype.animate = animate;
  Element.prototype.scrollIntoView = vi.fn();
  if (motion) document.documentElement.removeAttribute('data-motion');
  else document.documentElement.setAttribute('data-motion', 'off');
  const fixture = TestBed.createComponent(Host);
  const render = () => {
    TestBed.tick();
    fixture.detectChanges();
  };
  render();
  render();
  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
  const slider = (name: string) => el.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
  const key = (name: string, k: string, times = 1) => {
    for (let i = 0; i < times; i++) slider(name).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    render();
  };
  const click = (selector: string, index = 0) => {
    el.querySelectorAll<HTMLElement>(selector)[index].click();
    render();
  };
  const button = (name: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === name)!;
  return { el, text, slider, key, click, button, animate, render };
}

describe('CacheWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the steady state of its settings: origin load, mean, p99 and the 100-request waffle', () => {
    const { text, slider, el } = setup();
    expect(text('.value.readout')).toEqual(['6 ms', '51 ms']);
    expect(text('.load-text')).toEqual(['1,000/s']);
    expect(text('.waffle-legend li')).toEqual(['90 hits', '10 misses answered', '0 timing out now']);
    expect(el.querySelectorAll('rect.cell.miss')).toHaveLength(10);
    expect(slider('Cache hit rate').getAttribute('aria-valuetext')).toBe('90% hits: 1,000/s go on to the origin');
    expect(slider('Origin capacity').getAttribute('aria-valuetext')).toBe('The origin answers up to 2,000/s');
    expect(text('g-chart-frame .empty tspan')).toEqual(['Flush the cache', 'to see the miss storm']);
  });

  it('moves the hit rate along its snaps, p99 becomes a hit at 1 in 100, and a half request is said, not drawn', () => {
    const { key, text, el } = setup();
    key('Cache hit rate', 'ArrowRight', 3);
    expect(text('.value.readout')).toEqual(['1.5 ms', '1 ms']);
    expect(text('.waffle-legend li')).toEqual(['99 hits', '1 miss answered', '0 timing out now']);
    expect(text('.p99-kind')).toEqual(['a hit']);
    key('Cache hit rate', 'ArrowRight');
    expect(text('.waffle-legend li')).toEqual(['100 hits', '1 in 200 misses', '0 timing out now']);
    expect(el.querySelectorAll('rect.cell.miss')).toHaveLength(0);
  });

  it('shows a flush at its peak without motion, counts the timeouts, and marks the storm and the warm-up on the chart', () => {
    const { click, key, text, slider, el, animate } = setup();
    click('.actions button');
    expect(text('.value.readout')).toEqual(['timing out', 'timing out']);
    expect(text('.load-text')).toEqual(['10,000/s']);
    expect(text('.caption.bad tspan')).toEqual(['5× the 2,000/s', 'it can answer']);
    expect(el.querySelectorAll('path.cross')).toHaveLength(1);
    expect(text('.waffle-legend li')).toEqual(['0 hits', '20 misses answered', '80 timing out now']);
    expect(text('g-chart-frame .legend li')).toEqual([
      'origin load',
      'hit rate',
      'capacity',
      'over capacity until 5.7 s',
      'warm at 10.9 s',
    ]);
    expect(slider('Time after the flush').getAttribute('aria-valuetext')).toBe('0 s after the flush: 0% hits, origin 10,000/s');
    expect(slider('Cache hit rate').classList).toContain('ghost');
    key('Time after the flush', 'End');
    expect(text('g-chart-frame .legend li')).toContain('over capacity until 5.7 s, 21,000 timed out');
    expect(text('.waffle-legend li')[2]).toBe('0 timing out now');
    click('.actions button', 1);
    expect(slider('Time after the flush').getAttribute('aria-valuenow')).toBe('0');
    expect(text('.notice')).toEqual(['Back at the flush: drag the playhead under the chart to step through the refill.']);
    expect(animate).not.toHaveBeenCalled();
  });

  it('returns to the warm steady state when a setting changes after a flush, and says the cache is warm again', () => {
    const { click, key, text, slider } = setup();
    click('.actions button');
    key('Cache hit rate', 'ArrowRight');
    expect(slider('Cache hit rate').getAttribute('aria-valuetext')).toBe('95% hits: 500/s go on to the origin');
    expect(slider('Cache hit rate').classList).not.toContain('ghost');
    expect(text('.warm')).toEqual(['· warm again']);
    expect(text('.value.readout')).toEqual(['3.5 ms', '51 ms']);
    expect(text('g-chart-frame .legend li')).toContain('over capacity until 4.7 s, 18,000 timed out');
    key('Time after the flush', 'Home');
    expect(text('.value.readout')).toEqual(['timing out', 'timing out']);
  });

  it('says when the origin never gets back under capacity, and never calls a cache warm that did not warm', () => {
    const { click, key, text, slider, el } = setup();
    key('Cache hit rate', 'ArrowLeft', 2);
    key('Origin capacity', 'Home');
    click('.actions button');
    expect(text('g-chart-frame .legend li')).toContain('over capacity throughout');
    expect(el.querySelector('g-chart-frame svg')!.getAttribute('aria-label')).toContain('never gets back under capacity');
    key('Time after the flush', 'End');
    expect(text('g-chart-frame .legend li')).toContain('over capacity throughout, 140,000 timed out so far');
    key('Cache hit rate', 'ArrowRight');
    key('Cache hit rate', 'ArrowLeft');
    expect(text('.warm')).toEqual([]);
    expect(slider('Cache hit rate').classList).toContain('ghost');
    // It rests on the run's last sample, not the steady 5,000/s it never reaches.
    expect(text('.load-text')).toEqual(['6,392/s']);
  });

  it('sets an experiment up in one tap, holds its answer until the play, then reveals and marks its focus', () => {
    const { click, text, slider, el, animate } = setup();
    click('.cards button', STORM);
    expect(slider('Cache hit rate').getAttribute('aria-valuetext')).toBe('99.9% hits: 10/s go on to the origin');
    expect(el.querySelector('g-slider input')!.getAttribute('aria-valuetext')).toBe('100 ms');
    expect(text('app-widget-check legend')).toEqual(['The origin gets 10/s. Flush the cache: how much more traffic reaches the origin?']);
    click('app-widget-check fieldset button', 2);
    expect(text('app-widget-check .explain')[0]).toMatch(/^Every request misses, so the origin goes from 10\/s to 10,000\/s/);
    expect(el.querySelector('[data-focus="gauge"]')!.classList).toContain('focused');
    expect(el.querySelector('[data-focus="chart"]')!.classList).toContain('focused');
    expect(el.querySelector('[data-focus="waffle"]')!.classList).not.toContain('focused');
    expect(el.querySelectorAll('.cards .done')).toHaveLength(1);
    expect(animate).not.toHaveBeenCalled();
  });

  it('with motion, locks the settings while an answer plays, and an interrupted play still reveals', () => {
    const { click, key, text, slider, button, el } = setup({ motion: true });
    click('.cards button', NINE);
    click('app-widget-check fieldset button', 1);
    expect(text('app-widget-check .explain')).toEqual(['Watch the picture: the answer plays out on it.']);
    expect(button('Flush the cache').disabled).toBe(true);
    expect(slider('Cache hit rate').getAttribute('aria-disabled')).toBe('true');
    key('Cache hit rate', 'ArrowLeft');
    expect(slider('Cache hit rate').getAttribute('aria-valuenow')).toBe('99');

    click('.cards button', STORM);
    click('app-widget-check fieldset button', 2);
    expect(el.querySelectorAll('.cards .done')).toHaveLength(0);
    key('Time after the flush', 'End');
    expect(text('app-widget-check .explain')[0]).toMatch(/^Every request misses/);
    expect(el.querySelectorAll('.cards .done')).toHaveLength(1);
    expect(button('Flush the cache').disabled).toBe(false);
  });

  it('with motion, Replay and Flush during a running flush, and Replay inside a flush experiment, play from 0% hits', () => {
    const { click, button, text, slider } = setup({ motion: true });
    const atStart = () => {
      expect(slider('Cache hit rate').getAttribute('aria-valuetext')).toBe(
        `Target ${slider('Cache hit rate').getAttribute('aria-valuenow')}% hits; now 0% while the cache refills`,
      );
      expect(text('.warm')).toEqual([]);
      expect(text('.value.readout')).toEqual(['timing out', 'timing out']);
    };
    click('.actions button');
    atStart();
    button('Replay').click();
    TestBed.tick();
    atStart();
    button('Flush the cache').click();
    TestBed.tick();
    atStart();
    click('.cards button', STORM);
    click('app-widget-check fieldset button', 2);
    button('Replay').click();
    TestBed.tick();
    expect(text('app-widget-check .explain')[0]).toMatch(/^Every request misses/);
    atStart();
  });

  it('meets the challenge when the handle brings the mean under the goal', () => {
    const { click, key, text, el } = setup();
    click('.cards button', CACHE_EXPERIMENTS.length - 1);
    expect(text('.status')).toEqual(['Mean now 21 ms; the goal is under 3 ms.']);
    key('Cache hit rate', 'ArrowRight', 3);
    expect(text('.status')).toEqual(['Mean now 3 ms; the goal is under 3 ms.']);
    expect(el.querySelector('.status.met')).toBeNull();
    key('Cache hit rate', 'ArrowRight');
    expect(text('.status')).toEqual(['Goal met: mean 2 ms, under 3 ms.']);
    expect(el.querySelector('.status.met')).not.toBeNull();
    expect(text('.reveal')[0]).toMatch(/^The mean is under 3 ms from 99.5% hits/);
  });
});
