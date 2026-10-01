import { getCaseStudy } from '@grasp/engine';
import { BASE, answerFirst, settle } from '../lib.mjs';

/** The authored index of a decision's recommended option: drafts name options by it, whatever order they are shown in. */
const recommended = (id, stage) => getCaseStudy(id).stages[stage].decision.options.findIndex((o) => o.best);

/** News Feed answers: two stages in progress, or every stage answered with the last one open. */
const NEWS_FEED_POINTS = [4, 2, 2, 5, 5, 5, 3, 4];
const NEWS_FEED_STARTED = {
  attempt: 'audit-in-progress',
  reached: 2,
  stages: [{ chosen: 1, revealed: 4 }, { guess: '35k', revealed: 2 }, { revealed: 1 }],
};
const NEWS_FEED_ANSWERED = {
  attempt: 'audit-finished',
  reached: 7,
  stages: NEWS_FEED_POINTS.map((revealed, i) => ({
    revealed,
    ...([0, 4, 6].includes(i) ? { chosen: i === 0 ? 1 : recommended('news-feed', i) } : {}),
    ...(i === 1 ? { guess: '35k' } : i === 2 ? { guess: '1' } : {}),
  })),
};

const seedCase = async (p, id, draft) => {
  await p.evaluate(([key, value]) => localStorage.setItem(key, value), [`CapacitorStorage.grasp.case.${id}`, JSON.stringify(draft)]);
  await p.reload();
  await p.locator('ion-content').first().waitFor();
};

const finishNewsFeed = async (p) => {
  await seedCase(p, 'news-feed', NEWS_FEED_ANSWERED);
  await p.getByRole('button', { name: 'Finish the case' }).click();
  await p.locator('.outcome', { hasText: 'Case finished.' }).waitFor();
  await settle(p);
};

/** A case's estimates and decisions, by stage index. */
const CASE_ANSWERS = {
  'payment-ledger': { guesses: { 1: '18.5k', 2: '30', 7: '17', 9: '72M' }, decided: [0, 3, 4, 6, 8, 10, 11] },
  'feature-flags': { guesses: { 1: '5M', 2: '667' }, decided: [0, 3, 4, 6, 7, 8, 9, 10, 11, 12] },
};

/** A case answered up to `reached`, its decisions as recommended, so the stage there shows its model. */
const answeredDraft = (id, reached) => {
  const { guesses, decided } = CASE_ANSWERS[id];
  return {
    attempt: `audit-${id}-${reached}`,
    reached,
    stages: Array.from({ length: reached + 1 }, (_, i) =>
      i in guesses ? { guess: guesses[i] } : decided.includes(i) ? { chosen: recommended(id, i) } : {},
    ),
  };
};

/** Opens the case at the stage of `widget`, answers its prediction with `pick` and brings it into view. */
const caseWidget = (id, reached, widget, pick) => async (p) => {
  await seedCase(p, id, answeredDraft(id, reached));
  const model = p.locator(widget);
  await model.waitFor();
  await pick(model);
  await model.scrollIntoViewIfNeeded();
  await settle(p);
};

/** The Design Lab, case studies with their builds and widgets, and design lessons. */
export function designStates() {
  return [
    { id: 'design-list', path: '/design' },
    { id: 'sandbox', path: '/design/first-scale-up' },
    { id: 'sandbox-inspector', path: '/design/first-scale-up', setup: (p) => answerFirst(p, '.palette .tool') },
    { id: 'sandbox-leaderboard', path: '/design/leaderboard-budget' },
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
    {
      id: 'case-study-in-progress',
      path: '/design/case/news-feed',
      setup: async (p) => {
        await seedCase(p, 'news-feed', NEWS_FEED_STARTED);
        await p.getByRole('textbox', { name: 'Average feed reads per second' }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'case-study-finished', path: '/design/case/news-feed', setup: finishNewsFeed },
    {
      id: 'design-list-cases',
      path: '/design/case/news-feed',
      setup: async (p) => {
        await finishNewsFeed(p);
        await seedCase(p, 'url-shortener', {
          attempt: 'audit-url',
          reached: 1,
          stages: [{ chosen: recommended('url-shortener', 0), revealed: 5 }],
        });
        await p.goto(`${BASE}/design`);
        await p.getByRole('link', { name: /^URL Shortener.*Stage 2 of 9/ }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'case-build', path: '/design/free-build?case=news-feed' },
    { id: 'case-payment-ledger', path: '/design/case/payment-ledger' },
    { id: 'case-build-payment-ledger', path: '/design/free-build?case=payment-ledger' },
    {
      id: 'case-payment-ledger-retries',
      path: '/design/case/payment-ledger',
      setup: caseWidget('payment-ledger', 4, 'app-retry-widget', (m) => m.getByRole('button', { name: 'Posted twice' }).click()),
    },
    {
      id: 'case-payment-ledger-hot-account',
      path: '/design/case/payment-ledger',
      setup: caseWidget('payment-ledger', 7, 'app-hot-account-widget', (m) => m.locator('fieldset button').first().click()),
    },
    {
      id: 'case-payment-ledger-reconcile',
      path: '/design/case/payment-ledger',
      setup: caseWidget('payment-ledger', 11, 'app-reconcile-widget', async (m) => {
        for (let i = 0; i < 5; i++) await m.locator('app-widget-check').nth(i).getByRole('button', { name: 'Nothing: it matches' }).click();
      }),
    },
    { id: 'case-feature-flags', path: '/design/case/feature-flags' },
    { id: 'case-build-feature-flags', path: '/design/free-build?case=feature-flags' },
    {
      id: 'case-feature-flags-bucketing',
      path: '/design/case/feature-flags',
      setup: caseWidget('feature-flags', 6, 'app-bucketing-widget', async (m) => {
        await m.getByRole('radio', { name: '25%' }).click();
        await m.locator('app-widget-check fieldset button').first().click();
      }),
    },
    {
      id: 'case-feature-flags-propagation',
      path: '/design/case/feature-flags',
      setup: caseWidget('feature-flags', 7, 'app-propagation-widget', (m) => m.locator('app-widget-check fieldset button').first().click()),
    },
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
    {
      id: 'lesson-durability-erasure',
      path: '/learn/design/sd-durability',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: '6 + 3 erasure' }).click();
      },
    },
    {
      id: 'lesson-recovery-delete',
      path: '/learn/design/sd-recovery',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Async standby' }).click();
        await p.getByRole('radio', { name: 'A bad delete' }).click();
      },
    },
    {
      id: 'lesson-tenancy-fair',
      path: '/learn/design/sd-tenancy',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Fair sharing' }).click();
      },
    },
    {
      id: 'lesson-gateway-mesh',
      path: '/learn/design/sd-gateway',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Introspection' }).click();
        await p.getByRole('checkbox', { name: 'Service mesh with sidecar proxies' }).check();
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
  ];
}
