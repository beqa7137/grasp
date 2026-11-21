import {
  SHARDING_EXPERIMENTS,
  SHARD_BASELINE,
  SHARD_CHALLENGE_SOLUTION,
  goalMet,
  renderExperiment,
  shardNames,
  shardScenario,
  type ExperimentSpec,
  type ShardScenario,
  type ShardSettings,
} from '@grasp/engine';
import { REST_VIEW, type RingView } from './ring-layout';
import { HIDE_PHASE, hiding, type QuestionPhase } from './ring-words';

export type ExpPhase = 'asking' | 'playing' | 'revealed' | 'start' | 'met';
export interface ExpState {
  sc: ShardScenario;
  view: RingView;
}

/**
 * One experiment's stage as the widget draws it: asking (whatever came before leaves no trace), its answer's play at a
 * moment of its clock, revealed, or the challenge at its start or met. `when` replaces the hiding map's phases, so a
 * spec can plant a leak in it.
 */
export function experimentState(
  spec: ExperimentSpec,
  phase: ExpPhase,
  frac = 0.6,
  when: Readonly<Record<string, QuestionPhase>> = HIDE_PHASE,
): ExpState {
  const setup = { ...SHARD_BASELINE, ...spec.setup } as ShardSettings;
  const e = renderExperiment(spec);
  if (spec.goal) {
    const s = phase === 'start' ? setup : { ...setup, ...SHARD_CHALLENGE_SOLUTION };
    const sc = shardScenario(s);
    const met = goalMet(spec.goal, sc.metrics, { ...sc.settings });
    return { sc, view: { ...REST_VIEW, phase: 'challenge', met, focus: met ? e.focus : [] } };
  }
  const set = (spec.act && 'set' in spec.act ? spec.act.set : {}) as Partial<ShardSettings>;
  const q: QuestionPhase = phase === 'asking' ? 'asking' : phase === 'playing' ? 'playing' : 'revealed';
  const hid = hiding(e.hide, q, when);
  const setupSc = shardScenario(setup);
  if (phase === 'asking') return { sc: setupSc, view: { ...REST_VIEW, phase: q, hid, setup: setupSc } };
  const after = { ...setup, ...set };
  const sc = shardScenario(after, set.nodes ? shardNames(setup.nodes) : null);
  return {
    sc,
    view: {
      ...REST_VIEW,
      phase: q,
      hid,
      setup: setupSc,
      frac: phase === 'playing' ? frac : null,
      replace: set.points !== undefined && phase === 'playing' ? setup.points : null,
      focus: phase === 'revealed' ? e.focus : [],
    },
  };
}

export const EXPERIMENTS = SHARDING_EXPERIMENTS;
