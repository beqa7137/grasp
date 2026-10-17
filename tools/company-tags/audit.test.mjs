import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTERVIEW_REPORTS } from '@grasp/engine';
import { auditReports, checkLinks, fetchRobots, linkCheckPlan, renderReport, robotsAllow } from './audit.mjs';

const report = (url, publisher, over = {}) => ({
  kind: 'problem',
  itemId: 'two-sum',
  company: 'meta',
  source: { url, title: 'A write-up', publisher },
  reported: { date: '2025-06-01', basis: 'published' },
  checked: '2026-10-17',
  note: 'Phone screen.',
  ...over,
});

const PUBLISHERS = {
  blog: { name: 'A blog', hosts: ['blog.example.com'], access: 'automated', terms: 'https://blog.example.com/terms' },
  roundz: { name: 'Roundz Newsletter', hosts: ['roundz.substack.com'], access: 'manual', terms: 'https://substack.com/tos' },
  leaky: { name: 'Leaky', hosts: ['leetcode.com'], access: 'automated', terms: 'https://leetcode.com/terms' },
};

test('fetches only automated publishers, never a manual or denied host', async () => {
  const reports = [
    report('https://blog.example.com/a', 'blog'),
    report('https://blog.example.com/a', 'blog', { itemId: 'three-sum' }),
    report('https://roundz.substack.com/p/x', 'roundz'),
    report('https://leetcode.com/discuss/x', 'leaky'),
    report('https://www.reddit.com/r/x', 'blog'),
  ];
  assert.deepEqual(linkCheckPlan(reports, PUBLISHERS), ['https://blog.example.com/a']);
  const requested = [];
  const fetchImpl = async (url, init) => {
    requested.push(`${init?.method ?? 'GET'} ${url}`);
    return url.endsWith('/robots.txt') ? { ok: true, text: async () => 'User-agent: *\nDisallow: /private' } : { status: 200 };
  };
  assert.deepEqual(await checkLinks(reports, PUBLISHERS, fetchImpl), [{ url: 'https://blog.example.com/a', status: 200 }]);
  assert.deepEqual(requested, ['GET https://blog.example.com/robots.txt', 'HEAD https://blog.example.com/a']);
});

test('requests nothing for the shipped reports, whose publishers are all manual', async () => {
  assert.deepEqual(linkCheckPlan(INTERVIEW_REPORTS), []);
  assert.deepEqual(await checkLinks(INTERVIEW_REPORTS, undefined, () => assert.fail('fetched')), []);
});

test('reads robots.txt groups as RFC 9309 does', () => {
  assert.equal(robotsAllow('User-agent: *\nDisallow: /', '/a'), false);
  assert.equal(robotsAllow('', '/a'), true);
  assert.equal(robotsAllow('User-agent: OtherBot\nDisallow: /', '/a'), true);
  // Consecutive User-agent lines share one group.
  assert.equal(robotsAllow('User-agent: OtherBot\nUser-agent: *\nDisallow: /private', '/private/x'), false);
  // A group naming us replaces the * group.
  assert.equal(robotsAllow('User-agent: *\nDisallow: /\n\nUser-agent: GraspCompanyTagsAudit\nAllow: /', '/a'), true);
  assert.equal(robotsAllow('User-agent: *\nAllow: /\n\nUser-agent: graspcompanytagsaudit\nDisallow: /a', '/a'), false);
});

test('lets the longest rule win, and allow win a tie', () => {
  assert.equal(robotsAllow('User-agent: *\nDisallow: /\nAllow: /a', '/a'), true);
  assert.equal(robotsAllow('User-agent: *\nAllow: /a\nDisallow: /a/b', '/a/b'), false);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /a\nAllow: /a', '/a'), true);
});

test('matches * and $ in rules', () => {
  assert.equal(robotsAllow('User-agent: *\nDisallow: /*.pdf$', '/files/x.pdf'), false);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /*.pdf$', '/files/x.pdf?y=1'), true);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /p/*/edit', '/p/12/edit'), false);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /p/*/edit', '/p/12/view'), true);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /a.b', '/axb'), true);
});

test('treats an unreachable robots.txt as disallowing all and a missing one as allowing all', async () => {
  const origin = 'https://blog.example.com';
  assert.equal(await fetchRobots(origin, async () => ({ ok: false, status: 503 })), null);
  assert.equal(await fetchRobots(origin, async () => Promise.reject(new Error('reset'))), null);
  assert.equal(await fetchRobots(origin, async () => ({ ok: false, status: 404 })), '');
  assert.equal(robotsAllow(null, '/a'), false);
  const reports = [report('https://blog.example.com/a', 'blog')];
  const requested = [];
  const results = await checkLinks(reports, PUBLISHERS, async (url, init) => {
    requested.push(`${init?.method ?? 'GET'} ${url}`);
    return { ok: false, status: 500 };
  });
  assert.deepEqual(results, [{ url: 'https://blog.example.com/a', status: 'robots.txt disallows' }]);
  assert.deepEqual(requested, ['GET https://blog.example.com/robots.txt']);
});

test('imports without running, whatever argv holds', async () => {
  const argv = process.argv;
  process.argv = [argv[0]];
  try {
    await import(`./audit.mjs?bare=${Date.now()}`);
  } finally {
    process.argv = argv;
  }
});

test('lists hidden, expiring and refused reports, and items losing their last one', () => {
  const reports = [
    report('https://roundz.substack.com/p/old', 'roundz', { reported: { date: '2024-09-01', basis: 'published' } }),
    report('https://roundz.substack.com/p/soon', 'roundz', { itemId: 'jump-game', reported: { date: '2024-11-20', basis: 'interview' } }),
    report('https://roundz.substack.com/p/stale', 'roundz', { itemId: 'gas-station', checked: '2026-06-01' }),
    report('https://www.glassdoor.co.uk/x', 'roundz', { itemId: 'house-robber' }),
    report('https://roundz.substack.com/p/fine', 'roundz', { itemId: 'house-robber' }),
  ];
  const f = auditReports(reports, '2026-10-17', PUBLISHERS);
  assert.deepEqual(
    f.expired.map((x) => [x.report.source.url, x.day]),
    [['https://roundz.substack.com/p/old', '2026-09-01']],
  );
  assert.deepEqual(
    f.expiring.map((x) => x.day),
    ['2026-11-20'],
  );
  assert.deepEqual(
    f.recheckDue.map((x) => x.day),
    ['2026-09-09'],
  );
  assert.match(f.refused[0].reason, /denied/);
  assert.deepEqual(f.losingLast, ['problem:two-sum', 'problem:jump-game', 'problem:gas-station']);
  const text = renderReport('2026-10-17', f, [], reports, PUBLISHERS);
  assert.match(text, /## Expired: remove \(1\)/);
  assert.match(text, /- \[ \] https:\/\/roundz\.substack\.com\/p\/old/);
});

test('finds nothing to remove in the shipped reports on the day they were checked', () => {
  const f = auditReports(INTERVIEW_REPORTS, '2026-10-17');
  assert.deepEqual([f.expired, f.expiring, f.recheckDue, f.recheckSoon, f.refused, f.losingLast], [[], [], [], [], [], []]);
});
