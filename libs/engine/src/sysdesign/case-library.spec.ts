import { describe, expect, it } from 'vitest';
import { CASE_CATALOG } from './case-catalog.js';
import { EMPTY_CASE_QUERY, caseQueryParams, isCaseQueryFiltered, parseCaseQuery, queryCases, type CaseState } from './case-library.js';

const fresh = () => 'new' as CaseState;

describe('the Cases library', () => {
  it('shows all 27 cases unfiltered, Core 9 and Advanced 18', () => {
    const { cases, counts } = queryCases(EMPTY_CASE_QUERY, fresh);
    expect(cases).toHaveLength(27);
    expect(counts.level).toEqual({ core: 9, advanced: 18 });
    expect(counts.status).toEqual({ new: 27, started: 0, finished: 0 });
  });

  it('reads and writes its URL, dropping unknown values and keeping catalog order', () => {
    const query = parseCaseQuery({ q: ' rate ', level: 'advanced,bogus,core', topic: 'sd-caching', shelf: 'nowhere' });
    expect(query).toEqual({ q: 'rate', level: ['core', 'advanced'], status: [], shelf: [], topic: ['sd-caching'] });
    expect(caseQueryParams(query)).toEqual({ q: 'rate', level: 'core,advanced', status: null, shelf: null, topic: 'sd-caching' });
    expect(caseQueryParams(EMPTY_CASE_QUERY)).toEqual({ q: null, level: null, status: null, shelf: null, topic: null });
    expect(isCaseQueryFiltered(EMPTY_CASE_QUERY)).toBe(false);
    expect(isCaseQueryFiltered(query)).toBe(true);
  });

  it('reads a key given more than once as all of its values', () => {
    expect(parseCaseQuery({ q: ['rate', 'limiter'], level: ['core', 'advanced'] })).toEqual({
      ...EMPTY_CASE_QUERY,
      q: 'rate limiter',
      level: ['core', 'advanced'],
    });
  });

  it('filters by topic, shelf, level and search, counting each option with the other facets only', () => {
    const byTopic = queryCases({ ...EMPTY_CASE_QUERY, topic: ['sd-rate-limiting'] }, fresh);
    expect(byTopic.cases.map((c) => c.id)).toEqual(['rate-limiter', 'notifications', 'ticketing']);
    expect(byTopic.counts.level).toEqual({ core: 1, advanced: 2 });
    expect(byTopic.counts.topic['sd-caching']).toBe(10);

    const coordination = queryCases({ ...EMPTY_CASE_QUERY, shelf: ['coordination'], level: ['advanced'] }, fresh);
    expect(coordination.cases.map((c) => c.id)).toEqual([
      'payments',
      'payment-ledger',
      'ticketing',
      'job-scheduler',
      'collaborative-editor',
      'stock-exchange',
      'message-queue',
      'code-deployment',
    ]);
    expect(coordination.counts.shelf['coordination']).toBe(8);

    expect(queryCases({ ...EMPTY_CASE_QUERY, q: 'rate' }, fresh).cases.map((c) => c.title)).toEqual(['Rate Limiter']);
  });

  it('filters by status from the state it is given', () => {
    const states: Record<string, CaseState> = { 'url-shortener': 'started', chat: 'finished' };
    const stateOf = (id: string) => states[id] ?? 'new';
    const { cases, counts } = queryCases({ ...EMPTY_CASE_QUERY, status: ['started', 'finished'] }, stateOf);
    expect(cases.map((c) => c.id)).toEqual(['url-shortener', 'chat']);
    expect(counts.status).toEqual({ new: CASE_CATALOG.length - 2, started: 1, finished: 1 });
  });
});
