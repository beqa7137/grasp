import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CAPACITY_BASELINE,
  CAPACITY_EXPERIMENTS,
  capacityActOf,
  capacityRun,
  renderExperiment,
  type CapacitySettings,
  type ExperimentSpec,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './capacity-claims.testing';
import { CapacityWidgetComponent } from './capacity-widget.component';
import { NOTHING_HIDDEN, TIERS, actChange, hiding, rampNotice, rampStory, summary, type Hid } from './capacity-words';

@Component({
  selector: 'app-capacity-test-host',
  imports: [CapacityWidgetComponent],
  template: `<app-capacity-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = CAPACITY_EXPERIMENTS;
}

const exp = (id: string) => CAPACITY_EXPERIMENTS.find((e) => e.id === id)!;
/** Questions with a region missing from their hide lists: leaks the sweep must catch. */
const LEAKY: readonly ExperimentSpec[] = [
  { ...exp('tenfold'), hide: [] },
  { ...exp('cache'), hide: [] },
];
@Component({
  selector: 'app-capacity-leaky-host',
  imports: [CapacityWidgetComponent],
  template: `<app-capacity-widget [experiments]="experiments" />`,
})
class LeakyHost {
  readonly experiments = LEAKY;
}

const SHOWN = CAPACITY_EXPERIMENTS.map(renderExperiment);
const LONG_MS = 300_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const setupOf = (id: string) => capacityRun(exp(id).setup).settings;
const actOf = (id: string) => capacityActOf(exp(id));

/** While a question asks or its answer plays, no rendered or accessible text of the widget may hold its answer. */
const GIVEAWAYS: Record<string, string[]> = {
  tenfold: ['bottleneck', '÷ 2', '= 4,000 requests', 'limit 4,000 requests', 'Served 4,000', '4,000 requests a second'],
  cache: ['21,053/s', '21,000/s', '5.3×', '0.38', '21,053'],
  replay: ['61.3%', '61%', '32,653', '900', 'replay'],
  zone: ['1,000/s shed', '9,000/s', '111.1%', 'Full', 'bottleneck'],
  slow: ['1,200/s', ' 200/s', '13.3%', '4,800/s', 'workers bind', 'Full', 'would need'],
};

/** E1's ramp passes 4,000 requests a second on its way to 10,000: the traffic says it, as the stream's width does. */
const PLAY_ALLOWS: Record<string, string[]> = { tenfold: ['4,000 requests a second'] };

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
  let now = 0;
  let frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const animate = vi.fn(
    () => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), finish: vi.fn(), playState: 'running' }) as unknown as Animation,
  );
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
  const widget = el.querySelector('app-capacity-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const slider = () => el.querySelector<HTMLElement>('[role="slider"]')!;
  const key = async (target: HTMLElement, k: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const step = (name: string) => el.querySelector<HTMLButtonElement>(`button.step[aria-label="${name}"]`)!;
  const option = (name: string) =>
    [...el.querySelectorAll<HTMLInputElement>('.controls input')].find((i) => clean(i.closest('label')!).includes(name))!;
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
      ...[...widget.querySelectorAll('g-stage text, g-stage .tier-lines p, .controls, .describe, .caption')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label], g-stage [aria-valuetext]')].flatMap((e) => [
        e.getAttribute('aria-label') ?? '',
        e.getAttribute('aria-valuetext') ?? '',
      ]),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const component = () => fixture.debugElement.children[0].componentInstance as CapacityWidgetComponent;
  const ids = (selector: string) => [...svg().querySelectorAll(selector)].map((n) => n.getAttribute('data-id')!);
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return {
    el,
    widget,
    text,
    svg,
    slider,
    key,
    play,
    step,
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
    revealed,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function plantLeak(c: CapacityWidgetComponent, leak: (h: Hid) => Hid) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed(() => leak(real())) });
}

/**
 * What the open question must not show, on every surface: its answer's words and false claims in any text, and the
 * marks its hidden regions would draw (prevention 1 and 2). `e` is the real question, so what it hides comes from its
 * own list: a leaky copy or a leaky hiding map is caught.
 */
function giveaways(t: Setup, e: ExperimentSpec, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const words = t.said();
  const allow = phase === 'playing' ? (PLAY_ALLOWS[e.id] ?? []) : [];
  for (const g of GIVEAWAYS[e.id]) if (words.includes(g) && !allow.includes(g)) out.push(`"${g}"`);
  for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`false claim ${g}`);
  const svg = t.svg();
  const has = (sel: string) => !!svg.querySelector(sel);
  if (!t.play().disabled) out.push('Play is enabled');
  if (t.slider().getAttribute('aria-disabled') !== 'true') out.push('the traffic handle is enabled');
  for (const b of t.el.querySelectorAll<HTMLButtonElement>('button.step'))
    if (b.getAttribute('aria-disabled') !== 'true') out.push(`${b.getAttribute('aria-label')} is enabled`);
  if (!t.el.querySelector<HTMLFieldSetElement>('fieldset.conditions-control')!.disabled) out.push('the conditions are enabled');
  if (!t.describe().disabled) out.push('Describe is enabled');
  const hid = hiding(e.hide ?? [], phase, actChange(capacityRun(setupOf(e.id)), capacityRun(actOf(e.id))));
  for (const id of hid.lanes) {
    if (id === 'workers') {
      if (has('[data-id^="pool-fill-"]')) out.push('a filled worker cell while the pool waits');
      if (/\d of 100 busy/.test(words)) out.push('the pool in words while it waits');
      continue;
    }
    for (const sel of [
      `seg-${id}`,
      `notch-${id}`,
      `shed-${id}`,
      `cap-${id}`,
      `break-${id}`,
      `lost-${id}`,
      `zonetick-${id}`,
      `ghost-${id}`,
      `limit-${id}`,
    ])
      if (has(`[data-id^="${sel}"]`)) out.push(`${sel} on the hidden ${id} lane`);
    if (has(`.lane-fill[data-lane="${id}"] *, .lane-writes[data-lane="${id}"] *`)) out.push(`a fill on the hidden ${id} lane`);
    const status = [...svg.querySelectorAll(`[data-id^="status-${id}-"]`)].map((n) => n.textContent).join(' ');
    if (/\d/.test(status)) out.push(`the hidden ${id} status reads "${status}"`);
    const conv = [...svg.querySelectorAll(`[data-id^="conv-${id}-"]`)].map((n) => n.textContent).join(' ');
    if (/[÷=]/.test(conv)) out.push(`the hidden ${id} conversion reads "${conv}"`);
    if (id === 'primary' && has('[data-id^="xfer"]')) out.push('the step arrow while the primary waits');
    if (id === 'lb' || id === 'app') {
      const fleet = [...svg.querySelectorAll(`[data-id^="fleet-${id}"]`)].map((n) => n.textContent).join(' ');
      if (fleet.includes('×')) out.push(`the hidden ${id} fleet reads "${fleet}"`);
    }
  }
  if (hid.totals && /(^|[^\d.,])0 are served|nothing shed/.test(words)) out.push('a hidden total read as nothing');
  if (hid.totals && !/\?/.test([...svg.querySelectorAll('[data-id^="sink-"]')].map((n) => n.textContent).join(' ')))
    out.push('the totals while they wait');
  if (hid.lanes.size && has('.tier-box.bottleneck')) out.push('a bottleneck border while lanes hide');
  const ring = svg.querySelector('[data-id="ring"]');
  if (ring) {
    const [cx, cy] = [Number(ring.getAttribute('cx')), Number(ring.getAttribute('cy'))];
    const marks = [...svg.querySelectorAll('[data-id^="gapx-"][data-id$="-ground"]')];
    if (!marks.some((m) => Math.abs(Number(m.getAttribute('cx')) - cx) < 0.6 && Math.abs(Number(m.getAttribute('cy')) - cy) < 0.6))
      out.push("a ring off any gap's ×");
  }
  if (phase === 'asking' && has('[data-id^="ghost-"]')) out.push('a ghost while the question asks');
  if (hid.replay && has('.lane-writes[data-lane="replicas"] *')) out.push('the replay while E3 asks');
  if (hid.zones && has('[data-id^="zoneline-"], [data-id^="zone-"], [data-id^="lost-"]')) out.push('the zones while E4 asks');
  if (has('[data-id^="zonetick-"]')) out.push('an "if zone A fails" tick during a question');
  return out;
}

describe('CapacityWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting with every number from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'Of 8,000 requests a second, 6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. The load balancers are at 80%; the database primary is at 15%; the read replicas are at 82.5% each.',
    );
    const words = t.text('svg.draw text').join(' | ');
    for (const w of [
      'limit 10,000/s',
      'Full · 2,000/s shed, the bottleneck',
      '75 of 100 busy: 1,500/s × 50 ms in flight; the CPU, not the pool, is full.',
    ])
      expect(words).toContain(w);
    expect(t.slider().getAttribute('aria-valuetext')).toBe('8,000 requests a second');
    expect(t.play().getAttribute('aria-label')).toBe('Ramp the traffic up to 8,000 requests a second');
    expect(t.text('.tier-lines p')).toEqual([
      'Load balancers: 2, each 5,000 a second; limit 10,000 a second.',
      'App servers: 4, each 1,500 a second; limit 6,000 a second.',
      'Primary: 8,000 queries a second, the largest; limit 40,000 requests a second.',
      'Read replicas: 2, each 8,000 queries a second; limit 7,273 requests a second.',
    ]);
    expect(t.step('More app servers').getAttribute('aria-describedby')).toBe('capacity-tier-app');
    expect(t.step('A bigger database machine').getAttribute('aria-disabled')).toBe('true');
    expect(t.ids('[data-id^="zonetick-"]').length).toBeGreaterThan(0);
    expect(t.ids('[data-id^="seg-app-"]')).toEqual(['seg-app-B0', 'seg-app-C0', 'seg-app-A0', 'seg-app-A1']);
    expect(t.svg().querySelectorAll('*').length).toBeLessThan(500);
  });

  it(
    'changes with every stepper, toggle and key, keeps one height, and says each change in a sentence',
    async () => {
      const t = await setup();
      const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
      await t.press(t.step('More app servers'));
      expect(t.text('.notice')[0]).toMatch(/^App servers: now 5\. Of 8,000 requests a second, 7,273 are served/);
      expect(t.ids('[data-id^="ghost-app"]').length).toBeGreaterThan(0);
      expect(t.text('svg.draw text').join(' | ')).toContain('limit was 6,000/s');
      await t.key(t.slider(), 'ArrowRight');
      expect(t.slider().getAttribute('aria-valuetext')).toBe('10,000 requests a second');
      await t.key(t.slider(), 'End');
      expect(t.slider().getAttribute('aria-valuenow')).toBe('20000');
      await t.key(t.slider(), 'Home');
      expect(t.slider().getAttribute('aria-valuenow')).toBe('1000');
      await t.press(t.option('Cache reads'));
      expect(t.text('.notice')[0]).toMatch(/^Cache reads: on\. All 1,000 requests a second are served\./);
      await t.press(t.option('Zone A down'));
      expect(t.text('.tier-lines p')[0]).toBe('Load balancers: 2, 1 up after zone A, each 5,000 a second; limit 5,000 a second.');
      await t.press(t.option('Slow queries'));
      expect(t.text('.tier-lines p')[1]).toMatch(/each 200 a second, as its workers allow/);
      for (let i = 0; i < 6; i++) await t.press(t.step('More load balancers'));
      expect(t.step('More load balancers').getAttribute('aria-disabled')).toBe('true');
      await t.press(t.step('A smaller database machine'));
      expect(t.step('A smaller database machine').getAttribute('aria-disabled')).toBe('true');
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    },
    LONG_MS,
  );

  it('says what the ramp did, in a caption, when Play runs without motion, and rings the first tier to shed', async () => {
    const t = await setup();
    await t.press(t.play());
    const story = rampStory(CAPACITY_BASELINE);
    expect(t.text('.caption')).toEqual([story]);
    expect(t.text('.notice')).toEqual([story]);
    expect(t.ids('[data-id="ring"]')).toEqual(['ring']);
    expect(t.animate).not.toHaveBeenCalled();
    await t.press(t.step('Fewer app servers'));
    expect(t.text('.caption')).toEqual([]);
    expect(t.ids('[data-id="ring"]')).toEqual([]);
  });

  it(
    'ramps on one clock: each stop in turn, a shed drawn only from the stop that passes its limit, and Stop ends it',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Stop the ramp');
      const c = t.component();
      let last = 0;
      let sawShed = false;
      for (let i = 0; i < 25; i++) {
        await t.tick(100);
        // The visible notice holds no number of a stop the stage is not showing.
        if (t.play().getAttribute('aria-label') === 'Stop the ramp') expect(t.text('.notice')).toEqual([rampNotice(CAPACITY_BASELINE)]);
        const shown = c.shown();
        expect(shown.offered).toBeGreaterThanOrEqual(last);
        last = shown.offered;
        if (t.ids('[data-id="shed-app"]').length) {
          expect(shown.app.shed).toBeGreaterThan(0);
          sawShed = true;
        } else expect(shown.app.shed).toBe(0);
        expect(t.el.querySelectorAll('.particle:not([visibility="hidden"])').length).toBeLessThanOrEqual(60);
      }
      expect(sawShed).toBe(true);
      await t.press(t.play());
      expect(c.shown().offered).toBe(8000);
      expect(t.text('.notice')).toEqual([summary(capacityRun(CAPACITY_BASELINE))]);
      expect(t.play().getAttribute('aria-label')).toBe('Ramp the traffic up to 8,000 requests a second');
      expect(t.el.querySelectorAll('.particle:not([visibility="hidden"])').length).toBe(0);
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
      await t.tick(400);
      const was = t.component().shown().offered;
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 20; i++) await t.tick(100);
      expect(t.component().shown().offered).toBe(was);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 80 && t.play().getAttribute('aria-label') === 'Stop the ramp'; i++) await t.tick(100);
      expect(t.text('.notice')[0]).toMatch(/^Play stepped the traffic from 1,000 to 8,000 requests a second\./);
    },
    LONG_MS,
  );

  for (const motion of ['off', 'full'])
    it(
      `hides each question's answer on every surface while it asks and through its play, motion ${motion}`,
      async () => {
        const t = await setup({ motion });
        for (const e of SHOWN.filter((x) => !x.goal)) {
          const spec = exp(e.id);
          await t.card(at(e.id));
          const label = t.svg().getAttribute('aria-label');
          expect(t.play().getAttribute('aria-label')).toBe('Ramp the traffic, after your answer');
          expect(t.text('.notice'), e.id).toEqual(['Play and the settings this question is about wait for your answer.']);
          for (const b of t.el.querySelectorAll<HTMLButtonElement>('button.step')) await t.press(b);
          for (const k of ['ArrowRight', 'Home', 'End']) await t.key(t.slider(), k);
          await t.press(t.play());
          expect(t.svg().getAttribute('aria-label'), e.id).toBe(label);
          expect(t.text('.describe .muted'), e.id).toEqual(['Describe waits for your answer.']);
          expect(giveaways(t, spec, 'asking'), `${e.id} asking`).toEqual([]);
          await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
          for (let i = 0; i < 400 && !t.revealed(); i++) {
            expect(giveaways(t, spec, 'playing'), `${e.id} playing`).toEqual([]);
            await t.tick(60);
          }
          expect(t.describe().disabled, e.id).toBe(false);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice'), `${e.id} revealed`).toEqual([summary(t.component().model(), NOTHING_HIDDEN)]);
          for (const region of e.focus)
            expect(t.el.querySelector(`[data-focus^="${region}"]`)!.classList, `${e.id} ${region}`).toContain('focused');
        }
      },
      LONG_MS,
    );

  it(
    'catches leaks planted in copies of E1 and E2 that hide nothing',
    async () => {
      const t = await setup({ host: LeakyHost });
      await t.card(0);
      expect(giveaways(t, exp('tenfold'), 'asking')).toEqual(expect.arrayContaining(['"÷ 2"', 'seg-primary on the hidden primary lane']));
      const m = await setup({ motion: 'full', host: LeakyHost });
      await m.card(1);
      await m.choose(SHOWN[at('cache')].choices[0]);
      const caught = new Set<string>();
      for (let i = 0; i < 200 && !m.revealed(); i++) {
        for (const g of giveaways(m, exp('cache'), 'playing')) caught.add(g);
        await m.tick(60);
      }
      expect([...caught]).toEqual(expect.arrayContaining(['"21,053"', 'seg-primary on the hidden primary lane']));
    },
    LONG_MS,
  );

  it(
    'catches leaks planted in the hiding map and the setup: a ghost, the replay, the pool and the fleet’s figure',
    async () => {
      const asked = async (id: string, plant: (c: CapacityWidgetComponent) => void) => {
        const t = await setup();
        const c = t.component();
        await t.card(at(id));
        plant(c);
        await t.render();
        return giveaways(t, exp(id), 'asking');
      };
      const played = async (id: string, leak: (h: Hid) => Hid) => {
        const t = await setup({ motion: 'full' });
        plantLeak(t.component(), leak);
        const e = SHOWN[at(id)];
        await t.card(at(id));
        await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
        const caught = new Set<string>();
        for (let i = 0; i < 200 && !t.revealed(); i++) {
          for (const g of giveaways(t, exp(id), 'playing')) caught.add(g);
          await t.tick(60);
        }
        return [...caught];
      };
      const without = (h: Hid, id: string): Hid => ({ ...h, lanes: new Set([...h.lanes].filter((x) => x !== id)) });
      // E3 asked with a ghost of four replicas carried in, past a hiding map that lets ghosts show.
      expect(
        await asked('replay', (c) => {
          (c as unknown as { ghost: { set(s: CapacitySettings): void } }).ghost.set(actOf('replay'));
          plantLeak(c, (h) => ({ ...h, ghost: false }));
        }),
      ).toContain('a ghost while the question asks');
      // E3 asked with the replicas' replay shown.
      const t3 = await setup();
      plantLeak(t3.component(), (h) => ({ ...h, replay: false }));
      await t3.card(at('replay'));
      expect(giveaways(t3, exp('replay'), 'asking')).toContain('the replay while E3 asks');
      // E5 played with the pool left out of the hidden lanes, and with the app fleet's per-server figure shown.
      expect(await played('slow', (h) => without(h, 'workers'))).toEqual(
        expect.arrayContaining(['a filled worker cell while the pool waits', '"would need"']),
      );
      expect(await played('slow', (h) => without(h, 'app'))).toEqual(
        expect.arrayContaining(['the hidden app fleet reads "6 × 200/s"', '" 200/s"']),
      );
    },
    LONG_MS,
  );

  it('meets the challenge only with its one fleet, checking each bound as the ask states it', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('challenge'));
    expect(t.text('.notice')[0]).toMatch(/^Of 16,000 requests a second, 2,000 are served/);
    expect(t.play().disabled).toBe(false);
    expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
    expect(t.ids('[data-id^="zonetick-"]').length).toBeGreaterThan(0);
    expect(checks()[1]).toBe('- ·headroom: the busiest tier is full, so none: not yet');
    for (let i = 0; i < 4; i++) await t.press(t.step('More load balancers'));
    for (let i = 0; i < 9; i++) await t.press(t.step('More app servers'));
    await t.press(t.step('A bigger database machine'));
    for (let i = 0; i < 2; i++) await t.press(t.step('More read replicas'));
    expect(t.text('.status')).toEqual([]);
    await t.press(t.option('Cache reads'));
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(checks()).toEqual([
      '+ ✓served: all 16,000/s: met',
      '+ ✓headroom: the busiest tier 62.7% busy leaves 37.3%, at least 30%: met',
      '+ ✓zone A lost: nothing shed: met',
      "+ ✓machines: 29, the cache's 3 nodes among them, at most 29: met",
    ]);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('challenge')].reveal]);
    await t.press(t.step('Fewer app servers'));
    expect(t.text('.status')).toEqual(['You met it; now:']);
    expect(checks()[2]).toBe('- ·zone A lost: it held 6 of 16 app servers; the 10 left shed 1,000/s: not yet');
    await t.press(t.option('Zone A down'));
    expect(t.text('.status')).toEqual(['You met it; now:']);
  });

  it('describes every tier in a table, compact on a phone', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td, th')].map((td) => td.textContent!.trim()),
      );
    const wide = await setup();
    await wide.press(wide.describe());
    expect(wide.text('.describe .said')[0]).toBe(wide.svg().getAttribute('aria-label'));
    expect(wide.text('g-data-table thead th')).toEqual(['Tier', 'Up', 'Limit', 'Arriving', 'Busy', 'Shed']);
    expect(rows(wide)[1]).toEqual(['App servers', '4', '6,000/s', '8,000/s', 'full', '2,000/s']);
    const phone = await setup({ width: 252 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['Tier', 'Limit/s', 'In/s', 'Busy', 'Shed/s']);
    expect(rows(phone)[0]).toEqual(['LBs 2', '10,000', '8,000', '80%', '0']);
    expect(phone.text('.describe .note')).toEqual(['9 machines in all.']);
    for (const id of TIERS) expect(phone.text(`#capacity-tier-${id}`).length).toBe(1);
  });
});
