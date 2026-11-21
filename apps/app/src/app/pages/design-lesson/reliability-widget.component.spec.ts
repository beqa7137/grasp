import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  RELIABILITY_EXPERIMENTS,
  RELIABILITY_SETUPS,
  renderExperiment,
  reliabilityScenario,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { FALSE_CLAIMS, singledOut } from './reliability-claims.testing';
import { ReliabilityWidgetComponent, changedParts } from './reliability-widget.component';
import { WAITS_NOTICE, settingWords, type Hidden } from './reliability-words';

@Component({
  selector: 'app-reliability-test-host',
  imports: [ReliabilityWidgetComponent],
  template: `<app-reliability-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = RELIABILITY_EXPERIMENTS;
}

/** Questions with a region missing from their hide lists: leaks the sweep must catch. */
const LEAKY: readonly ExperimentSpec[] = [
  { ...RELIABILITY_EXPERIMENTS[0], hide: ['request'] },
  { ...RELIABILITY_EXPERIMENTS[0], hide: ['sample'] },
  { ...RELIABILITY_EXPERIMENTS[1], hide: [] },
  { ...RELIABILITY_EXPERIMENTS[2], hide: ['sample', 'after'] },
];
@Component({
  selector: 'app-reliability-leaky-host',
  imports: [ReliabilityWidgetComponent],
  template: `<app-reliability-widget [experiments]="experiments" />`,
})
class LeakyHost {
  readonly experiments = LEAKY;
}

const SHOWN = RELIABILITY_EXPERIMENTS.map(renderExperiment);
const LONG_MS = 240_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

/** While a question asks, no text the widget shows or says may hold its answer (the scale's own tick labels excepted). */
const GIVEAWAYS: Record<string, (string | RegExp)[]> = {
  series: ['35 h', '99.6%', '35 times', 'count in full', /failed \d+ times/],
  parallel: ['99.9999%', 'only while both', /adds \d nines/, /only while (all|both)/, 'both down', 'Both at once', '0.1% of 8.76 h'],
  weakest: ['Weakest link:', 'Weakest links:', 'capped', 'has no other copy', 'so the request fails', 'never the limit'],
  shared: ['2.6 h', '100×', 'shared failure takes', 'shared outages ×', 'passes straight'],
  failover: ['26 times', '27 times', '26.3', '2.2 h', '44 min', 'failovers ×', 'requests still go to it'],
};
/** The year's own events are its play's payoff: the band may act them out once the answer plays. */
const PLAY_ALLOWS: Record<string, string[]> = {
  weakest: ['has no other copy', 'so the request fails'],
  shared: ['shared failure takes'],
  failover: ['requests still go to it'],
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
  const widget = el.querySelector('app-reliability-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  const play = () => el.querySelector<HTMLButtonElement>('button.play:not(.step)')!;
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const key = async (target: HTMLElement, k: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const stepper = (label: string) => el.querySelector<HTMLButtonElement>(`.stepper button[aria-label="${label}"]`)!;
  const toggle = (name: string) => el.querySelector<HTMLInputElement>(`.toggles3 input[aria-label^="${name}"]`)!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  /** Every word the widget shows or says outside the question, but the scales' tick labels, which are axes. */
  const said = () =>
    [
      ...[
        ...widget.querySelectorAll('g-stage text:not([data-owner="r-top"]):not([data-owner="r-bottom"]), .controls, .describe, .standing'),
      ].map(clean),
      ...[...widget.querySelectorAll('g-stage [aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    ].join(' | ');
  const describe = () => el.querySelector<HTMLButtonElement>('.describe button')!;
  const component = () => fixture.debugElement.children[0].componentInstance as ReliabilityWidgetComponent;
  const ids = (selector: string) => [...svg().querySelectorAll(selector)].map((n) => n.getAttribute('data-id')!);
  const revealed = () => !!el.querySelector('app-widget-check .explain:not(.muted)');
  return {
    el,
    widget,
    text,
    svg,
    play,
    press,
    key,
    stepper,
    toggle,
    card,
    choose,
    said,
    describe,
    component,
    ids,
    render,
    tick,
    animate,
    watched,
    revealed,
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;
type Question = Pick<SdExperiment, 'id' | 'setup' | 'act'> & { hide?: readonly string[] };

/** Replaces the widget's hiding map with a leaky one, as a code change would: the sweep must catch what it shows. */
function plantLeak(c: ReliabilityWidgetComponent, leak: (h: Hidden) => Hidden) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed(() => leak(real())) });
}

/** Text on the HTML surfaces where a number could wrap from its unit: outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .readout, .standing, .describe .said, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (/\d (s|min|h|d)\b/.test(node.data) && !node.parentElement!.closest('.keep, code')) out.push(node.data.trim());
    }
  }
  return out;
}

/**
 * What the open question must not show, on every surface: its answer's words and false claims in any text, and the marks
 * its hidden regions would draw (prevention 1 and 2). `hide` is the question's own list, so a leaky copy is caught.
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
  const asking = phase === 'asking';
  if (!t.play().disabled) out.push('Play is enabled');
  if (
    [...t.el.querySelectorAll<HTMLButtonElement>('.stepper button, button.step')].some(
      (b) => !b.closest('fieldset:disabled') && !b.disabled,
    )
  )
    out.push('a stepper or a moment button is enabled');
  if ([...t.el.querySelectorAll<HTMLInputElement>('.toggles3 input')].some((i) => !i.closest('fieldset:disabled')))
    out.push('a toggle is enabled');
  if (!t.describe().disabled) out.push('Describe is enabled');
  if (svg.querySelector('.ghost-caret, [data-id="ghost-words"], [data-id="ghost-fact"]')) out.push('a ghost of an earlier setting');
  const shown = SHOWN.find((x) => x.id === e.id);
  const axis = [...svg.querySelectorAll('text[data-owner="r-top"], text[data-owner="r-bottom"]')].map((n) => n.textContent!.trim());
  const single = shown && asking ? singledOut(axis, shown) : null;
  if (single) out.push(`the scale's axis prints only the answer's value, ${single}`);
  if (svg.querySelector('[data-id="rule"], .split-shared, .split-failover, .split-chance'))
    out.push("the facts' rule while a question waits");
  if (h.has('sample') && asking) {
    const mark = svg.querySelector(
      '.tick-copy, .tick-fail, .tick-bypassed, .ring, .moment, .path, .box.down, .stop, .outcome.fails, .outcome.served',
    );
    if (mark) out.push(`a year mark while the year waits: ${mark.getAttribute('class')}`);
    if (!svg.querySelector('[data-id="year-hidden"]')) out.push('the hidden year is not one dashed box');
  }
  const after = h.has('after') && phase === 'playing';
  const request = h.has('request') || after;
  if (request) {
    for (const i of [0, 1, 2]) {
      const s = svg.querySelector(`[data-id="stat-${i}"]`);
      if (s && s.textContent!.trim() !== '?') out.push(`stat-${i} reads ${s.textContent}`);
    }
    if (svg.querySelector('.bar.request')) out.push("the request's bar while its numbers wait");
    if (svg.querySelector('[data-id="val-request"]')!.textContent!.trim() !== '?') out.push("the request's value while its numbers wait");
  }
  if (request || h.has('weakest')) {
    if (svg.querySelector('.capline, .capend, [data-id="cap-words"]')) out.push('the cap while the weakest link waits');
    if (svg.querySelector('[data-id^="val-"] .bad')) out.push('a marked weakest value while the weakest link waits');
  }
  if (after) {
    for (const id of changedParts(SHOWN.find((x) => x.id === e.id)!)) {
      if (!svg.querySelector(`[data-id="bar-hidden-${id}"]`)) out.push(`${id}'s bar shows while the answer plays`);
      if (svg.querySelector(`[data-id^="bar-${id}-"], [data-id="paper-${id}"]`))
        out.push(`${id}'s bar or paper words while the answer plays`);
      if (svg.querySelector(`[data-id="val-${id}"]`)!.textContent!.trim() !== '?') out.push(`${id}'s value while the answer plays`);
    }
  }
  return out;
}

