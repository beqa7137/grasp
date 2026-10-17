import { describe, expect, it } from 'vitest';
import { CODING_CATALOG } from '../coding/catalog.js';
import { TARGET_COMPANIES } from '../plan/options.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { COMPANY_IDS, COMPANY_NAMES } from './companies.js';
import { addMonths, lastDayOf, recheckBy, reportVisible, shownUntil, visibleReports, type InterviewReport } from './reports.js';
import { INTERVIEW_REPORTS, LAST_REFRESH } from './reports.data.js';
import { DENIED_HOSTS, PUBLISHERS, hostDenied, sourceRefusal, type PublisherId } from './source-policy.js';

const report = (over: Partial<InterviewReport> = {}): InterviewReport => ({
  kind: 'problem',
  itemId: 'two-sum',
  company: 'meta',
  source: { url: 'https://roundz.substack.com/p/example', title: 'Example', publisher: 'roundz' },
  reported: { date: '2025-03-29', basis: 'published' },
  checked: '2026-10-17',
  note: 'Phone screen.',
  ...over,
});

describe('report dates', () => {
  it('reads a partial date from the last day it covers', () => {
    expect(lastDayOf('2024')).toBe('2024-12-31');
    expect(lastDayOf('2025-02')).toBe('2025-02-28');
    expect(lastDayOf('2024-02')).toBe('2024-02-29');
    expect(lastDayOf('2025-08-01')).toBe('2025-08-01');
  });

  it('adds months, keeping to the shorter month', () => {
    expect(addMonths('2025-03-29', 24)).toBe('2027-03-29');
    expect(addMonths('2024-02-29', 24)).toBe('2026-02-28');
    expect(addMonths('2025-11-30', 3)).toBe('2026-02-28');
  });

  it('hides a report once it is over 24 months old, counting a publication date like an interview date', () => {
    const published = report({ reported: { date: '2025-03-29', basis: 'published' }, checked: '2027-03-01' });
    expect(shownUntil(published)).toBe('2027-03-29');
    expect(reportVisible(published, '2027-03-29')).toBe(true);
    expect(reportVisible(published, '2027-03-30')).toBe(false);
    const interview = report({ reported: { date: '2025-03-29', basis: 'interview' }, checked: '2027-03-01' });
    expect(reportVisible(interview, '2027-03-30')).toBe(false);
  });

  it('counts a year or a month from its last day', () => {
    expect(shownUntil(report({ reported: { date: '2024', basis: 'interview' } }))).toBe('2026-12-31');
    expect(shownUntil(report({ reported: { date: '2025-08', basis: 'interview' } }))).toBe('2027-08-31');
  });

  it('hides a report 100 days after its last check', () => {
    const r = report({ checked: '2026-10-17' });
    expect(recheckBy(r)).toBe('2027-01-25');
    expect(reportVisible(r, '2027-01-25')).toBe(true);
    expect(reportVisible(r, '2027-01-26')).toBe(false);
  });
});

describe('visibleReports', () => {
  const reports = [
    report({ company: 'microsoft', reported: { date: '2025-06-05', basis: 'published' } }),
    report({ company: 'meta', reported: { date: '2025-01', basis: 'interview' } }),
    report({ company: 'meta', reported: { date: '2025-09-01', basis: 'published' } }),
    report({ company: 'google', reported: { date: '2024-11', basis: 'published' } }),
    report({ itemId: 'three-sum', company: 'apple' }),
    report({ kind: 'case', itemId: 'two-sum', company: 'apple' }),
  ];

  it('lists the visible reports of an item by company, newest first within one', () => {
    expect(visibleReports('problem', 'two-sum', '2026-10-17', reports).map((r) => [r.company, r.reported.date])).toEqual([
      ['google', '2024-11'],
      ['meta', '2025-09-01'],
      ['meta', '2025-01'],
      ['microsoft', '2025-06-05'],
    ]);
  });

  it('drops what has expired on the given day', () => {
    expect(visibleReports('problem', 'two-sum', '2026-12-31', reports).map((r) => r.company)).toEqual(['meta', 'meta', 'microsoft']);
    expect(visibleReports('problem', 'two-sum', '2027-01-26', reports)).toEqual([]);
  });

  it('keeps problems and cases apart, and has nothing for an untagged item', () => {
    expect(visibleReports('case', 'two-sum', '2026-10-17', reports).map((r) => r.company)).toEqual(['apple']);
    expect(visibleReports('problem', 'house-robber', '2026-10-17')).toEqual([]);
  });

  it('shows the shipped reports on the day they were checked', () => {
    expect(visibleReports('problem', 'lowest-common-ancestor', '2026-10-17').map((r) => r.company)).toEqual(['google', 'meta', 'amazon']);
  });
});

