import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  STORAGE_BASELINE as B,
  STORAGE_CHALLENGE_SOLUTION,
  STORAGE_EXPERIMENTS,
  formatAmp,
  formatB,
  formatBytes,
  formatRate,
  formatReads,
  renderExperiment,
  storageScenario,
  type SdExperiment,
  type StorageSettings,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './storage-claims.testing';
import { StorageWidgetComponent } from './storage-widget.component';
import { REST_NOTICE, WAIT_NOTICE, settingSentence, type Hid, type HidFlag } from './storage-words';

@Component({
  selector: 'app-storage-test-host',
  imports: [StorageWidgetComponent],
  template: `<app-storage-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = STORAGE_EXPERIMENTS;
}

const SHOWN = STORAGE_EXPERIMENTS.map(renderExperiment);
const QUESTIONS = SHOWN.filter((e) => !e.goal);
const LONG_MS = 240_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const actOf = (e: SdExperiment) => ({ ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as StorageSettings;
const setupOf = (id: string) => storageScenario({ ...B, ...SHOWN[at(id)].setup } as StorageSettings);
const afterOf = (id: string) => storageScenario(actOf(SHOWN[at(id)]));

const E1 = setupOf('page-rewrite').btree;
const E2 = setupOf('lsm-rewrites').lsm;
/** While a question asks and while its answer plays, no text of the widget outside the dock may hold these. */
const GIVEAWAYS: Record<string, { both?: string[]; asking?: string[]; playing?: string[] }> = {
  'page-rewrite': {
    both: [
      formatB(E1.writeBytes),
      formatBytes(E1.writeBytes),
      formatAmp(E1.writeAmp),
      formatRate(E1.diskWriteMBps),
      `${formatB(E1.pageB)} written`,
      'written back whole',
      formatB(E1.pageB - 100),
      `+${formatB(100)}`,
      `${formatB(E1.pageB)} +`,
      'random page writes',
      '105,000',
    ],
    asking: ['written back', 'whole page', 'page back', 'rewritten in place', 'written after', 'rewritten unchanged'],
  },
  'lsm-rewrites': {
    both: [
      formatAmp(E2.writeAmp),
      formatRate(E2.diskWriteMBps),
      '≈',
      '10.5',
      `${E2.partsWritten} parts`,
      '1 log + 1 flush + 3',
      'Merge k',
      '(ratio + 1) / 2',
      ' avg',
      'on average',
      'times.',
    ],
  },
  'record-size': {
    playing: [
      formatAmp(afterOf('record-size').btree.writeAmp),
      formatRate(afterOf('record-size').btree.diskWriteMBps),
      formatB(afterOf('record-size').btree.writeBytes),
      '24×',
      'was ',
      '≈',
    ],
  },
  'no-filters': {
    both: ['every run'],
    asking: ['5 runs', '4 say', '4 runs say'],
    playing: [formatReads(afterOf('no-filters').lsm.lookupReads), '5 reads', '5 runs', 'none skipped', 'newest first', 'was '],
  },
  'more-data': {
    playing: [
      formatAmp(afterOf('more-data').lsm.writeAmp),
      formatRate(afterOf('more-data').lsm.diskWriteMBps),
      '≈',
      '42×',
      'was ',
      '5 levels ×',
    ],
  },
};
/** Settings a learner may have left before opening a card: every act's, the challenge's solution and two more. */
const FROMS: Partial<StorageSettings>[] = [
  ...SHOWN.filter((e) => e.act && 'set' in e.act).map(actOf),
  { ...STORAGE_CHALLENGE_SOLUTION },
  { page: 16, ratio: 4 },
  { data: 10, record: 200, ratio: 20, op: 1 },
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
  const widget = el.querySelector('app-storage-widget')!;
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
  const play = (engine: 'btree' | 'lsm') => el.querySelector<HTMLButtonElement>(`button.play[data-engine="${engine}"]`)!;
  const input = (name: string, label: string) =>
    [...el.querySelectorAll<HTMLInputElement>(`input[name="storage-${name}"]`)].find((i) => clean(i.closest('label')!) === label)!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  const component = () => fixture.debugElement.children[0].componentInstance as StorageWidgetComponent;
  /** Every word the widget shows or says outside the dock: the stage, its names and controls, the notice, the note, the story. */
  const said = () =>
    [
      ...[...widget.querySelectorAll('svg.draw text, g-stage label, .controls, .model-note, .caption, .describe')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return { el, widget, text, svg, tx, press, play, input, card, choose, component, said, describe, render, tick, watched, revealed };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** The structure an open question must not show: live controls, a ghost, and the marks and numbers its regions hide. */
function structural(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const svg = t.svg();
  const h = new Set(e.hide);
  const playing = phase === 'playing';
  const write = t.component().settings().op === 0;
  const digit = (id: string) => [...svg.querySelectorAll(`[data-id^="${id}"]`)].some((n) => /\d/.test(n.textContent ?? ''));
  for (const p of t.el.querySelectorAll<HTMLButtonElement>('button.play')) if (!p.disabled) out.push('a Play is enabled');
  for (const i of t.el.querySelectorAll<HTMLInputElement>('app-storage-widget input'))
    if (!i.disabled && !i.closest('fieldset:disabled')) out.push(`a setting is live: ${i.name}`);
  if (svg.querySelector('[data-id^="ghost-"]') || /was /.test(svg.textContent ?? '')) out.push('a ghost of an earlier setting');
  const writesAfter = h.has('writesAfter') && playing;
  if (h.has('btreeWrite') || writesAfter) {
    if (svg.querySelector('[data-id="write-bar-btree"]')) out.push('the B-tree write bar');
    if (t.tx('write-btree') !== '?×') out.push(`the B-tree write value reads "${t.tx('write-btree')}"`);
    if (write && t.tx('bt-total') !== null && !t.tx('bt-total')!.startsWith('?×')) out.push(`the B-tree total reads "${t.tx('bt-total')}"`);
    if (digit('log-note') || digit('page-note') || digit('bt-ledger')) out.push('a B-tree byte count');
  }
  if (h.has('btreeWrite') && !playing) {
    if (svg.querySelector('.strip.rewritten, .pg.written, [data-id="log-slice"]')) out.push('the page written back, or its log record');
    if (t.tx('bt-leaf-action')) out.push('the leaf says what happened to it');
  }
  if (h.has('lsmWrite') || writesAfter) {
    if (svg.querySelector('[data-id="write-bar-lsm"]')) out.push('the LSM write bar');
    if (t.tx('write-lsm') !== '?×') out.push(`the LSM write value reads "${t.tx('write-lsm')}"`);
    if (write) {
      if (t.tx('lsm-total') !== null && !t.tx('lsm-total')!.startsWith('?×')) out.push(`the LSM total reads "${t.tx('lsm-total')}"`);
      for (const c of svg.querySelectorAll('[data-id^="chip-"]'))
        if (c.textContent!.trim() !== '?×') out.push(`an LSM chip reads "${c.textContent}"`);
      if (digit('stair-text')) out.push('the staircase counts in words');
    }
  }
  if (h.has('lsmWrite') && !playing && svg.querySelector('[data-id="stair"]')) out.push("the level's merges drawn");
  if (h.has('readsWhy') && !playing && (/\d.* (runs|skipped)|\d runs/.test(t.tx('lsm-ledger') ?? '') || digit('filter-text')))
    out.push("the lookup's arithmetic");
  if (h.has('readsAfter') && playing) {
    if (svg.querySelector('[data-id^="pip-lsm"]')) out.push('an LSM read pip');
    const box = svg.querySelector('[data-id="pips-lsm-hidden"]');
    if (!box || Number(box.getAttribute('width')) !== 96)
      out.push(`the hidden pip box is ${box?.getAttribute('width')} px, not the row's whole scale`);
    if (t.tx('reads-lsm') !== '?') out.push(`the LSM reads value reads "${t.tx('reads-lsm')}"`);
    if (svg.querySelector('[data-id^="chip-"]')) out.push('a read chip');
    if (t.tx('lsm-total') !== null && !t.tx('lsm-total')!.startsWith('?')) out.push(`the lookup total reads "${t.tx('lsm-total')}"`);
    if (digit('lsm-ledger') || digit('filter-text')) out.push('the lookup counted in words');
  }
  if (!t.text('.notice')[0]) out.push('the notice is blank');
  return out;
}

