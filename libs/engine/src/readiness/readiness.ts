import type { Story } from '../behavioral/stories.js';
import { PLAN_ROUNDS, type PlanRound, type TargetInput } from '../plan/options.js';
import type { ProgressState } from '../srs/progress.js';
import { currentTarget, LEVEL_PROFILES, type LevelProfile, type TargetSource } from './levels.js';
import { readinessBand, type ReadinessBand } from './bands.js';
import { skillStatus, type SkillKind, type SkillState, type SkillStatus, type StatusContext } from './status.js';

export * from './bands.js';

export const STATE_WEIGHTS: Record<SkillState, number> = { new: 0, learning: 0.25, practiced: 0.6, ready: 1 };

export interface RequiredSkill {
  kind: SkillKind;
  id: string;
  /** How many times it counts in its round's score. */
  weight: number;
}

/** The skills a round's score counts at a level, in the order Up next considers them. */
export function requiredSkills(round: PlanRound, profile: LevelProfile): RequiredSkill[] {
  switch (round) {
    case 'coding':
      return profile.patterns.required.map((id) => ({ kind: 'pattern', id, weight: 1 }));
    case 'design':
      return [
        ...profile.topics.required.map((id): RequiredSkill => ({ kind: 'topic', id, weight: 1 })),
        ...profile.cases.required.map((id): RequiredSkill => ({ kind: 'case', id, weight: 1 })),
      ];
    case 'behavioral':
      return profile.competencies.map(({ id, weight }) => ({ kind: 'competency', id, weight }));
  }
}

/** Skills beyond the level's lists, which Up next offers once every required one is Ready. */
export function stretchSkills(round: PlanRound, profile: LevelProfile): RequiredSkill[] {
  if (round === 'coding') return profile.patterns.stretch.map((id) => ({ kind: 'pattern', id, weight: 1 }));
  if (round === 'design') return profile.topics.stretch.map((id) => ({ kind: 'topic', id, weight: 1 }));
  return [];
}

export interface RoundReadiness {
  round: PlanRound;
  /** The round's count in the Target, its weight in loop readiness. */
  count: number;
  score: number;
  skills: (SkillStatus & { weight: number })[];
}

export interface LoopReadiness {
  score: number;
  band: ReadinessBand;
  target: TargetInput;
  source: TargetSource;
  /** Only the rounds the Target counts, in round order. */
  rounds: RoundReadiness[];
}

/** 100 × Σ weight × state weight / Σ weight, rounded; a double weight counts twice in both sums. */
export function roundScore(skills: readonly { state: SkillState; weight: number }[]): number {
  const total = skills.reduce((sum, s) => sum + s.weight, 0);
  const earned = skills.reduce((sum, s) => sum + s.weight * STATE_WEIGHTS[s.state], 0);
  return total ? Math.round((100 * earned) / total) : 0;
}

/** Σ (round count × round score) / Σ round counts, rounded. */
export function loopScore(rounds: readonly { count: number; score: number }[]): number {
  const weights = rounds.reduce((sum, r) => sum + r.count, 0);
  return weights ? Math.round(rounds.reduce((sum, r) => sum + r.count * r.score, 0) / weights) : 0;
}

export function roundReadiness(round: PlanRound, count: number, ctx: StatusContext): RoundReadiness {
  const skills = requiredSkills(round, ctx.profile).map((s) => ({ ...skillStatus(s.kind, s.id, ctx), weight: s.weight }));
  return { round, count, score: roundScore(skills), skills };
}

/** Coverage of the Target's required skills, each round weighted by its count. Reads the synced log and story bank only. */
export function loopReadiness(state: ProgressState, stories: readonly Story[], now: Date): LoopReadiness {
  const { target, source } = currentTarget(state);
  const ctx: StatusContext = { state, stories, now, profile: LEVEL_PROFILES[target.level] };
  const rounds = PLAN_ROUNDS.filter((r) => target.rounds[r] > 0).map((r) => roundReadiness(r, target.rounds[r], ctx));
  const score = loopScore(rounds);
  return { score, band: readinessBand(score), target, source, rounds };
}
