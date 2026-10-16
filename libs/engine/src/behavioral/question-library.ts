import { COMPETENCY_CATALOG } from './catalog.js';
import { COMPETENCIES } from './competencies.js';
import type { BehavioralQuestion } from './types.js';
import { paramText, paramValues, type UrlParams } from '../url-params.js';

/**
 * What a question shows in the Questions library. A draft lives on the device per question; a story is tagged with
 * competencies, not questions, so a question has a story when one covers its competency. The two overlap.
 */
export const QUESTION_STATUSES = ['not-drafted', 'drafted', 'story'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** The Questions library's filters, which live only in the URL (REDESIGN.md 2.5, 4.8). An empty list means "any". */
export interface QuestionQuery {
  q: string;
  competency: readonly string[];
  status: readonly QuestionStatus[];
}

export const EMPTY_QUESTION_QUERY: QuestionQuery = { q: '', competency: [], status: [] };

export type QuestionFacet = Exclude<keyof QuestionQuery, 'q'>;
const FACET_VALUES: Record<QuestionFacet, readonly string[]> = {
  competency: COMPETENCY_CATALOG.map((c) => c.id),
  status: QUESTION_STATUSES,
};
export const QUESTION_FACETS = Object.keys(FACET_VALUES) as QuestionFacet[];

/** Reads the query from URL parameters: comma lists, unknown values dropped, in catalog order. */
export function parseQuestionQuery(params: UrlParams): QuestionQuery {
  const list = (facet: QuestionFacet) => {
    const given = paramValues(params, facet);
    return FACET_VALUES[facet].filter((v) => given.has(v));
  };
  return { q: paramText(params, 'q', ' ').trim(), competency: list('competency'), status: list('status') as QuestionStatus[] };
}

/** The URL parameters for a query; an empty filter is null, so an unfiltered library has a bare URL. */
export function questionQueryParams(query: QuestionQuery): Record<keyof QuestionQuery, string | null> {
  const join = (values: readonly string[]) => (values.length ? values.join(',') : null);
  return { q: query.q.trim() || null, competency: join(query.competency), status: join(query.status) };
}

export const isQuestionQueryFiltered = (query: QuestionQuery) => Boolean(query.q) || QUESTION_FACETS.some((f) => query[f].length > 0);

export interface QuestionGroup {
  competencyId: string;
  name: string;
  questions: BehavioralQuestion[];
}

export interface QuestionLibraryResult {
  /** Competencies in catalog order, each with its matching questions; a competency with none is left out. */
  groups: QuestionGroup[];
  total: number;
  /** What each option would show, counted with every other facet's selection but not its own (REDESIGN.md 2.9). */
  counts: Record<QuestionFacet, Record<string, number>>;
}

const QUESTIONS = COMPETENCIES.flatMap((c) => c.questions);
export const QUESTION_COUNT = QUESTIONS.length;

/** Filters the 91 questions. Every search word must appear in the prompt; several values of one facet widen it. */
export function queryQuestions(
  query: QuestionQuery,
  statusesOf: (question: BehavioralQuestion) => readonly QuestionStatus[],
): QuestionLibraryResult {
  const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const base = QUESTIONS.filter((q) => terms.every((t) => q.prompt.toLowerCase().includes(t)));
  const statuses = new Map(base.map((q) => [q.id, statusesOf(q)]));
  const matches: Record<QuestionFacet, (q: BehavioralQuestion, values: readonly string[]) => boolean> = {
    competency: (q, values) => values.includes(q.competencyId),
    status: (q, values) => statuses.get(q.id)!.some((s) => values.includes(s)),
  };
  const keeps = (q: BehavioralQuestion, except?: QuestionFacet) =>
    QUESTION_FACETS.every((f) => f === except || !query[f].length || matches[f](q, query[f]));
  const counts = Object.fromEntries(
    QUESTION_FACETS.map((f) => {
      const pool = base.filter((q) => keeps(q, f));
      return [f, Object.fromEntries(FACET_VALUES[f].map((v) => [v, pool.filter((q) => matches[f](q, [v])).length]))];
    }),
  ) as QuestionLibraryResult['counts'];
  const kept = base.filter((q) => keeps(q));
  const groups = COMPETENCY_CATALOG.map((c) => ({
    competencyId: c.id,
    name: c.name,
    questions: kept.filter((q) => q.competencyId === c.id),
  })).filter((g) => g.questions.length);
  return { groups, total: kept.length, counts };
}