function giveaways(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const words = t.said();
  const g = GIVEAWAYS[e.id] ?? {};
  const out = [...(g.both ?? []), ...(g[phase] ?? [])].filter((w) => words.includes(w)).map((w) => `"${w}"`);
  for (const c of FALSE_CLAIMS) if (c.test(words)) out.push(`${c} in "${words.match(c)![0]}"`);
  return [...out, ...structural(t, e, phase)];
}

/** Number text in the notice, the story, the note and Describe outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .caption, .model-note, .describe .said, .describe .note, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (/\d[\d,.]* (bytes|B|KB|MB|GB|MB\/s|levels?|runs?|disk reads?)\b/.test(node.data) && !node.parentElement!.closest('.keep, code'))
        out.push(node.data.trim());
    }
  }
  return out;
}

/** Replaces the widget's hiding map with one that leaks `flags`, as a code change would. */
function plantLeak(c: StorageWidgetComponent, flags: readonly HidFlag[]) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed((): Hid => ({ ...real(), ...Object.fromEntries(flags.map((f) => [f, false])) })) });
}

/** Opens a question from `from`, and returns what the sweep finds while it asks, and, with motion, while its answer plays. */
async function probe(t: Setup, e: SdExperiment, from: Partial<StorageSettings> | null, phases: ('asking' | 'playing')[]) {
  // Leave the open question as a learner would by moving on, then change the settings it would have held.
  t.component().exp.active.set(null);
  if (from) for (const [k, v] of Object.entries(from)) t.component().set(k as keyof StorageSettings, v);
  await t.render();
  await t.card(at(e.id));
  const found = new Set<string>();
  if (phases.includes('asking')) for (const g of giveaways(t, e, 'asking')) found.add(`asking: ${g}`);
  if (phases.includes('playing')) {
    await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
    for (let i = 0; i < 400 && !t.revealed(); i++) {
      for (const g of giveaways(t, e, 'playing')) found.add(`playing: ${g}`);
      await t.tick(60);
    }
  }
  return [...found];
}

