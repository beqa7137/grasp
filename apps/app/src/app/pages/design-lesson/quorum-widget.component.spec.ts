import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QUORUM_EXPERIMENTS, quorumAt, renderExperiment, type QuorumSettings } from '@grasp/engine';
import { QuorumWidgetComponent } from './quorum-widget.component';

@Component({
  imports: [QuorumWidgetComponent],
  template: `<app-quorum-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = QUORUM_EXPERIMENTS;
}

const SHOWN = QUORUM_EXPERIMENTS.map(renderExperiment);
/** The sweep and the plays sample frame by frame: many renders, longer than a unit test's default. */
const LONG_MS = 60_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

/** While a question asks, no rendered or accessible text of the widget may hold its answer (known.md bug 1). */
const GIVEAWAYS: Record<string, string[]> = {
  'r-plus-w-equals-n': ['1 of 10', 'share no replica', 'can miss all', 'at 2 ms'],
  'all-one-down': ['refused', 'timed out', 'Nothing was written', 'not sent', 'none written', 'live, 3 needed', '97.03', '99.9999'],
  stall: ['acked in 40', 'acked 40', 'returned 40', 'fresh', 'sent at 40', 'by R1 and R3', 'R1 and R3'],
  'missed-write': ['repaired', 'repair', '6 ms', 'fixed'],
  sloppy: ['1 of 3', 'returns v7', 'stale', 'can miss it', 'only 1 home', 'R2 v7', 'R3 v7'],
};
/** Nor a false claim: about overlap, about the write while it hides, or about the stand-ins. */
const FALSE_CLAIMS = ['meet any', 'can fit in N without sharing', 'write is sent', 'never asks'];
const BY_REGION: Record<string, string[]> = {
  verdict: ['returns v', 'fresh', 'stale', 'both acked'],
  repair: ['repair', 'fixed', 'v8 at'],
  write: ['acked in', 'refused', 'timed out', 'sent at'],
  'write-time': ['acked in 4', 'acked 4', 'sent at'],
  read: ['sent at', 'returned'],
};

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
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  Element.prototype.animate = animate;
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
  const widget = el.querySelector('app-quorum-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const slider = (name: string) => el.querySelector<HTMLElement>(`[role="slider"][aria-label^="${name}"]`)!;
  const key = async (target: HTMLElement, k: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const cards = () => [...el.querySelectorAll<HTMLButtonElement>('.card-hit')];
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
  /** Every word the widget shows or says, outside the question itself: the stage, its names, the controls, Describe. */
  const said = () =>
    [
      ...[...widget.querySelectorAll('g-stage text, .controls, .describe')].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label], g-stage [aria-valuetext]')].flatMap((e) => [
        e.getAttribute('aria-label') ?? '',
        e.getAttribute('aria-valuetext') ?? '',
      ]),
    ].join(' | ');
  const heights = () => el.querySelector<HTMLElement>('g-stage .well')!.style.height;
  return { el, widget, text, svg, slider, key, cards, play, option, press, card, choose, said, render, tick, animate, watched, heights };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** What the open question must not show, on every surface: its answer, false claims, and its hidden regions' words. */
function giveaways(t: Setup, id: string, hide: readonly string[], settings: QuorumSettings): string[] {
  const out: string[] = [];
  const words = t.said();
  for (const w of [...GIVEAWAYS[id], ...FALSE_CLAIMS, ...hide.flatMap((h) => BY_REGION[h] ?? [])])
    if (words.includes(w)) out.push(`"${w}"`);
  const m = quorumAt(settings);
  const svg = t.svg();
  const summary = svg.getAttribute('aria-label')!;
  if (hide.includes('write') || hide.includes('write-time')) {
    const styles = new Set([...svg.querySelectorAll('[data-write]')].map((l) => l.getAttribute('class')));
    if (styles.size > 1) out.push(`write lines in ${styles.size} styles`);
    if (svg.querySelector('.cell.acked')) out.push('an acked strip cell');
    for (const acked of m.write.acked) if (summary.includes(m.all[acked].name)) out.push(`the summary names ${m.all[acked].name}`);
  }
  // A word like "v8 at 20 ms" or "at 20 ms" on a replica the write never reached is false.
  for (const tx of svg.querySelectorAll('text[data-owner]')) {
    const i = Number((tx.getAttribute('data-owner')!.match(/^R(\d)$/) ?? [])[1]) - 1;
    if (i >= 0 && !m.write.applied.includes(i) && /\bat \d/.test(tx.textContent!)) out.push(`"${tx.textContent}" on R${i + 1}`);
  }
  if (hide.includes('read')) {
    const mark = svg.querySelector('.link.read:not(.legend-line), .link.dead, .chip.asked, [data-answer], .dot.read, .this-ring');
    if (mark) out.push(`a read mark: ${mark.getAttribute('class')}`);
  }
  if (
    (hide.includes('repair') || hide.includes('verdict')) &&
    t.el.querySelector('.link.repair, .repair-glyph, .repair-bar, .particle.repair:not([visibility])')
  )
    out.push('a repair mark');
  if (hide.includes('verdict') && svg.querySelector('.both-ring, .card-both, .both-echo')) out.push('a BOTH ring');
  return out;
}

const settingsOf = (e: (typeof SHOWN)[number]) =>
  ({ n: 3, w: 2, r: 2, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, stall: 0, sloppy: 0, ...e.setup }) as QuorumSettings;

describe('QuorumWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default write and read with every number from the model, and says them in its summary', async () => {
    const { svg, text, cards, slider, play } = await setup();
    expect(svg().getAttribute('aria-label')).toBe(
      '3 replicas, W QUORUM, R QUORUM. The write is acked in 4 ms by R1 and R2. returns v8 · fresh · 6 ms. 0 of 3 read sets can miss v8.',
    );
    expect(text('svg.draw text').join(' | ')).toContain('acked in 4 ms');
    expect(text('svg.draw text').join(' | ')).toContain('R2 both acked and answered');
    expect(text('svg.draw text').join(' | ')).toContain('returned 6 ms (+2 repair)');
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual([
      'R1, up. Activate to take it down.',
      'R2, up. Activate to take it down.',
      'R3, up. Activate to take it down.',
    ]);
    expect(slider('W').getAttribute('aria-valuetext')).toBe('QUORUM, 2 of 3: survives 1 down, writes succeed 99.97%');
    expect(slider('R').getAttribute('aria-valuetext')).toBe('QUORUM, 2 of 3: survives 1 down, reads succeed 99.97%');
    expect(play().getAttribute('aria-label')).toBe('Play the write, then the read');
    expect(play().disabled).toBe(false);
  });

  it('moves one Tab stop along the replicas with the arrows, Home and End, and names the next state', async () => {
    const t = await setup();
    const tabStops = () => t.cards().map((c) => c.tabIndex);
    expect(tabStops()).toEqual([0, -1, -1]);
    t.cards()[0].focus();
    await t.key(t.cards()[0], 'ArrowRight');
    expect(tabStops()).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(t.cards()[1]);
    await t.key(t.cards()[1], 'End');
    expect(tabStops()).toEqual([-1, -1, 0]);
    expect(t.text('.hint')).toEqual(['Enter: take R3 down']);
    await t.press(t.cards()[2]);
    expect(t.cards()[2].getAttribute('aria-label')).toBe('R3, down. Activate to make it stop mid-write.');
    expect(t.text('.notice')).toEqual(['R3 down: returns v8 · fresh · 40 ms.']);
    expect(t.text('.hint')).toEqual(['Enter: make R3 stop mid-write']);
    await t.key(t.cards()[2], 'Home');
    expect(tabStops()).toEqual([0, -1, -1]);
  });

  it('changes W and R on the drawing, carries them by level across N, and keeps one height per width and N', async () => {
    const t = await setup();
    const h3 = t.heights();
    await t.key(t.slider('W'), 'ArrowLeft');
    expect(t.slider('W').getAttribute('aria-valuetext')).toBe('ONE, 1 of 3: survives 2 down, writes succeed 99.9999%');
    await t.key(t.slider('R'), 'ArrowLeft');
    expect(t.svg().getAttribute('aria-label')).toContain('returns v7 · stale · 2 ms. 2 of 3 read sets can miss v8.');
    expect(t.heights()).toBe(h3);
    await t.press(t.option('5 replicas'));
    expect(t.svg().getAttribute('aria-label')).toMatch(/^5 replicas, W ONE, R ONE\./);
    await t.key(t.slider('W'), 'End');
    await t.key(t.slider('W'), 'ArrowLeft');
    expect(t.slider('W').getAttribute('aria-valuetext')).toBe('4 of 5: survives 1 down, writes succeed 99.90%');
    await t.press(t.option('3 replicas'));
    expect(t.slider('W').getAttribute('aria-valuetext')).toMatch(/^ALL, 3 of 3/);
    expect(t.heights()).toBe(h3);
  });

  it('pauses R2 and adds stand-ins with the conditions', async () => {
    const t = await setup();
    await t.press(t.option('R2 pauses'));
    expect(t.text('.notice')).toEqual(['R2 pauses for 100 ms: returns v8 · fresh · 40 ms.']);
    expect(t.svg().getAttribute('aria-label')).toContain('acked in 40 ms by R1 and R3');
    await t.press(t.option('Sloppy quorum'));
    expect(t.text('svg.draw text').join(' | ')).toContain('standing by');
  });

  it('says what a play did in order without motion, and draws the repaired v7 struck', async () => {
    const t = await setup();
    await t.press(t.play());
    expect(t.text('.notice')).toEqual([
      'Acked in 4 ms by R1 and R2. The read heard R3 (v7) and R2 (v8), repaired R3 and returned v8 in 6 ms.',
    ]);
    expect(t.text('.struck')).toEqual(['v7']);
    expect(t.animate).not.toHaveBeenCalled();
  });

  it(
    'plays the write then the read, every read-side mark arriving with the read, tracked by replica',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play());
      const readMarks = () => t.svg().querySelectorAll('.link.read:not(.legend-line), .chip.asked, [data-answer], .dot.read, .pill');
      expect(readMarks()).toHaveLength(0);
      expect(t.svg().querySelector('.this-ring:not(.key)')).toBeNull();
      let r3: Element | null = null;
      let order = '';
      for (let i = 0; i < 120 && t.text('.notice')[0] === ''; i++) {
        await t.tick(50);
        const answers = [...t.svg().querySelectorAll('[data-answer]')].map((a) => a.getAttribute('data-answer')).join(',');
        if (answers !== order.split(';').at(-1)) order += `;${answers}`;
        r3 ??= t.svg().querySelector('[data-answer="2"]');
      }
      expect(order).toBe(';2;1,2');
      expect(t.svg().querySelector('[data-answer="2"]')).toBe(r3);
      expect(t.text('.notice')[0]).toMatch(/^Acked in 4 ms by R1 and R2\./);
      expect(t.animate).toHaveBeenCalled();
      expect(readMarks().length).toBeGreaterThan(0);
    },
    LONG_MS,
  );

  it(
    'plays a timed-out write, a countdown, then the read on its own clock, the R-th answer landing last',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.key(t.slider('W'), 'End');
      await t.press(t.cards()[2]);
      await t.press(t.cards()[2]);
      expect(t.svg().getAttribute('aria-label')).toContain('The write times out.');
      await t.press(t.play());
      let countdown = false;
      const seen: string[] = [];
      for (let i = 0; i < 300 && t.text('.notice')[0] === ''; i++) {
        await t.tick(40);
        countdown ||= !!t.svg().querySelector('.countdown');
        const answers = [...t.svg().querySelectorAll('[data-answer]')].map((a) => a.getAttribute('data-answer')).join(',');
        if (seen.at(-1) !== answers) seen.push(answers);
      }
      expect(countdown).toBe(true);
      expect(seen).toEqual(['', '1', '1,0']);
      expect(t.text('.notice')[0]).toMatch(/^The write timed out at 2 s; R1 and R2 applied it\./);
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
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 40; i++) await t.tick(100);
      expect(t.text('.notice')).toEqual(['']);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 80 && t.text('.notice')[0] === ''; i++) await t.tick(100);
      expect(t.text('.notice')[0]).toMatch(/^Acked in 4 ms/);
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
          const settings = settingsOf(e);
          const summary = t.svg().getAttribute('aria-label');
          expect(t.play().disabled, e.id).toBe(true);
          expect(t.play().getAttribute('aria-label')).toBe('Play the write, then the read, after your answer');
          expect(t.text('.notice'), e.id).toEqual(['Play and the settings this question is about wait for your answer.']);
          // Move every card, handle and toggle: nothing moves while the question asks.
          for (const c of t.cards()) await t.press(c);
          for (const name of ['W', 'R']) for (const k of ['ArrowRight', 'Home', 'End']) await t.key(t.slider(name), k);
          for (const label of ['3 replicas', '5 replicas', 'R', 'Sloppy quorum']) await t.press(t.option(label));
          expect(t.svg().getAttribute('aria-label'), e.id).toBe(summary);
          expect(
            t.cards().every((c) => c.getAttribute('aria-disabled') === 'true'),
            e.id,
          ).toBe(true);
          expect(t.el.querySelector('.hint'), e.id).toBeNull();
          expect(t.text('.describe button')).toEqual(['Describe']);
          expect(giveaways(t, e.id, e.hide, settings), `${e.id} asking`).toEqual([]);
          await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
          const held = e.hide.filter((h) => h !== 'read');
          for (let i = 0; i < 200 && !t.el.querySelector('app-widget-check .explain:not(.muted)'); i++) {
            expect(giveaways(t, e.id, held, settings), `${e.id} playing`).toEqual([]);
            await t.tick(60);
          }
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          for (const region of e.focus) expect(t.el.querySelector(`[data-focus="${region}"]`)!.classList, e.id).toContain('focused');
        }
      },
      LONG_MS,
    );

  it('shows what each question hid once it is revealed', async () => {
    const t = await setup();
    await t.card(at('r-plus-w-equals-n'));
    expect(t.text('svg.draw text').join(' | ')).toContain('? of 10 can miss v8');
    expect(t.text('svg.draw text').join(' | ')).toContain('Does every read of 3 meet the 2 that acked?');
    await t.choose(SHOWN[at('r-plus-w-equals-n')].choices[2]);
    expect(t.text('svg.draw text').join(' | ')).toContain('1 of 10 can miss v8');
    await t.card(at('missed-write'));
    expect(t.text('svg.draw text').join(' | ')).toContain('2nd answer 4 ms');
    expect(t.text('svg.draw text').join(' | ')).toContain('returns v8 · fresh · ? ms');
    await t.card(at('sloppy'));
    expect(t.text('svg.draw text').join(' | ')).toContain('read sent after your answer');
    expect(t.text('svg.draw text').join(' | ')).toContain('for R2');
    await t.card(at('all-one-down'));
    expect(t.slider('W').getAttribute('aria-valuetext')).toBe('ALL, 3 of 3; what it survives shows after your answer');
    await t.choose(SHOWN[at('all-one-down')].choices[0]);
    expect(t.text('svg.draw text').join(' | ')).toContain('refused: 2 live, 3 needed');
  });

  it('meets the challenge only at N 5, W 4, R 2, stating its bounds as the ask does', async () => {
    const t = await setup();
    await t.card(at('fast-fresh'));
    expect(t.text('.status')[0]).toBe(
      'No read set can miss v8: 0 of 3 can, met · reads 40 ms, under 5 ms: not yet · writes 40 ms, under 50 ms: met · writes survive 1 down, at least 1: met',
    );
    expect(t.play().disabled).toBe(false);
    expect(t.text('.describe .muted')).toEqual(['Describe waits for your answer.']);
    await t.press(t.option('5 replicas'));
    await t.key(t.slider('W'), 'ArrowRight');
    await t.key(t.slider('R'), 'ArrowLeft');
    expect(t.text('.status')[0]).toMatch(/^Goal met: No read set can miss v8: 0 of 10 can, met · reads 3 ms/);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('fast-fresh')].reveal]);
  });

  it('describes each replica in a table, stand-ins included, compact on a phone', async () => {
    const wide = await setup();
    await wide.press(wide.option('Sloppy quorum'));
    await wide.press(wide.cards()[2]);
    await wide.press([...wide.el.querySelectorAll<HTMLButtonElement>('.describe button')][0]);
    expect(wide.text('g-data-table th')).toEqual(['Replica', 'State', 'Write round trip', 'Has v8 at', 'Read reaches it', 'Answered']);
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
    expect(rows(wide)).toEqual([
      ['R1 (DC A)', 'up', '2 ms', '1 ms', '23 ms', 'v8'],
      ['R2 (DC B)', 'up', '4 ms', '2 ms', '5 ms', 'v8'],
      ['R3 (DC C)', 'down', '–', '–', '–', '–'],
      ['H1 (DC A)', 'stand-in for R3', '3 ms', '1.5 ms', '–', '–'],
    ]);
    const phone = await setup({ width: 252 });
    await phone.press(phone.option('Sloppy quorum'));
    await phone.press(phone.cards()[2]);
    await phone.press([...phone.el.querySelectorAll<HTMLButtonElement>('.describe button')][0]);
    expect(phone.text('g-data-table th')).toEqual(['Rep.', 'State', 'Write rtt, ms', 'Has v8 at, ms', 'Read at, ms', 'Got']);
    expect(rows(phone)[3]).toEqual(['H1', 'for R3', '3', '1.5', '–', '–']);
  });
});
