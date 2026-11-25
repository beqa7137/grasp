import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ID_BASELINE as B, ID_EXPERIMENTS, idMint, renderExperiment, type IdSettings, type SdExperiment } from '@grasp/engine';
import { FALSE_CLAIMS } from './ids-claims.testing';
import { IdsWidgetComponent } from './ids-widget.component';
import { NOTHING_HIDDEN, PLAYING_NOTICE, PLAYS_OUT, REST_NOTICE, STOPPED_NOTICE, mintWords, summary, type Hid, type HidFlag } from './ids-words';

@Component({
  selector: 'app-ids-test-host',
  imports: [IdsWidgetComponent],
  template: `<app-ids-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = ID_EXPERIMENTS;
}

const SHOWN = ID_EXPERIMENTS.map(renderExperiment);
const QUESTIONS = SHOWN.filter((e) => !e.goal);
const LONG_MS = 900_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

/**
 * While a question asks, no word of the widget outside the dock may hold these; while its answer plays, the stage draws
 * what the play makes (`PLAYS_OUT`), so then only the words off the picture are held: names, notice, controls, Describe.
 */
const GIVEAWAYS: Record<string, string[]> = {
  'one-bit': ['34.8', '3 November 2060', 'halves', 'one bit fewer'],
  burst: ['3.95 ms', '904', '4 × 1,024', 'full ticks', 'last waits', 'waited for a later tick'],
  order: [
    'sorts after',
    'sort after',
    'sorts before',
    'sort before',
    'ids made later',
    'sorts first',
    'made 0.7 ms later',
    'out of time order',
    'hollow dot',
  ],
  'clock-back': ['same id', 'made twice', 'Two ids', 'ids repeat', 'reissuing', 'waited 0.7 ms'],
  birthday: ['2.7%', '0.027', 'about 1 in'],
};
/** Settings a learner may have left before opening a card. */
const FROMS: Partial<IdSettings>[] = [
  { gen: 12, seq: 8 },
  { fault: 3, load: 1 },
  { bits: 64, count: 12, tick: 10 },
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
  const widget = el.querySelector('app-ids-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const has = (selector: string) => !!svg().querySelector(selector);
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  const component = () => fixture.debugElement.children[0].componentInstance as IdsWidgetComponent;
  /** Every word the widget shows or says outside the dock: the stage's text unless `picture` is false, its names, its controls, the notice, Describe. */
  const said = (picture = true) =>
    [
      ...[...widget.querySelectorAll(`${picture ? 'svg.draw text, ' : ''}g-stage .panel, g-stage button, .controls, .caption, .describe`)].map(
        clean,
      ),
      ...[...widget.querySelectorAll('g-stage [aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return { el, widget, text, svg, has, press, play, card, choose, component, said, describe, render, tick, watched, revealed };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** The structure an open question must not show: live controls, a ghost, and the marks its regions hide. */
function structural(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const h = new Set(e.hide);
  for (const i of t.el.querySelectorAll<HTMLInputElement | HTMLButtonElement>('app-ids-widget g-stage :is(input, button):not(.nav)'))
    if (!i.disabled && !i.closest('fieldset:disabled')) out.push(`a control is live: ${i.className || i.getAttribute('name')}`);
  if (phase === 'asking' && (t.has('[data-id="ghost-tick"]') || t.has('[data-id^="ghost-words"]')))
    out.push('a ghost of an earlier setting');
  if (h.has('lifetime')) {
    if (phase === 'asking' && !t.has('[data-id="life-marker"]')) out.push('no lifetime marker while asking');
    if (phase === 'playing' && t.has('[data-id="life-marker"]')) out.push('a lifetime marker while the answer plays');
  }
  const name = t.svg().getAttribute('aria-label') ?? '';
  if ((h.has('order') || h.has('repeats')) && phase === 'asking') {
    if (t.has('[data-id^="row-key-"], [data-id^="rdot-"], [data-id^="order-"]:not([data-id^="order-hidden"])')) out.push('the sorted list');
    if (!t.has('[data-id="order-hidden"]')) out.push("the sorted list's hidden box");
    if (t.has('[data-id^="own-"]')) out.push("a faulty clock's own ticks");
    if (!name.includes('The order of the ids is hidden until you answer.')) out.push('the order unsaid in the stage name');
  }
  if ((h.has('order') || h.has('repeats')) && phase === 'playing' && !name.includes('The order of the ids shows at the reveal.'))
    out.push('the order unsaid in the stage name');
  if ((h.has('inspect') || h.has('repeats')) && phase === 'asking') {
    if (t.has('[data-id^="id-value"], [data-id^="leak-"], [data-id^="conv-"]')) out.push("the inspected id's digits");
    for (const n of t.el.querySelectorAll<HTMLButtonElement>('button.nav')) if (!n.disabled) out.push('Older or Newer is live');
  }
  if (h.has('repeats') && phase === 'asking' && t.has('.repeat-ring, .twin-ring, .repeat-link, .dot.repeat, [data-id="id-twice"]'))
    out.push('a repeat marked');
  if (phase === 'playing')
    for (const box of t.svg().querySelectorAll('[data-id$="-said"]'))
      if (/until you answer/.test(box.textContent ?? '')) out.push(`"${box.textContent}" after the answer`);
  if (
    h.has('chance') &&
    t.has(
      '[data-id="chance-marker"], [data-id^="curve-"]:not([data-id^="curve-name"]), [data-id^="pairs-"]:not([data-id^="pairs-hidden"]), [data-id="square-law"]',
    )
  )
    out.push('the chart');
  if (!t.text('.notice')[0]) out.push('the notice is blank');
  return out;
}

/** What the answer's play must have drawn on the stage by its last frame: the marks the question asked about. */
function playedOut(t: Setup, e: SdExperiment): string[] {
  const out: string[] = [];
  const h = new Set(e.hide);
  const want = (selector: string, what: string) => !t.has(selector) && out.push(`no ${what} by the end of the play`);
  if (h.has('burstAfter')) {
    want('[data-id="burst-bracket"]', "burst's bracket");
    want('[data-id="burst-last"]', "burst's last count");
    want('[data-id="wait-line"]', "last request's wait");
  }
  if (h.has('order') || h.has('repeats')) {
    want('[data-id^="row-key-"]', 'sorted row');
    if (t.has('[data-id="order-hidden"]')) out.push('the sorted list still hidden');
  }
  if (h.has('inspect')) want('[data-id^="id-value"]', 'id digits');
  if (h.has('repeats')) {
    want('.repeat-ring', 'repeat ring');
    want('[data-id^="row-note-"]', 'repeat note');
  }
  return out;
}

function giveaways(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  // The question's own title ("Which id sorts first") is the question, not its answer.
  const playsOut = phase === 'playing' && e.hide.some((h) => (PLAYS_OUT as readonly string[]).includes(h));
  const words = t.said(!playsOut).replaceAll(e.title, '');
  const out = (GIVEAWAYS[e.id] ?? []).filter((w) => words.includes(w)).map((w) => `"${w}"`);
  for (const c of FALSE_CLAIMS) if (c.test(words)) out.push(`${c} in "${words.match(c)![0]}"`);
  return [...out, ...structural(t, e, phase)];
}

/** Makes the stage's name say the order while the picture keeps the list hidden: a leak in words alone. */
function plantWordLeak(c: IdsWidgetComponent) {
  const real = c.stage;
  Object.defineProperty(c, 'stage', {
    value: computed(() => ({ ...real(), summary: summary(c.model(), { ...c.hid(), order: false }) })),
  });
}

/** Replaces the widget's hiding map with one that leaks `flags`, as a code change would. */
function plantLeak(c: IdsWidgetComponent, flags: readonly (HidFlag | 'words')[]) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed((): Hid => ({ ...real(), ...Object.fromEntries(flags.map((f) => [f, false])) })) });
}

async function probe(t: Setup, e: SdExperiment, from: Partial<IdSettings> | null, phases: ('asking' | 'playing')[]) {
  t.component().exp.active.set(null);
  if (from) for (const [k, v] of Object.entries(from)) t.component().set(k as keyof IdSettings, v);
  await t.render();
  await t.card(at(e.id));
  const found = new Set<string>();
  if (phases.includes('asking')) for (const g of giveaways(t, e, 'asking')) found.add(`asking: ${g}`);
  if (phases.includes('playing')) {
    await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
    let last: string[] = [];
    for (let i = 0; i < 400 && !t.revealed(); i++) {
      for (const g of giveaways(t, e, 'playing')) found.add(`playing: ${g}`);
      last = playedOut(t, e);
      await t.tick(200);
    }
    if (t.component().motion()) for (const g of last) found.add(`playing: ${g}`);
  }
  return [...found];
}

describe('IdsWidgetComponent', { timeout: LONG_MS }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default id, the Snowflake ledger and the mint, every number from the model', async () => {
    const t = await setup();
    const words = t.text('svg.draw text').join(' | ');
    for (const w of [
      'made by G2 at 2.9 ms',
      'id 118,682,025,992,396,801',
      'Timestamp, 41 bits',
      '2⁴¹ ticks × 1 ms = 69.7 years',
      '1 January 2026 to 7 September 2095',
      'lasts 69.7 years',
      '= 1,024 generators at once',
      '4,194,304,000 ids a second from all 1,024',
    ])
      expect(words).toContain(w);
    expect(words).toContain('(12:00:00.002 UTC on 24 November 2026, to the tick)');
    expect(t.svg().getAttribute('aria-label')).toContain('Three generators made 20 ids without talking to each other.');
    expect(t.text('.notice')).toEqual([REST_NOTICE]);
    expect(t.svg().querySelectorAll('[data-id^="dot-g"]')).toHaveLength(20);
  });

  it('steps the layout, keeps one height, says the change and draws the ghost on the ruler and in words', async () => {
    const t = await setup();
    const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
    await t.press(t.el.querySelector<HTMLButtonElement>('button[aria-label="One generator bit more"]')!);
    expect(t.text('.notice')[0]).toBe(
      'The layout now has 11 generator bits and 12 sequence bits: 2,048 generators, 4,096,000 ids a second each; the timestamp keeps 40 bits and lasts 34.8 years.',
    );
    expect(t.has('[data-id="ghost-tick"]')).toBe(true);
    expect(t.text('svg.draw text').join(' ')).toContain('was 69.7 years with 41 bits: one bit fewer halves it');
    for (const name of ['ids-fault', 'ids-load', 'ids-tick', 'ids-epoch', 'ids-bits']) {
      await t.press([...t.el.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].at(-1)!);
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height, name).toBe(h);
    }
  });

  it('steps through the ids with Older and Newer', async () => {
    const t = await setup();
    const newer = t.el.querySelector<HTMLButtonElement>('button.nav[data-dir="newer"]')!;
    await t.press(newer);
    expect(t.text('svg.draw text').join(' ')).toContain('made by G1 at 3.1 ms');
    await t.press(t.el.querySelector<HTMLButtonElement>('button.nav[data-dir="older"]')!);
    expect(t.text('svg.draw text').join(' ')).toContain('made by G2 at 2.9 ms');
  });

  it('writes the mint under the stage when motion is reduced', async () => {
    const t = await setup();
    await t.press(t.play());
    expect(t.text('.caption')).toEqual([`Reduced motion: the mint is drawn at its end. ${mintWords(idMint(B), NOTHING_HIDDEN)}`]);
  });

  it(
    'plays the mint on one clock, draws each id only once it is made, and pauses while the widget host is offscreen',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play());
      expect(t.text('.notice')).toEqual([PLAYING_NOTICE]);
      expect(t.play().getAttribute('aria-label')).toBe('Stop the mint');
      await t.tick(16);
      await t.tick(1000);
      const count = t.svg().querySelectorAll('[data-id^="dot-g"]').length;
      expect(count).toBeLessThan(20);
      const host = t.watched.find((w) => w.el === t.widget)!;
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(500);
      expect(t.svg().querySelectorAll('[data-id^="dot-g"]').length).toBe(count);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 200 && t.component().playing(); i++) await t.tick(100);
      expect(t.svg().querySelectorAll('[data-id^="dot-g"]')).toHaveLength(20);
      expect(t.text('.notice')).toEqual([mintWords(idMint(B), NOTHING_HIDDEN)]);
    },
    LONG_MS,
  );

  it('stops the mint at its end and says so', async () => {
    const t = await setup({ motion: 'full' });
    await t.press(t.play());
    await t.tick(16);
    await t.tick(2000);
    await t.press(t.play());
    expect(t.component().playing()).toBe(false);
    expect(t.text('.notice')).toEqual([`${STOPPED_NOTICE} ${mintWords(idMint(B), NOTHING_HIDDEN)}`]);
    expect(t.svg().querySelectorAll('[data-id^="dot-g"]')).toHaveLength(20);
    expect(t.play().getAttribute('aria-label')).toBe('Play the mint: 8 ms of three generators');
  });

  for (const motion of ['off', 'full'])
    it(
      `hides each question's answer on every surface while it asks and through its play, from any setting, motion ${motion}`,
      async () => {
        const t = await setup({ motion });
        for (const e of QUESTIONS) {
          for (const from of [null, ...FROMS])
            expect(await probe(t, e, from, ['asking']), `${e.id} from ${JSON.stringify(from)}`).toEqual([]);
          expect(t.text('.notice')[0], e.id).toMatch(new RegExp(`^${e.title}`));
          expect(t.describe().disabled).toBe(true);
          const before = t.component().settings();
          for (const i of t.el.querySelectorAll<HTMLInputElement>('app-ids-widget g-stage input')) await t.press(i);
          await t.press(t.play());
          expect(t.component().settings()).toEqual(before);
          expect(await probe(t, e, null, ['playing']), `${e.id} playing`).toEqual([]);
          expect(t.revealed()).toBe(true);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice')[0], `${e.id} revealed`).toBeTruthy();
          expect(t.describe().disabled, e.id).toBe(false);
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus^="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  it(
    'catches a leak planted on every flag of the hiding map, each against a clean run of the same question',
    async () => {
      const leaks: [string, string, 'asking' | 'playing', (HidFlag | 'words')[]][] = [
        ['E1 played, the new lifetime shown', 'one-bit', 'playing', ['lifeNew']],
        ["E2 played, G0's burst said", 'burst', 'playing', ['burstAfter']],
        ['E3 asked, the sorted list shown', 'order', 'asking', ['order']],
        ['E3 played, the order said', 'order', 'playing', ['order']],
        ["E3 asked, the inspected id's digits shown", 'order', 'asking', ['inspect']],
        ['E4 played, the repeats said', 'clock-back', 'playing', ['repeats', 'order']],
        ['E3 asked, the order said with the list hidden', 'order', 'asking', ['words']],
        ['E5 asked, the chart shown', 'birthday', 'asking', ['chance']],
        ['E2 asked with live controls', 'burst', 'asking', ['locked']],
      ];
      const caught: Record<string, boolean> = {};
      for (const [name, id, phase, flags] of leaks) {
        const e = SHOWN[at(id)];
        const run = async (leak: boolean) => {
          const t = await setup({ motion: 'full' });
          if (leak && flags[0] === 'words') plantWordLeak(t.component());
          else if (leak) plantLeak(t.component(), flags);
          await t.card(at(id));
          const found =
            phase === 'asking' ? giveaways(t, e, 'asking') : (await probe(t, e, null, ['playing'])).filter((g) => g.startsWith('playing'));
          vi.unstubAllGlobals();
          vi.restoreAllMocks();
          return found;
        };
        caught[name] = (await run(false)).length === 0 && (await run(true)).length > 0;
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

  it('meets the challenge only at 10 generator bits, 10 sequence bits and a 1 ms tick, checking each need', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('size-layout'));
    expect(checks()).toEqual([
      '+ ✓1,024 generators (need 1,000)',
      '+ ✓4,096,000 ids a second each (need 1,000,000)',
      '- ·lasts 68.8 years from today (need 200 years)',
    ]);
    expect(t.text('svg.draw text').join(' ')).toContain('(need 1,000)');
    const fewer = t.el.querySelector<HTMLButtonElement>('button[aria-label="One sequence bit fewer"]')!;
    await t.press(fewer);
    expect(t.text('.status')).toEqual([]);
    await t.press(fewer);
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(t.text('.notice')[0]).toMatch(/^Goal met\. /);
    await t.press(fewer);
    expect(t.text('.status')).toEqual(['You met it; now:']);
  });

  it('describes every id in id order, compact on a narrow stage', async () => {
    const wide = await setup({ width: 866 });
    await wide.press(wide.describe());
    expect(wide.text('g-data-table thead th')).toEqual(['#', 'Id', 'Made by', 'Made at', 'Timestamp', 'Gen', 'Seq', 'Waited', 'Note']);
    expect(wide.el.querySelectorAll('g-data-table tbody tr')).toHaveLength(20);
    vi.unstubAllGlobals();
    const phone = await setup({ width: 300 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['#', 'timestamp · G · seq', 'Made', 'Note']);
  });
});
