import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LATENCY_BASELINE,
  LATENCY_EXPERIMENTS,
  latencyScenario,
  renderExperiment,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './latency-claims.testing';
import { LatencyWidgetComponent } from './latency-widget.component';
import { NOTHING_HIDDEN, changeNotice, sameConfig, type Hid } from './latency-words';

@Component({
  selector: 'app-latency-test-host',
  imports: [LatencyWidgetComponent],
  template: `<app-latency-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = LATENCY_EXPERIMENTS;
}

/** Questions with a region missing from their hide lists: leaks the sweep must catch. */
const LEAKY: readonly ExperimentSpec[] = [
  { ...LATENCY_EXPERIMENTS[0], hide: ['numbers'] },
  { ...LATENCY_EXPERIMENTS[1], hide: ['after'] },
  { ...LATENCY_EXPERIMENTS[1], hide: ['ahead'] },
];
@Component({
  selector: 'app-latency-leaky-host',
  imports: [LatencyWidgetComponent],
  template: `<app-latency-widget [experiments]="experiments" />`,
})
class LeakyHost {
  readonly experiments = LEAKY;
}

const SHOWN = LATENCY_EXPERIMENTS.map(renderExperiment);
/** The sweep and the plays sample frame by frame: many renders, longer than a unit test's default. */
const LONG_MS = 120_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

/** While a question asks, no rendered or accessible text of the widget may hold its answer. */
const GIVEAWAYS: Record<string, string[]> = {
  'idle-yet-waiting': [
    'of requests wait',
    'waiting now',
    'waiting at',
    '20 ms',
    '10 ms waiting',
    'longest',
    'idle',
    'first in line',
    'Just left',
    'nobody wait',
    'Nobody wait',
  ],
  knee: ['90 ms waiting', '461 ms', '69 ms', '3×', '100 ms (Little', '× 100 ms'],
  pool: ['7.46', '7.5 ms', '59.6%', '57.4%', '69 ms', '17 ms', 'shared queue hands'],
  steady: ['45 ms', '229 ms', '55 ms', 'the rest take exactly'],
  'lose-one': [
    'No steady state',
    'no steady state',
    'of capacity',
    '120%',
    'grows',
    'without bound',
    '200/s',
    'starting empty',
    'from empty',
    'first 4 s',
    'First 4 s',
    '× slower',
    'real time',
    'model:',
    'after 4 s',
    'After 4 s',
    'the end,',
  ],
};
/** A sample's words are its own play's payoff, so E1's play may show them. */
const PLAY_ALLOWS: Record<string, string[]> = {
  'idle-yet-waiting': ['waiting now', 'waiting at', 'idle', 'first in line', 'longest', 'nobody wait', 'Nobody wait'],
};

async function setup({ width = 620, motion = 'off', host = Host as typeof Host | typeof LeakyHost } = {}) {
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
  const watched: { el: Element; report: IntersectionObserverCallback }[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly report: IntersectionObserverCallback) {}
      observe(el: Element) {
        watched.push({ el, report: this.report });
      }
      disconnect() {}
    },
  );
  // A hand-driven clock: each tick runs the frames waiting and advances time by `ms`.
  let now = 0;
  let frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), playState: 'running' }) as unknown as Animation);
  Element.prototype.animate = animate;
  Element.prototype.scrollIntoView = vi.fn();
  document.documentElement.setAttribute('data-motion', motion);
  const fixture = TestBed.createComponent(host);
  const render = async () => {
    for (let i = 0; i < 6; i++) {
      TestBed.tick();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
    }
  };
  const tick = async (ms: number) => {
    now += ms;
    const due = [...frames.values()];
    frames = new Map();
    for (const cb of due) cb(now);
    await render();
  };
  await render();
  const el = fixture.nativeElement as HTMLElement;
  const widget = el.querySelector('app-latency-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const slider = () => el.querySelector<HTMLElement>('[role="slider"]')!;
  const key = async (target: HTMLElement, k: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const option = (label: string) =>
    [...el.querySelectorAll<HTMLInputElement>('.controls input')].find((i) => clean(i.closest('label')!).startsWith(label))!;
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  /** Every word the widget shows or says outside the question itself: the stage, its names, the controls, Describe. */
  const said = () =>
    [
      ...[...widget.querySelectorAll('g-stage text, .controls, .describe, .caption')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label], g-stage [aria-valuetext]')].flatMap((e) => [
        e.getAttribute('aria-label') ?? '',
        e.getAttribute('aria-valuetext') ?? '',
      ]),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const component = () => fixture.debugElement.children[0].componentInstance as LatencyWidgetComponent;
  const ids = (selector: string) => [...svg().querySelectorAll(selector)].map((n) => n.getAttribute('data-id')!);
  return {
    el,
    widget,
    text,
    svg,
    slider,
    key,
    play,
    option,
    press,
    card,
    choose,
    said,
    render,
    tick,
    animate,
    watched,
    describe,
    component,
    ids,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;
type Question = Pick<SdExperiment, 'id' | 'setup' | 'act'> & { hide?: readonly string[] };

/** The setting a question starts from and the one its act moves to. */
function settingsOf(e: Question) {
  const from = latencyScenario({ ...LATENCY_BASELINE, ...e.setup });
  return { from, act: latencyScenario({ ...from.settings, ...(e.act && 'set' in e.act ? e.act.set : {}) }) };
}

/** Text on the widget's HTML surfaces where a number and its unit could wrap apart: outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .caption, .describe .said, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (/\d (ms|s)\b/.test(node.data) && !node.parentElement!.closest('.keep, code')) out.push(node.data.trim());
    }
  }
  return out;
}

/** Replaces the widget's hiding map with a leaky one, as a code change would: the sweep must catch what it shows. */
function plantLeak(c: LatencyWidgetComponent, leak: (h: Hid) => Hid) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed(() => leak(real())) });
}

/**
 * What the open question must not show, on every surface: its answer's words and false claims in any text, and the
 * marks its hidden regions would draw (prevention 1 and 2). `hide` is the question's own list, so a leaky copy is caught.
 */
function giveaways(t: Setup, e: Question, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const words = t.said();
  const allow = phase === 'playing' ? (PLAY_ALLOWS[e.id] ?? []) : [];
  for (const g of [...GIVEAWAYS[e.id], ...FALSE_CLAIMS]) {
    if (typeof g === 'string' && allow.includes(g)) continue;
    if (typeof g === 'string' ? words.includes(g) : g.test(words)) out.push(`"${g}"`);
  }
  const svg = t.svg();
  const h = new Set(e.hide ?? []);
  const { from, act } = settingsOf(e);
  const { plot } = t.component().stage().meta;
  if (!t.play().disabled) out.push('Play is enabled');
  if (t.slider().getAttribute('aria-disabled') !== 'true') out.push('the load handle is enabled');
  if (h.has('sample') && phase === 'asking') {
    const mark = svg.querySelector('.dot.wait, .dot.serve, .tick-arr, .busy, .area-wait, .peak, .ring-arc');
    if (mark) out.push(`a sample mark while the sample waits: ${mark.getAttribute('class')}`);
    if (svg.querySelector('.lane:not(.hidden), .ring-track:not(.hidden)')) out.push('a solid lane or ring track while the sample waits');
  }
  const numbers = h.has('numbers') || (h.has('after') && phase === 'playing');
  const model = svg.querySelector('.dot.req, .dot.p50, .dot.p99, .bar-work, .bar-wait, .leader, .mtick, .chevron, .drift');
  if (numbers && model) out.push(`a model mark while the numbers wait: ${model.getAttribute('class')}`);
  if (numbers)
    for (const s of svg.querySelectorAll('text.stat'))
      if (s.textContent!.trim() !== '?') out.push(`${s.getAttribute('data-id')} reads ${s.textContent}`);
  if (h.has('numbers') && svg.querySelector('.curve.p50, .curve.p99')) out.push('a curve while the numbers wait');
  if (h.has('utilization') && phase === 'playing') {
    if (!/up · (each )?\?%/.test(words)) out.push('the servers label shows the new load');
    if (svg.querySelector('.srv.over, .xmark[data-owner="slabel"]')) out.push('an over-capacity mark while the load waits');
  }
  if (h.has('stability') && phase === 'playing' && svg.querySelector('.drift, [data-id="rate-note"]'))
    out.push("the drift or the play's speed while stability waits");
  if (h.has('after') && phase === 'playing') {
    if (svg.querySelector('.cursor')) out.push('the cursor at the new setting while the answer plays');
    // The point ghost's arrow can only aim at the new, hidden point.
    if (svg.querySelector('.ghost-arrow, .ghost-head')) out.push('a ghost arrow at the new setting while the answer plays');
    // An act that changes the configuration moves the curves themselves: none may show before the reveal.
    if (!sameConfig(from.settings, act.settings) && svg.querySelector('.curve.p50, .curve.p99'))
      out.push("the act's curves while the answer plays");
    // Nor may any plot mark but the cut stand at the new utilization.
    const rho = t.component().model().rho;
    if (rho <= 1) {
      const x = plot.px0 + rho * (plot.px1 - plot.px0);
      for (const el of svg.querySelectorAll('circle, line')) {
        if (el.matches('.cut, .gridline, .axis')) continue;
        const circle = el.tagName === 'circle';
        const xs = (circle ? ['cx'] : ['x1', 'x2']).map((a) => Number(el.getAttribute(a)));
        const ys = (circle ? ['cy'] : ['y1', 'y2']).map((a) => Number(el.getAttribute(a)));
        if (xs.some((v) => Math.abs(v - x) <= 1) && ys.some((v) => v >= plot.py0 - 1 && v <= plot.py1 + 1))
          out.push(`a mark at the new utilization while the answer plays: ${el.getAttribute('data-id')}`);
      }
    }
  }
  if (phase === 'asking' && svg.querySelector('.curve.ghost, .ghost-dot, .ghost-arrow, text[data-owner~="ghost"]'))
    out.push('a ghost of an earlier setting while the question asks');
  if (h.has('ahead')) {
    if (svg.querySelector('.curve.p50, .curve.p99') && !svg.querySelector('.cut')) out.push('the curves without their cut');
    const cut = Number(svg.querySelector('.cut')?.getAttribute('x1') ?? Infinity);
    for (const c of svg.querySelectorAll('.curve.p50, .curve.p99')) {
      const xs = [...c.getAttribute('d')!.matchAll(/[ML]([\d.]+) /g)].map((x) => Number(x[1]));
      if (Math.max(...xs) > cut + 0.6) out.push('a curve past the cut');
    }
    // The cut stands at the setup's utilization: one at the act's would run the curves on to the answer.
    const x = plot.px0 + from.rho * (plot.px1 - plot.px0);
    if (Number.isFinite(cut) && Math.abs(cut - x) > 0.6) out.push(`the cut at ${cut}, not at the setup's utilization`);
  }
  return out;
}

