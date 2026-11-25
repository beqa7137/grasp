import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CDN_BASELINE as B,
  CDN_EXPERIMENTS,
  cdnScenario,
  cdnSig3,
  formatMeanMs,
  formatRank,
  formatReqRate,
  formatShare,
  renderExperiment,
  type CdnScenario,
  type CdnSettings,
  type SdExperiment,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './cdn-claims.testing';
import { CdnWidgetComponent } from './cdn-widget.component';
import { WAIT_NOTICE, settingSentence, type Hid, type HidFlag } from './cdn-words';

@Component({
  selector: 'app-cdn-test-host',
  imports: [CdnWidgetComponent],
  template: `<app-cdn-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = CDN_EXPERIMENTS;
}

const SHOWN = CDN_EXPERIMENTS.map(renderExperiment);
const QUESTIONS = SHOWN.filter((e) => !e.goal);
const LONG_MS = 300_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const actOf = (e: SdExperiment) => ({ ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as CdnSettings;
const after = (id: string) => cdnScenario(actOf(SHOWN[at(id)]));
const before = (id: string) => cdnScenario({ ...B, ...SHOWN[at(id)].setup } as CdnSettings);

/**
 * Every figure of a scenario as the widget could print it: each numeric field through its own formatters (a rate with
 * its unit and as bare digits), the shield's only with the shield on.
 */
function figures(sc: CdnScenario): string[] {
  const rate = (v: number) => [formatReqRate(v), ...(v >= 100 ? [cdnSig3(v)] : [])];
  const shield = !!sc.settings.shield;
  return [
    ...rate(sc.edgeRps),
    ...rate(sc.missRps),
    ...rate(sc.originRps),
    formatShare(sc.edgeShare),
    formatShare(sc.originShare),
    formatMeanMs(sc.meanMs),
    formatRank(sc.edgeKnee),
    ...(shield ? [...rate(sc.shieldRps), formatShare(sc.shieldShare), formatRank(sc.shieldKnee)] : []),
    ...sc.lanes.flatMap((l) => [`edge hit ${formatShare(l.edge)}`, ...(shield ? [`shield hit ${formatShare(l.shieldHit)}`] : [])]),
  ];
}
/** The act's figures that differ from the setup's, for each answer's play: no surface may hold them until the reveal. */
function answerTokens(id: string): string[] {
  const old = figures(before(id));
  return [...new Set(figures(after(id)))].filter((t) => !old.includes(t));
}
const E1 = before('which-objects');
/** While a question asks and while its answer plays, no text of the widget outside the dock may hold these. */
const GIVEAWAYS: Record<string, string[]> = {
  'which-objects': ['12,400th', formatRank(E1.edgeKnee), formatShare(E1.lanes[2].edge), formatShare(E1.lanes[1].edge)],
  'more-locations': [...answerTokens('more-locations'), '4,390', '4,400'],
  'origin-shield': [...answerTokens('origin-shield'), '913', '910'],
  'more-traffic': [...answerTokens('more-traffic'), '13,400', '13,000'],
  'tracking-parameter': [...answerTokens('tracking-parameter'), '2,520', '2,500/s', '2,500 a second'],
};
/** Settings a learner may have left before opening a card: every act's, the challenge's solution and one more. */
const FROMS: Partial<CdnSettings>[] = [
  ...QUESTIONS.filter((e) => e.act && 'set' in e.act).map(actOf),
  { pops: 100, ttl: 300, shield: 1 },
  { rps: 1000, pops: 5 },
];

async function setup({ width = 620, motion = 'off' } = {}) {
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
  Element.prototype.animate = vi.fn(
    () => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), playState: 'running' }) as unknown as Animation,
  );
  Element.prototype.scrollIntoView = vi.fn();
  document.documentElement.setAttribute('data-motion', motion);
  const fixture = TestBed.createComponent(Host);
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
  const widget = el.querySelector('app-cdn-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const has = (selector: string) => !!svg().querySelector(selector);
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const shield = () => el.querySelector<HTMLInputElement>('label.switch input')!;
  const input = (name: string, label: string) =>
    [...el.querySelectorAll<HTMLInputElement>(`input[name="cdn-${name}"]`)].find((i) => clean(i.closest('label')!) === label)!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  const component = () => fixture.debugElement.children[0].componentInstance as CdnWidgetComponent;
  /** Every word the widget shows or says outside the dock: the stage, its names and controls, the notice, the notes. */
  const said = () =>
    [
      ...[...widget.querySelectorAll('svg.draw text, g-stage label, .controls, .model-note, .caption, .describe')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return {
    el,
    widget,
    text,
    svg,
    has,
    press,
    play,
    shield,
    input,
    card,
    choose,
    component,
    said,
    describe,
    render,
    tick,
    watched,
    revealed,
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** The structure an open question must not show: live controls, a ghost, and the marks its regions hide. */
function structural(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const h = new Set(e.hide);
  if (!t.play().disabled) out.push('Play is enabled');
  for (const i of t.el.querySelectorAll<HTMLInputElement>('app-cdn-widget input'))
    if (!i.disabled && !i.closest('fieldset:disabled')) out.push(`a setting is live: ${i.name || i.getAttribute('aria-label')}`);
  if (/It was /.test(t.said())) out.push('a ghost of an earlier setting');
  if (!/assumptions show (after your answer|at the reveal)/.test(t.text('.model-note').join(' ')))
    out.push("the model's note states the hit rule");
  if (phase === 'playing' && /after your answer|wait for your answer/.test(t.said() + t.text('.notice').join(' ')))
    out.push('an answer already given is asked for');
  if (h.has('curve') || (h.has('outcome') && phase === 'playing')) {
    if (t.has('[data-id^="band-"], circle[data-id="knee-edge"], circle[data-id="knee-shield"], [data-id^="ring-label"]'))
      out.push("the square's bands or rings");
    if (!t.has('[data-id="square-hidden"]')) out.push('no dashed box over the square');
  }
  if (h.has('curve') && phase === 'asking' && t.has('.copy, .tick-hit, .tick-miss, .ans-origin, .ans-shield, .dense'))
    out.push('a sampled outcome drawn');
  if (h.has('outcome') && phase === 'playing') {
    if (t.has('[data-id^="fill-"], [data-id^="stream-"], [data-id="trunk"]')) out.push('the flows drawn');
    for (const fig of t.svg().querySelectorAll('text[data-id="fig-edge"], text[data-id="fig-shield"], text[data-id="fig-origin"]'))
      if (!fig.textContent!.trim().startsWith('?/s')) out.push(`a tier's rate shown: ${fig.textContent!.trim()}`);
    if (t.has('.lit, .lit-row')) out.push('a lit path on a hidden flow');
    if (t.has('[data-id="mean-tick"]')) out.push('the mean tick');
    if (t.has('circle.particle')) out.push('a particle on a hidden flow');
  }
  if (!t.text('.notice')[0]) out.push('the notice is blank');
  return out;
}

