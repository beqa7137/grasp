import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
export const { chromium, devices } = require('@playwright/test');
export const AxeBuilder = require('@axe-core/playwright').default;
export const { PNG } = require('playwright-core/lib/utilsBundle');

export const BASE = process.env.BASE ?? 'http://localhost:4310';
export const OUT = process.env.OUT ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

export const PROFILES = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
  pixel7: { ...devices['Pixel 7'] },
  w320: { ...devices['Pixel 7'], viewport: { width: 320, height: 700 } },
};

/** THEME: 'dark' or 'light' stores that preference; 'system-dark' or 'system-light' stores none and emulates the device mode. */
export const THEME = process.env.THEME ?? 'dark';
const SYSTEM_SCHEME = THEME.startsWith('system-') ? THEME.slice('system-'.length) : null;
/** STABLE=1: seeded Math.random, counter UUIDs and a fixed clock, so two captures of one build match pixel for pixel. */
const STABLE = process.env.STABLE === '1';
/** Selectors hidden with their layout kept, for values no init script reaches, such as worker timings. */
const MASK_CSS = process.env.MASK_CSS;

export async function newContext(browser, profile, { noticeSeen = true, extra = {} } = {}) {
  const context = await browser.newContext({ ...PROFILES[profile], ...(SYSTEM_SCHEME ? { colorScheme: SYSTEM_SCHEME } : {}), ...extra });
  // A fresh address per context keeps the API's per-IP rate limit out of long runs against a local server.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${randomInt(256)}.${randomInt(1, 255)}` });
  await context.addInitScript((learnerId) => {
    if (!localStorage.getItem('CapacitorStorage.grasp.learnerId')) {
      localStorage.setItem('CapacitorStorage.grasp.learnerId', learnerId);
    }
  }, randomUUID());
  if (!SYSTEM_SCHEME) await context.addInitScript((theme) => localStorage.setItem('CapacitorStorage.grasp.theme', theme), THEME);
  if (MASK_CSS) {
    await context.addInitScript((css) => {
      const add = () =>
        document.head.append(Object.assign(document.createElement('style'), { textContent: `${css} { visibility: hidden !important; }` }));
      if (document.head) add();
      else document.addEventListener('DOMContentLoaded', add);
    }, MASK_CSS);
  }
  if (STABLE) {
    await context.clock.setFixedTime(new Date('2026-09-24T12:00:00'));
    await context.addInitScript(() => {
      let a = 20260924;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let n = 0;
      crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    });
  }
  if (noticeSeen)
    await context.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
  return context;
}

/** Blocks every write to the API, so runs against production leave no data behind. */
export const readOnly = (context) =>
  context.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));

export const settle = (page, ms = 700) => page.waitForTimeout(ms);

export async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('ion-content');
  await settle(page);
}

export async function toPredict(page) {
  for (let i = 0; i < 400; i++) {
    if (await page.locator('.predict').count()) return true;
    const step = page.getByRole('button', { name: 'Step forward' });
    if (await step.isDisabled()) return false;
    await step.click();
    await page.waitForTimeout(80);
  }
  return false;
}

/** Turns predict mode off and steps to the last frame, where a tree visualizer shows every badge. */
export async function toEnd(page) {
  await page.getByText('Predict mode').click();
  const [shown, total] = (await page.locator('app-player .scrub .count').textContent()).match(/\d+/g).map(Number);
  const step = page.getByRole('button', { name: 'Step forward' });
  for (let i = shown; i < total; i++) await step.click();
  await page.locator('app-player .scene').scrollIntoViewIfNeeded();
  await settle(page, 500);
}

const STORIES = [
  {
    id: 'a1',
    title: 'The billing export',
    competencyIds: ['ownership', 'delivery'],
    draft: {
      situation: 'Our nightly billing export failed silently for a week before finance noticed the gap.',
      task: 'Nobody owned the export, and I had the most context on the pipeline that fed it.',
      action:
        'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
      result: 'Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.',
      reflection: '',
    },
  },
  {
    id: 'a2',
    title: 'Pushing back on the launch date',
    competencyIds: ['conflict', 'tradeoffs', 'influence', 'customer'],
    draft: { situation: '', task: '', action: '', result: '', reflection: '' },
  },
];

