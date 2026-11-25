import { Component, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  RECOVERY_BASELINE as B,
  RECOVERY_CHALLENGE_SOLUTION,
  RECOVERY_EXPERIMENTS,
  RECOVERY_PLANS,
  formatMinutes,
  formatRecoveryTime,
  formatSpan,
  recoveryScenario,
  renderExperiment,
  type RecoverySettings,
  type SdExperiment,
} from '@grasp/engine';
import { RecoveryWidgetComponent } from './recovery-widget.component';
import { FALSE_CLAIMS } from './recovery-claims.testing';
import { buildStage, type Stage } from './recovery-layout';
import {
  REST_NOTICE,
  WAIT_NOTICE,
  hiding,
  rpoHidden,
  rtoHidden,
  settingSentence,
  story,
  summary,
  type Hid,
  type HidFlag,
} from './recovery-words';

@Component({
  selector: 'app-recovery-test-host',
  imports: [RecoveryWidgetComponent],
  template: `<app-recovery-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = RECOVERY_EXPERIMENTS;
}

const SHOWN = RECOVERY_EXPERIMENTS.map(renderExperiment);
const QUESTIONS = SHOWN.filter((e) => !e.goal);
const LONG_MS = 400_000;
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const actOf = (e: SdExperiment) => ({ ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as RecoverySettings;
const setupOf = (id: string) => recoveryScenario({ ...B, ...SHOWN[at(id)].setup } as RecoverySettings);
const afterOf = (id: string) => recoveryScenario(actOf(SHOWN[at(id)]));
const time = formatRecoveryTime;

/** While a question asks and while its answer plays, no text of the widget outside the dock may hold these. */
const GIVEAWAYS: Record<string, { both?: string[]; asking?: string[]; playing?: string[] }> = {
  'replica-drop': {
    both: [
      'cannot',
      'the drop too',
      'applied the drop',
      'waits in its log',
      'never',
      `back in ${time(setupOf('replica-drop').plans.delayed.rtoMin)}`,
      'pause it',
    ],
  },
  'pitr-time': {
    both: [
      `back in ${time(setupOf('pitr-time').plans.pitr.rtoMin)}`,
      formatMinutes(setupOf('pitr-time').plans.pitr.rtoMin),
      formatMinutes(setupOf('pitr-time').replayMin),
      'in all',
      'serves last',
      'h after the',
      'min after the',
      `serves in ${time(setupOf('pitr-time').plans.pitr.rtoMin)}`,
      time(setupOf('pitr-time').plans.pitr.rtoMin),
    ],
  },
  archive: {
    playing: [
      `back in ${time(afterOf('archive').plans.pitr.rtoMin)}`,
      `loses ${formatSpan(afterOf('archive').plans.pitr.rpoS)}`,
      `up to ${formatSpan(afterOf('archive').plans.pitr.rpoS)}`,
      'was ',
      'in all',
      'serves last',
    ],
  },
  growth: {
    playing: [
      `back in ${time(afterOf('growth').plans.full.rtoMin)}`,
      `back in ${time(afterOf('growth').plans.pitr.rtoMin)}`,
      `back in ${time(afterOf('growth').plans.standby.rtoMin)}`,
      `back in ${time(afterOf('growth').plans.delayed.rtoMin)}`,
      formatMinutes(afterOf('growth').restoreMin),
      'was ',
      'serves last',
      'h after the disaster',
      'min after the disaster',
    ],
  },
  delayed: {
    both: [
      `back in ${time(setupOf('delayed').plans.delayed.rtoMin)}`,
      formatMinutes(setupOf('delayed').delayedReplayMin),
      time(setupOf('delayed').plans.delayed.rtoMin),
      'waits in its log',
      'pause it',
      'back last',
    ],
  },
};
/** Settings a learner may have left before opening a card: every act's, the challenge's solution and two more. */
const FROMS: Partial<RecoverySettings>[] = [
  ...SHOWN.filter((e) => e.act && 'set' in e.act).map(actOf),
  { ...RECOVERY_CHALLENGE_SOLUTION },
  { disaster: 1, sync: 1 },
  { size: 500, base: 1, archive: 300 },
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
  const widget = el.querySelector('app-recovery-widget')!;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const svg = () => el.querySelector('svg.draw')!;
  /** A text's words, all its lines joined. */
  const tx = (id: string) => {
    const ns = [...svg().querySelectorAll(`[data-id="${id}"], [data-id^="${id}#"]`)];
    return ns.length ? ns.map(clean).join(' ') : null;
  };
  const press = async (b: HTMLElement) => {
    b.click();
    await render();
  };
  const play = () => el.querySelector<HTMLButtonElement>('button.play')!;
  const input = (name: string, label: string) =>
    [...el.querySelectorAll<HTMLInputElement>(`input[name="recovery-${name}"]`)].find((i) =>
      [label, `${label} the writes`].includes(clean(i.closest('label')!)),
    )!;
  const card = async (i: number) => press(el.querySelectorAll<HTMLButtonElement>('.cards button')[i]);
  const choose = async (label: string) =>
    press([...el.querySelectorAll<HTMLButtonElement>('app-widget-check button')].find((b) => clean(b) === label)!);
  const component = () => fixture.debugElement.children[0].componentInstance as RecoveryWidgetComponent;
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

/** How the stage's summary names each plan, and what it says in place of a hidden loss. */
const SUMMARY_NAME = { full: 'full backups', pitr: 'point-in-time recovery', standby: 'the standby', delayed: 'the delayed replica' };
const SUMMARY_LOSS_HIDDEN = {
  full: 'full backups: its loss shows after your answer',
  pitr: 'its loss shows after your answer',
  standby: 'the standby: what it can bring back shows after your answer',
  delayed: 'the delayed replica: what it can bring back shows after your answer',
};

/**
 * The structure an open question must not show: live controls, a ghost, and the marks and numbers its regions hide, in
 * both blocks, the inset and the stage's summary. Which plans are hidden comes from the question's own `hide` list, so a
 * render path that ignores the widget's hiding map is caught by what it draws.
 */
function structural(t: Setup, e: SdExperiment, phase: 'asking' | 'playing'): string[] {
  const out: string[] = [];
  const svg = t.svg();
  const hide = new Set(e.hide);
  const playing = phase === 'playing';
  const has = (sel: string) => !!svg.querySelector(sel);
  const W = Number(svg.getAttribute('width'));
  const axis = W - 2 * (W < 380 ? 12 : 16);
  if (!t.play().disabled) out.push('Play is enabled');
  for (const i of t.el.querySelectorAll<HTMLInputElement>('app-recovery-widget input'))
    if (!i.disabled && !i.closest('fieldset:disabled')) out.push(`a setting is live: ${i.name}`);
  if (has('[data-id^="ghost-"]') || /was /.test(svg.textContent ?? '')) out.push('a ghost of an earlier setting');
  const replicas = hide.has('replicasDrop') ? ['standby', 'delayed'] : hide.has('delayedOutcome') ? ['delayed'] : [];
  for (const k of replicas) {
    if (t.tx(`a-${k}-value`) !== null && !/\?/.test(t.tx(`a-${k}-value`)!)) out.push(`${k}'s loss reads "${t.tx(`a-${k}-value`)}"`);
    if (t.tx(`b-${k}-value`) !== null && !/\?/.test(t.tx(`b-${k}-value`)!)) out.push(`${k}'s time reads "${t.tx(`b-${k}-value`)}"`);
    if (/\d/.test(t.tx(`b-${k}-ledger`) ?? '')) out.push(`${k}'s ledger counts`);
    if (!playing) {
      const marks =
        k === 'standby'
          ? ['ring-standby', 'lost-standby', 'standby-x', 'never-standby', 'bar-standby-promote']
          : ['ring-delayed', 'lost-delayed', 'delayed-drop', 'bar-delayed-replay'];
      for (const id of marks) if (has(`[data-id="${id}"]`)) out.push(`${id} drawn while the question asks`);
      const box = svg.querySelector(`[data-id="hidden-b-${k}"]`);
      if (!box || Math.abs(Number(box.getAttribute('width')) - axis) > 0.2)
        out.push(`${k}'s hidden box is ${box?.getAttribute('width')} px, not the axis`);
    }
  }
  const insetHidden = [...replicas, ...(hide.has('pitrTime') ? ['pitr'] : [])];
  if (!playing)
    for (const k of insetHidden) {
      for (const sel of [`[data-id^="ibar-${k}-"]`, `[data-id="iserve-${k}"]`, `[data-id="never-i-${k}"]`, `[data-id="more-${k}"]`])
        if (has(sel)) out.push(`${sel} drawn in the inset while the question asks`);
      if (!has(`[data-id="hidden-i-${k}"]`)) out.push(`${k}'s inset row has no hidden box`);
    }
  const real = hiding(e.hide ?? [], phase);
  const label = svg.getAttribute('aria-label') ?? '';
  for (const k of RECOVERY_PLANS) {
    if (rtoHidden(real, k) && !label.includes(`${SUMMARY_NAME[k]}: after your answer`)) out.push(`the summary gives ${k}'s time`);
    if (rpoHidden(real, k) && !label.includes(SUMMARY_LOSS_HIDDEN[k])) out.push(`the summary gives what ${k} loses`);
  }
  if (hide.has('pitrTime')) {
    if (t.tx('b-pitr-value') !== null && !/\?/.test(t.tx('b-pitr-value')!)) out.push(`PITR's time reads "${t.tx('b-pitr-value')}"`);
    if (/\d/.test(t.tx('b-pitr-ledger') ?? '')) out.push("PITR's ledger counts");
    if (!playing) {
      if (has('[data-id^="bar-pitr-"]')) out.push("PITR's bar drawn while the question asks");
      const box = svg.querySelector('[data-id="hidden-b-pitr"]');
      if (!box || Math.abs(Number(box.getAttribute('width')) - axis) > 0.2)
        out.push(`PITR's hidden box is ${box?.getAttribute('width')} px, not the axis`);
    }
  }
  if (hide.has('pitrAfter') && playing) {
    for (const id of ['a-pitr-value', 'b-pitr-value'])
      if (t.tx(id) !== null && !/\?/.test(t.tx(id)!)) out.push(`${id} reads "${t.tx(id)}"`);
    if (/\d/.test(t.tx('b-pitr-ledger') ?? '') || /\d/.test(t.tx('a-pitr-note') ?? '')) out.push("PITR's new numbers in its words");
  }
  if (hide.has('rtoAfter') && playing)
    for (const k of RECOVERY_PLANS)
      if ((t.tx(`b-${k}-value`) !== null && !/\?/.test(t.tx(`b-${k}-value`)!)) || /\d/.test(t.tx(`b-${k}-ledger`) ?? ''))
        out.push(`${k}'s new time shown while the answer plays`);
  // While a hidden region's answer plays, its mechanism is drawn and its outcome marks wait for the reveal.
  if (playing) {
    const held = new Set(replicas);
    if (hide.has('pitrTime') || hide.has('pitrAfter')) held.add('pitr');
    if (hide.has('rtoAfter')) RECOVERY_PLANS.forEach((k) => held.add(k));
    for (const k of held) {
      const rpoToo = replicas.includes(k) || hide.has('pitrAfter');
      const ids = [
        `serve-${k}`,
        `iserve-${k}`,
        `never-${k}`,
        `never-i-${k}`,
        ...(rpoToo ? [`ring-${k}`, `lost-${k}`, ...(k === 'standby' ? ['standby-x'] : [])] : []),
      ];
      for (const id of ids) if (has(`[data-id="${id}"]`)) out.push(`${id} drawn while the answer plays`);
    }
  }
  if (/\d/.test(t.tx('step') ?? '')) out.push(`the step counts: "${t.tx('step')}"`);
  if (/\d/.test(t.tx('b-head-sub') ?? '')) out.push(`block B's head counts: "${t.tx('b-head-sub')}"`);
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

/** Number text in the notice, the story, the note, Describe and the dock outside a kept run of `g-code-text`. */
function bareUnits(t: Setup): string[] {
  const out: string[] = [];
  for (const el of t.widget.querySelectorAll('.notice, .caption, .model-note, .describe .said, .describe .note, app-experiment-dock')) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (/\d[\d,.]* (s|min|h|GB|TB|GB\/min)\b/.test(node.data) && !node.parentElement!.closest('.keep, code')) out.push(node.data.trim());
    }
  }
  return out;
}