function giveaways(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const words = t.said();
  const out = (GIVEAWAYS[e.id] ?? []).filter((w) => words.includes(w)).map((w) => `"${w}"`);
  for (const c of FALSE_CLAIMS) if (c.test(words)) out.push(`${c} in "${words.match(c)![0]}"`);
  return [...out, ...structural(t, e, phase)];
}

/** Number text in the notice, the story, the notes and Describe outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .caption, .model-note, .describe .said, .describe .note, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (
        /\d[\d,.]*(%|\/s)? (ms|minutes?|seconds?|hours?|locations?|URLs|times|a second)\b/.test(node.data) &&
        !node.parentElement!.closest('.keep, code, .model-note.set span')
      )
        out.push(node.data.trim());
    }
  }
  return out;
}

/**
 * Makes the widget print a figure past its hiding map, as code that ignores `hid` would: the edge's rate in its tier
 * label, or the shield's rate at the end of the step line.
 */
function plantBypass(c: CdnWidgetComponent, where: 'edge-fig' | 'step') {
  if (where === 'step') {
    const real = c.step;
    const leaked = computed(() => `${real()} The shield answers ${formatReqRate(c.model().shieldRps)}.`);
    Object.defineProperty(c, 'step', { value: leaked });
    return;
  }
  const real = c.over;
  const leaked = computed(() =>
    real().map((p) =>
      p.k === 'text' && p.id === 'fig-edge'
        ? { ...p, spans: [{ ...p.spans[0], t: formatReqRate(c.model().edgeRps) }, ...p.spans.slice(1)] }
        : p,
    ),
  );
  Object.defineProperty(c, 'over', { value: leaked });
}

/** Replaces the widget's hiding map with one that leaks `flags`, as a code change would. */
function plantLeak(c: CdnWidgetComponent, flags: readonly HidFlag[]) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed((): Hid => ({ ...real(), ...Object.fromEntries(flags.map((f) => [f, false])) })) });
}

