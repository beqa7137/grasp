import { ALGORITHM_CATALOG } from '../algorithms/catalog.js';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { QUESTION_PROMPTS } from '../behavioral/question-prompts.js';
import { PROBLEM_PATTERNS } from '../coding/problem-patterns.js';
import { PATTERN_CATALOG, PATTERN_TRACKS } from '../curriculum/catalog.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { MOCK_PROBLEMS } from '../interview/mock-problems.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { SCENARIO_CATALOG } from '../sysdesign/scenario-catalog.js';
import { SEARCH_DATA } from './index.data.js';
import { CUE_WORDS, PRODUCT_NAMES, SEARCH_ALIASES } from './keywords.js';
import type { SearchIndex, SearchKind, SearchRound, SearchRow } from './types.js';

/** The app's own places a learner may look for by name, each with its round, or `app` for none. */
const PAGES: readonly (readonly [path: string, title: string, blurb: string, round: SearchRound])[] = [
  ['/today/review', 'Review', 'The cards due today, spaced so you remember them.', 'app'],
  ['/today/plan', 'Study plan', 'Your days to the interview.', 'app'],
  ['/today/progress', 'Progress', 'Loop readiness, round by round.', 'app'],
  ['/today/settings', 'Settings', 'Your loop, appearance, account and data.', 'app'],
  ['/mock/loop', 'Mock loop', 'One round of each, back to back, then one debrief.', 'app'],
  ['/coding/placement', 'Placement check', 'Find where to start in about 5 minutes.', 'coding'],
  ['/design/lab', 'Lab', 'Build any design and run traffic through it.', 'design'],
  ['/behavioral/stories', 'Stories', 'Your story bank.', 'behavioral'],
  ['/behavioral/guide', 'How to answer (STAR)', 'The STAR shape, and what to do before the loop.', 'behavioral'],
  ['/behavioral/drill', 'STAR drill', 'Timed answers with follow-ups and checks.', 'behavioral'],
  ['/behavioral/rehearse', 'Rehearse stories', 'Tell your stories against the clock.', 'behavioral'],
];

const row = (kind: SearchKind, id: string, title: string, blurb: string, tags: readonly string[] = []): SearchRow => [
  id,
  title,
  blurb,
  tags,
  [...(SEARCH_ALIASES[`${kind}:${id}`] ?? []), ...(CUE_WORDS[`${kind}:${id}`] ?? []), ...(PRODUCT_NAMES[`${kind}:${id}`] ?? [])],
];

/**
 * The search index (REDESIGN.md 2.9): titles, short blurbs, tags and aliases. The catalogs that load with first paint are
 * read where they are; the generated data adds what lives in heavier modules.
 */
export function searchIndex(): SearchIndex {
  const summaries = new Map(SEARCH_DATA.caseSummary);
  const tracks = new Map(PATTERN_TRACKS.map((t) => [t.id, t.name]));
  const patterns = PROBLEM_PATTERNS as Readonly<Record<string, readonly string[]>>;
  return {
    pattern: PATTERN_CATALOG.map((p) => row('pattern', p.id, p.name, p.oneLiner, [tracks.get(p.track)!])),
    visualizer: ALGORITHM_CATALOG.map((a) => row('visualizer', a.id, a.title, '', [a.patternId])),
    problem: SEARCH_DATA.problem.map(([id, title, difficulty]) => row('problem', id, title, difficulty, patterns[id])),
    topic: SD_TOPICS.map((t) => row('topic', t.id, t.name, t.oneLiner)),
    mission: SCENARIO_CATALOG.map((s) =>
      row(
        'mission',
        s.id,
        s.title,
        s.tagline,
        SD_TOPICS.filter((t) => t.scenarioIds.includes(s.id)).map((t) => t.id),
      ),
    ),
    case: CASE_CATALOG.map((c) => row('case', c.id, c.title, summaries.get(c.id) ?? '', c.topics)),
    mock: MOCK_PROBLEMS.map((m) => row('mock', m.id, m.title, '', [m.track])),
    competency: COMPETENCY_CATALOG.map((c) => row('competency', c.id, c.name, c.oneLiner)),
    question: QUESTION_PROMPTS.map((q) => row('question', q.id, q.prompt, '', [q.competencyId])),
    story: [],
    page: PAGES.map(([path, title, blurb, round]) => row('page', path, title, blurb, [round])),
  };
}