/** Replaces the widget's hiding map with one that leaks `flags`, as a code change would. */
function plantLeak(c: RecoveryWidgetComponent, flags: readonly HidFlag[]) {
  const real = c.hid;
  Object.defineProperty(c, 'hid', { value: computed((): Hid => ({ ...real(), ...Object.fromEntries(flags.map((f) => [f, false])) })) });
}

/**
 * Replaces one render path with one that ignores `flags`, as a code change to it would, while the hiding map itself
 * stays right: the stage's summary, or the inset's rows (its other marks stay the real stage's).
 */
function plantRenderLeak(c: RecoveryWidgetComponent, surface: 'summary' | 'inset', flags: readonly HidFlag[]) {
  const real = c.stage;
  const leaky = () => ({ ...c.hid(), ...Object.fromEntries(flags.map((f) => [f, false])) }) as Hid;
  const INSET = /^(ibar-|iserve-|never-i-|hidden-i-|more-)/;
  Object.defineProperty(c, 'stage', {
    value: computed((): Stage => {
      const st = real();
      if (surface === 'summary') return { ...st, summary: summary(c.model(), leaky()) };
      const view = { hid: leaky(), play: null, answering: false, ghost: null, told: false, challenge: false, focus: [] };
      const other = buildStage(c.width(), c.model(), view).D;
      const D = Object.create(st.D) as Stage['D'];
      D.prims = (layers) => [
        ...st.D.prims(layers).filter((p) => !INSET.test(p.id)),
        ...other.prims(layers).filter((p) => INSET.test(p.id)),
      ];
      return { ...st, D };
    }),
  });
}