describe('StorageWidgetComponent', { timeout: 120_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting with every number from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toContain(
      'An update writes its whole page and a log record, 4,196 bytes for 100 bytes: 42× the data.',
    );
    const words = t.text('svg.draw text').join(' | ');
    for (const w of [
      'One write, through both engines',
      '4,096 B + 100 B = 4,196 B written',
      '42× the data',
      '1 log + 1 flush + 4 levels × 5.5 avg',
      '24× the data',
    ])
      expect(words).toContain(w);
    expect(t.play('btree').getAttribute('aria-label')).toBe('Play the write through the B-tree');
    expect(t.play('lsm').getAttribute('aria-label')).toBe('Play the write through the LSM tree');
    expect(t.text('.notice')).toEqual([REST_NOTICE]);
    expect([t.text('label.toggle b'), t.text('label.toggle small')]).toEqual([['Bloom filters'], ['1.3 GB of memory']]);
  });

  it('never prints an answer on the stage a learner sees on load', async () => {
    const asked = ['8,292 B', '8,292 bytes', '82.9×', '≈10.5×', '10.5×', '33.5×', '5.1×', '5 disk reads', '29.5×'];
    for (const width of [252, 344, 620]) {
      const t = await setup({ width });
      for (const op of ['A write', 'A lookup']) {
        await t.press(t.input('op', op));
        const words = t.said();
        for (const a of asked) expect(words, `${width}px ${op}: "${a}"`).not.toContain(a);
      }
      vi.unstubAllGlobals();
    }
  });

  it('changes each setting, keeps one height, says each change in a sentence and keeps its ghost in words', async () => {
    const t = await setup();
    const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
    await t.press(t.input('page', '16 KB'));
    expect(t.text('.notice').join('')).toBe(settingSentence(storageScenario({ ...B, page: 16 })));
    expect(t.tx('write-btree')).toContain('was 42×');
    expect(t.svg().querySelector('[data-id="ghost-btree"]')).not.toBeNull();
    expect(t.svg().querySelector('[data-id="ghost-lsm"]')).toBeNull();
    for (const [name, label] of [
      ['ratio', '4'],
      ['data', '1,000 GB'],
      ['record', '1,000 B'],
      ['op', 'A lookup'],
    ] as const) {
      await t.press(t.input(name, label));
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    }
    await t.press(t.el.querySelector<HTMLInputElement>('label.toggle input')!);
    expect(t.component().settings()).toEqual({ data: 1000, record: 1000, page: 16, ratio: 4, bloom: 0, op: 1 });
    expect(t.text('label.toggle small')).toEqual(['off: no filter memory']);
    expect(t.tx('reads-lsm')).toBe('8 · was 1');
    expect(t.play('lsm').getAttribute('aria-label')).toBe('Play the lookup through the LSM tree');
  });

  it('writes what a play did under the stage when motion is reduced', async () => {
    const t = await setup();
    await t.press(t.play('btree'));
    const said = t.text('.caption');
    expect(said).toEqual([
      'The write walks 5 pages from the root to a leaf, 4 of them in memory, reads its leaf from disk, changes 100 bytes there and appends 100 bytes to the log: the write is safe and answered. Later the whole page goes back to disk, 4,096 bytes: 4,196 bytes written for 100 bytes of data, 42×.',
    ]);
    expect(t.text('.notice')).toEqual(said);
    // One live region reads the story out; the caption under the stage is only to read.
    const live = [...t.widget.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')];
    expect(live.filter((el) => el.textContent!.includes('walks 5 pages'))).toHaveLength(1);
    expect(t.tx('step-btree')).toBe('written below the picture');
    expect(bareUnits(t)).toEqual([]);
    await t.press(t.input('ratio', '20'));
    expect(t.text('.caption')).toEqual([]);
  });

  it(
    'plays a write on one clock, says its step as it goes, stops on Stop and pauses while the widget host is offscreen',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.play('lsm'));
      expect(t.play('lsm').getAttribute('aria-label')).toBe('Stop the write through the LSM tree');
      const steps = new Set<string>();
      const host = t.watched.find((w) => w.el === t.widget)!;
      await t.tick(400);
      const key = t.svg().querySelector('circle.key')?.getAttribute('transform');
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(200);
      expect(t.svg().querySelector('circle.key')?.getAttribute('transform')).toBe(key);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 200 && t.component().playing(); i++) {
        steps.add(t.tx('step-lsm')!);
        await t.tick(60);
      }
      expect([...steps], [...steps].join(' | ')).toEqual(
        expect.arrayContaining(['in the memtable too: safe and answered', 'merged into L1; model: ≈5.5×', 'L2 fills over 10 merges']),
      );
      expect(t.text('.notice')[0]).toMatch(/^The write is appended to the log/);
      await t.press(t.play('btree'));
      await t.tick(500);
      await t.press(t.play('btree'));
      expect(t.component().playing()).toBe(false);
      expect(t.tx('step-btree')).toBe('sorted pages, updated in place');
    },
    LONG_MS,
  );

  it(
    "starts the other engine's play mid-play: the new play is the one drawn, its Play is its Stop and its key moves",
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play('btree'));
      await t.tick(500);
      await t.press(t.play('lsm'));
      await t.tick(400);
      expect(t.component().play()).toBe('lsm');
      expect(t.play('lsm').getAttribute('aria-label')).toBe('Stop the write through the LSM tree');
      expect(t.play('btree').getAttribute('aria-label')).toBe('Play the write through the B-tree');
      const keys = new Set<string>();
      for (let i = 0; i < 300 && t.component().playing(); i++) {
        const k = t.svg().querySelector('circle.key')?.getAttribute('transform');
        if (k) keys.add(k);
        await t.tick(60);
      }
      expect(keys.size).toBeGreaterThan(5);
      expect(t.text('.notice')[0]).toMatch(/^The write is appended to the log/);
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
          expect(t.text('.model-note')).toEqual(['A rough model. Its assumptions show after your answer.']);
          // Every control waits: pressing them changes nothing.
          const before = t.component().settings();
          for (const i of t.el.querySelectorAll<HTMLInputElement>('app-storage-widget input')) await t.press(i);
          await t.press(t.play('btree'));
          expect(t.component().settings()).toEqual(before);
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
      const leaks: [string, string, 'asking' | 'playing', HidFlag[], Partial<StorageSettings> | null][] = [
        ['E1 asked, the page written back drawn', 'page-rewrite', 'asking', ['btMarks'], null],
        ["E1 asked, the B-tree's numbers shown", 'page-rewrite', 'asking', ['btNumbers'], null],
        ["E1 played, the B-tree's numbers shown", 'page-rewrite', 'playing', ['btNumbers'], null],
        ["E2 asked, the level's merges drawn", 'lsm-rewrites', 'asking', ['lsmMarks'], null],
        ["E2 played, the LSM tree's numbers shown", 'lsm-rewrites', 'playing', ['lsmNumbers'], null],
        ["E3 played, the B-tree's new numbers shown", 'record-size', 'playing', ['btNumbers'], null],
        ["E3 played, the LSM tree's numbers shown", 'record-size', 'playing', ['lsmNumbers'], null],
        ['E4 played, the reads shown', 'no-filters', 'playing', ['readNumbers'], null],
        ["E4 asked, the lookup's arithmetic shown", 'no-filters', 'asking', ['readWhy'], null],
        ["E5 played, the LSM tree's new numbers shown", 'more-data', 'playing', ['lsmNumbers'], null],
        ['E3 asked with the ghost of the setting before it', 'record-size', 'asking', ['ghost'], { page: 16 }],
        ["E1 asked, the model's note and the engines' settings live", 'page-rewrite', 'asking', ['locked'], null],
        ['E4 played, the hidden pip box sized by the count', 'no-filters', 'playing', ['pipBox'], null],
      ];
      const caught: Record<string, boolean> = {};
      for (const [name, id, phase, flags, ghost] of leaks) {
        const e = SHOWN[at(id)];
        const run = async (leak: boolean) => {
          const t = await setup({ motion: 'full' });
          const c = t.component();
          if (leak) plantLeak(c, flags);
          // The ghost a learner's change would leave, which the card's new start and the map both keep away.
          if (ghost) Object.defineProperty(c, 'ghostShown', { value: computed(() => ({ ...B, ...ghost }) as StorageSettings) });
          await t.card(at(id));
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

  it('meets the challenge only at 100 GB and ratio 5 with filters off, checking its bounds as the ask states them', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('tune-ratio'));
    expect(t.text('.notice')).toEqual([settingSentence(storageScenario({ ...B, ratio: 20, bloom: 0 }))]);
    expect(checks()).toEqual([
      '- ·the LSM tree writes 33.5× the data, under 20×: not yet',
      '+ ✓a lookup costs 4 disk reads, under 7: met',
      '+ ✓the data is 100 GB, at least 100 GB: met',
    ]);
    expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
    expect(t.play('lsm').disabled).toBe(false);
    await t.press(t.input('ratio', '4'));
    expect(checks()[1]).toBe('- ·a lookup costs 7 disk reads, under 7: not yet');
    await t.press(t.el.querySelector<HTMLInputElement>('label.toggle input')!);
    expect(t.text('.status')).toEqual(['The goal keeps bloom filters off.']);
    await t.press(t.el.querySelector<HTMLInputElement>('label.toggle input')!);
    await t.press(t.input('ratio', '5'));
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('tune-ratio')].reveal]);
    await t.press(t.input('ratio', '10'));
    expect(t.text('.status')).toEqual(['You met it; now:']);
    await t.press(t.input('ratio', '5'));
    expect(t.text('.status')).toEqual(['Goal met:']);
  });

  it('describes both engines at each of their settings, the two current rows marked, in the widest form its box holds', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((td) => td.textContent!.trim()),
      );
    const roomy = await setup({ width: 700 });
    await roomy.press(roomy.describe());
    expect(roomy.text('g-data-table thead th')).toEqual(['Engine', 'Levels', 'Written', 'Disk writes', 'Lookup, filters on', 'Disk used']);
    vi.unstubAllGlobals();
    // The two-column desktop stage: the long lookup head would overflow the box, so it takes one word.
    const wide = await setup();
    await wide.press(wide.describe());
    expect(wide.text('g-data-table thead th')).toEqual(['Engine', 'Levels', 'Written', 'Disk writes', 'Lookup', 'Disk used']);
    expect(rows(wide)[0]).toEqual(['B-tree, 4 KB pages', '5', '42×', '420 MB/s', '1 disk read', '1.44×']);
    expect(rows(wide)[5]).toEqual(['LSM tree, ratio 10', '4 + L0', '24×', '240 MB/s', '1 disk read', '1.11×']);
    expect([...wide.el.querySelectorAll('g-data-table tr[aria-current]')].map((r) => r.querySelector('th')!.textContent!.trim())).toEqual([
      'B-tree, 4 KB pages',
      'LSM tree, ratio 10',
    ]);
    expect(wide.text('.describe .note')).toEqual([
      "Rows are this workload's: 100 GB in records of 100 bytes, bloom filters on. The LSM tree's disk use is an upper bound.",
    ]);
    expect(bareUnits(wide)).toEqual([]);
    vi.unstubAllGlobals();
    const phone = await setup({ width: 252 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['Engine', 'Levels', 'Write, ×', 'Reads', 'Disk, ×']);
    expect(rows(phone)[5]).toEqual(['LSM, ratio 10', '4+L0', '24', '1', '1.11']);
  });
});
