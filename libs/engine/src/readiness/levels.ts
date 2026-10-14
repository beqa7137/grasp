import type { Difficulty } from '../algorithms/types.js';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import type { Seniority } from '../behavioral/types.js';
import type { CodingProblemSummary } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { SD_SHELVES, sdTopicLevel, type SdShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { DEFAULT_ROUND_COUNTS, PLAN_ROUNDS, TARGET_LEVELS, type RoundCounts, type TargetInput } from '../plan/options.js';
import type { ProgressState } from '../srs/progress.js';

/** What a loop at one level asks for: readiness counts the required lists, and the plan schedules them. */
export interface LevelProfile {
  level: Seniority;
  /** The easiest problem difficulty that counts as "at level": Ready needs a solve at it. */
  bar: Difficulty;
  /** The easiest problem the plan may start a pattern on for a learner whose starting point is New. */
  startBar: Difficulty;
  patterns: { required: readonly string[]; stretch: readonly string[] };
  topics: { required: readonly string[]; stretch: readonly string[] };
  cases: { required: readonly string[] };
  /** Every competency, with how often it counts in the behavioral score. */
  competencies: readonly { id: string; weight: number }[];
}

export const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

const EARLY_PATTERNS = [
  'hashing',
  'two-pointers',
  'sliding-window',
  'binary-search',
  'prefix-sum',
  'monotonic-stack',
  'fast-slow',
  'linked-list-reversal',
  'intervals',
  'heap',
  'bfs',
  'dfs-backtracking',
  'tree-dfs',
  'dp-1d',
];
const MID_STRETCH_PATTERNS = ['minimum-spanning-tree', 'bit-manipulation', 'bitmask-dp'];
const MID_CASES = ['url-shortener', 'rate-limiter', 'news-feed', 'chat'];
// In `CASE_CATALOG` order (levels.spec.ts checks it), without importing the case catalog: the Coding hub's Skill map reads
// these profiles, and the catalog's own chunk was one more round trip before it showed.
const SENIOR_CASES = [
  'url-shortener',
  'rate-limiter',
  'typeahead',
  'news-feed',
  'chat',
  'proximity-service',
  'distributed-cache',
  'leaderboard',
  'ad-click-aggregator',
  'hotel-booking',
];
const SENIOR_STRETCH_TOPICS = ['sd-discovery', 'sd-gateway'];
const SENIOR_DOUBLE = ['leadership', 'influence', 'ambiguity', 'tradeoffs', 'technical-depth'];

const inOrder = <T extends { id: string }>(catalog: readonly T[], keep: (item: T) => boolean) => catalog.filter(keep).map((i) => i.id);
const split = <T extends { id: string }>(catalog: readonly T[], required: (item: T) => boolean) => ({
  required: inOrder(catalog, required),
  stretch: inOrder(catalog, (i) => !required(i)),
});
const weighted = (double: readonly string[]) => COMPETENCY_CATALOG.map((c) => ({ id: c.id, weight: double.includes(c.id) ? 2 : 1 }));

// Early career has no design round by default; one added by hand is held to Mid-level's design lists.
const midDesign = { topics: split(SD_TOPICS, (t) => sdTopicLevel(t.id) === 'core'), cases: { required: MID_CASES } };

export const LEVEL_PROFILES: Record<Seniority, LevelProfile> = {
  early: {
    level: 'early',
    bar: 'medium',
    startBar: 'easy',
    patterns: split(PATTERN_CATALOG, (p) => EARLY_PATTERNS.includes(p.id)),
    ...midDesign,
    competencies: weighted([]),
  },
  mid: {
    level: 'mid',
    bar: 'medium',
    startBar: 'medium',
    patterns: split(PATTERN_CATALOG, (p) => !MID_STRETCH_PATTERNS.includes(p.id)),
    ...midDesign,
    competencies: weighted([]),
  },
  senior: {
    level: 'senior',
    bar: 'medium',
    startBar: 'medium',
    patterns: split(PATTERN_CATALOG, (p) => !MID_STRETCH_PATTERNS.includes(p.id)),
    topics: split(SD_TOPICS, (t) => !SENIOR_STRETCH_TOPICS.includes(t.id)),
    cases: { required: SENIOR_CASES },
    competencies: weighted(SENIOR_DOUBLE),
  },
};

export const meetsBar = (problem: Pick<CodingProblemSummary, 'difficulty'>, bar: Difficulty) =>
  DIFFICULTY_RANK[problem.difficulty] >= DIFFICULTY_RANK[bar];

/** The levels at which none of a shelf's topics is required, so the hub can mark the shelf "Stretch at <level>". */
export function shelfStretchAt(shelf: SdShelf): Seniority[] {
  const topics = SD_SHELVES.find((s) => s.id === shelf)!;
  const all: readonly string[] = [...topics.core, ...topics.advanced];
  return TARGET_LEVELS.filter((level) => !LEVEL_PROFILES[level].topics.required.some((t) => all.includes(t)));
}

/** Where the Target came from: a `target.set`, a plan made before Targets existed, or nothing yet. */
export type TargetSource = 'set' | 'derived' | 'assumed';

/** The Target readiness and Up next use: the learner's own, else Mid-level with the default counts. */
export function currentTarget(state: Pick<ProgressState, 'target' | 'plan'>): { target: TargetInput; source: TargetSource } {
  if (state.target) return { target: state.target, source: 'set' };
  const defaults = DEFAULT_ROUND_COUNTS.mid;
  if (!state.plan) return { target: { level: 'mid', rounds: { ...defaults } }, source: 'assumed' };
  const rounds = Object.fromEntries(PLAN_ROUNDS.map((r) => [r, state.plan!.rounds.includes(r) ? defaults[r] : 0])) as RoundCounts;
  return { target: { level: 'mid', rounds }, source: 'derived' };
}