describe('source policy', () => {
  it('refuses every denied host, its subdomains and, for a wildcard, any top-level domain', () => {
    const denied = [
      'https://leetcode.com/discuss/interview-experience/1',
      'https://leetcode.cn/circle/discuss/1',
      'https://www.glassdoor.com/Interview/x.htm',
      'https://www.glassdoor.co.uk/Interview/x.htm',
      'https://www.glassdoor.co.in/Interview/x.htm',
      'https://www.teamblind.com/post/x',
      'https://www.1point3acres.com/bbs/x',
      'https://www.reddit.com/r/leetcode/comments/x',
      'https://old.reddit.com/r/cscareerquestions/x',
      'https://redd.it/x',
      'https://www.aced.io/questions/x',
      'https://www.tryexponent.com/questions/x',
      'https://www.hellointerview.com/learn/x',
      'https://interviewing.io/mocks/x',
      'https://prachub.com/questions/x',
      'https://github.com/someone/leetcode-company-wise-problems',
      'https://raw.githubusercontent.com/someone/list/main/meta.csv',
    ];
    for (const url of denied) {
      expect(hostDenied(url), url).toBe(true);
      expect(sourceRefusal(url, 'roundz'), url).toMatch(/denied/);
    }
    for (const entry of DENIED_HOSTS) expect(hostDenied(`https://${entry.replace('.*', '.com')}/x`), entry).toBe(true);
  });

  it('denies a trailing-dot host and a denied name under any top-level domain, IDN ones included', () => {
    expect(hostDenied('https://leetcode.com./discuss/x')).toBe(true);
    expect(hostDenied('https://www.glassdoor.xn--p1ai/x')).toBe(true);
    expect(hostDenied('https://glassdoor.com.au/x')).toBe(true);
    expect(sourceRefusal('https://leetcode.com./discuss/x', 'roundz')).not.toBeNull();
  });

  it('refuses user info, a port and any URL the parser would rewrite', () => {
    expect(sourceRefusal('https://evil.com@roundz.substack.com/p/x', 'roundz')).toMatch(/user info/);
    expect(sourceRefusal('https://roundz.substack.com@evil.com/p/x', 'roundz')).toMatch(/user info/);
    expect(sourceRefusal('https://roundz.substack.com:8443/p/x', 'roundz')).toMatch(/port/);
    expect(sourceRefusal('https://roundz.substack.com\\p\\x', 'roundz')).toMatch(/canonical/);
    expect(sourceRefusal('https://ROUNDZ.substack.com/p/x', 'roundz')).toMatch(/canonical/);
    expect(sourceRefusal('https://roundz.substack.com./p/x', 'roundz')).toMatch(/not a host/);
  });

  it('does not deny a host that only contains a denied name', () => {
    expect(hostDenied('https://notleetcode.com.example.org/x')).toBe(false);
    expect(hostDenied('https://roundz.substack.com/p/x')).toBe(false);
  });

  it('allows only https pages on the publisher hosts', () => {
    expect(sourceRefusal('https://roundz.substack.com/p/x', 'roundz')).toBeNull();
    expect(sourceRefusal('http://roundz.substack.com/p/x', 'roundz')).toMatch(/https/);
    expect(sourceRefusal('https://other.substack.com/p/x', 'roundz')).toMatch(/not a host/);
    expect(sourceRefusal('https://www.geeksforgeeks.org/x', 'roundz')).toMatch(/not a host/);
    expect(sourceRefusal('not a url', 'taro')).toMatch(/https/);
  });

  it('allows no publisher on a denied host', () => {
    for (const [id, publisher] of Object.entries(PUBLISHERS))
      for (const host of publisher.hosts) expect(hostDenied(`https://${host}/`), id).toBe(false);
  });
});

