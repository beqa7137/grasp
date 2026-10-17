#!/usr/bin/env node
/**
 * The monthly company-tags audit (docs/COMPANY_TAGS.md). Offline, it lists reports past or near their expiry or recheck
 * day and any the source policy now refuses; online, it checks links only on publishers marked `automated`, never on a
 * `manual` or denied one. It writes a Markdown report and changes no data.
 *
 *   node tools/company-tags/audit.mjs [--today YYYY-MM-DD] [--out <file>] [--no-links]
 *
 * The report goes to the system's temporary directory unless `--out` names a file.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { INTERVIEW_REPORTS, PUBLISHERS, addCalendarDays, hostDenied, recheckBy, shownUntil, sourceRefusal } from '@grasp/engine';

export const WARN_DAYS = 45;
const USER_AGENT = 'GraspCompanyTagsAudit/1 (+https://grasp-rho-taupe.vercel.app)';

const label = (r) => `${r.company} ${r.kind} ${r.itemId} (${r.source.url})`;

/** What a reviewer must act on: rows hidden now, rows that hide within `WARN_DAYS`, policy refusals, items losing their last row. */
export function auditReports(reports, today, publishers = PUBLISHERS) {
  const soon = addCalendarDays(today, WARN_DAYS);
  const findings = { expired: [], expiring: [], recheckDue: [], recheckSoon: [], refused: [], losingLast: [] };
  const live = new Map();
  for (const r of reports) {
    const until = shownUntil(r);
    const by = recheckBy(r);
    const refusal = publishers[r.source.publisher]
      ? sourceRefusal(r.source.url, r.source.publisher)
      : `unknown publisher ${r.source.publisher}`;
    if (refusal) findings.refused.push({ report: r, reason: refusal });
    if (until < today) findings.expired.push({ report: r, day: until });
    else if (until <= soon) findings.expiring.push({ report: r, day: until });
    if (by < today) findings.recheckDue.push({ report: r, day: by });
    else if (by <= soon) findings.recheckSoon.push({ report: r, day: by });
    const item = `${r.kind}:${r.itemId}`;
    live.set(item, (live.get(item) ?? 0) + (until > soon && by > soon && !refusal ? 1 : 0));
  }
  findings.losingLast = [...live].filter(([, count]) => count === 0).map(([item]) => item);
  return findings;
}

/** The only URLs the audit may request: on an `automated` publisher's own hosts, never a denied one, once each. */
export const linkCheckPlan = (reports, publishers = PUBLISHERS) => [
  ...new Set(
    reports
      .filter(({ source: { url, publisher } }) => {
        const p = publishers[publisher];
        return p?.access === 'automated' && url.startsWith('https://') && p.hosts.includes(new URL(url).hostname) && !hostDenied(url);
      })
      .map((r) => r.source.url),
  ),
];

const PRODUCT_TOKEN = 'graspcompanytagsaudit';

/** Groups of consecutive User-agent lines and the rules after them (RFC 9309 2.1). */
function robotsGroups(robots) {
  const groups = [];
  let group = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length) groups.push((group = { agents: [], rules: [] }));
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow') && value) group.rules.push({ allow: key === 'allow', pattern: value });
  }
  return groups;
}

/** `*` matches any run of characters and a final `$` anchors the end; anything else is a prefix. */
const patternMatches = (pattern, path) => {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
};

/**
 * Whether robots.txt lets us fetch `path` (RFC 9309): the groups naming our product token, else the `*` groups; the
 * longest matching rule wins and allow wins a tie. `null` stands for an unreachable robots.txt, which disallows all.
 */
export function robotsAllow(robots, path) {
  if (robots === null) return false;
  const groups = robotsGroups(robots);
  const ours = groups.filter((g) => g.agents.includes(PRODUCT_TOKEN));
  const rules = (ours.length ? ours : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  let best = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}

/** A 4xx robots.txt allows everything; a 5xx or a network error disallows everything (RFC 9309 2.3.1). */
export async function fetchRobots(origin, fetchImpl) {
  const response = await fetchImpl(`${origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT } }).catch(() => null);
  if (!response || response.status >= 500) return null;
  return response.ok ? await response.text() : '';
}

/** HEAD requests, after robots.txt, for the URLs `linkCheckPlan` allows and no others. */
export async function checkLinks(reports, publishers = PUBLISHERS, fetchImpl = fetch) {
  const robots = new Map();
  const results = [];
  for (const url of linkCheckPlan(reports, publishers)) {
    const { origin, pathname, search } = new URL(url);
    if (!robots.has(origin)) robots.set(origin, await fetchRobots(origin, fetchImpl));
    if (!robotsAllow(robots.get(origin), pathname + search)) {
      results.push({ url, status: 'robots.txt disallows' });
      continue;
    }
    const response = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', headers: { 'user-agent': USER_AGENT } }).catch((e) => ({
      status: `error: ${e.message}`,
    }));
    results.push({ url, status: response.status });
  }
  return results;
}

export function renderReport(today, findings, links, reports, publishers = PUBLISHERS) {
  const section = (title, rows, line) => [`## ${title} (${rows.length})`, '', ...(rows.length ? rows.map(line) : ['None.']), ''];
  const manual = [...new Set(reports.filter((r) => publishers[r.source.publisher]?.access !== 'automated').map((r) => r.source.url))];
  return [
    `# Company tags audit, ${today}`,
    '',
    `${reports.length} reports. Hidden in the app: past expiry (24 months) or 100 days without a recheck. Warning window: ${WARN_DAYS} days.`,
    '',
    ...section('Policy refusals: remove', findings.refused, (f) => `- ${label(f.report)}: ${f.reason}`),
    ...section('Expired: remove', findings.expired, (f) => `- ${label(f.report)}: shown until ${f.day}`),
    ...section('Expiring soon', findings.expiring, (f) => `- ${label(f.report)}: shown until ${f.day}`),
    ...section('Recheck overdue: hidden until rechecked', findings.recheckDue, (f) => `- ${label(f.report)}: due ${f.day}`),
    ...section('Recheck due soon', findings.recheckSoon, (f) => `- ${label(f.report)}: due ${f.day}`),
    ...section('Items losing their last shown report', findings.losingLast, (item) => `- ${item}`),
    ...section('Link checks (automated publishers only)', links, (l) => `- ${l.url}: ${l.status}`),
    ...section('Manual rechecks: open each once in a browser', manual, (url) => `- [ ] ${url}`),
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: { today: { type: 'string' }, out: { type: 'string' }, 'no-links': { type: 'boolean' } },
  });
  const today = values.today ?? new Date().toISOString().slice(0, 10);
  // Outside the repository by default, so the report never reaches a commit or the format check.
  values.out ??= join(tmpdir(), `company-tags-audit-${today}.md`);
  const findings = auditReports(INTERVIEW_REPORTS, today);
  const links = values['no-links'] ? [] : await checkLinks(INTERVIEW_REPORTS);
  writeFileSync(values.out, renderReport(today, findings, links, INTERVIEW_REPORTS) + '\n');
  const hidden = new Set([...findings.expired, ...findings.recheckDue].map((f) => f.report)).size;
  console.log(
    `${values.out}: ${INTERVIEW_REPORTS.length} reports, ${hidden} hidden, ${findings.refused.length} refused, ${links.length} links checked`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
