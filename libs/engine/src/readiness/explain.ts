import { ROUND_NAMES } from '../plan/options.js';
import { SKILL_STATES, type SkillState } from './skill-status.js';
import type { LoopReadiness, RoundReadiness } from './readiness.js';

const STATE_NAMES: Record<SkillState, string> = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One term of the loop's weighted mean: a round's score and how often the Target counts it. */
export interface LoopTerm {
  name: string;
  count: number;
  score: number;
}

/** The loop's score as it is computed: Σ (count × score) / Σ count, from the same rounded round scores. */
export interface LoopArithmetic {
  terms: LoopTerm[];
  divisor: number;
  score: number;
  text: string;
}

/** "(2 × Coding 37 + System design 22 + Behavioral 27) / 4 = 31", or "Coding 37" for a loop of one round counted once. */
export function loopArithmetic(readiness: Pick<LoopReadiness, 'rounds' | 'score'>): LoopArithmetic {
  const terms = readiness.rounds.map((r) => ({ name: ROUND_NAMES[r.round], count: r.count, score: r.score }));
  const divisor = terms.reduce((sum, t) => sum + t.count, 0);
  const sum = terms.map((t) => `${t.count > 1 ? `${t.count} × ` : ''}${t.name} ${t.score}`).join(' + ');
  const text = divisor === 1 ? sum : `(${sum}) / ${divisor} = ${readiness.score}`;
  return { terms, divisor, score: readiness.score, text };
}

/** "21 required patterns: 3 Ready, 6 Practiced, 5 Learning, 7 New = 37" (REDESIGN.md 4.10), states with none left out. */
export function roundArithmetic(round: Pick<RoundReadiness, 'round' | 'skills' | 'score'>): string {
  const counts = (kind?: string) => round.skills.filter((s) => !kind || s.kind === kind).length;
  const doubled = round.skills.filter((s) => s.weight > 1).length;
  const what =
    round.round === 'coding'
      ? plural(counts(), 'required pattern')
      : round.round === 'design'
        ? `${plural(counts('topic'), 'required topic')} and ${plural(counts('case'), 'required case')}`
        : `${plural(counts(), 'competency', 'competencies')}${doubled ? `, ${doubled} counted twice` : ''}`;
  const states = [...SKILL_STATES]
    .reverse()
    .map((state) => [state, round.skills.filter((s) => s.state === state).length] as const)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${STATE_NAMES[state]}`);
  return `${what}: ${states.join(', ')} = ${round.score}`;
}
