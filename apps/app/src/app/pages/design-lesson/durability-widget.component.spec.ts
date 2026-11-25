import { Component, computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DURABILITY_BASELINE as B,
  DURABILITY_CHALLENGE_SOLUTION,
  DURABILITY_EXPERIMENTS,
  durabilityPlayState,
  durabilityScenario,
  formatWhole,
  renderExperiment,
  type DurabilityScenario,
  type DurabilitySettings,
  type SdExperiment,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './durability-claims.testing';
import { DurabilityWidgetComponent } from './durability-widget.component';
import { WAIT_NOTICE, raceSentence, settingSentence, NOTHING_HIDDEN, type Hid, type HidFlag } from './durability-words';

@Component({
  selector: 'app-durability-test-host',
  imports: [DurabilityWidgetComponent],
  template: `<app-durability-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = DURABILITY_EXPERIMENTS;
}

const SHOWN = DURABILITY_EXPERIMENTS.map(renderExperiment);
const QUESTIONS = SHOWN.filter((e) => !e.goal);
const LONG_MS = 300_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const actOf = (e: SdExperiment) => ({ ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as DurabilitySettings;

/**
 * The model as it would be if what the hiding map hides were otherwise: every value a hidden region holds moved, every
 * value it leaves shown kept. Whatever the widget says outside the dock must not change, in any words.
 */
function otherwise(m: DurabilityScenario, hid: Hid): DurabilityScenario {
  let o = { ...m };
  if (hid.steps || hid.loss)
    o = {
      ...o,
      p: m.p * 2.9,
      tail: m.tail * 3.3,
      ways: m.ways + 1,
      lead: m.lead * 2.3,
      exactGap: m.exactGap * 1.7 + 0.01,
      steps: m.steps.map((st) => ({ ...st, factor: st.factor * 2.3, level: st.level * 2.7 })),
    };
  if (hid.loss)
    o = {
      ...o,
      loss: m.loss * 7.3,
      indep: m.indep * 7.3,
      nines: m.nines - Math.log10(7.3),
      perBillion: m.perBillion * 7.3,
      objectsPerLoss: m.objectsPerLoss * 1.9,
      lossEventsYear: m.lossEventsYear * 3.1,
    };
  if (hid.reads)
    o = { ...o, repairRead: Math.min(m.n - 1, m.repairRead + 1), rebuildTB: m.rebuildTB * 1.6, rebuildGbps: m.rebuildGbps * 1.6 };
  return o;
}
/** Settings a learner may have left before opening a card: every act's, the challenge's solution and the heaviest. */
const FROMS: Partial<DurabilitySettings>[] = [
  ...SHOWN.filter((e) => e.act && 'set' in e.act).map(actOf),
  { ...DURABILITY_CHALLENGE_SOLUTION },
  { scheme: 3, afr: 10, repair: 168, rack: 1 },
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
  const widget = el.querySelector('app-durability-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const tx = (id: string) => {
    const n = svg().querySelector(`[data-id="${id}"]`);
    return n ? clean(n) : null;
  };
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const stage = () => el.querySelector<HTMLButtonElement>('button.pill')!;
  const input = (name: string, label: string) =>
    [...el.querySelectorAll<HTMLInputElement>(`input[name="durability-${name}"]`)].find((i) => clean(i.closest('label')!) === label)!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  const component = () => fixture.debugElement.children[0].componentInstance as DurabilityWidgetComponent;
  /** Every word the widget shows or says outside the dock: the stage, its controls, the readout, the notice, the note, Describe. */
  const said = () =>
    [
      ...[...widget.querySelectorAll('svg.draw text, g-stage button, .controls, .model-note, .describe')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label], g-stage')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  // The counterfactual seam: the widget's model, with what is hidden moved while `blind` is on.
  const blind: WritableSignal<boolean> = signal(false);
  const c = component();
  const real = c.model;
  Object.defineProperty(c, 'model', { value: computed(() => (blind() ? otherwise(real(), c.hid()) : real())) });
  c.settings.set({ ...c.settings() });
  await render();
  /** What the widget says, compared with what it would say were the hidden values otherwise: any difference is a leak. */
  const unmoved = async (): Promise<string[]> => {
    const a = said();
    blind.set(true);
    await render();
    const b = said();
    blind.set(false);
    await render();
    if (a === b) return [];
    let i = 0;
    while (a[i] === b[i]) i++;
    return [`says what hides: "…${a.slice(Math.max(0, i - 40), i + 30)}…" against "…${b.slice(Math.max(0, i - 40), i + 30)}…"`];
  };
  return {
    el,
    widget,
    text,
    svg,
    tx,
    press,
    play,
    stage,
    input,
    card,
    choose,
    component,
    said,
    unmoved,
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
  const svg = t.svg();
  const h = new Set(e.hide);
  const playing = phase === 'playing';
  const has = (sel: string) => !!svg.querySelector(sel);
  if (!t.play().disabled) out.push('Play is enabled');
  if (!t.stage().disabled) out.push('Stage a loss is enabled');
  for (const i of t.el.querySelectorAll<HTMLInputElement>('app-durability-widget input'))
    if (!i.disabled && !i.closest('fieldset:disabled')) out.push(`a setting is live: ${i.name}`);
  if (has('[data-id^="ghost-"]') || /\b(was|before) \d/.test(svg.textContent ?? '') || /Before this change/.test(svg.textContent ?? ''))
    out.push('a ghost of an earlier setting');
  if (h.has('steps') || (h.has('after') && playing)) {
    if (has('[data-id^="row-"]')) out.push('a step row');
    if (!has('[data-id="steps-hidden"]')) out.push('no hidden steps box');
  }
  if (h.has('after') && playing) {
    if (has('[data-id="final-dot"], [data-id="final-bar"], [data-id="final-value"]')) out.push('the yearly loss drawn');
    if (t.tx('head-val-2') !== '?') out.push(`NINES reads "${t.tx('head-val-2')}"`);
    if (!/\? nines/.test(t.text('.readout')[0] ?? '')) out.push('the readout says the loss');
  }
  if (h.has('reads') && playing) {
    if (has('[data-id^="read-"]') || has('circle.read-dot')) out.push('a read stub, block or dot');
    if (!has('[data-id="reads-hidden"]') && !has('[data-id="reads-lost"]')) out.push('no hidden reads box');
  }
  if (!t.text('.notice')[0]) out.push('the notice is blank');
  if (!t.describe().disabled) out.push('Describe is live');
  return out;
}

async function giveaways(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): Promise<string[]> {
  const words = t.said();
  const out: string[] = [];
  for (const c of FALSE_CLAIMS) if (c.test(words)) out.push(`${c} in "${words.match(c)![0]}"`);
  return [...out, ...(await t.unmoved()), ...structural(t, e, phase)];
}

/** Number text in the notice, the readout, the note, Describe and the dock outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .readout, .model-note, .describe .said, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (
        /\d[\d,.]*%? (h|TB|PB|MB|Gb\/s|nines|years|a year)\b|\b1 in \d|\d \+ \d/.test(node.data) &&
        !node.parentElement!.closest('.keep, code')
      )
        out.push(node.data.trim());
    }
  }
  return out;
}

/** Replaces the widget's hiding map with one that leaks `flags`, as a code change would. */
function plantLeak(c: DurabilityWidgetComponent, flags: readonly HidFlag[]) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed((): Hid => ({ ...real(), ...Object.fromEntries(flags.map((f) => [f, false])) })) });
}

/** A code change that says a hidden value in words no list foresaw: the act's yearly loss as a decade's, while it plays. */
function plantWords(c: DurabilityWidgetComponent) {
  const real = c.readout;
  Object.defineProperty(c, 'readout', {
    value: computed(() =>
      c.playing() ? `${real()}, toward ${formatWhole(c.model().perBillion * 10)} lost a decade among a billion` : real(),
    ),
  });
}

/** Opens a question from `from`, and returns what the sweep finds while it asks, and while its answer plays. */
async function probe(t: Setup, e: SdExperiment, from: Partial<DurabilitySettings> | null, phases: ('asking' | 'playing')[]) {
  t.component().exp.active.set(null);
  if (from) for (const [k, v] of Object.entries(from)) t.component().set(k as keyof DurabilitySettings, v);
  await t.render();
  await t.card(at(e.id));
  const found = new Set<string>();
  if (phases.includes('asking')) for (const g of await giveaways(t, e, 'asking')) found.add(`asking: ${g}`);
  if (phases.includes('playing')) {
    await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
    for (let i = 0; i < 400 && !t.revealed(); i++) {
      for (const g of await giveaways(t, e, 'playing')) found.add(`playing: ${g}`);
      await t.tick(80);
    }
  }
  return [...found];
}

describe('DurabilityWidgetComponent', { timeout: 120_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting with every number from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk in its own rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model gives 9.7 nines, a yearly loss chance of 1 in 5.6 billion: among a billion such objects, on average 1 every 6 years.',
    );
    const words = t.text('svg.draw text').join(' | ');
    for (const w of [
      'stored: 3 × 1 = 3×',
      '3 full copies',
      '→c3',
      'rebuilt in 24 h',
      'none failed',
      '× 1 in 18,000',
      'Lost in a year: 1 in 5.6 billion',
      '9.7 nines',
    ])
      expect(words).toContain(w);
    expect(t.play().getAttribute('aria-label')).toBe('Play a repair');
    expect(t.stage().getAttribute('aria-pressed')).toBe('false');
    expect(t.text('.notice')).toEqual([settingSentence(durabilityScenario(B))]);
    expect(bareUnits(t)).toEqual([]);
  });

  it('changes each setting, keeps one height, says each change in a sentence and draws its ghost', async () => {
    const t = await setup();
    const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
    await t.press(t.input('repair', '168 h'));
    expect(t.text('.notice').join('')).toBe(settingSentence(durabilityScenario({ ...B, repair: 168 })));
    expect(t.tx('row-window1-value')).toBe('× 1 in 2,600 (was 1 in 18,000)');
    expect(t.tx('ghost-words')).toBe('before 9.7');
    expect(t.text('svg.draw text').join(' ')).toContain('Before this change: 9.7 nines.');
    for (const [name, label] of [
      ['scheme', '10 + 4'],
      ['afr', '10%'],
      ['rack', 'One rack'],
      ['scheme', '2 copies'],
    ] as const) {
      await t.press(t.input(name, label));
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    }
    expect(t.component().settings()).toEqual({ scheme: 0, afr: 10, repair: 168, rack: 1 });
    expect(t.text('.model-note')[0]).toContain('Here every copy shares one rack');
  });

  it('steps a play through its three moments when motion is reduced, saying each in its own words', async () => {
    const t = await setup();
    const m = durabilityScenario(B);
    const notices: string[] = [];
    await t.press(t.play());
    notices.push(t.text('.notice')[0]);
    expect(t.play().getAttribute('aria-label')).toBe('Next moment, 2 of 3');
    expect(t.tx('play-label')).toBe('Next moment, 2 of 3');
    expect(notices[0]).toBe('c3 fails, and its 24 h repair starts: a free disk will take its place.');
    expect(t.tx('head-val-2')).toBe('…');
    await t.press(t.play());
    notices.push(t.text('.notice')[0]);
    expect(notices[1]).toBe(
      'c3 is being rebuilt on a free disk, read from a surviving copy. A loss would need both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical repair none does.',
    );
    expect(t.play().getAttribute('aria-label')).toBe('Next moment, 3 of 3');
    expect(t.svg().querySelector('[data-id="disk-fill"]')).not.toBeNull();
    await t.press(t.play());
    notices.push(t.text('.notice')[0]);
    expect(notices[2]).toBe(raceSentence(m, durabilityPlayState(B, 'repair', null), 'repair', NOTHING_HIDDEN));
    expect(t.play().getAttribute('aria-label')).toBe('Play a repair');
    const staged: string[] = [];
    for (const name of ['Stage a loss: next moment, 2 of 3', 'Stage a loss: next moment, 3 of 3']) {
      await t.press(t.stage());
      expect(t.stage().getAttribute('aria-pressed')).toBe('true');
      expect(t.stage().getAttribute('aria-label')).toBe(name);
      expect(t.play().getAttribute('aria-label')).toBe(name.replace('Stage a loss: next', 'Next'));
      staged.push(t.text('.notice')[0]);
    }
    await t.press(t.stage());
    staged.push(t.text('.notice')[0]);
    expect(staged[2]).toMatch(/^Staged, not sampled: c3 fails, and before its 24 h repair ends c1 and c2 fail too\./);
    // Each press is a new moment, said in a new sentence, so a live region reads every one.
    for (const seq of [notices, staged]) for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(t.tx('staged-tag-words')).toBe('STAGED, NOT SAMPLED');
    expect(t.tx('reads-lost')).toBe('nothing is left to rebuild from');
    // A finished staged loss says what the next press does: it clears the stage back to the model.
    expect(t.stage().getAttribute('aria-label')).toBe('Stage a loss, press to clear it');
    await t.press(t.stage());
    expect(t.stage().getAttribute('aria-pressed')).toBe('false');
    expect(t.stage().getAttribute('aria-label')).toMatch(/^Stage a loss: a loss played on purpose/);
    expect(t.tx('staged-tag-words')).toBeNull();
    // A rack event takes every copy at once: its staged loss is one moment, its end, and a second press is rest.
    await t.press(t.input('rack', 'One rack'));
    await t.press(t.stage());
    expect(t.text('.notice')[0]).toMatch(/^Staged, not sampled: a rack event destroys the one rack/);
    expect(t.component().step()).toBeNull();
    expect(t.stage().getAttribute('aria-pressed')).toBe('true');
    expect(t.stage().getAttribute('aria-label')).toBe('Stage a loss, press to clear it');
    await t.press(t.stage());
    expect(t.stage().getAttribute('aria-pressed')).toBe('false');
  });

  it('names every control by its visible words first, at rest, stepping, staging, playing and while a question waits', async () => {
    const check = (t: Setup, when: string) => {
      const out: string[] = [];
      for (const i of t.el.querySelectorAll<HTMLInputElement>('app-durability-widget input')) {
        const shown = i.closest('label')!.textContent!.replace(/\s+/g, ' ').trim();
        if (!i.getAttribute('aria-label')!.startsWith(shown)) out.push(`${when}: radio "${shown}" named "${i.getAttribute('aria-label')}"`);
      }
      const pairs: [HTMLElement, string | null][] = [
        [t.play(), t.tx('play-label')],
        [t.stage(), t.stage().textContent!.trim()],
      ];
      for (const [b, shown] of pairs)
        if (!shown || !b.getAttribute('aria-label')!.startsWith(shown))
          out.push(`${when}: "${shown}" named "${b.getAttribute('aria-label')}"`);
      return out;
    };
    const found: string[] = [];
    for (const width of [252, 620]) {
      const t = await setup({ width });
      found.push(...check(t, `rest ${width}`));
      await t.press(t.input('scheme', '10 + 4'));
      found.push(...check(t, `10 + 4 ${width}`));
      await t.press(t.play());
      found.push(...check(t, `stepped ${width}`));
      await t.press(t.stage());
      found.push(...check(t, `staged ${width}`));
      await t.card(at('half'));
      found.push(...check(t, `asking ${width}`));
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      const r = await setup({ width, motion: 'full' });
      await r.press(r.play());
      await r.tick(500);
      found.push(...check(r, `running ${width}`));
      await r.card(at('window'));
      await r.choose(SHOWN[at('window')].choices[0]);
      await r.tick(500);
      found.push(...check(r, `answer playing ${width}`));
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
    expect(found).toEqual([]);
    const t = await setup();
    expect(t.el.querySelector('fieldset.repair-control')!.getAttribute('aria-label')).toBeNull();
    expect(t.el.querySelector('#durability-repair-why')!.textContent).toBe('Time to full redundancy: detect and rebuild');
  });

  it(
    'plays a repair on one clock, filling the window and the free disk by transform, and pauses while the widget host is offscreen',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Repairing, press to stop');
      await t.tick(1500);
      const fill = () => t.svg().querySelector('rect.band-fill.live')?.getAttribute('transform');
      expect(fill()).toMatch(/scale\(0\.\d+ 1\)/);
      expect(t.svg().querySelectorAll('circle.read-dot')).toHaveLength(1);
      expect(t.tx('head-val-2')).toBe('…');
      const host = t.watched.find((w) => w.el === t.widget)!;
      const before = fill();
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(200);
      expect(fill()).toBe(before);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 200 && t.component().playing(); i++) await t.tick(60);
      expect(t.tx('head-val-2')).toBe('9.7');
      expect(t.text('.notice')[0]).toMatch(/^c3 is rebuilt on a free disk in 24 h/);
      await t.press(t.input('scheme', '10 + 4'));
      await t.press(t.play());
      await t.tick(1500);
      expect(t.svg().querySelectorAll('circle.read-dot')).toHaveLength(10);
      await t.press(t.play());
      expect(t.component().playing()).toBe(false);
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
          const before = t.component().settings();
          for (const i of t.el.querySelectorAll<HTMLInputElement>('app-durability-widget input')) await t.press(i);
          await t.press(t.play());
          await t.press(t.stage());
          expect(t.component().settings()).toEqual(before);
          expect(bareUnits(t), e.id).toEqual([]);
          expect(await probe(t, e, null, ['playing']), `${e.id} playing`).toEqual([]);
          expect(t.revealed()).toBe(true);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice'), `${e.id} revealed`).toEqual([settingSentence(t.component().model())]);
          expect(t.describe().disabled, e.id).toBe(false);
          expect(bareUnits(t), `${e.id} revealed`).toEqual([]);
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus~="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  it(
    'catches a leak planted on every flag of the hiding map, each against a clean run of the same question',
    async () => {
      const leaks: [string, string, 'asking' | 'playing', HidFlag[] | 'words', Partial<DurabilitySettings> | null][] = [
        ['E2 played, its yearly loss said in other words', 'window', 'playing', 'words', null],
        ['E2 asked, the steps shown', 'window', 'asking', ['steps'], null],
        ['E4 asked, the steps shown', 'batch', 'asking', ['steps'], null],
        ['E1 played, the loss shown', 'half', 'playing', ['loss'], null],
        ['E3 played, the reads shown', 'reads', 'playing', ['reads'], null],
        ['E5 played, the steps and the loss shown', 'rack', 'playing', ['steps', 'loss'], null],
        ['E1 asked with the ghost of the setting before it', 'half', 'asking', ['ghost'], { repair: 168 }],
        ['E1 asked, the controls live', 'half', 'asking', ['waits'], null],
      ];
      const caught: Record<string, boolean> = {};
      for (const [name, id, phase, flags, ghost] of leaks) {
        const e = SHOWN[at(id)];
        const run = async (leak: boolean) => {
          const t = await setup({ motion: 'full' });
          const c = t.component();
          if (leak && flags === 'words') plantWords(c);
          else if (leak) plantLeak(c, flags as HidFlag[]);
          if (ghost) Object.defineProperty(c, 'ghostShown', { value: computed(() => ({ ...B, ...ghost }) as DurabilitySettings) });
          await t.card(at(id));
          const found =
            phase === 'asking'
              ? await giveaways(t, e, 'asking')
              : (await probe(t, e, null, ['playing'])).filter((g) => g.startsWith('playing'));
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

  it('meets the challenge only at 10 + 4 in separate racks with 72 h repairs, checking its bounds as the ask states them', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('billion'));
    expect(t.text('.notice')).toEqual([settingSentence(durabilityScenario({ ...B, afr: 5 }))]);
    expect(checks()).toEqual([
      '- ·on average 3 a year among a billion, fewer than 1 every 10 years: not yet',
      '- ·stored at 3×, at most 1.5×: not yet',
      '+ ✓a rebuild reads 1.9 Gb/s, under 10 Gb/s: met',
    ]);
    expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
    expect(t.input('afr', '2%').disabled).toBe(true);
    await t.press(t.input('scheme', '10 + 4'));
    expect(checks()[2]).toBe('- ·a rebuild reads 19 Gb/s, under 10 Gb/s: not yet');
    await t.press(t.input('repair', '72 h'));
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('billion')].reveal]);
    expect(`${t.tx('goal-words')} ${t.tx('final-words')}`).toContain('goal: 10 nines');
    await t.press(t.input('repair', '168 h'));
    expect(t.text('.status')).toEqual(['You met it; now:']);
    expect(bareUnits(t)).toEqual([]);
  });

  it('describes the model step by step in the widest form its box holds', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((td) => td.textContent!.trim()),
      );
    const wide = await setup({ width: 620 });
    await wide.press(wide.describe());
    expect(wide.text('g-data-table thead th')).toEqual(['Step', 'Factor', 'Chance a year', 'Nines']);
    expect(rows(wide)).toEqual([
      ['First failures: 3 × 2%', '0.06 a year', '0.06 a year', '1.2'],
      ['Another fails within 24 h', '× 1 in 18,000', '1 in 300,000', '5.5'],
      ['And a second', '× 1 in 18,000', '1 in 5.6 billion', '9.7'],
      ['One choice only', '× 1', '1 in 5.6 billion', '9.7'],
      ['Lost in a year', 'the exact model', '1 in 5.6 billion', '9.7'],
    ]);
    expect(wide.text('.describe .said')[1]).toContain('For copies the steps are the model exactly: a loss needs every other copy.');
    expect(bareUnits(wide)).toEqual([]);
    vi.unstubAllGlobals();
    const phone = await setup({ width: 252 });
    await phone.press(phone.input('scheme', '10 + 4'));
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['Step', 'Factor', 'Nines']);
    expect(phone.text('.describe .said')[1]).toMatch(/0\.\d+% less here\.$/);
  });
});