describe('the shipped reports', () => {
  const problems = new Set(CODING_CATALOG.map((p) => p.id));
  const cases = new Set(CASE_CATALOG.map((c) => c.id));
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const validDay = (d: string) => day.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  const BANNED = /\b(frequency|frequently|most asked|popular|top|hot)\b|%/i;

  it('name a catalog item, a known company and an allowed source', () => {
    for (const r of INTERVIEW_REPORTS) {
      const where = `${r.company} ${r.itemId}`;
      expect((r.kind === 'problem' ? problems : cases).has(r.itemId), where).toBe(true);
      expect(COMPANY_IDS, where).toContain(r.company);
      expect(sourceRefusal(r.source.url, r.source.publisher), where).toBeNull();
      expect(r.source.title.trim(), where).not.toBe('');
    }
  });

  it('carry a valid reported date with its basis, and a checked day between it and the last refresh', () => {
    for (const r of INTERVIEW_REPORTS) {
      const where = `${r.company} ${r.itemId}`;
      expect(r.reported.date, where).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
      expect(validDay(lastDayOf(r.reported.date)), where).toBe(true);
      expect(['interview', 'published', 'updated'], where).toContain(r.reported.basis);
      expect(validDay(r.checked), where).toBe(true);
      expect(r.checked >= lastDayOf(r.reported.date), where).toBe(true);
      expect(r.checked <= LAST_REFRESH, where).toBe(true);
    }
  });

  it('keep notes short, in plain punctuation and free of frequency words', () => {
    for (const r of INTERVIEW_REPORTS) {
      const where = `${r.company} ${r.itemId}: ${r.note}`;
      expect(r.note.length, where).toBeGreaterThan(0);
      expect(r.note.length, where).toBeLessThanOrEqual(200);
      expect(r.note, where).not.toMatch(/[\u2014\u00a0]/);
      expect(r.note, where).not.toMatch(BANNED);
      expect(r.source.title, where).not.toMatch(/[\u2014\u00a0]/);
    }
  });

  it('cite each source once per item, and at most 3 reports per item and company', () => {
    const sources = new Set<string>();
    const perCompany = new Map<string, number>();
    for (const r of INTERVIEW_REPORTS) {
      const item = `${r.kind}:${r.itemId}`;
      const source = `${item} ${r.source.url}`;
      expect(sources.has(source), source).toBe(false);
      sources.add(source);
      const key = `${item} ${r.company}`;
      perCompany.set(key, (perCompany.get(key) ?? 0) + 1);
    }
    for (const [key, count] of perCompany) expect(count, key).toBeLessThanOrEqual(3);
  });

  it('give every company a report, and every target company a name', () => {
    const named = new Set(INTERVIEW_REPORTS.map((r) => r.company));
    expect(COMPANY_IDS.filter((c) => !named.has(c))).toEqual([]);
    for (const company of TARGET_COMPANIES) expect(COMPANY_NAMES[company]).toBeTruthy();
  });

  it('cite the same title for a source wherever it appears', () => {
    const titles = new Map<string, string>();
    for (const r of INTERVIEW_REPORTS) {
      expect(titles.get(r.source.url) ?? r.source.title, r.source.url).toBe(r.source.title);
      titles.set(r.source.url, r.source.title);
    }
  });

  it('list publishers by name, each with its terms', () => {
    for (const [id, p] of Object.entries(PUBLISHERS) as [PublisherId, (typeof PUBLISHERS)[PublisherId]][]) {
      expect(p.name, id).not.toBe('');
      expect(p.terms, id).toMatch(/^https:\/\//);
    }
  });
});