describe('ReliabilityWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting from the model and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toBe(
      'A request crosses 2 load balancers, 3 app servers, 1 database and 1 recommendations service, every copy 99.9% available; copies fail independently, and traffic moves off a dead copy at once. By the model the request is 99.8% available: down 17.5 h a year, 86 min in 30 days. Weakest links: the database and the recommendations service (1 copy each), each down 8.8 h a year.',
    );
    const words = t.text('svg.draw text').join(' ');
    for (const w of [
      '99.8%',
      '17.5 h',
      '86 min',
      'Week 3: the recommendations service is down for 1 h and has no other copy, so the request fails.',
    ])
      expect(words).toContain(w);
    expect(words).toContain('In this simulated year the request failed 17 times, 17 h in all: each for 1 h.');
    expect(t.text('.notice')).toEqual([settingWords(reliabilityScenario(RELIABILITY_SETUPS.base))]);
    expect(t.text('.readout')).toEqual(['Request: 99.8% available · down 17.5 h a year']);
    expect(t.play().getAttribute('aria-label')).toBe('Next moment, 2 of 3');
    expect(t.ids('[data-id^="capend-"]')).toEqual(['capend-db', 'capend-recs']);
    expect(bareUnits(t)).toEqual([]);
  });

  it(
    'steps copies and toggles conditions, keeps one height, leaves a ghost and says each change in a sentence',
    async () => {
      const t = await setup();
      const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
      await t.press(t.stepper('More databases'));
      expect(t.el.querySelector('output[aria-label="Database: 2 copies"]')).not.toBeNull();
      expect(t.text('.notice')).toEqual([
        'The request is 99.89% available, down 8.8 h a year. Weakest link: the recommendations service (1 copy), down 8.8 h a year.',
      ]);
      expect(t.svg().querySelector('.ghost-caret')).not.toBeNull();
      expect(t.text('svg.draw text').join(' ')).toContain('Before this change: 17.5 h a year.');
      await t.press(t.toggle('Recs optional'));
      await t.press(t.toggle('Shared failures'));
      await t.press(t.toggle('Failover 5 min'));
      expect(t.text('svg.draw text').join(' ')).toContain(
        'A pair is down 92 min a year, 32 s on paper: (0.88 shared outages × 1 h) + (7.88 failovers × 5 min) + 26 s both down by chance.',
      );
      expect(t.ids('.split-shared, .split-failover, .split-chance')).toEqual([
        'split-shared',
        'split-failover',
        'split-chance',
        'split-shared-key',
        'split-failover-key',
        'split-chance-key',
      ]);
      expect(t.text('svg.draw [data-id^="split-"][data-id$="-word"]')).toEqual(['shared', 'failover', 'by chance']);
      for (const l of ['Fewer databases', 'Fewer databases']) await t.press(t.stepper(l));
      expect(t.stepper('Fewer databases').disabled).toBe(true);
      for (const l of ['More app servers', 'More load balancers', 'More load balancers']) await t.press(t.stepper(l));
      expect(t.stepper('More load balancers').disabled).toBe(true);
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    },
    LONG_MS,
  );

  it('steps through the moments without motion, each step changing the picture, and Left and Right on Play do the same', async () => {
    const t = await setup();
    const rest = t.svg().innerHTML;
    await t.press(t.play());
    expect(t.svg().innerHTML).not.toBe(rest);
    expect(t.text('.notice')[0]).toMatch(/^Week 11: LB 1 is down for 1 h\. LB 2 carries the request, so the load balancers stay up\./);
    expect(t.text('svg.draw text').join(' ')).toContain(
      'If both were down at once: their overlap, magnified, is 0.1% of 8.76 h = 32 s a year.',
    );
    expect(t.play().getAttribute('aria-label')).toBe('Next moment, 3 of 3');
    await t.key(t.play(), 'ArrowRight');
    expect(t.text('.notice')[0]).toMatch(/^Week 14: the database is down for 1 h and has no other copy, so the request fails\./);
    await t.key(t.play(), 'ArrowRight');
    expect(t.text('.notice')).toEqual(['Week 3: the recommendations service is down for 1 h and has no other copy, so the request fails.']);
    expect(t.svg().innerHTML).toBe(rest);
    await t.key(t.play(), 'ArrowLeft');
    expect(t.text('.notice')[0]).toMatch(/^Week 14:/);
    expect(t.animate).not.toHaveBeenCalled();
  });

  it('names each condition toggle starting with the words it shows (WCAG 2.5.3, label in name)', async () => {
    const t = await setup();
    for (const label of t.el.querySelectorAll('.toggles3 label')) {
      const shown = [...label.querySelector('span')!.childNodes].map((n) => n.textContent!.trim()).join(' ');
      expect(label.querySelector('input')!.getAttribute('aria-label')!.startsWith(`${shown}:`), shown).toBe(true);
    }
  });

  it(
    'plays the year on one clock: ticks only once their week is reached, the band only changed at holds, and Stop ends it',
    async () => {
      const t = await setup({ motion: 'full' });
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Stop the year');
      const c = t.component();
      let clip = 0;
      let weeks = 0;
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await t.tick(100);
        const width = Number(t.svg().querySelector('clipPath rect')!.getAttribute('width'));
        expect(width).toBeGreaterThanOrEqual(clip);
        expect(c.weeks()).toBeGreaterThanOrEqual(weeks);
        clip = width;
        weeks = c.weeks();
        expect(t.svg().querySelector('[data-id="playhead"]')).not.toBeNull();
        const outcome = t.svg().querySelector('.outcome')!.getAttribute('class')!;
        seen.add(outcome);
        if (outcome.includes('none')) expect(t.svg().querySelector('.box.down')).toBeNull();
      }
      expect(seen).toContain('outcome none');
      expect(seen).toContain('outcome fails');
      await t.press(t.play());
      expect(c.plan()).toBeNull();
      expect(t.play().getAttribute('aria-label')).toBe('Play the year');
      expect(t.svg().querySelector('[data-id="playhead"]')).toBeNull();
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
      const was = t.component().weeks();
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 20; i++) await t.tick(100);
      expect(t.component().weeks()).toBe(was);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 120 && t.component().plan(); i++) await t.tick(100);
      expect(t.text('.notice')[0]).toMatch(/^In this simulated year the request failed 17 times/);
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
          expect(t.play().getAttribute('aria-label')).toBe('Play the year, after your answer');
          expect(t.text('.notice'), e.id).toEqual([WAITS_NOTICE]);
          await t.press(t.play());
          for (const b of t.el.querySelectorAll<HTMLButtonElement>('.stepper button')) await t.press(b);
          expect(t.svg().getAttribute('aria-label'), e.id).toBe(summary);
          expect(giveaways(t, e, 'asking'), `${e.id} asking`).toEqual([]);
          expect(bareUnits(t), `${e.id} asking`).toEqual([]);
          await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
          for (let i = 0; i < 400 && !t.revealed(); i++) {
            expect(giveaways(t, e, 'playing'), `${e.id} playing`).toEqual([]);
            await t.tick(60);
          }
          expect(t.describe().disabled, e.id).toBe(false);
          expect(t.text('app-widget-check .explain'), e.id).toEqual([e.reveal]);
          expect(t.text('.notice'), `${e.id} revealed`).toEqual([settingWords(t.component().model())]);
          expect(bareUnits(t), `${e.id} revealed`).toEqual([]);
          for (const region of e.focus)
            expect(t.el.querySelector(`[data-focus^="${e.id === 'failover' ? 'timeline' : region}"]`)!.classList, e.id).toContain(
              'focused',
            );
        }
      },
      LONG_MS,
    );

  for (const motion of ['off', 'full'])
    it(
      `catches leaks planted in copies of E1, E2 and E3, motion ${motion}`,
      async () => {
        const t = await setup({ motion, host: LeakyHost });
        // E1 asked without hiding its year: the request's row counts the answer.
        await t.card(0);
        expect(giveaways(t, RELIABILITY_EXPERIMENTS[0], 'asking')).toEqual(
          expect.arrayContaining(['a year mark while the year waits: moment', 'the hidden year is not one dashed box']),
        );
        // E1 asked without hiding the request: the headline is the answer.
        await t.card(1);
        expect(giveaways(t, RELIABILITY_EXPERIMENTS[0], 'asking')).toEqual(expect.arrayContaining(['"35 h"', 'stat-1 reads 35 h']));
        // E3 asked without hiding the weakest link: the cap names the database.
        await t.card(3);
        expect(giveaways(t, RELIABILITY_EXPERIMENTS[2], 'asking')).toEqual(
          expect.arrayContaining(['the cap while the weakest link waits']),
        );
        if (motion === 'off') return;
        // E2 played without hiding the act's numbers: the database's new bar and value are the answer.
        await t.card(2);
        await t.choose(SHOWN[1].choices[1]);
        const caught = new Set<string>();
        for (let i = 0; i < 200 && !t.revealed(); i++) {
          for (const g of giveaways(t, RELIABILITY_EXPERIMENTS[1], 'playing')) caught.add(g);
          await t.tick(60);
        }
        expect([...caught]).toEqual(expect.arrayContaining(["db's bar shows while the answer plays", 'stat-1 reads 17.5 h']));
      },
      LONG_MS,
    );

  it(
    'catches leaks planted in the hiding map: E4 played with its parts shown, E3 with a ghost or its moment, E2 with the rule',
    async () => {
      const caught = async (id: string, leak: (h: Hidden) => Hidden, play: boolean, before?: (t: Setup) => void) => {
        const t = await setup({ motion: 'full' });
        plantLeak(t.component(), leak);
        const e = SHOWN[at(id)];
        await t.card(at(id));
        before?.(t);
        await t.render();
        const out = new Set(giveaways(t, e, 'asking'));
        if (play) {
          await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
          for (let i = 0; i < 200 && !t.revealed(); i++) {
            for (const g of giveaways(t, e, 'playing')) out.add(g);
            await t.tick(60);
          }
        }
        return [...out];
      };
      expect(await caught('shared', (h) => ({ ...h, parts: new Set() }), true)).toEqual(
        expect.arrayContaining(["lb's value while the answer plays", "db's bar shows while the answer plays"]),
      );
      expect(
        await caught(
          'weakest',
          (h) => ({ ...h, ghost: false }),
          false,
          (t) => (t.component() as unknown as { ghost: { set(v: unknown): void } }).ghost.set(RELIABILITY_SETUPS.base),
        ),
      ).toContain('a ghost of an earlier setting');
      expect(await caught('weakest', (h) => ({ ...h, sample: false }), false)).toEqual(
        expect.arrayContaining(['"has no other copy"', '"so the request fails"']),
      );
      expect(await caught('parallel', (h) => ({ ...h, rule: false }), false)).toContain("the facts' rule while a question waits");
    },
    LONG_MS,
  );

  it(
    'keeps the answer’s hold after the reveal, with that hour drawn under the year',
    async () => {
      const t = await setup();
      await t.card(at('parallel'));
      await t.choose(SHOWN[at('parallel')].choices[0]);
      const words = t.text('svg.draw text').join(' ');
      expect(words).toContain('Week 24: DB 1 is down for 1 h. DB 2 carries the request, so the databases stay up.');
      expect(words).toContain('If both were down at once: their overlap, magnified, is 0.1% of 8.76 h = 32 s a year.');
      expect(t.svg().querySelector('.box.serving')).not.toBeNull();
      await t.press(t.stepper('More app servers'));
      expect(t.text('svg.draw text').join(' ')).not.toContain('Week 24: DB 1 is down');
    },
    LONG_MS,
  );

  it(
    'meets the challenge only with pairs and recommendations optional, checking its bounds as the ask states them',
    async () => {
      const t = await setup();
      const checks = () =>
        [...t.el.querySelectorAll('.checks li')].map(
          (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
        );
      await t.card(at('add-a-nine'));
      expect(t.text('.notice')).toEqual([
        'The request is 99.76% available, down 20.6 h a year. Weakest links: the database and the recommendations service (1 copy each), each down 8.8 h a year.',
      ]);
      expect(checks()).toEqual(['- ·the request down 20.6 h a year, under 8.76 h: not yet', '+ ✓7 copies in all, no more than 7: met']);
      expect(t.toggle('Shared failures').disabled).toBe(true);
      expect(t.toggle('Failover 5 min').disabled).toBe(true);
      expect(t.text('.controls legend')[1]).toBe('Conditions · the goal keeps shared failures and failover on');
      expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
      expect(t.svg().querySelector('.goal-line:not(.met)')).not.toBeNull();
      await t.press(t.stepper('Fewer app servers'));
      expect(t.text('.status')).toEqual([]);
      await t.press(t.stepper('More databases'));
      expect(t.text('.status')).toEqual([]);
      await t.press(t.toggle('Recs optional'));
      expect(t.text('.status')).toEqual(['Goal met:']);
      expect(checks()[0]).toBe('+ ✓the request down 4.6 h a year, under 8.76 h: met');
      expect(t.svg().querySelector('.goal-line.met')).not.toBeNull();
      expect(t.text('svg.draw text').join(' ')).toContain('The page renders without them, so the request is served.');
      expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('add-a-nine')].reveal]);
      await t.press(t.stepper('More app servers'));
      expect(t.text('.status')).toEqual(['You met it; now:']);
    },
    LONG_MS,
  );

  it('describes each part and the request in a table, in tight cells on a desktop stage and compact on a phone', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
    const wide = await setup({ width: 700 });
    await wide.press(wide.describe());
    expect(wide.text('.describe .said')[1]).toMatch(
      /^In this simulated year the request failed 17 times, 17 h in all: each for 1 h\. The picture rests on week 3, when the recommendations service/,
    );
    expect(wide.text('g-data-table th')).toEqual(['Part', 'Copies', 'Available', 'Down a year', 'In 30 days', 'Simulated year']);
    expect(rows(wide)[2]).toEqual(['Database', '1', '99.9%', '8.8 h', '43 min', '9 failures, 9 h']);
    expect(rows(wide)[4]).toEqual(['The request', '7', '99.8%', '17.5 h', '86 min', '17 failures, 17 h']);
    expect(bareUnits(wide)).toEqual([]);
    const mid = await setup({ width: 620 });
    await mid.press(mid.describe());
    expect(mid.text('g-data-table th')).toEqual(['Part', 'Copies', 'Available', 'Down a year', 'In 30 days', 'Simulated year']);
    expect(rows(mid)[4]).toEqual(['Request', '7', '99.8%', '17.5 h', '86 min', '17 failures, 17 h']);
    expect(mid.el.querySelector('g-data-table')!.classList).toContain('compact');
    const phone = await setup({ width: 252 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table th')).toEqual(['Part', 'Copies', 'Down a year', 'This year']);
    expect(rows(phone)[2]).toEqual(['DB', '1', '8.8 h', '9×, 9 h']);
  });
});
