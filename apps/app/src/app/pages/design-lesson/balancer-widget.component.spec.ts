import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LB_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { SimClient } from '../../sim/sim-client';
import type { SimRequest } from '../../sim/sim-protocol';
import { simulate } from '../../sim/simulate';
import { BalancerWidgetComponent } from './balancer-widget.component';

@Component({
  imports: [BalancerWidgetComponent],
  template: `<app-balancer-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = LB_EXPERIMENTS;
}

const SHOWN = LB_EXPERIMENTS.map(renderExperiment);
const SLOW = SHOWN.findIndex((e) => e.id === 'one-slow-server');
const GOAL = SHOWN.findIndex((e) => e.goal);

async function setup({ width = 694, fail = false } = {}) {
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
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now())));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  Element.prototype.animate = animate;
  Element.prototype.scrollIntoView = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
  document.documentElement.setAttribute('data-motion', 'off');
  const requests: SimRequest[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SimClient,
        useValue: {
          run: (r: SimRequest) => {
            requests.push(r);
            return fail ? Promise.reject(new Error('worker failed')) : Promise.resolve(simulate(r));
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  const render = async () => {
    for (let i = 0; i < 8; i++) {
      TestBed.tick();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
    }
  };
  await render();
  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
  const slider = (name: string) => el.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
  const key = async (name: string, k: string, times = 1) => {
    for (let i = 0; i < times; i++) slider(name).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const button = (name: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === name)!;
  const press = async (name: string) => {
    button(name).click();
    await render();
  };
  const card = async (i: number) => {
    el.querySelectorAll<HTMLButtonElement>('.cards button')[i].click();
    await render();
  };
  const radio = async (name: string) => {
    const input = [...el.querySelectorAll<HTMLLabelElement>('.segment')]
      .find((l) => l.textContent!.trim() === name)!
      .querySelector('input')!;
    input.click();
    await render();
  };
  const stageHeight = () => el.querySelector<HTMLElement>('g-stage .well')!.style.height;
  return { el, text, slider, key, press, card, radio, button, stageHeight, requests, render, animate };
}

describe('BalancerWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the run the worker returns: p99, the share sent to S1 against what it can keep up with, and a lane per server', async () => {
    const { text, el, requests } = await setup();
    // The cards' questions wait for a card to open; the readout's run is all the page asks for.
    expect(requests.map((r) => r.kind)).toEqual(['balance']);
    expect(text('.value.big')).toEqual(['82 ms']);
    expect(text('.caption').filter((t) => t.startsWith('S1 is sent') || t.includes('keep up'))).toEqual([
      'S1 is sent 10% of requests',
      '| it can keep up with 14.3%',
    ]);
    expect(el.querySelector('canvas.lanes')!.getAttribute('data-servers')).toBe('10');
    expect(el.querySelector('.share.bad')).toBeNull();
    expect(text('.slow-header')).toEqual(['S1 at full speed']);
    expect(text('g-histogram .legend li')).toContain('p99 82 ms');
  });

  it('slows S1 by its handle: round-robin overfeeds it and its queue holds what the reveal quotes', async () => {
    const { key, text, el, slider } = await setup();
    await key('Slow server', 'ArrowRight', 2);
    expect(slider('Slow server').getAttribute('aria-valuetext')).toBe('S1 is 5 times slower than the others');
    expect(text('.value.big')).toEqual(['64.7 s']);
    expect(text('.count').at(0)).toBe('1,379');
    expect(el.querySelector('.share.bad')).not.toBeNull();
    expect(text('.slow-header')).toEqual(['S1 is 5× slower']);
    // A block stands for enough requests that the run's longest queue fits the lane.
    expect(text('.caption').find((t) => t.startsWith('='))).toMatch(/^= (20|50|100) requests$/);
  });

  it('switches policy, sizes the fleet by the rack edge and keeps one stage height', async () => {
    const { radio, key, text, el, stageHeight } = await setup();
    const height = stageHeight();
    await radio('Least connections');
    expect(text('.value.big')).toEqual(['51 ms']);
    expect(text('.policy-name')).toEqual(['Least connections']);
    const servers = () => el.querySelector('canvas.lanes')!.getAttribute('data-servers');
    await key('Servers', 'End');
    expect(servers()).toBe('20');
    await key('Servers', 'Home');
    expect(servers()).toBe('4');
    expect(stageHeight()).toBe(height);
  });

  it('sets an experiment up in one tap, then reveals the model answer and marks where to look, at the same height', async () => {
    const { press, card, text, el, slider, stageHeight } = await setup();
    const height = stageHeight();
    await card(SLOW);
    expect(slider('Slow server').getAttribute('aria-valuenow')).toBe('1');
    expect(text('app-widget-check legend')).toEqual([SHOWN[SLOW].ask]);
    await press(SHOWN[SLOW].choices[SHOWN[SLOW].answer]);
    expect(text('app-widget-check .explain')).toEqual([SHOWN[SLOW].reveal]);
    expect(slider('Slow server').getAttribute('aria-valuenow')).toBe('5');
    for (const region of SHOWN[SLOW].focus) expect(el.querySelector(`[data-focus="${region}"]`)!.classList).toContain('focused');
    expect(stageHeight()).toBe(height);
  });

  it('meets the challenge only with least connections and the slow server kept', async () => {
    const { card, radio, text, key } = await setup();
    await card(GOAL);
    expect(text('.status')[0]).toBe('Now p99 64.7 s; the goal is under 100 ms.');
    await key('Slow server', 'Home');
    expect(text('.status')[0]).toBe('Now p99 82 ms, but the goal keeps S1 5× slower, 10 servers and 70% load.');
    await key('Slow server', 'ArrowRight', 2);
    await radio('Least connections');
    expect(text('.status')[0]).toMatch(/^Goal met: p99 81 ms/);
    expect(text('.reveal')).toEqual([SHOWN[GOAL].reveal]);
  });

  it('steps through the policy picks one press at a time without motion, showing what it looked at', async () => {
    const { press, text, el } = await setup();
    await press('Watch it choose');
    expect(text('.notice')[0]).toMatch(/^Request 1 of 12: it is S\d+'s turn \(\d+ in flight\), however long its queue\.$/);
    expect(el.querySelectorAll('rect.pick.chosen')).toHaveLength(1);
    await press('Next pick');
    expect(text('.notice')[0]).toMatch(/^Request 2 of 12/);
  });

  it('reveals what the picture shows even when a setting moved while the question was open', async () => {
    const { card, key, press, text, slider } = await setup();
    await card(SLOW);
    await key('Slow server', 'End');
    await key('Servers', 'End');
    await press(SHOWN[SLOW].choices[SHOWN[SLOW].answer]);
    expect(slider('Slow server').getAttribute('aria-valuenow')).toBe('5');
    expect(slider('Servers').getAttribute('aria-valuenow')).toBe('10');
    expect(text('.value.big')).toEqual(['64.7 s']);
    expect(text('app-widget-check .explain')).toEqual([SHOWN[SLOW].reveal]);
  });

  it('keeps the challenge status true after the learner moves on from meeting it', async () => {
    const { card, radio, text } = await setup();
    await card(GOAL);
    await radio('Least connections');
    expect(text('.status')[0]).toBe('Goal met: p99 81 ms, under 100 ms.');
    await radio('Round-robin');
    expect(text('.status')[0]).toBe('You met it at p99 81 ms; now p99 64.7 s.');
  });

  it('fills the histogram in as the time handle moves: p99 so far, then p99 of every request', async () => {
    const { key, text } = await setup();
    await key('Time in the run', 'Home');
    expect(text('svg.fleet .label')[0]).toBe('p99 so far');
    expect(text('svg.fleet .caption')[0]).toMatch(/^mean so far /);
    expect(text('g-histogram .legend li')[0]).toBe('answered so far');
    await key('Time in the run', 'ArrowRight', 30);
    expect(text('.value.big')[0]).toMatch(/ms$/);
    await key('Time in the run', 'End');
    expect(text('svg.fleet .label')[0]).toBe('p99');
    expect(text('.value.big')).toEqual(['82 ms']);
  });

  it('says when p99 runs past the run, as the queue left at its end drains', async () => {
    const { key, text } = await setup();
    expect(text('svg.fleet .label')[0]).toBe('p99');
    await key('Slow server', 'End');
    expect(text('svg.fleet .label')[0]).toBe('p99, run and drain');
    expect(text('.value.big')[0]).toMatch(/ s$/);
  });

  it('names the tie least connections breaks in turn', async () => {
    const { radio, press, text } = await setup();
    await radio('Least connections');
    await press('Watch it choose');
    expect(text('.notice')[0]).toMatch(
      /^Request 1 of 12: scans all 10(; \d+ have the fewest \(\d+ in flight\), and S\d+ is next in turn among them|, and S\d+ \(\d+ in flight\) has the fewest)\.$/,
    );
  });

  it('says so when the worker fails, keeps saying so, and offers no experiment it cannot run', async () => {
    const { text, key, el } = await setup({ fail: true });
    expect(text('.notice')).toEqual(['The simulation stopped. Reload the page to run it again.']);
    await key('Time in the run', 'Home');
    expect(text('.notice')).toEqual(['The simulation stopped. Reload the page to run it again.']);
    expect(el.querySelector('app-experiment-dock')).toBeNull();
    expect(el.querySelector('g-histogram svg')!.getAttribute('aria-label')).toBe(
      'The simulation stopped. Reload the page to run it again.',
    );
  });
});
