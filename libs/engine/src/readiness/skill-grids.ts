import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import type { Story } from '../behavioral/stories.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { PLAN_ROUNDS, type PlanRound } from '../plan/options.js';
import type { ProgressState } from '../srs/progress.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { currentTarget, LEVEL_PROFILES } from './levels.js';
import { SKILL_STATES, skillStatus, type SkillKind, type SkillState, type SkillStatus, type StatusContext } from './status.js';

export interface GridSkill extends SkillStatus {
  name: string;
  /** Counted in the round's score at the Target's level; the rest are Stretch there. */
  required: boolean;
  /** How many times it counts in the round's score. */
  weight: number;
}

export type StateTotals = Record<SkillState, number>;

/** Every skill of a round as the Progress page draws it: one square each, required or Stretch, in catalog order. */
export interface RoundGrid {
  round: PlanRound;
  /** The round's count in the Target; 0 when the loop leaves it out. */
  count: number;
  skills: GridSkill[];
  /** The design round's required cases, drawn as their own row. */
  cases: GridSkill[];
  /** Skills of every row by state. */
  totals: StateTotals;
  /** Only the skills the round's score counts. */
  required: StateTotals;
}

const tally = (skills: readonly GridSkill[]): StateTotals =>
  Object.fromEntries(SKILL_STATES.map((state) => [state, skills.filter((s) => s.state === state).length])) as StateTotals;

/** The per-round square grids of REDESIGN.md 4.10, read from the same skill states as readiness. */
export function skillGrids(state: ProgressState, stories: readonly Story[], now: Date): RoundGrid[] {
  const { target } = currentTarget(state);
  const profile = LEVEL_PROFILES[target.level];
  const ctx: StatusContext = { state, stories, now, profile };
  const skill = (kind: SkillKind, id: string, name: string, required: boolean, weight = 1): GridSkill => ({
    ...skillStatus(kind, id, ctx),
    name,
    required,
    weight,
  });
  const rows: Record<PlanRound, { skills: GridSkill[]; cases: GridSkill[] }> = {
    coding: {
      skills: PATTERN_CATALOG.map((p) => skill('pattern', p.id, p.name, profile.patterns.required.includes(p.id))),
      cases: [],
    },
    design: {
      skills: SD_TOPICS.map((t) => skill('topic', t.id, t.name, profile.topics.required.includes(t.id))),
      cases: profile.cases.required.map((id) => skill('case', id, CASE_CATALOG.find((c) => c.id === id)?.title ?? id, true)),
    },
    behavioral: {
      skills: COMPETENCY_CATALOG.map((c) => {
        const weight = profile.competencies.find((w) => w.id === c.id)?.weight ?? 1;
        return skill('competency', c.id, c.name, true, weight);
      }),
      cases: [],
    },
  };
  return PLAN_ROUNDS.map((round) => {
    const all = [...rows[round].skills, ...rows[round].cases];
    return { round, count: target.rounds[round], ...rows[round], totals: tally(all), required: tally(all.filter((s) => s.required)) };
  });
}
