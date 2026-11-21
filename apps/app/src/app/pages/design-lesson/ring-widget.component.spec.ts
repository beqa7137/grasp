import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  SHARDING_EXPERIMENTS,
  SHARD_BASELINE,
  SHARD_NAMES,
  renderExperiment,
  shardAfter,
  shardScenario,
  type ExperimentSpec,
  type SdExperiment,
  type ShardSettings,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './ring-claims.testing';
import type { RingStage } from './ring-layout';
import { RingWidgetComponent } from './ring-widget.component';
import { hiding, stageSummary, story, summary as settingSummary, swapStory, type Hid } from './ring-words';

@Component({
  selector: 'app-ring-test-host',
  imports: [RingWidgetComponent],
  template: `<app-ring-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = SHARDING_EXPERIMENTS;
}

/** Copies of E1, E3 and E5 played with nothing hidden: leaks the sweep must catch. */
const LEAKY: readonly ExperimentSpec[] = [0, 2, 4].map((i) => ({ ...SHARDING_EXPERIMENTS[i], hide: [] }));
@Component({
  selector: 'app-ring-leaky-host',
  imports: [RingWidgetComponent],
  template: `<app-ring-widget [experiments]="experiments" />`,
})
class LeakyHost {
  readonly experiments = LEAKY;
}

const SHOWN = SHARDING_EXPERIMENTS.map(renderExperiment);
const LONG_MS = 240_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

const setupOf = (spec: Pick<ExperimentSpec, 'setup'>) => ({ ...SHARD_BASELINE, ...spec.setup }) as ShardSettings;
const actOf = (spec: ExperimentSpec) => (spec.act && 'set' in spec.act ? spec.act.set : {}) as Partial<ShardSettings>;
/** The act's own numbers from the model: each count a node holds after it that none held before, and the moved count. */
function answerWords(spec: ExperimentSpec): string[] {
  const before = shardScenario(setupOf(spec));
  const after = shardAfter(setupOf(spec), actOf(spec));
  const was = new Set(Object.values(before.now.counts));
  const out = Object.values(after.now.counts)
    .filter((n) => !was.has(n))
    .map((n) => `holds ${n}`);
  if (after.change) out.push(`${after.change.moved} of`);
  return out;
}
/** While a question asks or its answer plays, no rendered or accessible text of the widget may hold its answer. */
const GIVEAWAYS: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    'mod-join': ['166 keys', '83%', '+47', '47 of them', 'other 119', 'places every key again', 'so far'],
    'ring-join': ['All 39', '+39', '13 from A', '10 from B', '5 from C', '11 from D', 'moved to E', 'E holds it', 'so far'],
    'one-point': ['107 keys', ' 107 ', '55.1%', 'A: 107', 'so far'],
    'lost-node': ['180 keys', 'to 180', '+107', 'all to C', 'C holds it', 'C is the fullest', 'so far'],
    'hot-key': ['42.3%', '19.2%', 'so far'],
  }).map(([id, words]) => [id, [...answerWords(SHARDING_EXPERIMENTS.find((x) => x.id === id)!), ...words]]),
);

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
  Element.prototype.animate = vi.fn(
    () => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), playState: 'running' }) as unknown as Animation,
  );
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
  const widget = el.querySelector('app-ring-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const replay = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const option = (name: string, label: string) =>
    [...el.querySelectorAll<HTMLInputElement>('.controls input')].find(
      (i) => (!name || i.name === name) && clean(i.closest('label')!).startsWith(label),
    )!;
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
      ...[...widget.querySelectorAll('g-stage text, .controls legend, .controls label, .controls p, .describe')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const component = () => fixture.debugElement.children[0].componentInstance as RingWidgetComponent;
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return { el, widget, text, svg, replay, option, press, card, choose, said, render, tick, watched, describe, component, revealed };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Replaces one of the widget's computed surfaces with a leaky one, as a code change would. */
function plant<T>(c: RingWidgetComponent, key: 'hid' | 'caption' | 'stage', leak: (real: T) => T) {
  const real = c[key] as unknown as () => T;
  Object.defineProperty(c, key, { value: computed(() => leak(real())) });
}

/**
 * What the open question must not show, on every surface: its answer's words and false claims in any text, and the
 * marks the answer would draw (prevention 1 and 2), asking and frame by frame through its play.
 */
function giveaways(t: Setup, e: Pick<SdExperiment, 'id'>, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const words = t.said();
  for (const g of [...GIVEAWAYS[e.id], ...FALSE_CLAIMS])
    if (typeof g === 'string' ? words.includes(g) : g.test(words))
      out.push(
        typeof g === 'string'
          ? `"${g}"`
          : `${g}: ${words.match(g)![0]} in ${words.slice(Math.max(0, words.search(g) - 40), words.search(g) + 20)}`,
      );
  const svg = t.svg();
  if (!t.replay().disabled) out.push('Replay is enabled');
  const caption = t.text('#ring-down-hint')[0];
  for (const m of SHARD_NAMES) if (new RegExp(`\\b${m}\\b`).test(caption)) out.push(`the down caption names ${m}`);
  if (words.includes('watch which keys move')) out.push('the free line while the controls wait');
  if (svg.querySelector('.key.moved, .hot-block.moved, .hot-moved')) out.push('a hollow key');
  if (svg.querySelector('.landing')) out.push('a landing ring');
  if (phase === 'asking') {
    if (svg.querySelector('.fly, .sweep')) out.push('a flight or the sweep while it asks');
    if (svg.querySelector('[data-id="row-in"], [data-id="row-out"]')) out.push('an in or out row while it asks');
    if (!words.includes('LAST CHANGE · NONE YET')) out.push('a last change while it asks');
  } else {
    // The stage's summary is the setup's while the answer plays, word for word.
    const spec = SHARDING_EXPERIMENTS.find((x) => x.id === e.id)!;
    const start = shardScenario(setupOf(spec));
    const want = stageSummary(start, hiding(spec.hide ?? [], 'playing'), start);
    if (svg.getAttribute('aria-label') !== want) out.push(`the stage summary "${svg.getAttribute('aria-label')}"`);
    for (const c of svg.querySelectorAll('[data-id^="cell-"]'))
      if (!/^(\?|down|left)$/.test(c.textContent!.trim())) out.push(`a table cell "${c.textContent}"`);
    if (/^\d/.test(t.text('[data-id="moved-count"]')[0] ?? '')) out.push('a count in the headline');
  }
  return out;
}

/** Plays an answer to its reveal, collecting what the sweep finds on every frame. */
async function playThrough(t: Setup, e: SdExperiment, check = true): Promise<string[]> {
  const caught = new Set<string>();
  await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
  for (let i = 0; i < 400 && !t.revealed(); i++) {
    if (check) for (const g of giveaways(t, e, 'playing')) caught.add(g);
    if (t.describe().disabled === false) caught.add('Describe is open');
    await t.tick(50);
  }
  return [...caught];
}

describe('RingWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'A consistent-hash ring with 100 points a node puts the 200 keys on 4 nodes: A holds 53, B holds 50, C holds 50 and D holds 47.',
    );
    expect(t.replay().getAttribute('aria-label')).toBe('Replay the last change: none yet');
    expect(t.replay().disabled).toBe(true);
    expect(t.svg().querySelectorAll('circle[data-id^="k"]')).toHaveLength(200);
    expect(t.svg().querySelectorAll('circle[data-id^="p"]')).toHaveLength(200);
    expect(t.text('#ring-down-hint')).toEqual(['A would fail: its keys must move']);
  });

  it(
    'says a change of the node set in its story, keeps one height, and replays it',
    async () => {
      const t = await setup();
      const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
      await t.press(t.option('ring-nodes', '5'));
      expect(t.text('.notice')).toEqual([
        'E joined, and 39 of the 200 keys moved. All 39 moved to E: 13 from A, 10 from B, 5 from C and 11 from D. An even share for E is 40 (200 / 5).',
      ]);
      expect(t.svg().querySelectorAll('.key.moved[data-id^="p"]')).toHaveLength(39);
      expect(t.replay().disabled).toBe(false);
      await t.press(t.option('ring-scheme', 'hash mod N'));
      expect(t.text('[data-id="verdict-label"]')).toEqual(['LAST CHANGE · NONE YET']);
      await t.press(t.option('', 'Busiest node down'));
      expect(t.text('[data-id="verdict-label"]')[0]).toMatch(/^LAST CHANGE · [A-E] WENT DOWN$/);
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    },
    LONG_MS,
  );

  it(
    'plays a change on one clock, pausing while the widget host is offscreen, and lands on the story',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.option('ring-nodes', '5'));
      expect(t.text('.notice')).toEqual(['The keys that change node are moving.']);
      // A free play brings the piles into view, as an answer's play does.
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      expect(t.replay().getAttribute('aria-label')).toBe('Stop the replay');
      const host = t.watched.find((w) => w.el === t.widget)!;
      let landed = 0;
      for (let i = 0; i < 20; i++) {
        await t.tick(80);
        const now = t.svg().querySelectorAll('.key.moved[data-id^="p"]').length;
        expect(now).toBeGreaterThanOrEqual(landed);
        landed = now;
        // The hand and each key in flight are drawn once, by the every-frame marks, never again by the stage.
        expect(t.svg().querySelectorAll('.sweep').length).toBeLessThanOrEqual(1);
        const flying = [...t.svg().querySelectorAll('.fly')].map((el) => el.getAttribute('data-id'));
        expect(new Set(flying).size).toBe(flying.length);
      }
      const was = t.component().frac();
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(100);
      expect(t.component().frac()).toBe(was);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 80 && t.component().frac() !== null; i++) await t.tick(60);
      expect(t.component().frac()).toBeNull();
      expect(t.text('.notice')[0]).toMatch(/^E joined, and 39 of the 200 keys moved\./);
      expect(t.svg().querySelectorAll('.key.moved[data-id^="p"]')).toHaveLength(39);
    },
    LONG_MS,
  );

  for (const motion of ['off', 'full'])
    it(
      `hides each question's answer on every surface while it asks and through its play, motion ${motion}`,
      async () => {
        const t = await setup({ motion });
        // A change of the learner's own before the cards: no trace of it may show while a question asks.
        await t.press(t.option('ring-nodes', '6'));
        for (let i = 0; i < 80 && t.component().frac() !== null; i++) await t.tick(60);
        for (const e of SHOWN.filter((x) => !x.goal)) {
          await t.card(at(e.id));
          const summary = t.svg().getAttribute('aria-label');
          expect(t.replay().getAttribute('aria-label')).toBe('Replay the last change, after your answer');
          expect(t.text('.notice'), e.id).toEqual(['Replay and the settings wait for your answer.']);
          for (const [n, l] of [
            ['ring-scheme', 'hash mod N'],
            ['ring-points', '10'],
            ['ring-nodes', '3'],
            ['', 'A hot key'],
            ['', 'Busiest node down'],
          ])
            await t.press(t.option(n, l));
          await t.press(t.replay());
          expect(t.svg().getAttribute('aria-label'), e.id).toBe(summary);
          expect(t.describe().disabled, e.id).toBe(true);
          expect(giveaways(t, e, 'asking'), `${e.id} asking`).toEqual([]);
          expect(await playThrough(t, e), `${e.id} playing`).toEqual([]);
          expect(t.describe().disabled, e.id).toBe(false);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice')[0], `${e.id} revealed`).toBe(story(t.component().model()));
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus^="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  for (const motion of ['off', 'full'])
    it(
      `catches leaks planted in copies of E1, E3 and E5 that hide nothing, motion ${motion}`,
      async () => {
        const t = await setup({ motion, host: LeakyHost });
        const expected: Record<string, string> = { 'mod-join': '"166 of"', 'one-point': '"107 keys"', 'hot-key': '"42.3%"' };
        for (const [i, e] of LEAKY.map(renderExperiment).entries()) {
          await t.card(i);
          const caught = await playThrough(t, e);
          // Without motion the answer reveals at once; what it shows then is what an unhidden play would.
          if (motion === 'off') caught.push(...giveaways(t, e, 'playing'));
          expect(caught, e.id).toContain(expected[e.id]);
        }
      },
      LONG_MS,
    );

  it(
    "catches the act's summary planted on the stage while E3 and E4 play",
    async () => {
      for (const id of ['one-point', 'lost-node']) {
        const t = await setup({ motion: 'full' });
        const c = t.component();
        plant<RingStage>(c, 'stage', (st) => ({ ...st, summary: settingSummary(c.model()) }));
        await t.card(at(id));
        const caught = await playThrough(t, SHOWN[at(id)]);
        expect(
          caught.some((g) => g.startsWith('the stage summary')),
          id,
        ).toBe(true);
        expect(caught, id).toEqual(expect.arrayContaining([id === 'one-point' ? '"holds 107"' : '"holds 180"']));
      }
    },
    LONG_MS,
  );

  it(
    'catches leaks planted in the hiding map and the down caption',
    async () => {
      // E4 played with its region hidden in the wrong phase: the failure's counts show while the answer plays.
      const t = await setup({ motion: 'full' });
      plant<Hid>(t.component(), 'hid', (h) => (h.after ? hiding(['after'], 'playing', { after: 'asking' }) : h));
      await t.card(at('lost-node'));
      expect(await playThrough(t, SHOWN[at('lost-node')])).toEqual(expect.arrayContaining(['"+107"']));
      // E1 asked with the toggle's caption taken from the unlocked setting: it names the node that would fail.
      const u = await setup({ motion: 'full' });
      plant<string>(u.component(), 'caption', () => 'A would fail: its keys must move');
      await u.card(at('mod-join'));
      expect(giveaways(u, SHOWN[at('mod-join')], 'asking')).toContain('the down caption names A');
    },
    LONG_MS,
  );

  it(
    'meets the challenge only with a ring of 5 nodes, 100 points each and the hot key split',
    async () => {
      const t = await setup();
      const checks = () =>
        [...t.el.querySelectorAll('.checks li')].map(
          (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
        );
      await t.card(at('survive'));
      expect(t.text('.notice')[0]).toMatch(/^Placing by hash mod 3 puts the 200 keys on the 3 nodes left with C down/);
      expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
      expect(checks()[0]).toBe('- ·the busiest shard left carries 59.8% of the traffic, needs under 30%: not yet');
      expect(t.text('.goal-mini')).toEqual(['1 of 3 met: busiest shard not yet · keys moved not yet · nodes met']);
      await t.press(t.option('ring-scheme', 'Consistent hashing'));
      await t.press(t.option('ring-points', '100'));
      await t.press(t.option('ring-nodes', '5'));
      expect(t.text('.status')).toEqual([]);
      const was = t.component().model().downNode!;
      await t.press(t.option('', 'Split'));
      expect(t.text('.status')).toEqual(['Goal met:']);
      // Splitting the key makes another node the busiest, so the node down changes, and the notice says why.
      expect(t.component().model().downNode).not.toBe(was);
      expect(t.text('.notice')).toEqual([swapStory(t.component().model(), was)]);
      expect(t.text('.notice')[0]).toMatch(
        /^With the hot key split, E is the busiest node, so E is the one down instead of A\. E went down,/,
      );
      expect(checks()).toEqual([
        '+ ✓the busiest shard left carries 27.6% of the traffic, needs under 30%: met',
        '+ ✓the failure moved 39 keys, needs fewer than 50: met',
        '+ ✓the cluster has 5 nodes, needs fewer than 6: met',
      ]);
      expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('survive')].reveal]);
      await t.press(t.option('ring-points', '10'));
      expect(t.text('.status')).toEqual(['You met it; now:']);
      await t.press(t.option('ring-points', '100'));
      // Bringing the down node back is a return, not a join, whatever its letter.
      await t.press(t.option('', 'Busiest node down'));
      expect(t.text('[data-id="verdict-label"]')).toEqual(['LAST CHANGE · E CAME BACK']);
      expect(t.text('.notice')[0]).toMatch(/^E came back, and 39 of the 200 keys moved\./);
      expect(t.text('.notice')[0]).not.toContain('An even share for E');
    },
    LONG_MS,
  );

  it(
    'names each control the same at every width, inside its accessible name, as the learner text names it',
    async () => {
      const names = (t: Setup) =>
        [...t.el.querySelectorAll<HTMLInputElement>('.controls input')].map((input) => {
          const label = input.closest('label')!.cloneNode(true) as HTMLElement;
          label.querySelectorAll('small').forEach((s) => s.remove());
          const visible = label.textContent!.replace(/\s+/g, ' ').trim();
          return { visible, name: input.getAttribute('aria-label') ?? visible };
        });
      const legends = (t: Setup) =>
        [...t.el.querySelectorAll('.controls legend')].map((l) => l.firstChild!.textContent!.replace(/\s+/g, ' ').trim());
      const said = SHOWN.flatMap((e) => [e.ask, e.reveal, ...e.choices]).join(' ');
      const named = [...said.matchAll(/\b(?:Turn on|Turn off|Set|Tap|Pick) ([A-Z][^.,:;]*)/g)].map((m) => m[1]);
      expect(named.length).toBeGreaterThan(0);
      let first: string[] | undefined;
      for (const width of [252, 300, 340, 356, 393, 620]) {
        const t = await setup({ width });
        const controls = names(t);
        for (const c of controls) expect(c.name.toLowerCase(), `at ${width}`).toContain(c.visible.toLowerCase());
        const labels = [...controls.map((c) => c.visible), ...legends(t)];
        first ??= labels;
        expect(labels, `the labels at ${width}`).toEqual(first);
        for (const n of named)
          expect(
            labels.some((l) => n.startsWith(l)),
            `"${n}" at ${width}`,
          ).toBe(true);
      }
    },
    LONG_MS,
  );

  it(
    'describes every node in a table, compact on a phone',
    async () => {
      const rows = (t: Setup) =>
        [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
      const wide = await setup();
      await wide.press(wide.describe());
      expect(wide.text('g-data-table th')).toEqual([
        'Node',
        'Points (virtual nodes)',
        'Of the ring',
        'Keys',
        'Traffic',
        'Moved in',
        'Moved out',
      ]);
      expect(rows(wide)[0]).toEqual(['A', '100', '25.3%', '53', '26.5%', 'no change yet', 'no change yet']);
      const phone = await setup({ width: 252 });
      await phone.press(phone.option('', 'Busiest node down'));
      await phone.press(phone.describe());
      expect(phone.text('g-data-table th')).toEqual(['Node', 'Keys', 'Traffic', 'In', 'Out']);
      expect(rows(phone)[0]).toEqual(['A, down', 'none', 'none', '0', '−53']);
    },
    LONG_MS,
  );
});
