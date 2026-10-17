import { getCaseStudy, itemsForTopic } from '@grasp/engine';
import { BASE, answerFirst, openReports, settle } from '../lib.mjs';

/** The authored index of a decision's recommended option: drafts name options by it, whatever order they are shown in. */
const recommended = (id, stage) => getCaseStudy(id).stages[stage].decision.options.findIndex((o) => o.best);

/** News Feed answers: two stages in progress, or every stage answered with the last one open. */
/** The Caching widget's panel at the top of the view, so its picture and the controls under it show. */
const cacheStageToTop = (p) => p.locator('#try').evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
/** A worker-run widget is drawn once its first run is in: the readout has a value. */
const balancerReady = (p) => p.locator('app-balancer-widget .value.big').filter({ hasText: /\d/ }).waitFor();
/** Steps a handle on the drawing by key, as a learner without a mouse would. */
const stepHandle = async (p, name, key, times = 1) => {
  await p.getByRole('slider', { name, exact: true }).focus();
  for (let i = 0; i < times; i++) await p.keyboard.press(key);
};
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
  'proximity-service': { guesses: { 1: '17k', 2: '200' }, decided: [0, 3, 4, 6, 7, 8, 9, 10, 11, 12] },
  'email-service': { guesses: { 1: '463k', 2: '518' }, decided: [0, 3, 4, 6, 7, 8, 9, 10, 11, 12] },
  'code-deployment': { guesses: { 1: '1000', 2: '133', 8: '225' }, decided: [0, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13] },
};