/** Opens a question from `from`, and returns what the sweep finds while it asks, and, with motion, while its answer plays. */
async function probe(t: Setup, e: SdExperiment, from: Partial<RecoverySettings> | null, phases: ('asking' | 'playing')[]) {
  t.component().exp.active.set(null);
  if (from) for (const [k, v] of Object.entries(from)) t.component().set(k as keyof RecoverySettings, v);
  await t.render();
  await t.card(at(e.id));
  const found = new Set<string>();
  if (phases.includes('asking')) for (const g of giveaways(t, e, 'asking')) found.add(`asking: ${g}`);
  if (phases.includes('playing')) {
    await t.choose(e.choices[(e.answer + 1) % e.choices.length]);
    for (let i = 0; i < 400 && !t.revealed(); i++) {
      for (const g of giveaways(t, e, 'playing')) found.add(`playing: ${g}`);
      await t.tick(110);
    }
  }
  return [...found];
}

describe('RecoveryWidgetComponent', { timeout: LONG_MS }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default setting with every number from the model, and says it in its summary', async () => {
    const t = await setup();
    expect(t.svg().getAttribute('aria-label')).toContain('After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h');
    expect(t.tx('a-full-value')).toBe('loses 24 h');
    expect(t.tx('a-pitr-value')).toBe('loses 1 min');
    expect(t.tx('a-standby-value')).toBe('loses 5 s');
    expect(t.tx('b-pitr-value')).toBe('back in 5.7 h');
    expect(t.tx('b-pitr-ledger')).toBe('restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all');
    expect(t.tx('b-delayed-value')).toBe('back in 7 min');
    expect(t.play().getAttribute('aria-label')).toBe('Play the disaster and the recovery');
    expect(t.text('.notice')).toEqual([REST_NOTICE]);
    expect(t.el.querySelector('g-stage')!.getAttribute('aria-label')).toBe(
      'Backups and recovery: one disaster, what four recovery plans lose and how long each takes to serve again',
    );
  });

  it('never prints an answer on the stage a learner sees on load', async () => {
    const asked = ['4.5 h', '272 min', '13 min', 'cannot', 'never', 'loses 10 s', '16.7 h', '19.1 h'];
    for (const width of [252, 344, 620]) {
      const t = await setup({ width });
      const words = t.said();
      for (const a of asked) expect(words, `${width}px: "${a}"`).not.toContain(a);
      vi.unstubAllGlobals();
    }
  });

  it('changes each setting, keeps one height, says each change in a sentence and keeps its ghost in words', async () => {
    const t = await setup();
    const h = t.el.querySelector<HTMLElement>('g-stage .well')!.style.height;
    await t.press(t.input('archive', '10 s'));
    expect(t.text('.notice').join('')).toBe(settingSentence(recoveryScenario({ ...B, archive: 10 })));
    expect(t.tx('a-pitr-value')).toBe('loses 10 s · was 1 min');
    await t.press(t.input('restore', '50 GB/min'));
    expect(t.tx('b-pitr-value')).toContain('· was 5.7 h');
    expect(t.svg().querySelector('[data-id="ghost-pitr"]')).not.toBeNull();
    for (const [name, label] of [
      ['base', '6 h'],
      ['sync', 'Sync'],
      ['replay', '20×'],
      ['disaster', 'Table dropped'],
      ['size', '10 TB'],
    ] as const) {
      await t.press(t.input(name, label));
      expect(t.el.querySelector<HTMLElement>('g-stage .well')!.style.height).toBe(h);
    }
    expect(t.component().settings()).toEqual({ disaster: 1, size: 10000, restore: 50, base: 6, archive: 10, replay: 20, sync: 1 });
    expect(t.tx('b-standby-value')).toBe('never');
    expect(t.tx('a-standby-value')).toBe('cannot bring it back');
    await t.press(t.input('disaster', 'Disks lost'));
    expect(t.tx('a-pitr-value')).toBe('loses 10 s · was nothing');
  });

  it('writes what a play did under the stage when motion is reduced', async () => {
    const t = await setup();
    await t.press(t.play());
    expect(t.text('.caption')).toEqual([story(recoveryScenario(B))]);
    expect(t.text('.notice')).toEqual(t.text('.caption'));
    expect(t.tx('step')).toBe('Written below the picture.');
    expect(bareUnits(t)).toEqual([]);
    await t.press(t.input('replay', '20×'));
    expect(t.text('.caption')).toEqual([]);
  });

  it(
    'plays the disaster on one clock, says its steps, stops on Stop and pauses while the widget host is offscreen',
    async () => {
      const t = await setup({ motion: 'full' });
      expect(t.watched.map((w) => w.el)).toContain(t.widget);
      await t.press(t.play());
      expect(t.play().getAttribute('aria-label')).toBe('Stop the disaster and the recovery');
      const host = t.watched.find((w) => w.el === t.widget)!;
      await t.tick(400);
      const step = t.tx('step');
      const cursor = t.svg().querySelector('[data-id="cursor-full"]')?.getAttribute('x1');
      host.report([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      for (let i = 0; i < 10; i++) await t.tick(300);
      expect(t.svg().querySelector('[data-id="cursor-full"]')?.getAttribute('x1')).toBe(cursor);
      expect(t.tx('step')).toBe(step);
      host.report([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      const steps = new Set<string>();
      const notices = new Set<string>();
      for (let i = 0; i < 200 && t.component().playing(); i++) {
        steps.add(t.tx('step')!);
        notices.add(t.text('.notice')[0]);
        await t.tick(110);
      }
      expect([...steps]).toEqual(
        expect.arrayContaining([
          'The day before: full backups copy the database; the log and both replicas get every write.',
          'The disks fail: everything on the primary is gone.',
          "Each plan's recovery point: the newest moment it can bring back.",
        ]),
      );
      expect([...steps].some((s) => /^Recovering: [\d.]+ h after the disaster\.$/.test(s))).toBe(true);
      expect([...notices].some((n) => /\d/.test(n) && n.startsWith('Recovering'))).toBe(false);
      expect(t.text('.notice')[0]).toBe('Point-in-time recovery serves last, 5.7 h after the disaster.');
      // Two columns here: a tall stage still brings its recovery into view, and the notice stays pinned beside it.
      expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(t.el.querySelector('.block-b'));
      expect(t.widget.classList).toContain('pinned');
      await t.press(t.play());
      await t.tick(500);
      await t.press(t.play());
      expect(t.component().playing()).toBe(false);
      expect(t.tx('step')).toMatch(/^Each plan is judged/);
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
          expect(t.text('.model-note')).toEqual(['A schematic model. Its assumptions show after your answer.']);
          const before = t.component().settings();
          for (const i of t.el.querySelectorAll<HTMLInputElement>('app-recovery-widget input')) await t.press(i);
          await t.press(t.play());
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
      const leaks: [string, string, 'asking' | 'playing', HidFlag[], Partial<RecoverySettings> | null][] = [
        ["E1 asked, the standby's words shown", 'replica-drop', 'asking', ['standbyWords'], null],
        ["E1 asked, the standby's outcome drawn", 'replica-drop', 'asking', ['standbyMarks'], null],
        ["E1 played, the standby's words shown", 'replica-drop', 'playing', ['standbyWords'], null],
        ["E1 asked, the delayed replica's words shown", 'replica-drop', 'asking', ['delayedWords'], null],
        ["E1 asked, the delayed replica's outcome drawn", 'replica-drop', 'asking', ['delayedMarks'], null],
        ["E1 played, the delayed replica's words shown", 'replica-drop', 'playing', ['delayedWords'], null],
        ["E1 played, the replicas' outcomes drawn", 'replica-drop', 'playing', ['outcomesHeld'], null],
        ["E2 asked, PITR's time shown", 'pitr-time', 'asking', ['pitrRto'], null],
        ["E2 asked, PITR's bar drawn", 'pitr-time', 'asking', ['pitrRtoMarks'], null],
        ["E2 played, PITR's time shown", 'pitr-time', 'playing', ['pitrRto'], null],
        ["E2 asked, PITR's hidden box sized by its time", 'pitr-time', 'asking', ['boxFull'], null],
        ["E2 played, PITR's serve dot drawn", 'pitr-time', 'playing', ['outcomesHeld'], null],
        ["E3 played, PITR's new loss shown", 'archive', 'playing', ['pitrRpo'], null],
        ["E3 played, PITR's time shown", 'archive', 'playing', ['pitrRto'], null],
        ['E4 played, every time shown', 'growth', 'playing', ['allRto'], null],
        ['E4 played, the serve dots drawn', 'growth', 'playing', ['outcomesHeld'], null],
        ["E5 asked, the delayed replica's words shown", 'delayed', 'asking', ['delayedWords'], null],
        ["E5 asked, the delayed replica's outcome drawn", 'delayed', 'asking', ['delayedMarks'], null],
        ['E3 asked with the ghost of the setting before it', 'archive', 'asking', ['ghost'], { archive: 300 }],
        ["E1 asked, Play and the stage's settings live", 'replica-drop', 'asking', ['locked'], null],
      ];
      const renderLeaks: [string, string, 'asking' | 'playing', 'summary' | 'inset', HidFlag[]][] = [
        ["E2 asked, the summary ignoring PITR's hidden time", 'pitr-time', 'asking', 'summary', ['pitrRto']],
        ["E3 played, the summary ignoring PITR's hidden time", 'archive', 'playing', 'summary', ['pitrRto']],
        ["E1 asked, the summary ignoring the standby's hidden loss", 'replica-drop', 'asking', 'summary', ['standbyWords']],
        ["E5 asked, the inset ignoring the delayed replica's hidden marks", 'delayed', 'asking', 'inset', ['delayedMarks']],
        ["E1 asked, the inset ignoring the standby's hidden marks", 'replica-drop', 'asking', 'inset', ['standbyMarks']],
        ["E2 asked, the inset ignoring PITR's hidden bar", 'pitr-time', 'asking', 'inset', ['pitrRtoMarks']],
      ];
      const caught: Record<string, boolean> = {};
      const planted = [
        ...leaks.map(([name, id, phase, flags, ghost]) => ({
          name,
          id,
          phase,
          ghost,
          plant: (c: RecoveryWidgetComponent) => plantLeak(c, flags),
        })),
        ...renderLeaks.map(([name, id, phase, surface, flags]) => ({
          name,
          id,
          phase,
          ghost: null,
          plant: (c: RecoveryWidgetComponent) => plantRenderLeak(c, surface, flags),
        })),
      ];
      for (const { name, id, phase, ghost, plant } of planted) {
        const e = SHOWN[at(id)];
        const run = async (leak: boolean) => {
          const t = await setup({ motion: 'full' });
          const c = t.component();
          if (leak) plant(c);
          if (ghost) Object.defineProperty(c, 'ghostShown', { value: computed(() => ({ ...B, ...ghost }) as RecoverySettings) });
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

  it(
    "brings an answer's block into view in two columns as its recovery starts, and pins the notice until the reveal or a change",
    async () => {
      const t = await setup({ motion: 'full' });
      const scrolled = () => vi.mocked(Element.prototype.scrollIntoView).mock.contexts;
      await t.card(at('pitr-time'));
      vi.mocked(Element.prototype.scrollIntoView).mockClear();
      await t.choose(SHOWN[at('pitr-time')].choices[SHOWN[at('pitr-time')].answer]);
      expect(t.widget.classList).toContain('pinned');
      for (let i = 0; i < 200 && !scrolled().includes(t.el.querySelector('.block-b')); i++) await t.tick(110);
      expect(scrolled()).toContain(t.el.querySelector('.block-b'));
      for (let i = 0; i < 200 && !t.revealed(); i++) await t.tick(110);
      expect(t.revealed()).toBe(true);
      expect(t.widget.classList).not.toContain('pinned');
      await t.card(at('replica-drop'));
      vi.mocked(Element.prototype.scrollIntoView).mockClear();
      await t.choose(SHOWN[at('replica-drop')].choices[0]);
      for (let i = 0; i < 200 && !t.revealed(); i++) await t.tick(110);
      expect(scrolled()).toContain(t.el.querySelector('.block-a'));
      expect(scrolled()).not.toContain(t.el.querySelector('.block-b'));
      vi.unstubAllGlobals();
      const free = await setup({ motion: 'full' });
      await free.press(free.play());
      for (let i = 0; i < 200 && free.component().playing(); i++) await free.tick(110);
      expect(free.widget.classList).toContain('pinned');
      await free.press(free.input('size', '500 GB'));
      expect(free.widget.classList).not.toContain('pinned');
    },
    LONG_MS,
  );

  it('meets the challenge only with the one triple, checking its bounds as the ask states them', async () => {
    const t = await setup();
    const checks = () =>
      [...t.el.querySelectorAll('.checks li')].map(
        (li) => `${li.classList.contains('met') ? '+' : '-'} ${li.textContent!.replace(/\s+/g, ' ').trim()}`,
      );
    await t.card(at('meet'));
    expect(t.text('.notice')).toEqual([settingSentence(recoveryScenario(B))]);
    expect(checks()).toEqual([
      '+ ✓point-in-time recovery loses at most 1 min (now up to 1 min): met',
      '- ·point-in-time recovery serves again within 1 h (now 5.7 h): not yet',
      '+ ✓no more than one full backup every 6 h (now every 24 h): met',
    ]);
    expect(t.text('.describe .muted')).toEqual(['Describe waits until you meet the goal.']);
    expect(t.svg().textContent).toContain('1 h goal');
    await t.press(t.input('disaster', 'Table dropped'));
    expect(t.text('.status')).toEqual(['The goal keeps 2 TB and the disks lost.']);
    // Off the goal's setting no bound is judged, so no line reads met.
    expect(checks()).toEqual([
      '- ·point-in-time recovery loses at most 1 min (now nothing)',
      '- ·point-in-time recovery gets the table back within 1 h (now 5.8 h)',
      '- ·no more than one full backup every 6 h (now every 24 h)',
    ]);
    await t.press(t.input('disaster', 'Disks lost'));
    await t.press(t.input('restore', '50 GB/min'));
    await t.press(t.input('base', '6 h'));
    expect(t.text('.status')).toEqual([]);
    await t.press(t.input('replay', '20×'));
    expect(t.text('.status')).toEqual(['Goal met:']);
    expect(t.text('app-experiment-dock .reveal')).toEqual([SHOWN[at('meet')].reveal]);
    await t.press(t.input('archive', '5 min'));
    expect(t.text('.status')).toEqual(['You met it; now:']);
  });

  it('describes each plan against each disaster, the current rows marked, compact on a narrow stage', async () => {
    const rows = (t: Setup) =>
      [...t.el.querySelectorAll('g-data-table tbody tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((td) => td.textContent!.trim()),
      );
    const wide = await setup({ width: 620 });
    await wide.press(wide.describe());
    expect(wide.text('g-data-table thead th')).toEqual(['Plan', 'Disaster', 'Loses (RPO)', 'Back in (RTO)']);
    expect(rows(wide)[1]).toEqual(['Point-in-time recovery', 'disks lost', '1 min', '5.7 h']);
    expect(rows(wide)[6]).toEqual(['Standby', 'a dropped table', 'the table', 'never']);
    expect([...wide.el.querySelectorAll('g-data-table tr[aria-current]')]).toHaveLength(4);
    expect(wide.text('.describe .note')).toEqual([
      "Rows are this setting's: 2 TB restored at 10 GB/min, a full backup every 24 h, the log archived every 1 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model.",
    ]);
    expect(bareUnits(wide)).toEqual([]);
    vi.unstubAllGlobals();
    const phone = await setup({ width: 252 });
    await phone.press(phone.describe());
    expect(phone.text('g-data-table thead th')).toEqual(['Plan', 'Loses', 'Back in']);
    expect(rows(phone)[5]).toEqual(['Point-in-time, drop', 'nothing', '5.8 h']);
  });
});
