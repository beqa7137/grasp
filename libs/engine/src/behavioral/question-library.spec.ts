import { describe, expect, it } from 'vitest';
import { attributesOfQuestion } from '../companies/culture.js';
import {
  EMPTY_QUESTION_QUERY,
  QUESTION_COUNT,
  isQuestionQueryFiltered,
  parseQuestionQuery,
  queryQuestions,
  questionQueryParams,
  type QuestionStatus,
} from './question-library.js';
import type { QuestionPrompt } from './question-prompts.js';

const fresh = (): QuestionStatus[] => ['not-drafted'];
const ids = (result: ReturnType<typeof queryQuestions>) => result.groups.flatMap((g) => g.questions.map((q) => q.id));

describe('the Questions library', () => {
  it('shows all 91 questions unfiltered, seven under each of the 13 competencies in catalog order', () => {
    const result = queryQuestions(EMPTY_QUESTION_QUERY, fresh);
    expect(QUESTION_COUNT).toBe(91);
    expect(result.total).toBe(91);
    expect(result.groups).toHaveLength(13);
    expect(result.groups[0]).toMatchObject({ competencyId: 'ownership', name: 'Ownership' });
    expect(result.groups.every((g) => g.questions.length === 7)).toBe(true);
    expect(result.counts.status).toEqual({ 'not-drafted': 91, drafted: 0, story: 0 });
    expect(result.counts.competency['conflict']).toBe(7);
  });

  it('reads and writes its URL, dropping unknown values and keeping catalog order', () => {
    const query = parseQuestionQuery({ q: ' disagree ', competency: 'conflict,bogus,ownership', status: 'story,nope' });
    expect(query).toEqual({ q: 'disagree', competency: ['ownership', 'conflict'], status: ['story'], culture: [] });
    expect(questionQueryParams(query)).toEqual({ q: 'disagree', competency: 'ownership,conflict', status: 'story', culture: null });
    expect(questionQueryParams(EMPTY_QUESTION_QUERY)).toEqual({ q: null, competency: null, status: null, culture: null });
    expect(isQuestionQueryFiltered(EMPTY_QUESTION_QUERY)).toBe(false);
    expect(isQuestionQueryFiltered({ ...EMPTY_QUESTION_QUERY, q: 'x' })).toBe(true);
  });

  it('reads a key given more than once as all of its values', () => {
    expect(parseQuestionQuery({ q: ['tell', 'me'], status: ['drafted', 'story'], competency: ['conflict'] })).toEqual({
      q: 'tell me',
      competency: ['conflict'],
      status: ['drafted', 'story'],
      culture: [],
    });
  });

  it('filters by culture attribute, counting each with the other facets', () => {
    const cultureOf = (q: { id: string; competencyId: string }) => attributesOfQuestion('microsoft', q.id, q.competencyId).map((a) => a.id);
    const all = queryQuestions(EMPTY_QUESTION_QUERY, fresh, cultureOf);
    expect(all.counts.culture).toEqual({
      'growth-mindset': 18,
      'customer-obsessed': 7,
      'diverse-inclusive': 2,
      'one-microsoft': 15,
      'making-a-difference': 9,
    });
    const growth = queryQuestions({ ...EMPTY_QUESTION_QUERY, culture: ['growth-mindset'] }, fresh, cultureOf);
    expect(growth.groups.map((g) => g.competencyId)).toEqual(['conflict', 'influence', 'feedback', 'failure', 'learning']);
    expect(growth.total).toBe(18);
    expect(parseQuestionQuery({ culture: 'growth-mindset,nope' }).culture).toEqual(['growth-mindset']);
    expect(queryQuestions({ ...EMPTY_QUESTION_QUERY, culture: ['growth-mindset'] }, fresh).total).toBe(0);
  });

  it('opens a deep link to one competency and a search, matching every word anywhere in the prompt', () => {
    const conflict = queryQuestions(parseQuestionQuery({ competency: 'conflict', q: 'disagree' }), fresh);
    expect(ids(conflict)).toEqual(['conflict-1', 'conflict-2', 'conflict-3', 'conflict-6']);
    expect(conflict.groups.map((g) => g.name)).toEqual(['Conflict & Disagreement']);
    // The Competency counts keep the search but not the competency chosen, so other chips say what they would add.
    expect(conflict.counts.competency['conflict']).toBe(4);
    expect(conflict.counts.competency['ownership']).toBe(0);
    expect(ids(queryQuestions({ ...EMPTY_QUESTION_QUERY, q: 'DISAGREED manager' }, fresh))).toEqual(['conflict-2']);
  });

  it('filters by overlapping statuses, widening with each one chosen', () => {
    const statusesOf = (q: QuestionPrompt): QuestionStatus[] => [
      q.id === 'conflict-1' ? 'drafted' : 'not-drafted',
      ...(q.competencyId === 'conflict' ? (['story'] as const) : []),
    ];
    const all = queryQuestions(EMPTY_QUESTION_QUERY, statusesOf);
    expect(all.counts.status).toEqual({ 'not-drafted': 90, drafted: 1, story: 7 });

    const story = queryQuestions({ ...EMPTY_QUESTION_QUERY, status: ['story'] }, statusesOf);
    expect(story.total).toBe(7);
    expect(story.counts.status).toEqual({ 'not-drafted': 90, drafted: 1, story: 7 });
    expect(story.counts.competency['conflict']).toBe(7);
    expect(story.counts.competency['ownership']).toBe(0);

    const drafted = queryQuestions({ ...EMPTY_QUESTION_QUERY, status: ['drafted', 'story'] }, statusesOf);
    expect(ids(drafted)).toHaveLength(7);
    expect(queryQuestions({ ...EMPTY_QUESTION_QUERY, status: ['drafted'], competency: ['ownership'] }, statusesOf).groups).toEqual([]);
  });
});