const seedStories = async (p) => {
  await p.evaluate((stories) => localStorage.setItem('CapacitorStorage.grasp.behavioral.stories', JSON.stringify(stories)), STORIES);
  await p.reload();
  await p.getByRole('link', { name: /The billing export/ }).waitFor();
};

const answerFirst = async (p, selector) => {
  await p.locator(selector).first().click();
  await settle(p, 500);
};

/** Every page state the audits and screenshots cover: a path plus the steps that bring the page into that state. */
export function states() {
  const players = ['binary-search', 'lcs', 'dijkstra', 'two-sum-hash', 'subsets-backtracking'].flatMap((id) => [
    { id: `player-${id}`, path: `/visualize/${id}` },
    { id: `player-${id}-predict`, path: `/visualize/${id}`, setup: async (p) => ((await toPredict(p)) ? settle(p, 500) : 'no predict') },
    {
      id: `player-${id}-answered`,
      path: `/visualize/${id}`,
      setup: async (p) => ((await toPredict(p)) ? answerFirst(p, '.predict .choice') : 'no predict'),
    },
  ]);
  return [
    { id: 'learn', path: '/learn' },
    { id: 'visualize-list', path: '/visualize' },
    ...players,
    { id: 'player-subsets-backtracking-end', path: '/visualize/subsets-backtracking', setup: toEnd },
    { id: 'review-question', path: '/drill' },
    { id: 'review-answered', path: '/drill', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'practice-question', path: '/drill?pattern=binary-search' },
    { id: 'practice-answered', path: '/drill?pattern=binary-search', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'pattern-binary-search', path: '/learn/pattern/binary-search' },
    { id: 'design-list', path: '/design' },
    { id: 'sandbox', path: '/design/first-scale-up' },
    { id: 'sandbox-inspector', path: '/design/first-scale-up', setup: (p) => answerFirst(p, '.palette .tool') },
    { id: 'sandbox-free', path: '/design/free-build' },
    { id: 'case-study', path: '/design/case/url-shortener' },
    {
      id: 'case-study-decided',
      path: '/design/case/url-shortener',
      setup: async (p) => {
        await p.getByRole('button', { name: /Can users pick a custom alias/ }).click();
        await p.getByRole('button', { name: 'Show the model answer' }).click();
        await p.getByRole('button', { name: 'Show all' }).click();
      },
    },
    {
      id: 'case-study-estimated',
      path: '/design/case/url-shortener',
      setup: async (p) => {
        await p.getByRole('button', { name: /How many links are created per day/ }).click();
        await p.getByRole('button', { name: 'Show the model answer' }).click();
        await p.getByRole('button', { name: 'Show all' }).click();
        await p.getByRole('button', { name: 'Next: Estimate the traffic' }).click();
        await p.getByRole('textbox', { name: 'Average redirects per second' }).fill('30k');
        await p.getByRole('button', { name: 'Check', exact: true }).click();
      },
    },
    { id: 'case-build', path: '/design/free-build?case=news-feed' },
    { id: 'case-ticketing', path: '/design/case/ticketing' },
    { id: 'case-build-ticketing', path: '/design/free-build?case=ticketing' },
    { id: 'case-build-video-streaming', path: '/design/free-build?case=video-streaming' },
    { id: 'case-build-web-crawler', path: '/design/free-build?case=web-crawler' },
    { id: 'case-search-engine', path: '/design/case/search-engine' },
    { id: 'case-build-search-engine', path: '/design/free-build?case=search-engine' },
    { id: 'case-file-sync', path: '/design/case/file-sync' },
    { id: 'case-build-file-sync', path: '/design/free-build?case=file-sync' },
    { id: 'case-leaderboard', path: '/design/case/leaderboard' },
    { id: 'case-build-leaderboard', path: '/design/free-build?case=leaderboard' },
    { id: 'case-ad-click-aggregator', path: '/design/case/ad-click-aggregator' },
    { id: 'case-build-ad-click-aggregator', path: '/design/free-build?case=ad-click-aggregator' },
    { id: 'case-job-scheduler', path: '/design/case/job-scheduler' },
    { id: 'case-build-job-scheduler', path: '/design/free-build?case=job-scheduler' },
    { id: 'case-collaborative-editor', path: '/design/case/collaborative-editor' },
    { id: 'case-build-collaborative-editor', path: '/design/free-build?case=collaborative-editor' },
    { id: 'case-metrics-monitoring', path: '/design/case/metrics-monitoring' },
    { id: 'case-build-metrics-monitoring', path: '/design/free-build?case=metrics-monitoring' },
    { id: 'case-hotel-booking', path: '/design/case/hotel-booking' },
    { id: 'case-build-hotel-booking', path: '/design/free-build?case=hotel-booking' },
    { id: 'case-stock-exchange', path: '/design/case/stock-exchange' },
    { id: 'case-build-stock-exchange', path: '/design/free-build?case=stock-exchange' },
    { id: 'case-message-queue', path: '/design/case/message-queue' },
    { id: 'case-build-message-queue', path: '/design/free-build?case=message-queue' },
    { id: 'lesson-latency', path: '/learn/design/sd-latency', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-caching-flushed',
      path: '/learn/design/sd-caching',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('button', { name: 'Flush the cache' }).click();
      },
    },
    {
      id: 'lesson-sharding-added',
      path: '/learn/design/sd-sharding',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('button', { name: 'Add node E' }).click();
      },
    },
    { id: 'lesson-queues', path: '/learn/design/sd-queues', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-replication-pinned',
      path: '/learn/design/sd-replication',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('checkbox', { name: /Read your own writes/ }).check();
      },
    },
    { id: 'lesson-rate-limiting', path: '/learn/design/sd-rate-limiting', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-reliability', path: '/learn/design/sd-reliability', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-estimation-answered',
      path: '/learn/design/sd-estimation',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.locator('app-estimate-drill input').fill('6k');
        await p.getByRole('button', { name: 'Check', exact: true }).click();
      },
    },
    { id: 'lesson-capacity', path: '/learn/design/sd-capacity', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-consistency-down',
      path: '/learn/design/sd-consistency',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('button', { name: /^Replica 3,/ }).click();
      },
    },
    { id: 'lesson-consensus', path: '/learn/design/sd-consensus', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-ids', path: '/learn/design/sd-ids', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-search', path: '/learn/design/sd-search', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-streams-sliding',
      path: '/learn/design/sd-streams',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Sliding' }).click();
      },
    },
    { id: 'lesson-storage', path: '/learn/design/sd-storage', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-geo', path: '/learn/design/sd-geo', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-data-modeling-denormalized',
      path: '/learn/design/sd-data-modeling',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Denormalized' }).click();
      },
    },
    {
      id: 'lesson-locks-fencing',
      path: '/learn/design/sd-locks',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('checkbox', { name: 'Fencing tokens' }).check();
      },
    },
    {
      id: 'lesson-load-balancing-slow',
      path: '/learn/design/sd-load-balancing',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: '5×' }).click();
      },
    },
    {
      id: 'lesson-clocks-hybrid',
      path: '/learn/design/sd-clocks',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Hybrid logical clock' }).click();
      },
    },
    {
      id: 'lesson-discovery-registry',
      path: '/learn/design/sd-discovery',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Registry' }).click();
      },
    },
    { id: 'lesson-overload', path: '/learn/design/sd-overload', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-realtime-long-polling',
      path: '/learn/design/sd-realtime',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Long polling' }).click();
      },
    },
    {
      id: 'lesson-transactions-saga',
      path: '/learn/design/sd-transactions',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Saga' }).click();
        await p.getByRole('radio', { name: 'Step 3' }).click();
      },
    },
    {
      id: 'lesson-batch-skew',
      path: '/learn/design/sd-batch',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('slider', { name: /hottest key/ }).fill('20');
      },
    },
    {
      id: 'lesson-api-design-cursor',
      path: '/learn/design/sd-api-design',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Cursor' }).click();
      },
    },
    { id: 'lesson-security', path: '/learn/design/sd-security', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-multi-region-quorum',
      path: '/learn/design/sd-multi-region',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Quorum' }).click();
      },
    },
    {
      id: 'lesson-observability-burning',
      path: '/learn/design/sd-observability',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('slider', { name: /Requests failing now/ }).fill('144');
      },
    },
    {
      id: 'lesson-cdn-shield',
      path: '/learn/design/sd-cdn',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('checkbox', { name: /Origin shield/ }).check();
      },
    },
    { id: 'interview-home', path: '/interview' },
    { id: 'lesson-binary-search', path: '/learn/pattern/binary-search' },
    {
      id: 'lesson-dp-2d-revealed',
      path: '/learn/pattern/dp-2d',
      setup: async (p) => {
        const example = p.locator('app-worked-example').first();
        await example.getByRole('button', { name: /key move/ }).click();
        await example.getByRole('button', { name: 'Walk through it' }).click();
        await example.getByRole('button', { name: 'Show all' }).click();
        await p.locator('details.follow-up summary').first().click();
      },
    },
    { id: 'behavioral-list', path: '/behavioral' },
    { id: 'behavioral-competency', path: '/behavioral/conflict' },
    { id: 'behavioral-competency-new', path: '/behavioral/feedback' },
    {
      id: 'behavioral-examples-checked',
      path: '/behavioral/conflict',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Show why it works' }).click();
        const exercise = p.locator('app-spot-flaws').first();
        await exercise.getByRole('checkbox', { name: 'Blames others' }).check();
        await exercise.getByRole('checkbox', { name: 'No measurable result' }).check();
        await exercise.getByRole('button', { name: 'Check' }).click();
      },
    },
    { id: 'behavioral-question', path: '/behavioral/question/conflict-1' },
    {
      id: 'behavioral-question-drafted',
      path: '/behavioral/question/ownership-1',
      setup: async (p) => {
        const fields = p.locator('app-star-practice textarea');
        await fields.nth(0).fill('Our nightly billing export failed silently for a week before finance noticed the gap.');
        await fields.nth(1).fill('Nobody owned the export, and I had the most context on the pipeline that fed it.');
        await fields
          .nth(2)
          .fill(
            'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
          );
        await fields.nth(3).fill('Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.');
      },
    },
    { id: 'behavioral-stories-empty', path: '/behavioral/stories' },
    { id: 'behavioral-stories', path: '/behavioral/stories', setup: seedStories },
    {
      id: 'behavioral-story',
      path: '/behavioral/stories',
      setup: async (p) => {
        await seedStories(p);
        await p.getByRole('link', { name: /The billing export/ }).click();
        await p.getByLabel('Title').waitFor();
      },
    },
    {
      id: 'behavioral-rehearse',
      path: '/behavioral/stories',
      setup: async (p) => {
        await seedStories(p);
        await p.getByRole('link', { name: 'Rehearse 1 due' }).click();
        await p.getByText('Peek at your story').click();
      },
    },
    { id: 'behavioral-rehearse-none', path: '/behavioral/rehearse' },
    { id: 'behavioral-mock', path: '/behavioral/mock' },
    {
      id: 'behavioral-mock-debrief',
      path: '/behavioral/mock',
      setup: async (p) => {
        const mock = p.locator('app-behavioral-mock');
        const next = mock.getByRole('button', { name: /^(Answer|Finish and see the debrief)$/ });
        for (let question = 0; question < 3; question++) {
          const draft = STORIES[0].draft;
          for (const [part, text] of Object.entries(draft))
            if (text) await mock.getByLabel(part[0].toUpperCase() + part.slice(1), { exact: true }).fill(text);
          await next.click();
          await mock.getByLabel('Your answer').fill('I would ask the data team to own it sooner, because an unowned job fails silently.');
          await next.click();
          await mock.getByLabel('Your answer').fill('Not sure.');
          await next.click();
        }
        await mock.getByRole('heading', { name: 'Debrief' }).waitFor();
      },
    },
    { id: 'settings', path: '/settings' },
    { id: 'code-list', path: '/code' },
    { id: 'code-two-sum', path: '/code/two-sum' },
    {
      id: 'code-two-sum-run',
      path: '/code/two-sum',
      setup: async (p) => {
        await p.getByRole('button', { name: /Run/ }).first().click();
        await p.waitForSelector('.outcome', { timeout: 30_000 });
        await settle(p, 400);
      },
    },
    { id: 'diagnostic-intro', path: '/diagnostic' },
    {
      id: 'feedback-dialog',
      path: '/learn',
      setup: async (p) => {
        await p.locator('.feedback-tab').click();
        await p.waitForSelector('ion-modal app-feedback-sheet');
        await settle(p, 600);
      },
    },
    {
      id: 'pilot-welcome',
      path: '/learn',
      fresh: true,
      setup: async (p) => {
        await p.waitForSelector('ion-modal app-pilot-notice');
        await settle(p, 600);
      },
    },
  ];
}