/** A case answered up to `reached`, its decisions as recommended, so the stage there shows its model. */
const answeredDraft = (id, reached) => {
  const { guesses, decided } = CASE_ANSWERS[id];
  return {
    attempt: `audit-${id}-${reached}`,
    reached,
    stages: Array.from({ length: reached + 1 }, (_, i) => ({
      ...(i in guesses ? { guess: guesses[i] } : {}),
      ...(decided.includes(i) ? { chosen: recommended(id, i) } : {}),
    })),
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

/** Attachments Everywhere solved with an object store, so the sidebar shows the cleared mission. */
const clearAttachments = async (p) => {
  const design = {
    nodes: [
      { id: 'users', kind: 'client', x: 70, y: 240, instances: 1 },
      { id: 'lb', kind: 'lb', x: 250, y: 240, instances: 2 },
      { id: 'app', kind: 'app', x: 430, y: 240, instances: 9 },
      { id: 'db', kind: 'db', x: 700, y: 240, instances: 2 },
      { id: 'objects', kind: 'blob', x: 430, y: 400, instances: 1 },
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'app' },
      { from: 'app', to: 'db' },
      { from: 'app', to: 'objects' },
    ],
  };
  await p.evaluate(
    (value) => localStorage.setItem('CapacitorStorage.grasp.design.mail-attachments', value),
    JSON.stringify({ design, workload: { rps: 10_000, readRatio: 0.3, objectShare: 0.5 } }),
  );
  await p.reload();
  await p.getByRole('heading', { name: 'Scenario cleared' }).waitFor();
  await settle(p);
};

/**
 * Your First Scale-Up passed, the Rate Limiter case finished and Load Balancing's cards recalled on three days and a Caching
 * quick check answered, so the Topics show every state and a shelf with a Ready topic. Seeded on the device and reloaded, as a sync would bring them.
 */
const seedDesignProgress = async (p) => {
  await p.evaluate(
    ([itemIds, opened]) => {
      const at = (offset) => new Date(Date.now() + offset * 86_400_000 - 3_600_000).toISOString();
      let n = 0;
      const event = (offset, body) => ({ id: `design-seed-${++n}`, at: at(offset), ...body });
      const events = [
        event(-3, { type: 'scenario.completed', scenarioId: 'first-scale-up', monthlyCost: 1840 }),
        event(-3, {
          type: 'case.completed',
          caseId: 'rate-limiter',
          topics: ['sd-rate-limiting', 'sd-estimation', 'sd-reliability'],
          bestChoices: 3,
          decisions: 4,
          closeEstimates: 1,
          estimates: 2,
        }),
        event(-3, { type: 'practice.answered', itemId: opened, correct: true, durationMs: 9000 }),
        ...[-2, -1, 0].flatMap((offset) =>
          itemIds.map((itemId) => event(offset, { type: 'review.graded', itemId, rating: 3, correct: true, durationMs: 9000 })),
        ),
      ];
      localStorage.setItem('CapacitorStorage.grasp.events', JSON.stringify({ events, cursor: null }));
    },
    [itemsForTopic('sd-load-balancing').map((item) => item.id), itemsForTopic('sd-caching')[0].id],
  );
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('app-design-shelves').waitFor();
  await settle(p);
};

/** The Design Lab, case studies with their builds and widgets, and design lessons. */
export function designStates() {
  return [
    { id: 'design-topics', path: '/design' },
    { id: 'design-topics-progress', path: '/design', setup: seedDesignProgress },
    {
      id: 'design-topics-coordination',
      path: '/design',
      setup: async (p) => {
        await p.getByRole('button', { name: /^Coordination/ }).click();
        await settle(p);
      },
    },
    { id: 'design-missions', path: '/design/missions' },
    { id: 'design-missions-topic', path: '/design/missions?topic=sd-capacity' },
    { id: 'design-cases-topic', path: '/design/cases?topic=sd-rate-limiting' },
    {
      id: 'design-cases-filters',
      path: '/design/cases?level=core',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Filters' }).click();
        await p.getByRole('dialog', { name: 'Filters' }).waitFor();
        await settle(p);
      },
    },
    { id: 'case-study-related', path: '/design/cases/ticketing' },
    { id: 'sandbox', path: '/design/missions/first-scale-up' },
    { id: 'sandbox-inspector', path: '/design/missions/first-scale-up', setup: (p) => answerFirst(p, '.palette .tool') },
    {
      id: 'sandbox-edge-inspector',
      path: '/design/missions/first-scale-up',
      setup: async (p) => {
        await p.locator('.edge .hit').first().dispatchEvent('pointerdown');
        await p.locator('.inspector h2.mono').scrollIntoViewIfNeeded();
        await settle(p, 500);
      },
    },
    { id: 'sandbox-leaderboard', path: '/design/missions/leaderboard-budget' },
    { id: 'sandbox-attachments', path: '/design/missions/mail-attachments' },
    { id: 'sandbox-attachments-cleared', path: '/design/missions/mail-attachments', setup: clearAttachments },
    { id: 'sandbox-ledger', path: '/design/missions/ledger-month-end' },
    { id: 'sandbox-ledger-revisit', path: '/design/missions/ledger-month-end?revisit=1' },
    { id: 'sandbox-reconnect-storm', path: '/design/missions/reconnect-storm' },
    { id: 'sandbox-free', path: '/design/lab' },
    { id: 'case-study', path: '/design/cases/url-shortener' },
    { id: 'case-reported', path: '/design/cases/chat', setup: openReports },
    {
      id: 'case-study-decided',
      path: '/design/cases/url-shortener',
      setup: async (p) => {
        await p.getByRole('button', { name: /Can users pick a custom alias/ }).click();
        await p.getByRole('button', { name: 'Show the model answer' }).click();
        await p.getByRole('button', { name: 'Show all' }).click();
      },
    },
    {
      id: 'case-study-estimated',
      path: '/design/cases/url-shortener',
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
      path: '/design/cases/news-feed',
      setup: async (p) => {
        await seedCase(p, 'news-feed', NEWS_FEED_STARTED);
        await p.getByRole('textbox', { name: 'Average feed reads per second' }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'case-study-finished', path: '/design/cases/news-feed', setup: finishNewsFeed },
    {
      id: 'design-cases',
      path: '/design/cases/news-feed',
      setup: async (p) => {
        await finishNewsFeed(p);
        await seedCase(p, 'url-shortener', {
          attempt: 'audit-url',
          reached: 1,
          stages: [{ chosen: recommended('url-shortener', 0), revealed: 5 }],
        });
        await p.goto(`${BASE}/design/cases`);
        await p.getByRole('link', { name: /^URL Shortener.*Stage 2 of 9/ }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'case-build', path: '/design/cases/news-feed/build' },
    { id: 'case-payment-ledger', path: '/design/cases/payment-ledger' },
    { id: 'case-build-payment-ledger', path: '/design/cases/payment-ledger/build' },
    {
      id: 'case-payment-ledger-retries',
      path: '/design/cases/payment-ledger',
      setup: caseWidget('payment-ledger', 4, 'app-retry-widget', (m) => m.getByRole('button', { name: 'Posted twice' }).click()),
    },
    {
      id: 'case-payment-ledger-hot-account',
      path: '/design/cases/payment-ledger',
      setup: caseWidget('payment-ledger', 7, 'app-hot-account-widget', (m) => m.locator('fieldset button').first().click()),
    },
    {
      id: 'case-payment-ledger-reconcile',
      path: '/design/cases/payment-ledger',
      setup: caseWidget('payment-ledger', 11, 'app-reconcile-widget', async (m) => {
        for (let i = 0; i < 5; i++) await m.locator('app-widget-check').nth(i).getByRole('button', { name: 'Nothing: it matches' }).click();
      }),
    },
    { id: 'case-feature-flags', path: '/design/cases/feature-flags' },
    { id: 'case-build-feature-flags', path: '/design/cases/feature-flags/build' },
    {
      id: 'case-feature-flags-bucketing',
      path: '/design/cases/feature-flags',
      setup: caseWidget('feature-flags', 6, 'app-bucketing-widget', async (m) => {
        await m.getByRole('radio', { name: '25%' }).click();
        await m.locator('app-widget-check fieldset button').first().click();
      }),
    },
    {
      id: 'case-feature-flags-propagation',
      path: '/design/cases/feature-flags',
      setup: caseWidget('feature-flags', 7, 'app-propagation-widget', (m) => m.locator('app-widget-check fieldset button').first().click()),
    },
    { id: 'case-proximity-service', path: '/design/cases/proximity-service' },
    { id: 'case-build-proximity-service', path: '/design/cases/proximity-service/build' },
    {
      id: 'case-proximity-service-cells',
      path: '/design/cases/proximity-service',
      setup: caseWidget('proximity-service', 6, 'app-cells-widget', async (m) => {
        await m.getByRole('radio', { name: 'The cell and its 8 neighbours' }).click();
        await m.locator('app-widget-check fieldset button').first().click();
      }),
    },
    {
      id: 'case-proximity-service-quadtree',
      path: '/design/cases/proximity-service',
      setup: caseWidget('proximity-service', 7, 'app-quadtree-widget', (m) =>
        m.locator('app-widget-check fieldset button').first().click(),
      ),
    },
    { id: 'case-email-service', path: '/design/cases/email-service' },
    { id: 'case-build-email-service', path: '/design/cases/email-service/build' },
    {
      id: 'case-email-service-retry',
      path: '/design/cases/email-service',
      setup: caseWidget('email-service', 7, 'app-smtp-retry-widget', (m) => m.locator('app-widget-check fieldset button').first().click()),
    },
    {
      id: 'case-email-service-storage',
      path: '/design/cases/email-service',
      setup: caseWidget('email-service', 8, 'app-mail-storage-widget', (m) =>
        m.locator('app-widget-check fieldset button').first().click(),
      ),
    },
    { id: 'case-code-deployment', path: '/design/cases/code-deployment' },
    { id: 'case-build-code-deployment', path: '/design/cases/code-deployment/build' },
    {
      id: 'case-code-deployment-distribution',
      path: '/design/cases/code-deployment',
      setup: caseWidget('code-deployment', 7, 'app-artifact-distribution-widget', (m) =>
        m.locator('app-widget-check fieldset button').first().click(),
      ),
    },
    {
      id: 'case-code-deployment-rollout',
      path: '/design/cases/code-deployment',
      setup: caseWidget('code-deployment', 8, 'app-rollout-plan-widget', (m) =>
        m.locator('app-widget-check fieldset button').first().click(),
      ),
    },
    { id: 'case-ticketing', path: '/design/cases/ticketing' },
    { id: 'case-build-ticketing', path: '/design/cases/ticketing/build' },
    { id: 'case-build-video-streaming', path: '/design/cases/video-streaming/build' },
    { id: 'case-build-web-crawler', path: '/design/cases/web-crawler/build' },
    { id: 'case-search-engine', path: '/design/cases/search-engine' },
    { id: 'case-build-search-engine', path: '/design/cases/search-engine/build' },
    { id: 'case-file-sync', path: '/design/cases/file-sync' },
    { id: 'case-build-file-sync', path: '/design/cases/file-sync/build' },
    { id: 'case-leaderboard', path: '/design/cases/leaderboard' },
    { id: 'case-build-leaderboard', path: '/design/cases/leaderboard/build' },
    { id: 'case-ad-click-aggregator', path: '/design/cases/ad-click-aggregator' },
    { id: 'case-build-ad-click-aggregator', path: '/design/cases/ad-click-aggregator/build' },
    { id: 'case-job-scheduler', path: '/design/cases/job-scheduler' },
    { id: 'case-build-job-scheduler', path: '/design/cases/job-scheduler/build' },
    { id: 'case-collaborative-editor', path: '/design/cases/collaborative-editor' },
    { id: 'case-build-collaborative-editor', path: '/design/cases/collaborative-editor/build' },
    { id: 'case-metrics-monitoring', path: '/design/cases/metrics-monitoring' },
    { id: 'case-build-metrics-monitoring', path: '/design/cases/metrics-monitoring/build' },
    { id: 'case-hotel-booking', path: '/design/cases/hotel-booking' },
    { id: 'case-build-hotel-booking', path: '/design/cases/hotel-booking/build' },
    { id: 'case-stock-exchange', path: '/design/cases/stock-exchange' },
    { id: 'case-build-stock-exchange', path: '/design/cases/stock-exchange/build' },
    { id: 'case-message-queue', path: '/design/cases/message-queue' },
    { id: 'case-build-message-queue', path: '/design/cases/message-queue/build' },
    { id: 'lesson-latency', path: '/design/topics/sd-latency', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-caching', path: '/design/topics/sd-caching', setup: (p) => cacheStageToTop(p) },
    {
      id: 'lesson-caching-flushed',
      path: '/design/topics/sd-caching',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Flush the cache' }).click();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-caching-revealed',
      path: '/design/topics/sd-caching',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Is p99 a miss?' }).click();
        await p.getByRole('button', { name: 'It stays at 101 ms' }).click();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-sharding-added',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('button', { name: 'Add node E' }).click();
      },
    },
    { id: 'lesson-queues', path: '/design/topics/sd-queues', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-replication',
      path: '/design/topics/sd-replication',
      setup: (p) => cacheStageToTop(p),
    },
    {
      id: 'lesson-replication-pinned',
      path: '/design/topics/sd-replication',
      setup: async (p) => {
        await p.getByRole('checkbox', { name: /Pin to the primary/ }).check();
        await stepHandle(p, 'Replica applies the write', 'ArrowRight', 12);
        await stepHandle(p, 'Your read', 'ArrowRight', 9);
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-replication-asking',
      path: '/design/topics/sd-replication',
      setup: async (p) => {
        await p.getByRole('button', { name: 'A read too soon' }).click();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-replication-revealed',
      path: '/design/topics/sd-replication',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Lag outlasts the pin' }).click();
        await p.locator('app-widget-check').getByRole('button', { name: 'The old value', exact: true }).click();
        await cacheStageToTop(p);
      },
    },
    { id: 'lesson-rate-limiting', path: '/design/topics/sd-rate-limiting', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-reliability', path: '/design/topics/sd-reliability', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-estimation-answered',
      path: '/design/topics/sd-estimation',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.locator('app-estimate-drill input').fill('6k');
        await p.getByRole('button', { name: 'Check', exact: true }).click();
      },
    },
    { id: 'lesson-capacity', path: '/design/topics/sd-capacity', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-consistency-down',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('button', { name: /^Replica 3,/ }).click();
      },
    },
    { id: 'lesson-consensus', path: '/design/topics/sd-consensus', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-ids', path: '/design/topics/sd-ids', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-search', path: '/design/topics/sd-search', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-streams-sliding',
      path: '/design/topics/sd-streams',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Sliding' }).click();
      },
    },
    { id: 'lesson-storage', path: '/design/topics/sd-storage', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-geo', path: '/design/topics/sd-geo', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-data-modeling-denormalized',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Denormalized' }).click();
      },
    },
    {
      id: 'lesson-locks-fencing',
      path: '/design/topics/sd-locks',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('checkbox', { name: 'Fencing tokens' }).check();
      },
    },
    {
      id: 'lesson-load-balancing',
      path: '/design/topics/sd-load-balancing',
      setup: async (p) => {
        await balancerReady(p);
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-load-balancing-slow',
      path: '/design/topics/sd-load-balancing',
      setup: async (p) => {
        await balancerReady(p);
        await stepHandle(p, 'Slow server', 'ArrowRight', 2);
        await p.locator('app-balancer-widget .value.big').filter({ hasText: '64.7 s' }).waitFor();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-load-balancing-fleet20',
      path: '/design/topics/sd-load-balancing',
      setup: async (p) => {
        await balancerReady(p);
        await stepHandle(p, 'Servers', 'End');
        await stepHandle(p, 'Slow server', 'End');
        await p.locator('app-balancer-widget .value.big').filter({ hasText: /\d/ }).waitFor();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-load-balancing-revealed',
      path: '/design/topics/sd-load-balancing',
      setup: async (p) => {
        await balancerReady(p);
        await p.getByRole('button', { name: 'Least connections backs off' }).click();
        await p.locator('app-widget-check legend').waitFor();
        await p.locator('app-widget-check button').nth(1).click();
        await p.locator('app-widget-check .explain').filter({ hasText: 'just under' }).waitFor();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-load-balancing-picks',
      path: '/design/topics/sd-load-balancing',
      setup: async (p) => {
        await balancerReady(p);
        await p.getByRole('radio', { name: 'Two random choices' }).check();
        await p.getByRole('button', { name: 'Watch it choose' }).click();
        await cacheStageToTop(p);
      },
    },
    {
      id: 'lesson-clocks-hybrid',
      path: '/design/topics/sd-clocks',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Hybrid logical clock' }).click();
      },
    },
    {
      id: 'lesson-discovery-registry',
      path: '/design/topics/sd-discovery',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Registry' }).click();
      },
    },
    {
      id: 'lesson-durability-erasure',
      path: '/design/topics/sd-durability',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: '6 + 3 erasure' }).click();
      },
    },
    {
      id: 'lesson-recovery-delete',
      path: '/design/topics/sd-recovery',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Async standby' }).click();
        await p.getByRole('radio', { name: 'A bad delete' }).click();
      },
    },
    {
      id: 'lesson-tenancy-fair',
      path: '/design/topics/sd-tenancy',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Fair sharing' }).click();
      },
    },
    {
      id: 'lesson-gateway-mesh',
      path: '/design/topics/sd-gateway',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Introspection' }).click();
        await p.getByRole('checkbox', { name: 'Service mesh with sidecar proxies' }).check();
      },
    },
    { id: 'lesson-overload', path: '/design/topics/sd-overload', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-realtime-long-polling',
      path: '/design/topics/sd-realtime',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Long polling' }).click();
      },
    },
    {
      id: 'lesson-transactions-saga',
      path: '/design/topics/sd-transactions',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Saga' }).click();
        await p.getByRole('radio', { name: 'Step 3' }).click();
      },
    },
    {
      id: 'lesson-batch-skew',
      path: '/design/topics/sd-batch',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('slider', { name: /hottest key/ }).fill('20');
      },
    },
    {
      id: 'lesson-api-design-cursor',
      path: '/design/topics/sd-api-design',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Cursor' }).click();
      },
    },
    { id: 'lesson-security', path: '/design/topics/sd-security', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    {
      id: 'lesson-multi-region-quorum',
      path: '/design/topics/sd-multi-region',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('radio', { name: 'Quorum' }).click();
      },
    },
    {
      id: 'lesson-observability-burning',
      path: '/design/topics/sd-observability',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('slider', { name: /Requests failing now/ }).fill('144');
      },
    },
    {
      id: 'lesson-cdn-shield',
      path: '/design/topics/sd-cdn',
      setup: async (p) => {
        await p.locator('#try').scrollIntoViewIfNeeded();
        await p.getByRole('checkbox', { name: /Origin shield/ }).check();
      },
    },
  ];
}