/** Opens a question from `from`, and returns what the sweep finds while it asks, and, with motion, while its answer plays. */
async function probe(t: Setup, e: SdExperiment, from: Partial<CdnSettings> | null, phases: ('asking' | 'playing')[]) {
  t.component().exp.active.set(null);
  await t.render();
  if (from) for (const [k, v] of Object.entries(from)) t.component().set(k as keyof CdnSettings, v);
  await t.render();
  await t.card(at(e.id));
  const found = new Set<string>();
  if (phases.includes('asking')) for (const g of giveaways(t, e, 'asking')) found.add(`asking: ${g}`);
  if (phases.includes('playing')) {
    await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
    for (let i = 0; i < 400 && !t.revealed(); i++) {
      for (const g of giveaways(t, e, 'playing')) found.add(`playing: ${g}`);
      await t.tick(90);
    }
  }
  return [...found];
}

describe('CdnWidgetComponent', { timeout: LONG_MS }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting from the model and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'A CDN with 20 locations serves 10,000 requests a second for 100,000 images with Zipf popularity; each location keeps a copy for 1 minute after a miss. By the model, 69.2% are answered at the edge in 10 ms, and 3,080/s reach the origin, in 130 ms: a mean response of 46.9 ms. Popular objects hit and the long tail misses: objects more popular than the 2,481st hit at the edge more than half the time, and the rest less. The timeline is one random sample of the outlined location’s requests.',
    );
    const words = t.text('svg.draw text').join(' | ');
    for (const w of ['6,920/s answered at the edge', '3,080/s reach the origin', 'mean 46.9 ms', '2,481st', 'edge hit 49.8%'])
      expect(words).toContain(w);
    expect(t.svg().querySelectorAll('[data-id^="pop-"]')).toHaveLength(20);
    expect(t.play().getAttribute('aria-label')).toBe('Play 5 minutes at the outlined location');
    expect(t.text('.notice')).toEqual([settingSentence(cdnScenario(B))]);
    expect(t.text('label.switch')).toEqual(['Origin shield']);
  });

  it('never prints an answer on the stage a learner sees on load', async () => {
    for (const width of [254, 620]) {
      const t = await setup({ width });
      const words = t.said();
      for (const a of Object.values(GIVEAWAYS)
        .flat()
        .filter((w) => !['49.8%', '9.0%'].includes(w)))
        expect(words, `${width}px: "${a}"`).not.toContain(a);
      vi.unstubAllGlobals();
    }
  });

  it('changes each setting, keeps one height, says each change in a sentence and keeps its ghost in words', async () => {
    const t = await setup();
    const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
    await t.press(t.input('pops', '100'));
    expect(t.text('.notice').join('')).toBe(settingSentence(cdnScenario({ ...B, pops: 100 })));
    expect(t.said()).toContain('It was 3,080/s.');
    expect(t.svg().querySelectorAll('[data-id^="pop-"]')).toHaveLength(20);
    for (const [name, label] of [
      ['rps', '100,000/s'],
      ['ttl', '5 s'],
      ['variants', '+ utm_source'],
    ] as const) {
      await t.press(t.input(name, label));
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    }
    await t.press(t.shield());
    expect(t.component().settings()).toEqual({ rps: 100_000, pops: 100, ttl: 5, shield: 1, variants: 10 });
    expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    expect(t.play().getAttribute('aria-label')).toBe('Play 25 seconds at the outlined location');
    expect(bareUnits(t)).toEqual([]);
  });

  it('writes what a play showed under the stage when motion is reduced', async () => {
    const t = await setup();
    await t.press(t.play());
    const said = t.text('.caption');
    expect(said[0]).toMatch(/^In this sample of 5 minutes at the outlined location, #1 missed \d+ times, once each time its copy expired/);
    expect(said[0]).toContain('The hit shares beside each object are the model’s.');
    expect(t.text('.notice')).toEqual(said);
    expect(t.text('svg.draw text').join(' ')).toContain('Played below the picture: motion is reduced.');
    expect(bareUnits(t)).toEqual([]);
    await t.press(t.input('ttl', '5 min'));
    expect(t.text('.caption')).toEqual([]);
  });

  it(
    'plays the timeline on one clock, rides the particle on its route, stops on Stop and pauses while the host is offscreen',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Stop the timeline');
      await t.tick(400);
      const head = () => t.svg().querySelector('line.playhead')?.getAttribute('x1');
      const x = head();
      const host = t.watched.find((w) => w.el === t.widget)!;
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(200);
      expect(head()).toBe(x);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      const steps = new Set<string>();
      const notices = new Set<string>();
      let particles = 0;
      let lit = 0;
      let last = -1;
      for (let i = 0; i < 200 && t.component().playing(); i++) {
        steps.add(t.text('svg.draw text[data-id^="step-"]').join(' '));
        notices.add(t.text('.notice')[0]);
        if (t.has('circle.particle')) particles++;
        if (t.has('rect.lit')) lit++;
        const now = Number(head() ?? Infinity);
        expect(now).toBeGreaterThanOrEqual(last);
        last = now;
        expect(t.svg().querySelector('g.sample')!.getAttribute('clip-path')).toBe('url(#cdn-clock)');
        await t.tick(60);
      }
      expect([...steps].some((s) => /^At .* of 5 minutes: #1’s copy expired; the next request misses/.test(s))).toBe(true);
      expect([...steps].some((s) => /has no live copy here, a miss: fetched from the origin, 130 ms/.test(s))).toBe(true);
      expect(particles).toBeGreaterThan(0);
      expect(lit).toBeGreaterThan(0);
      expect([...notices]).toEqual(['Playing 5 minutes at the outlined location.']);
      expect(t.text('.notice')[0]).toMatch(/^In this sample of 5 minutes at the outlined location, #1 missed/);
      expect(t.svg().querySelector('g.sample')!.getAttribute('clip-path')).toBeNull();
      await t.press(t.play());
      await t.tick(500);
      await t.press(t.play());
      expect(t.component().playing()).toBe(false);
      expect(head()).toBeUndefined();
      expect(t.text('.notice')).toEqual([settingSentence(cdnScenario(B))]);
    },
    LONG_MS,
  );

  for (const motion of ['off', 'full'])
    it(
      `hides each question's answer on every surface while it asks and through its play, from any setting, motion ${motion}`,
      async () => {
        const t = await setup({ motion });
        for (const e of QUESTIONS) {
          for (const from of [null, ...FROMS])
            expect(await probe(t, e, from, ['asking']), `${e.id} from ${JSON.stringify(from)}`).toEqual([]);
          expect(t.text('.notice'), e.id).toEqual([WAIT_NOTICE]);
          expect(t.describe().disabled).toBe(true);
          const was = t.component().settings();
          for (const i of t.el.querySelectorAll<HTMLInputElement>('app-cdn-widget input')) await t.press(i);
          await t.press(t.play());
          expect(t.component().settings()).toEqual(was);
          expect(t.text('.caption')).toEqual([]);
          expect(bareUnits(t), e.id).toEqual([]);
          expect(await probe(t, e, null, ['playing']), `${e.id} playing`).toEqual([]);
          expect(t.revealed()).toBe(true);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice'), `${e.id} revealed`).toEqual([settingSentence(t.component().model())]);
          expect(t.describe().disabled, e.id).toBe(false);
          expect(bareUnits(t), `${e.id} revealed`).toEqual([]);
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus^="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  it(
    'catches a leak planted on every flag of the hiding map, each against a clean run of the same question',
    async () => {
      const leaks: [string, string, 'asking' | 'playing', HidFlag[] | 'edge-fig' | 'step', boolean][] = [
        ["E1 asked, the square's shares shown", 'which-objects', 'asking', ['curveNumbers'], false],
        ["E1 asked, the square's bands drawn", 'which-objects', 'asking', ['curveBands'], false],
        ["E1 asked, the lanes' hit shares shown", 'which-objects', 'asking', ['laneHits'], false],
        ["E1 asked, the sample's outcomes drawn", 'which-objects', 'asking', ['laneMarks'], false],
        ["E1 asked, the settings and the model's note live", 'which-objects', 'asking', ['locked'], false],
        ["E2 played, the tiers' numbers shown", 'more-locations', 'playing', ['tierNumbers'], false],
        ['E2 played, the flows drawn', 'more-locations', 'playing', ['tierFlows'], false],
        ['E2 played, the mean shown', 'more-locations', 'playing', ['mean'], false],
        ["E3 played, the square's shares shown", 'origin-shield', 'playing', ['curveNumbers'], false],
        ["E4 played, the lanes' hit shares shown", 'more-traffic', 'playing', ['laneHits'], false],
        ['E5 asked with the ghost of the setting before it', 'tracking-parameter', 'asking', ['ghost'], true],
        ["E2 played, the edge's rate printed past the map", 'more-locations', 'playing', 'edge-fig', false],
        ["E3 played, the shield's rate on the step line", 'origin-shield', 'playing', 'step', false],
      ];
      const caught: Record<string, boolean> = {};
      for (const [name, id, phase, flags, ghost] of leaks) {
        const e = SHOWN[at(id)];
        const run = async (leak: boolean) => {
          const t = await setup({ motion: 'full' });
          const c = t.component();
          if (leak) {
            if (Array.isArray(flags)) plantLeak(c, flags);
            else plantBypass(c, flags);
          }
          await t.card(at(id));
          // The ghost a learner's change would leave, which the card's new start and the map both keep away.
          if (ghost) {
            (c as unknown as { ghost: { set(v: unknown): void } }).ghost.set(cdnScenario({ ...B, pops: 100 }));
            await t.render();
          }
          const found =
            phase === 'asking' ? giveaways(t, e, 'asking') : (await probe(t, e, null, ['playing'])).filter((g) => g.startsWith('playing'));
          vi.unstubAllGlobals();
          vi.restoreAllMocks();
          return found;
        };
        const clean = await run(false);
        caught[name] = clean.length === 0 && (await run(true)).length > 0;
      }
      expect(
        Object.entries(caught)
          .filter(([, v]) => !v)
          .map(([k]) => k)
          .join('; '),
      ).toBe('');
    },
    LONG_MS,
  );

  it('meets the challenge only at 100 locations, 5 minutes and the shield, its checklist saying "Goal met" only while it holds', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('fit-the-origin'));
    expect(t.text('.notice')).toEqual([settingSentence(cdnScenario(B))]);
    expect(t.text('.status')).toEqual(['Your goal:']);
    expect(checks()).toEqual([
      '- ·the origin takes 3,080/s, under 500/s: not yet',
      '- ·the mean response is 46.9 ms, under 18 ms: not yet',
      '+ ✓each cache keeps a copy for 1 minute, at most 5 minutes: met',
    ]);
    expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
    expect(t.play().disabled).toBe(false);
    await t.press(t.input('ttl', '5 min'));
    await t.press(t.shield());
    expect(t.text('.status')).toEqual(['Not yet:']);
    await t.press(t.input('pops', '100'));
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('fit-the-origin')].reveal]);
    expect(t.describe().disabled).toBe(false);
    await t.press(t.input('ttl', '1 h'));
    expect(t.text('.status')).toEqual(['Not yet:']);
    expect(checks()[2]).toBe('- ·each cache keeps a copy for 1 hour, at most 5 minutes: not yet');
    await t.press(t.input('ttl', '5 min'));
    await t.press(t.input('rps', '100,000/s'));
    expect(t.text('.status')).toEqual(['Not yet:']);
    expect(
      checks()
        .slice(0, 3)
        .every((c) => c.startsWith('+')),
    ).toBe(true);
    expect(checks()[3]).toBe('- ·traffic stays 10,000/s and the cache key the path only: not yet');
    await t.press(t.input('rps', '10,000/s'));
    expect(checks()).toHaveLength(3);
  });

  it('describes each count of locations, the current one marked, compact on a narrow stage', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((td) => td.textContent!.trim()),
      );
    const wide = await setup();
    await wide.press(wide.describe());
    expect(wide.text('g-data-table thead th')).toEqual([
      'Locations',
      'Nearest',
      'Edge hit',
      'Origin',
      'Origin, shield',
      'Mean',
      'Mean, shield',
    ]);
    expect(rows(wide)[2]).toEqual(['20 locations', '10 ms', '69.2%', '3,080/s', '?', '46.9 ms', '?']);
    await wide.card(at('origin-shield'));
    await wide.choose(SHOWN[at('origin-shield')].choices[0]);
    await wide.press(wide.describe());
    expect(rows(wide)[2]).toEqual(['20 locations', '10 ms', '69.2%', '3,080/s', '913/s', '46.9 ms', '30.2 ms']);
    expect([...wide.el.querySelectorAll('g-data-table tr[aria-current]')].map((r) => r.querySelector('th')!.textContent!.trim())).toEqual([
      '100 locations',
    ]);
    expect(bareUnits(wide)).toEqual([]);
    vi.unstubAllGlobals();
    const phone = await setup({ width: 254 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['PoPs', 'Edge hit', 'Origin /s', 'With shield /s', 'Mean ms']);
    expect(rows(phone)[3]).toEqual(['100', '56.1%', '4,390', '?', '57.2']);
    await phone.press(phone.shield());
    expect(rows(phone)[3]).toEqual(['100', '56.1%', '4,390', '913', '28.6']);
  });
});
