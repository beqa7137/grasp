import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUESTION_QUERY,
  QUESTION_COUNT,
  isQuestionQueryFiltered,
  parseQuestionQuery,
  queryQuestions,
  questionQueryParams,
  type QuestionStatus,
} from './question-library.js';
import type { BehavioralQuestion } from './types.js';

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
    expect(query).toEqual({ q: 'disagree', competency: ['ownership', 'conflict'], status: ['story'] });
    expect(questionQueryParams(query)).toEqual({ q: 'disagree', competency: 'ownership,conflict', status: 'story' });
    expect(questionQueryParams(EMPTY_QUESTION_QUERY)).toEqual({ q: null, competency: null, status: null });
    expect(isQuestionQueryFiltered(EMPTY_QUESTION_QUERY)).toBe(false);
    expect(isQuestionQueryFiltered({ ...EMPTY_QUESTION_QUERY, q: 'x' })).toBe(true);
  });

  it('reads a key given more than once as all of its values', () => {
    expect(parseQuestionQuery({ q: ['tell', 'me'], status: ['drafted', 'story'], competency: ['conflict'] })).toEqual({
      q: 'tell me',
      competency: ['conflict'],
      status: ['drafted', 'story'],
    });
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
    const statusesOf = (q: BehavioralQuestion): QuestionStatus[] => [
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
