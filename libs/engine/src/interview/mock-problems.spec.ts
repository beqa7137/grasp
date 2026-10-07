import { describe, expect, it } from 'vitest';
import { getProblemSummary } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { MOCK_PROBLEMS } from './mock-problems.js';

describe('mock problem index', () => {
  it('has unique ids and known patterns', () => {
    expect(new Set(MOCK_PROBLEMS.map((p) => p.id)).size).toBe(MOCK_PROBLEMS.length);
    const patterns = new Set<string>(PATTERN_CATALOG.map((p) => p.id));
    for (const p of MOCK_PROBLEMS) for (const id of p.patternIds) expect(patterns.has(id), `${p.id}: ${id}`).toBe(true);
    for (const p of MOCK_PROBLEMS.filter((m) => m.track === 'system-design')) expect(p.patternIds).toEqual([]);
  });

  it('names a catalog twin of the same kind, or says why there is none', () => {
    for (const p of MOCK_PROBLEMS) {
      if (p.catalogId === null) {
        expect(p.noCatalogReason?.trim(), p.id).toBeTruthy();
        continue;
      }
      expect(p.noCatalogReason, p.id).toBeUndefined();
      if (p.track === 'coding') expect(getProblemSummary(p.catalogId), p.id).toBeDefined();
      else
        expect(
          CASE_CATALOG.some((c) => c.id === p.catalogId),
          p.id,
        ).toBe(true);
    }
    expect(Object.fromEntries(MOCK_PROBLEMS.map((p) => [p.id, p.catalogId]))).toEqual({
      'warmer-days': 'daily-temperatures',
      'shipping-capacity': 'ship-within-days',
      'course-order': null,
      'longest-k-replace': 'character-replacement',
      'url-shortener': 'url-shortener',
      'news-feed': 'news-feed',
      'rate-limiter': 'rate-limiter',
      'chat-service': 'chat',
    });
  });

  it('shares each coding twin pattern with the catalog problem', () => {
    for (const p of MOCK_PROBLEMS.filter((m) => m.track === 'coding' && m.catalogId)) {
      const twin = getProblemSummary(p.catalogId!)!;
      expect(
        p.patternIds.some((id) => twin.patternIds.includes(id)),
        p.id,
      ).toBe(true);
    }
  });
});
