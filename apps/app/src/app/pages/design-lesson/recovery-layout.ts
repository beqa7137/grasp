import {
  RECOVERY_ARCHIVE_EVERY_S,
  RECOVERY_BASE_EVERY_H,
  RECOVERY_REPLAY_SPEEDS,
  RECOVERY_RESTORE_GB_PER_MIN,
  formatRestoreSpeed,
  formatTimes,
  type RecoveryPlanId,
  type RecoveryScenario,
} from '@grasp/engine';
import type { Focus } from './focus-layout';
import { recoveryA } from './recovery-a';
import { recoveryB } from './recovery-b';
import {
  controlsRow,
  focusOutlines,
  hit,
  line,
  nameFor,
  reserved,
  text,
  type Ctx,
  type Hit,
  type StageMeta,
  type StageView,
} from './recovery-draw';
import { Draw, tw, wrapKept } from './recovery-text';
import { ALL_STEPS, TOLD_STEP, span, stepOf, summary, workload } from './recovery-words';

export interface Stage {
  D: Draw;
  H: number;
  hits: Hit[];
  focus: (Focus & { region: string })[];
  summary: string;
  meta: StageMeta;
}

/** The stage's padding: 12 px on a phone's narrow stage, else 16. */
export const padOf = (W: number) => (W < 380 ? 12 : 16);

/**
 * The stage, top to bottom at every width: the header, block A (what each plan loses, before the disaster), its
 * controls, block B (how long each takes to serve again, after it) with its inset of the first 90 minutes, and its
 * controls. Its height depends on its width alone.
 */
export function buildStage(W: number, m: RecoveryScenario, view: StageView): Stage {
  const D = new Draw(W);
  const PAD = padOf(W);
  const frac = view.play?.frac ?? null;
  const c: Ctx = {
    D,
    m,
    view,
    hid: view.hid,
    W,
    PAD,
    frac,
    struck: frac === null || frac >= 0.24 - 1e-9,
    hits: [],
    meta: {
      PAD,
      ax0: 0,
      xNow: 0,
      zeroX: 0,
      rings: {},
      lost: {},
      bars: {},
      fulls: 0,
      boxes: [],
      combXs: [],
      rowsB: [],
      hiddenBoxes: [],
      ticks: { a: [], b: [], i: [] },
      bHeadY: 0,
      bEndY: 0,
      aTop: 0,
      slack: 0,
    },
  };
  const s = m.settings;
  let y = PAD;

  // The header: the title and Play, the workload, the step.
  const playX = W - PAD - 44;
  const title =
    ['One disaster, four recovery plans', 'One disaster, four plans'].find((t) => tw(t, 'title') <= W - 2 * PAD - 52) ?? 'Four plans';
  text(c, 'title', PAD, y + 15, [[title, 'title', 'ink']], { owner: 'head' });
  hit(c, { kind: 'play', x: playX, y: y - 4, w: 44, h: 44, owner: 'play' });
  y += 15;
  const textW = playX - 8 - PAD;
  const wl = wrapKept(workload(s), 'cap', textW);
  const wlLines = reserved('workload', W, (mm) => wrapKept(workload(mm.settings), 'cap', textW).length);
  wl.forEach((l, i) => text(c, 'workload', PAD, y + 20 + i * 18, [[l, 'cap', 'muted']], { owner: 'head' }));
  y += 20 + (wlLines - 1) * 18;
  const stepW = W - 2 * PAD;
  const step = view.told ? TOLD_STEP : stepOf(m, frac, view.hid);
  const stLines = Math.max(...ALL_STEPS.map((t) => wrapKept(t, 'cap', stepW).length));
  wrapKept(step, 'cap', stepW).forEach((l, i) => text(c, 'step', PAD, y + 20 + i * 18, [[l, 'cap', 'ink']], { owner: 'head' }));
  y += 20 + (stLines - 1) * 18 + 16;
  line(c, 'grid', 'rule-head', 'rule', PAD, y, W - PAD, y);
  y += 18;

  const nameOf = (key: RecoveryPlanId | 'primary') => nameFor(key, c, W - 2 * PAD - 16, W - 2 * PAD);
  y = recoveryA(c, y, nameOf);
  y = controlsRow(c, y + 4, [
    { group: 'base', legend: 'Full backup every', items: RECOVERY_BASE_EVERY_H.map((h) => [h, span(h * 3600)] as const), cur: s.base },
    { group: 'archive', legend: 'Log archived every', items: RECOVERY_ARCHIVE_EVERY_S.map((a) => [a, span(a)] as const), cur: s.archive },
    {
      group: 'sync',
      legend: 'Standby',
      items: [
        [0, 'Async'],
        [1, 'Sync'],
      ],
      cur: s.sync,
    },
  ]);
  y += 18;
  line(c, 'grid', 'rule-ab', 'rule', PAD, y, W - PAD, y);
  y += 18;

  y = recoveryB(c, y, nameOf);
  y = controlsRow(c, y + 4, [
    {
      group: 'restore',
      legend: 'Restore speed',
      items: RECOVERY_RESTORE_GB_PER_MIN.map((v) => [v, formatRestoreSpeed(v)] as const),
      cur: s.restore,
    },
    {
      group: 'replay',
      legend: 'Log replay',
      items: RECOVERY_REPLAY_SPEEDS.map((v) => [v, `${formatTimes(v)} the writes`] as const),
      short: RECOVERY_REPLAY_SPEEDS.map((v) => formatTimes(v)),
      cur: s.replay,
    },
  ]);
  c.meta.bEndY = y;
  const H = y + PAD;
  return { D, H, hits: c.hits, focus: focusOutlines(D, view.focus, H), summary: summary(m, view.hid), meta: c.meta };
}