describe('LatencyWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting with every number from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'One server, 70% busy, requests taking 10 ms on average. The model gives p50 23 ms, p99 154 ms and a mean of 33 ms, of which 23 ms is waiting.',
    );
    const words = t.text('svg.draw text').join(' | ');
    for (const w of [
      'Queue at its longest · 10 waiting at 301 ms',
      'Server · 70% busy',
      'drawn above: the longest queue, 10',
      "2.33 in the system at once on average: 70/s × 33.3 ms (Little's law).",
      '23 ms waiting',
    ])
      expect(words).toContain(w);
    expect(t.slider().getAttribute('aria-valuetext')).toBe('70% busy, 70 requests a second');
    expect(t.play().getAttribute('aria-label')).toBe('Play the sample');
    expect(t.play().disabled).toBe(false);
    expect(t.ids('[data-id^="req-"]')).toHaveLength(11);
  });

  it(
    'moves the load by key, keeps one height, and says each change in a sentence',
    async () => {
      const t = await setup();
      const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
      await t.key(t.slider(), 'ArrowRight');
      expect(t.slider().getAttribute('aria-valuetext')).toBe('75% busy, 75 requests a second');
      expect(t.text('.notice')).toEqual(['One server, 75% busy: p99 184 ms, p50 28 ms, 75% of requests wait.']);
      await t.key(t.slider(), 'End');
      expect(t.slider().getAttribute('aria-valuenow')).toBe('98');
      await t.key(t.slider(), 'Home');
      expect(t.slider().getAttribute('aria-valuenow')).toBe('10');
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    },
    LONG_MS,
  );

  it(
    'keeps the queue and a lost server for two or more servers, and says why where the controls are',
    async () => {
      const t = await setup();
      expect(t.option('One queue').disabled).toBe(true);
      expect(t.option('A server down').disabled).toBe(true);
      expect(t.text('.controls legend')[1]).toBe('Queue · one server has one queue');
      expect(t.text('.controls .toggles label')[1]).toBe('A server down needs two or more');
      await t.press(t.option('4'));
      expect(t.option('A queue each').disabled).toBe(false);
      await t.press(t.option('A queue each'));
      await t.key(t.slider(), 'ArrowRight');
      await t.key(t.slider(), 'ArrowRight');
      expect(t.svg().getAttribute('aria-label')).toMatch(
        /^4 servers with a queue each, 80% busy with all up, requests taking 10 ms on average\./,
      );
      expect(t.text('svg.draw text').join(' | ')).toContain('Queues · S1 idle beside a line of 16 at 398 ms');
      await t.press(t.option('One queue'));
      expect(t.text('.notice')).toEqual(['4 servers with one shared queue, each 80% busy: p99 69 ms, p50 13 ms, 59.6% of requests wait.']);
      await t.press(t.option('3'));
      await t.press(t.option('A server down'));
      expect(t.text('.notice')).toEqual([
        '3 servers with one shared queue, one down, 120% of capacity: no steady state; the queue grows by 40 requests a second.',
      ]);
      expect(t.text('svg.draw text').join(' | ')).toContain('2 up · 120% of capacity');
      expect(t.slider().getAttribute('aria-valuetext')).toBe('80% busy with all 3 up, 240 requests a second');
      await t.press(t.option('1'));
      expect(t.option('A server down').checked).toBe(false);
    },
    LONG_MS,
  );

  it(
    'leaves a ghost of the setting before a change: a curve when the utilization stays, the old cursor when it moves',
    async () => {
      const t = await setup();
      await t.press(t.option('Steady work'));
      expect(t.svg().querySelector('.curve.ghost')).not.toBeNull();
      expect(t.svg().querySelector('.ghost-dot')).toBeNull();
      await t.key(t.slider(), 'ArrowLeft');
      expect(t.svg().querySelector('.curve.ghost')).toBeNull();
      expect(t.svg().querySelectorAll('.ghost-dot').length).toBeGreaterThan(0);
      await t.card(at('knee'));
      expect(t.svg().querySelector('.curve.ghost, .ghost-dot')).toBeNull();
    },
    LONG_MS,
  );

  it('says what the sample did, in a caption, when Play runs without motion', async () => {
    const t = await setup();
    await t.press(t.play());
    const story =
      'In this sample, 31 requests arrived in the last 400 ms. The line grew to 10 waiting at 301 ms; 3 were waiting at the end.';
    expect(t.text('.caption')).toEqual([story]);
    expect(t.text('.notice')).toEqual([story]);
    expect(bareUnits(t)).toEqual([]);
    expect(t.animate).not.toHaveBeenCalled();
    await t.key(t.slider(), 'ArrowRight');
    expect(t.text('.caption')).toEqual([]);
  });

  it(
    'plays the window on one clock: each request drawn from its arrival, tracked by its id, and Stop ends it',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Stop the sample');
      expect(t.svg().querySelector('[data-id="rate-note"]')!.textContent!.trim()).toBe('playing 25× slower');
      const c = t.component();
      const smp = c.sample();
      let clip = 0;
      let element: Element | null = null;
      let tracked: string | null = null;
      for (let i = 0; i < 60; i++) {
        await t.tick(100);
        const tau = c.tau()!;
        const width = Number(t.svg().querySelector('clipPath rect')!.getAttribute('width'));
        expect(width).toBeGreaterThanOrEqual(clip);
        clip = width;
        for (const id of t.ids('g.band [data-id^="req-"]'))
          expect(smp.reqs.find((r) => `req-${r.id}` === id)!.arrive).toBeLessThanOrEqual(tau);
        if (!tracked) {
          tracked = t.ids('g.band .dot.wait')[0] ?? null;
          element = tracked ? t.svg().querySelector(`g.band [data-id="${tracked}"]`) : null;
        } else if (t.svg().querySelector(`g.band [data-id="${tracked}"]`))
          expect(t.svg().querySelector(`g.band [data-id="${tracked}"]`)).toBe(element);
      }
      expect(tracked).not.toBeNull();
      await t.press(t.play());
      expect(c.tau()).toBeNull();
      expect(t.play().getAttribute('aria-label')).toBe('Play the sample');
      expect(t.text('svg.draw text').join(' | ')).toContain('Queue at its longest · 10 waiting at 301 ms');
    },
    LONG_MS,
  );

  it(
    'pauses a play while the widget host is offscreen, not one stage',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.play());
      const host = t.watched.find((w) => w.el === t.widget)!;
      await t.tick(100);
      const was = t.component().tau();
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 20; i++) await t.tick(100);
      expect(t.component().tau()).toBe(was);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 140 && t.component().tau() !== null; i++) await t.tick(100);
      expect(t.text('.notice')[0]).toMatch(/^In this sample, 31 requests arrived/);
    },
    LONG_MS,
  );

  for (const motion of ['off', 'full'])
    it(
      `hides each question's answer on every surface while it asks and through its play, motion ${motion}`,
      async () => {
        const t = await setup({ motion });
        for (const e of SHOWN.filter((x) => !x.goal)) {
          await t.card(at(e.id));
          const summary = t.svg().getAttribute('aria-label');
          expect(t.play().getAttribute('aria-label')).toBe('Play the sample, after your answer');
          expect(t.text('.notice'), e.id).toEqual(['Play and the settings wait for your answer.']);
          // Move every control: nothing moves while the question asks.
          for (const label of ['1', '2', '4', 'A queue each', 'One queue', 'Steady work', 'A server down']) await t.press(t.option(label));
          for (const k of ['ArrowRight', 'Home', 'End']) await t.key(t.slider(), k);
          await t.press(t.play());
          expect(t.svg().getAttribute('aria-label'), e.id).toBe(summary);
          expect(t.text('.caption'), e.id).toEqual([]);
          expect(t.describe().disabled, e.id).toBe(true);
          expect(giveaways(t, e, 'asking'), `${e.id} asking`).toEqual([]);
          expect(bareUnits(t), `${e.id} asking`).toEqual([]);
          await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
          for (let i = 0; i < 400 && !t.el.querySelector('app-widget-check .explain:not(.muted)'); i++) {
            expect(giveaways(t, e, 'playing'), `${e.id} playing`).toEqual([]);
            expect(t.describe().disabled, `${e.id} playing: Describe`).toBe(true);
            await t.tick(60);
          }
          expect(t.describe().disabled, e.id).toBe(false);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice'), `${e.id} revealed`).toEqual([changeNotice(t.component().model(), NOTHING_HIDDEN)]);
          expect(bareUnits(t), `${e.id} revealed`).toEqual([]);
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus^="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  for (const motion of ['off', 'full'])
    it(
      `catches leaks planted in copies of E1 and E2, motion ${motion}`,
      async () => {
        const t = await setup({ motion, host: LeakyHost });
        // E1 asked without hiding its sample: the band and the timeline show the queue the answer is about.
        await t.card(0);
        expect(giveaways(t, LATENCY_EXPERIMENTS[0], 'asking')).toContain('a solid lane or ring track while the sample waits');
        // E2 asked without cutting its curves: they run on past 70% to the answer.
        await t.card(1);
        expect(giveaways(t, LATENCY_EXPERIMENTS[1], 'asking')).toContain('the curves without their cut');
        if (motion === 'off') return;
        // E2 played without hiding the act's numbers: the headline at 90% shows the answer, and the point ghost's arrow
        // aims at the new p99.
        await t.card(2);
        await t.choose(SHOWN[1].choices[0]);
        const caught = new Set<string>();
        for (let i = 0; i < 200 && !t.el.querySelector('app-widget-check .explain:not(.muted)'); i++) {
          for (const g of giveaways(t, LATENCY_EXPERIMENTS[1], 'playing')) caught.add(g);
          await t.tick(60);
        }
        expect([...caught]).toEqual(
          expect.arrayContaining(['"461 ms"', 'stat-p99 reads 461 ms', 'a ghost arrow at the new setting while the answer plays']),
        );
      },
      LONG_MS,
    );

  it(
    "catches leaks planted in the hiding map: the act's curves while E3 plays, and a cut at E2's new load",
    async () => {
      const caughtIn = async (id: string, leak: (h: Hid, c: LatencyWidgetComponent) => Hid) => {
        const t = await setup({ motion: 'full' });
        const c = t.component();
        plantLeak(c, (h) => leak(h, c));
        const e = SHOWN[at(id)];
        await t.card(at(id));
        await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
        const caught = new Set<string>();
        for (let i = 0; i < 200 && !t.el.querySelector('app-widget-check .explain:not(.muted)'); i++) {
          for (const g of giveaways(t, e, 'playing')) caught.add(g);
          await t.tick(60);
        }
        return [...caught];
      };
      // The words' map leaves the act's curves drawn: E3's shared queue runs its p99 through 69 ms on the log axis.
      expect(await caughtIn('pool', (h) => ({ ...h, curves: false }))).toContain("the act's curves while the answer plays");
      // The widget cuts at the model's utilization, the act's 90%, instead of the setup's: the curves run on to 461 ms.
      expect(await caughtIn('knee', (h, c) => (h.ahead === null ? h : { ...h, ahead: c.model().rho }))).toEqual(
        expect.arrayContaining([expect.stringMatching(/^the cut at [\d.]+, not at the setup's utilization$/)]),
      );
    },
    LONG_MS,
  );

  it(
    'shows what each question hid once it is revealed',
    async () => {
      const t = await setup();
      await t.card(at('idle-yet-waiting'));
      expect(t.text('svg.draw text').join(' | ')).toContain('Requests arrive after your answer');
      await t.choose(SHOWN[at('idle-yet-waiting')].choices[2]);
      expect(t.text('svg.draw text').join(' | ')).toContain('10 ms waiting');
      await t.card(at('lose-one'));
      expect(t.text('svg.draw text').join(' | ')).toContain('Servers · each 80% busy');
      await t.choose(SHOWN[at('lose-one')].choices[2]);
      const words = t.text('svg.draw text').join(' | ');
      for (const w of ['2 up · 120% of capacity', 'No steady state', 'the model: +40 a second', 'before: 85 ms'])
        expect(words).toContain(w);
      expect(t.svg().querySelector('.chevron')).not.toBeNull();
    },
    LONG_MS,
  );

  it(
    'meets the challenge only with 4 servers sharing one queue at 60%, checking its bounds as the ask states them',
    async () => {
      const t = await setup();
      const checks = () =>
        [...t.el.querySelectorAll('.checks li')].map(
          (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
        );
      await t.card(at('headroom'));
      expect(t.text('.notice')).toEqual([
        '2 servers with a queue each, one down, 120% of capacity: no steady state; the queue grows by 20 requests a second.',
      ]);
      expect(t.text('.status')).toEqual([]);
      expect(checks()).toEqual([
        '- ·p99 with one server down: grows without bound, needs under 100 ms: not yet',
        '+ ✓the fleet at 60% busy with all up, at least 60%: met',
      ]);
      expect(t.play().disabled).toBe(false);
      expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
      await t.press(t.option('4'));
      expect(checks()[0]).toBe('- ·p99 with one server down: 230 ms, under 100 ms: not yet');
      await t.press(t.option('One queue'));
      expect(t.text('.status')).toEqual(['Goal met:']);
      expect(checks()[0]).toBe('+ ✓p99 with one server down: 85 ms, under 100 ms: met');
      expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('headroom')].reveal]);
      await t.key(t.slider(), 'ArrowRight');
      expect(t.text('.status')).toEqual(['You met it; now:']);
      expect(checks()[0]).toBe('- ·p99 with one server down: 121 ms, under 100 ms: not yet');
      await t.key(t.slider(), 'ArrowLeft');
      expect(t.text('.status')).toEqual(['Goal met:']);
      await t.press(t.option('1'));
      expect(t.text('.status')).toEqual(['You met it; now:']);
      expect(checks()[0]).toBe('- ·p99 with one server down: needs two or more servers: not yet');
    },
    LONG_MS,
  );

  it(
    'describes the model at every load in a table, compact on a phone, with the sample in words',
    async () => {
      const rows = (t: Setup) =>
        [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
      const wide = await setup();
      await wide.press(wide.describe());
      expect(wide.text('.describe .said')[0]).toMatch(
        /^One server, 70% busy, .* This sample: 31 requests arrived in the last 400 ms\. The line grew to 10 waiting at 301 ms; 3 were waiting at the end\.$/,
      );
      expect(wide.text('g-data-table th')).toEqual(['Load', 'Busy', 'Mean', 'p50', 'p99', 'Wait at all']);
      expect(bareUnits(wide)).toEqual([]);
      expect(rows(wide)[7]).toEqual(['70%', '70%', '33.3 ms', '23.1 ms', '154 ms', '70%']);
      expect(wide.el.querySelector('g-data-table tr.active')!.textContent).toContain('70%');
      await wide.press(wide.option('3'));
      await wide.press(wide.option('A server down'));
      expect(wide.text('g-data-table th')[1]).toBe('Load on each');
      expect(rows(wide)[9]).toEqual(['80%', '120% (over)', 'grows', 'grows', 'grows', 'all']);
      expect(wide.text('.describe .note')).toEqual(['grows: no steady state; every wait grows without bound.']);
      const phone = await setup({ width: 252 });
      await phone.press(phone.describe());
      expect(phone.text('g-data-table th')).toEqual(['Load', 'Busy', 'Mean, ms', 'p50, ms', 'p99, ms', 'Waits']);
      expect(rows(phone)[7]).toEqual(['70%', '70%', '33', '23', '154', '70%']);
    },
    LONG_MS,
  );
});
