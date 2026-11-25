/**
 * The Durability widget's plays. A play draws one repair: a typical one, in which no other piece fails (the outcome of
 * nearly every repair), or a staged loss, named as staged, whose own chance is the model's. Neither is a sample whose
 * counts could be read as the yearly loss. Each runs on one monotone clock in seconds, and nothing for an event shows
 * before its moment.
 */
import { durabilityScenario, type DurabilityScenario, type DurabilitySettings } from './durability.js';

export type DurabilityPlayKind = 'repair' | 'staged';

/** The piece that fails in every play: the third (c3, d3), so it sits mid-row with sources on both sides; of two copies, the second. */
export const durabilityFailedIndex = (m: Pick<DurabilityScenario, 'n'>) => (m.n > 2 ? 2 : 1);

/** The pieces a rebuild reads: any one copy, or any k of the survivors (the first k, skipping the failed one). */
export function durabilitySources(m: DurabilityScenario): number[] {
  const ids = m.pieces.map((_, i) => i).filter((i) => i !== durabilityFailedIndex(m));
  return m.replicas ? [ids[0]] : ids.slice(0, m.need);
}

/**
 * The staged loss: after the first failure, t more pieces fail inside the window, spread over the row so the picture
 * reads as chance and not as a block, the last of them before the repair ends.
 */
export function durabilityStagedFailures(m: DurabilityScenario): number[] {
  const others = m.pieces.map((_, i) => i).filter((i) => i !== durabilityFailedIndex(m));
  if (m.replicas) return others;
  const out: number[] = [];
  for (let j = 0; j < m.t; j++) out.push(others[Math.round(((j + 0.5) * others.length) / m.t - 0.5)]);
  return [...new Set(out)];
}

/** When, as a fraction of the window, the j-th staged failure strikes. */
export const durabilityStagedAt = (j: number, t: number) => (j + 1) / (t + 1.6);

export type DurabilityEvent =
  | { at: number; kind: 'fail' | 'rack' | 'ways' | 'final' | 'rebuilt' | 'lost' }
  | { at: number; kind: 'step'; i: number }
  | { at: number; kind: 'staged'; piece: number; j: number };

export interface DurabilityPlan {
  kind: DurabilityPlayKind;
  rackEvent: boolean;
  fail: number;
  winStart: number;
  winEnd: number;
  win: number;
  lostAt: number | null;
  rebuiltAt: number | null;
  waysAt: number;
  finalAt: number;
  total: number;
  events: readonly DurabilityEvent[];
}

const plans = new Map<string, DurabilityPlan>();

/**
 * A play's beats on one clock: the failure, the window (longer for a longer repair, so a week visibly lasts longer
 * than a day, but never under 1.4 s), the rebuild landing, then the model's last two rows. A staged loss strikes its
 * further failures inside the window; with every piece in one rack it is a rack event, which strikes all at once.
 */
export function durabilityPlan(s: DurabilitySettings, kind: DurabilityPlayKind = 'repair'): DurabilityPlan {
  const key = `${s.scheme}|${s.afr}|${s.repair}|${s.rack}|${kind}`;
  const hit = plans.get(key);
  if (hit) return hit;
  const m = durabilityScenario(s);
  const fail = 0.35;
  const winStart = 0.9;
  const rackEvent = kind === 'staged' && !!s.rack;
  const win = rackEvent ? 0 : 1.4 + 2.2 * Math.sqrt(s.repair / 168);
  const winEnd = winStart + win;
  const events: DurabilityEvent[] = [{ at: fail, kind: 'fail' }];
  if (rackEvent) events.push({ at: fail, kind: 'rack' });
  else {
    for (let i = 1; i <= m.t; i++) events.push({ at: winStart + (win * i) / (m.t + 1), kind: 'step', i });
    if (kind === 'staged')
      durabilityStagedFailures(m).forEach((piece, j) =>
        events.push({ at: winStart + win * durabilityStagedAt(j, m.t), kind: 'staged', piece, j }),
      );
  }
  const staged = events.filter((e) => e.kind === 'staged').map((e) => e.at);
  const lostAt = kind === 'staged' ? (rackEvent ? fail : Math.max(...staged)) : null;
  const rebuiltAt = kind === 'staged' ? null : winEnd;
  const waysAt = (rackEvent ? winStart : winEnd) + 0.45;
  const finalAt = waysAt + 0.5;
  const total = finalAt + 0.9;
  events.push({ at: waysAt, kind: 'ways' }, { at: finalAt, kind: 'final' });
  if (rebuiltAt !== null) events.push({ at: rebuiltAt, kind: 'rebuilt' });
  if (lostAt !== null) events.push({ at: lostAt, kind: 'lost' });
  events.sort((a, b) => a.at - b.at);
  const out = { kind, rackEvent, fail, winStart, winEnd, win, lostAt, rebuiltAt, waysAt, finalAt, total, events };
  plans.set(key, out);
  return out;
}

export interface DurabilityPlayState {
  plan: DurabilityPlan;
  failed: boolean;
  rackDown: boolean;
  /** The staged failures struck so far, as piece indexes. */
  stagedDown: readonly number[];
  lost: boolean;
  /** The window's progress, 0 to 1. */
  progress: number;
  rebuilt: boolean;
  rows: { first: boolean; steps: number; ways: boolean; rack: boolean; final: boolean };
  done: boolean;
}

/**
 * What the clock has reached at `tau` seconds: the window's progress and which marks are drawn. At rest (`tau` null)
 * the play's end state is drawn, so nothing is lost without motion.
 */
export function durabilityPlayState(s: DurabilitySettings, kind: DurabilityPlayKind, tau: number | null): DurabilityPlayState {
  const plan = durabilityPlan(s, kind);
  const T = tau ?? Infinity;
  const reached = (at: number) => at <= T + 1e-9;
  const m = durabilityScenario(s);
  const failed = reached(plan.fail);
  const stagedDown = plan.events.flatMap((e) => (e.kind === 'staged' && reached(e.at) ? [e.piece] : []));
  const lost = plan.lostAt !== null && reached(plan.lostAt);
  let progress = 0;
  if (!plan.rackEvent) {
    const now = Math.min(T, lost ? plan.lostAt! : plan.winEnd);
    progress = !lost && reached(plan.winEnd) ? 1 : Math.max(0, Math.min(1, (now - plan.winStart) / plan.win));
  }
  const stepsShown = plan.events.filter((e) => e.kind === 'step' && reached(e.at)).length;
  return {
    plan,
    failed,
    rackDown: plan.rackEvent && failed,
    stagedDown,
    lost,
    progress,
    rebuilt: plan.rebuiltAt !== null && reached(plan.rebuiltAt),
    rows: {
      first: failed,
      steps: Math.min(m.t, stepsShown + (plan.rackEvent && failed ? m.t : 0)),
      ways: reached(plan.waysAt),
      rack: s.rack ? reached(plan.rackEvent ? plan.fail : plan.waysAt) : false,
      final: reached(plan.finalAt),
    },
    done: T >= plan.total,
  };
}
