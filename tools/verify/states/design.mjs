import { CASE_LABS, SCENARIO_CATALOG, getCaseStudy, itemsForTopic } from '@grasp/engine';
import { BASE, answerFirst, openReports, settle } from '../lib.mjs';
import { reliabilityStates } from './reliability.mjs';

/** The authored index of a decision's recommended option: drafts name options by it, whatever order they are shown in. */
const recommended = (id, stage) => getCaseStudy(id).stages[stage].decision.options.findIndex((o) => o.best);

/** News Feed answers: two stages in progress, or every stage answered with the last one open. */
/** The Caching widget's panel at the top of the view, so its picture and the controls under it show. */
const cacheStageToTop = (p) => p.locator('#try').evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
/** A worker-run widget is drawn once its first run is in: the readout has a value. */
const feedReady = async (p) => {
  await p.locator('app-feed-model-widget app-feed-traffic svg').waitFor();
  await p.locator('#try').scrollIntoViewIfNeeded();
};
/** The Consistency & Quorums widget drawn, its panel at the top of the view. */
const quorumStageToTop = (p) => p.locator('app-quorum-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
const quorumReady = async (p) => {
  await p.locator('app-quorum-widget svg.draw').waitFor();
  await quorumStageToTop(p);
};
/**
 * Sets the quorum widget as a learner would: N, the conditions, W and R by key from QUORUM, and taps on each replica
 * card (each tap moves it on: up, down, stops mid-write, back).
 */
const quorumAt = async (p, { n, w, r, stall, sloppy, taps = [] }, ready = true) => {
  if (ready) await p.locator('app-quorum-widget svg.draw').waitFor();
  const widget = p.locator('app-quorum-widget');
  if (n) {
    await widget.getByRole('radio', { name: `${n} replicas` }).check();
    // The handles take the new stops with the redraw; a key before it would step the old ones.
    await widget.locator(`svg.draw[aria-label^="${n} replicas"]`).waitFor();
  }
  if (stall) await widget.getByRole('checkbox', { name: /pauses/ }).check();
  if (sloppy) await widget.getByRole('checkbox', { name: /Sloppy quorum/ }).check();
  const quorum = Math.floor((n ?? 3) / 2) + 1;
  for (const [name, to] of [
    ['W, acks a write waits for', w],
    ['R, answers a read waits for', r],
  ]) {
    if (!to || to === quorum) continue;
    await stepHandle(p, name, to > quorum ? 'ArrowRight' : 'ArrowLeft', Math.abs(to - quorum));
  }
  for (const [i, k] of taps.entries()) for (let j = 0; j < k; j++) await widget.locator('.card-hit').nth(i).click();
  await quorumStageToTop(p);
};
const ringStageToTop = (p) => p.locator('app-ring-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/** Sets the sharding widget as a learner would: placement, points, nodes and the conditions, by their names. */
const ringAt = async (p, { scheme, points, nodes, hot, split, down }, ready = true) => {
  const widget = p.locator('app-ring-widget');
  if (ready) await widget.locator('svg.draw [data-id="k0"]').waitFor();
  if (scheme) await widget.getByRole('radio', { name: scheme }).check();
  if (points) await widget.getByRole('radio', { name: points, exact: true }).check();
  if (nodes) await widget.getByRole('radio', { name: new RegExp(`^${nodes} nodes`) }).check();
  if (hot) await widget.getByRole('checkbox', { name: /A hot key/ }).check();
  if (split) await widget.getByRole('checkbox', { name: 'Split the key' }).check();
  if (down) await widget.getByRole('checkbox', { name: /Busiest node down/ }).check();
  await ringStageToTop(p);
};
const ringCard = async (p, title) => {
  await p.locator('app-ring-widget svg.draw [data-id="k0"]').waitFor();
  await p.locator('app-ring-widget .cards button', { hasText: title }).click();
};
const latencyStageToTop = (p) => p.locator('app-latency-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/** The latency widget's load stops, as its handle steps them. */
const LATENCY_LOADS = [10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 98];
/**
 * Sets the latency widget as a learner would: the server count, the queue, steady work and a server down by their
 * controls, then the load by key from the stop it is at.
 */
const latencyAt = async (p, { servers, split, steady, down, load }, ready = true) => {
  const widget = p.locator('app-latency-widget');
  if (ready) await widget.locator('svg.draw .curve.p99').waitFor();
  if (servers) await widget.getByRole('radio', { name: String(servers), exact: true }).check();
  if (split !== undefined) await widget.getByRole('radio', { name: split ? 'A queue each' : 'One queue' }).check();
  if (steady !== undefined) await widget.getByRole('checkbox', { name: /Steady work/ }).setChecked(steady);
  if (down !== undefined) await widget.getByRole('checkbox', { name: /A server down/ }).setChecked(down);
  if (load) {
    const handle = widget.getByRole('slider', { name: 'Load, how busy the servers run' });
    const steps = LATENCY_LOADS.indexOf(load) - LATENCY_LOADS.indexOf(Number(await handle.getAttribute('aria-valuenow')));
    if (steps) await stepHandle(p, 'Load, how busy the servers run', steps > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(steps));
  }
  await latencyStageToTop(p);
};
const latencyCard = async (p, title) => {
  await p.locator('app-latency-widget svg.draw .curve.p99').waitFor();
  await p.locator('app-latency-widget .cards button', { hasText: title }).click();
};
const storageStageToTop = (p) => p.locator('app-storage-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/** Sets the storage widget as a learner would, by its radios and its Bloom filters toggle, once its summary is drawn. */
const storageAt = async (p, { op, data, record, page, ratio, bloom } = {}) => {
  const widget = p.locator('app-storage-widget');
  await widget.locator('svg.draw[aria-label^="A B-tree and an LSM tree"]').waitFor();
  for (const name of [op, data, record, page, ratio]) if (name) await widget.getByRole('radio', { name, exact: true }).check();
  if (bloom !== undefined) await widget.getByRole('checkbox', { name: 'Bloom filters' }).setChecked(bloom);
  await storageStageToTop(p);
};
const storageCard = async (p, title) => {
  await storageAt(p);
  await p.locator('app-storage-widget .cards button', { hasText: title }).click();
};
const idsStageToTop = (p) => p.locator('app-ids-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/** Sets the ids widget as a learner would: the steppers pressed from Snowflake's layout, then the radios, once drawn. */
const idsAt = async (p, { gen = 0, seq = 0, radios = [], guard } = {}) => {
  const widget = p.locator('app-ids-widget');
  await widget.locator('svg.draw[aria-label^="The 64 bits are"]').waitFor();
  for (const [by, one] of [
    [gen, 'generator'],
    [seq, 'sequence'],
  ])
    for (let i = 0; i < Math.abs(by); i++)
      await widget.getByRole('button', { name: `One ${one} bit ${by > 0 ? 'more' : 'fewer'}` }).click();
  for (const name of radios) await widget.getByRole('radio', { name, exact: true }).check();
  if (guard !== undefined) await widget.getByRole('checkbox', { name: /^Keep the last timestamp/ }).setChecked(guard);
  await idsStageToTop(p);
};
const idsCard = async (p, title) => {
  await idsAt(p);
  await p.locator('app-ids-widget .cards button', { hasText: title }).click();
};
const capacityStageToTop = (p) => p.locator('app-capacity-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/**
 * Sets the capacity widget as a learner would: each tier's steppers pressed from the default (2 load balancers, 4 app
 * servers, the 8,000-query machine, 2 replicas), the conditions checked, then the traffic by key.
 */
const capacityAt = async (
  p,
  { lb = 0, app = 0, smaller = false, bigger = false, replicas = 0, cache, zone, slow, traffic = 0 } = {},
  ready = true,
) => {
  const widget = p.locator('app-capacity-widget');
  if (ready) await widget.locator('svg.draw[aria-label*="requests a second"]').waitFor();
  const press = async (name, times) => {
    for (let i = 0; i < times; i++) await widget.getByRole('button', { name, exact: true }).click();
  };
  await press(lb > 0 ? 'More load balancers' : 'Fewer load balancers', Math.abs(lb));
  await press(app > 0 ? 'More app servers' : 'Fewer app servers', Math.abs(app));
  if (smaller) await press('A smaller database machine', 1);
  if (bigger) await press('A bigger database machine', 1);
  await press(replicas > 0 ? 'More read replicas' : 'Fewer read replicas', Math.abs(replicas));
  if (cache !== undefined) await widget.getByRole('checkbox', { name: /Cache reads/ }).setChecked(cache);
  if (zone !== undefined) await widget.getByRole('checkbox', { name: /Zone A down/ }).setChecked(zone);
  if (slow !== undefined) await widget.getByRole('checkbox', { name: /Slow queries/ }).setChecked(slow);
  if (traffic) await stepHandle(p, 'Traffic, requests a second', traffic > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(traffic));
  await capacityStageToTop(p);
};
const capacityCard = async (p, title) => {
  await p.locator('app-capacity-widget svg.draw[aria-label*="requests a second"]').waitFor();
  await p.locator('app-capacity-widget .cards button', { hasText: title }).click();
};
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

/** Presses a control only the desktop Lab has (from 1024px); on a phone the state is the page as it opens. */
const onDesktop = async (p, role, name) => {
  await p.locator('app-sandbox g.node').first().waitFor();
  const control = p.getByRole(role, { name });
  if (await control.isVisible()) await control.click();
  await settle(p, 500);
};

/** The Lab's boards without a state of their own above: every mission and case build is screenshotted (R21's pixel diff). */
const everyBoard = (listed) =>
  [
    ...SCENARIO_CATALOG.map((s) => ({ id: `sandbox-${s.id}`, path: `/design/missions/${s.id}` })),
    ...Object.keys(CASE_LABS).map((id) => ({ id: `case-build-${id}`, path: `/design/cases/${id}/build` })),
  ].filter((state) => !listed.some((l) => l.path === state.path));

/** The Design Lab, case studies with their builds and widgets, and design lessons. */
export function designStates() {
  const states = [
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
    { id: 'sandbox-inspector', path: '/design/missions/first-scale-up', setup: (p) => answerFirst(p, '.palette .tool, .tool-tile') },
    { id: 'sandbox-model', path: '/design/missions/first-scale-up', setup: (p) => onDesktop(p, 'button', /^Model/) },
    { id: 'sandbox-trace', path: '/design/cases/url-shortener/build', setup: (p) => onDesktop(p, 'button', 'Trace a request') },
    { id: 'sandbox-workload', path: '/design/cases/rate-limiter/build', setup: (p) => onDesktop(p, 'button', /^Workload/) },
    {
      id: 'sandbox-callout-inspector',
      path: '/design/missions/first-scale-up',
      setup: async (p) => {
        const callout = p.locator('app-lab-overlay .callout').first();
        if (await callout.isVisible()) await callout.click();
        await settle(p, 500);
      },
    },
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
    { id: 'lesson-latency', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, {}) },
    { id: 'lesson-latency-quiet', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { load: 30 }) },
    { id: 'lesson-latency-busy', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { load: 90 }) },
    { id: 'lesson-latency-split', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { servers: 4, split: true, load: 80 }) },
    {
      id: 'lesson-latency-pool',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, { servers: 4, split: true, load: 80 });
        await latencyAt(p, { split: false }, false);
      },
    },
    {
      id: 'lesson-latency-steady',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, { load: 90 });
        await latencyAt(p, { steady: true }, false);
      },
    },
    { id: 'lesson-latency-calm', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { servers: 4, steady: true, load: 30 }) },
    {
      id: 'lesson-latency-down',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, { servers: 3, load: 60 });
        await latencyAt(p, { down: true }, false);
      },
    },
    { id: 'lesson-latency-overload', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { servers: 3, down: true, load: 70 }) },
    { id: 'lesson-latency-critical', path: '/design/topics/sd-latency', setup: (p) => latencyAt(p, { servers: 2, down: true, load: 50 }) },
    {
      id: 'lesson-latency-reduced',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, {});
        await p.locator('app-latency-widget').getByRole('button', { name: 'Play the sample' }).click();
        await p.locator('app-latency-widget .caption').waitFor();
      },
    },
    {
      id: 'lesson-latency-describe',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, {});
        await p.locator('app-latency-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-latency-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-latency-table',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyAt(p, { servers: 3, down: true, load: 80 });
        await p.locator('app-latency-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-latency-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-latency-asking',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyCard(p, 'One queue or a queue each');
        await p.locator('app-widget-check legend').waitFor();
        await latencyStageToTop(p);
      },
    },
    {
      id: 'lesson-latency-revealed',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyCard(p, 'From 70% to 90% busy');
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^100 ms: 3× as long/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^100 ms: the mean is/ })
          .waitFor();
        await latencyStageToTop(p);
      },
    },
    {
      id: 'lesson-latency-challenge',
      path: '/design/topics/sd-latency',
      setup: async (p) => {
        await latencyCard(p, 'Challenge');
        await latencyAt(p, { servers: 4, split: false }, false);
        await p.locator('app-experiment-dock .reveal').waitFor();
        await latencyStageToTop(p);
      },
    },
    { id: 'lesson-storage', path: '/design/topics/sd-storage', setup: (p) => storageAt(p) },
    { id: 'lesson-storage-lookup', path: '/design/topics/sd-storage', setup: (p) => storageAt(p, { op: 'A lookup' }) },
    { id: 'lesson-storage-bigpage', path: '/design/topics/sd-storage', setup: (p) => storageAt(p, { page: '16 KB' }) },
    { id: 'lesson-storage-bigrecord', path: '/design/topics/sd-storage', setup: (p) => storageAt(p, { record: '1,000 B' }) },
    { id: 'lesson-storage-nobloom', path: '/design/topics/sd-storage', setup: (p) => storageAt(p, { op: 'A lookup', bloom: false }) },
    { id: 'lesson-storage-tall', path: '/design/topics/sd-storage', setup: (p) => storageAt(p, { data: '1,000 GB', ratio: '4' }) },
    {
      id: 'lesson-storage-small',
      path: '/design/topics/sd-storage',
      setup: (p) => storageAt(p, { data: '10 GB', record: '1,000 B', page: '16 KB', ratio: '20' }),
    },
    {
      id: 'lesson-storage-reduced',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageAt(p);
        await p.locator('app-storage-widget').getByRole('button', { name: 'Play the write through the LSM tree' }).click();
        await p.locator('app-storage-widget .caption').waitFor();
      },
    },
    {
      id: 'lesson-storage-describe',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageAt(p);
        await p.locator('app-storage-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-storage-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-storage-table',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageAt(p, { op: 'A lookup', data: '1,000 GB', bloom: false });
        await p.locator('app-storage-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-storage-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-storage-asking',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageCard(p, 'One small update');
        await p.locator('app-widget-check legend').waitFor();
        await storageStageToTop(p);
      },
    },
    {
      id: 'lesson-storage-revealed',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageCard(p, 'Without bloom filters');
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^5 disk reads: one in every run/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^5 disk reads: the newest version/ })
          .waitFor();
        await storageStageToTop(p);
      },
    },
    {
      id: 'lesson-storage-challenge',
      path: '/design/topics/sd-storage',
      setup: async (p) => {
        await storageCard(p, 'Challenge');
        await storageAt(p, { ratio: '5' });
        await p.locator('app-experiment-dock .reveal').waitFor();
        await storageStageToTop(p);
      },
    },
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
    { id: 'lesson-sharding', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, {}) },
    { id: 'lesson-sharding-one', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { points: '1' }) },
    { id: 'lesson-sharding-mod', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { scheme: 'hash mod N' }) },
    { id: 'lesson-sharding-joined', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { nodes: 5 }) },
    { id: 'lesson-sharding-modjoined', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { scheme: 'hash mod N', nodes: 5 }) },
    { id: 'lesson-sharding-down', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { points: '1', down: true }) },
    { id: 'lesson-sharding-hot', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { hot: true, nodes: 6 }) },
    { id: 'lesson-sharding-split', path: '/design/topics/sd-sharding', setup: (p) => ringAt(p, { hot: true, split: true }) },
    {
      id: 'lesson-sharding-describe',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await ringAt(p, { nodes: 5 });
        await p.locator('app-ring-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-ring-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-sharding-table',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await ringAt(p, { nodes: 6, down: true });
        await p.locator('app-ring-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-ring-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-sharding-asking',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await ringCard(p, 'The same node, on a ring');
        await p.locator('app-widget-check legend').waitFor();
        await ringStageToTop(p);
      },
    },
    {
      id: 'lesson-sharding-revealed',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await ringCard(p, 'A fifth node, by hash mod N');
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^About 160/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^It moves 166/ })
          .waitFor();
        await ringStageToTop(p);
      },
    },
    {
      id: 'lesson-sharding-challenge',
      path: '/design/topics/sd-sharding',
      setup: async (p) => {
        await ringCard(p, 'Challenge');
        await ringAt(p, { scheme: 'Consistent hashing', points: '100', nodes: 5, split: true }, false);
        await p.locator('app-experiment-dock .reveal').waitFor();
        await ringStageToTop(p);
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
    { id: 'lesson-capacity', path: '/design/topics/sd-capacity', setup: (p) => capacityAt(p) },
    { id: 'lesson-capacity-calm', path: '/design/topics/sd-capacity', setup: (p) => capacityAt(p, { traffic: -7 }) },
    { id: 'lesson-capacity-cached', path: '/design/topics/sd-capacity', setup: (p) => capacityAt(p, { app: 4, cache: true, traffic: 2 }) },
    {
      id: 'lesson-capacity-replicas',
      path: '/design/topics/sd-capacity',
      setup: (p) => capacityAt(p, { lb: 4, app: 16, replicas: 4, cache: true, traffic: 6 }),
    },
    {
      id: 'lesson-capacity-zone',
      path: '/design/topics/sd-capacity',
      setup: (p) => capacityAt(p, { lb: 1, app: 5, replicas: 1, cache: true, zone: true, traffic: 1 }),
    },
    {
      id: 'lesson-capacity-slow',
      path: '/design/topics/sd-capacity',
      setup: (p) => capacityAt(p, { app: 2, cache: true, slow: true, traffic: -2 }),
    },
    {
      id: 'lesson-capacity-overload',
      path: '/design/topics/sd-capacity',
      setup: (p) => capacityAt(p, { app: 17, replicas: 4, traffic: 13 }),
    },
    { id: 'lesson-capacity-outage', path: '/design/topics/sd-capacity', setup: (p) => capacityAt(p, { replicas: -2, zone: true }) },
    {
      id: 'lesson-capacity-ghost',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityAt(p, { cache: true });
        await capacityAt(p, { app: 2 }, false);
      },
    },
    {
      id: 'lesson-capacity-reduced',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityAt(p);
        await p
          .locator('app-capacity-widget')
          .getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ })
          .click();
        await p.locator('app-capacity-widget svg.draw [data-id="ring"]').waitFor();
      },
    },
    {
      id: 'lesson-capacity-describe',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityAt(p);
        await p.locator('app-capacity-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-capacity-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-capacity-table',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityAt(p, { lb: 1, app: 5, replicas: 1, cache: true, zone: true, traffic: 1 });
        await p.locator('app-capacity-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-capacity-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    ...[
      ['tenfold', 'Ten times the traffic'],
      ['cache', 'Cache the reads'],
      ['replay', 'Two more replicas'],
      ['zone', 'Lose a zone'],
      ['slow', 'A slow database'],
    ].flatMap(([id, title]) => [
      {
        id: `lesson-capacity-asking-${id}`,
        path: '/design/topics/sd-capacity',
        setup: async (p) => {
          await capacityCard(p, title);
          await p.locator('app-widget-check legend').waitFor();
          await capacityStageToTop(p);
        },
      },
      {
        id: `lesson-capacity-revealed-${id}`,
        path: '/design/topics/sd-capacity',
        setup: async (p) => {
          await capacityCard(p, title);
          await p.locator('app-widget-check button.g-choice').first().click();
          await p.locator('app-widget-check .explain:not(.muted)').waitFor();
          await capacityStageToTop(p);
        },
      },
    ]),
    {
      id: 'lesson-capacity-challenge',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityCard(p, 'Challenge');
        await p.locator('app-capacity-widget .checks li').first().waitFor();
        await capacityStageToTop(p);
      },
    },
    {
      id: 'lesson-capacity-challenge-met',
      path: '/design/topics/sd-capacity',
      setup: async (p) => {
        await capacityCard(p, 'Challenge');
        await capacityAt(p, { lb: 4, app: 9, bigger: true, replicas: 2, cache: true }, false);
        await p.locator('app-experiment-dock .reveal').waitFor();
        await capacityStageToTop(p);
      },
    },
    { id: 'lesson-consistency', path: '/design/topics/sd-consistency', setup: (p) => quorumReady(p) },
    { id: 'lesson-consistency-stale', path: '/design/topics/sd-consistency', setup: (p) => quorumAt(p, { w: 1, r: 1 }) },
    { id: 'lesson-consistency-down', path: '/design/topics/sd-consistency', setup: (p) => quorumAt(p, { taps: [0, 0, 1] }) },
    { id: 'lesson-consistency-timeout', path: '/design/topics/sd-consistency', setup: (p) => quorumAt(p, { w: 3, taps: [0, 0, 2] }) },
    {
      id: 'lesson-consistency-sloppy',
      path: '/design/topics/sd-consistency',
      setup: (p) => quorumAt(p, { sloppy: true, taps: [0, 3, 3] }),
    },
    { id: 'lesson-consistency-slow', path: '/design/topics/sd-consistency', setup: (p) => quorumAt(p, { n: 5, w: 3, r: 3, stall: true }) },
    {
      id: 'lesson-consistency-describe',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await quorumAt(p, { w: 1, r: 1 });
        await p.locator('app-quorum-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-quorum-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-consistency-table',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await quorumAt(p, { sloppy: true, r: 3, taps: [0, 0, 1] });
        await p.locator('app-quorum-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-quorum-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-consistency-asking',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await quorumReady(p);
        await p.locator('app-quorum-widget .cards button', { hasText: 'One replica stalls' }).click();
        await p.locator('app-widget-check legend').waitFor();
      },
    },
    {
      id: 'lesson-consistency-revealed',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await quorumReady(p);
        await p.locator('app-quorum-widget .cards button', { hasText: 'A sloppy quorum' }).click();
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^Yes: 1 of the 3/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^Yes, 1 of the 3/ })
          .waitFor();
        await quorumStageToTop(p);
      },
    },
    {
      id: 'lesson-consistency-challenge',
      path: '/design/topics/sd-consistency',
      setup: async (p) => {
        await quorumReady(p);
        await p.locator('app-quorum-widget .cards button', { hasText: 'Challenge' }).click();
        await quorumAt(p, { n: 5, w: 4, r: 2 }, false);
        await p.locator('app-experiment-dock .reveal').waitFor();
        await quorumStageToTop(p);
      },
    },
    { id: 'lesson-consensus', path: '/design/topics/sd-consensus', setup: (p) => p.locator('#try').scrollIntoViewIfNeeded() },
    { id: 'lesson-ids', path: '/design/topics/sd-ids', setup: (p) => idsAt(p) },
    { id: 'lesson-ids-gen11', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { gen: 1 }) },
    { id: 'lesson-ids-gen16', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { gen: 6 }) },
    { id: 'lesson-ids-gen0', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { gen: -10, seq: -12 }) },
    { id: 'lesson-ids-tick10', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ['10 ms'] }) },
    { id: 'lesson-ids-epoch1970', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ['1970'] }) },
    { id: 'lesson-ids-overflow', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { gen: 6, radios: ['1970'] }) },
    { id: 'lesson-ids-burst', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { gen: 2, seq: -2, radios: ['5,000 at once'] }) },
    { id: 'lesson-ids-skew', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ["G2's clock ahead"] }) },
    { id: 'lesson-ids-stepback', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ["G1's clock steps back"] }) },
    {
      id: 'lesson-ids-naive',
      path: '/design/topics/sd-ids',
      setup: (p) => idsAt(p, { radios: ["G1's clock steps back"], guard: false }),
    },
    { id: 'lesson-ids-shared', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ['G2 given number 1'] }) },
    { id: 'lesson-ids-random64', path: '/design/topics/sd-ids', setup: (p) => idsAt(p, { radios: ['64 random bits'] }) },
    {
      id: 'lesson-ids-trillion',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsAt(p, { radios: ['64 random bits'] });
        await p.locator('app-ids-widget').getByRole('slider', { name: 'Ids made' }).fill('12');
        await idsStageToTop(p);
      },
    },
    {
      id: 'lesson-ids-reduced',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsAt(p);
        await p.locator('app-ids-widget').getByRole('button', { name: 'Play the mint: 8 ms of three generators' }).click();
        await p.locator('app-ids-widget .caption').waitFor();
      },
    },
    {
      id: 'lesson-ids-describe',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsAt(p);
        await p.locator('app-ids-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-ids-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-ids-table',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsAt(p, { radios: ["G1's clock steps back"], guard: false });
        await p.locator('app-ids-widget').getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-ids-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-ids-asking',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsCard(p, 'Which id sorts first');
        await p.locator('app-widget-check legend').waitFor();
        await idsStageToTop(p);
      },
    },
    {
      id: 'lesson-ids-revealed',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsCard(p, 'The clock steps back');
        await p.locator('app-widget-check').getByRole('button', { name: 'Some repeat ids it already made' }).click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^Two ids are made twice/ })
          .waitFor();
        await idsStageToTop(p);
      },
    },
    {
      id: 'lesson-ids-challenge',
      path: '/design/topics/sd-ids',
      setup: async (p) => {
        await idsCard(p, 'Challenge: size the layout');
        await p.locator('app-ids-widget .checks li').first().waitFor();
      },
    },
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
    { id: 'lesson-data-modeling-n1', path: '/design/topics/sd-data-modeling', setup: (p) => feedReady(p) },
    {
      id: 'lesson-data-modeling-batched',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.getByRole('radio', { name: 'Batched IN' }).check();
      },
    },
    {
      id: 'lesson-data-modeling-join',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.getByRole('radio', { name: 'Join' }).check();
      },
    },
    {
      id: 'lesson-data-modeling-rename',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.getByRole('radio', { name: 'Denormalized', exact: true }).check();
        await p.getByRole('button', { name: 'Rename Ada' }).click();
        await p.getByRole('slider', { name: 'Copy rewrite' }).waitFor();
      },
    },
    {
      id: 'lesson-data-modeling-describe',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.getByRole('button', { name: 'Describe' }).click();
        await p.locator('app-feed-model-widget .describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-data-modeling-table',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.getByRole('button', { name: 'Table' }).click();
        await p.locator('app-feed-traffic g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-data-modeling-asking',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.locator('app-feed-model-widget .cards button', { hasText: 'Denormalize the feed?' }).click();
        await p.locator('app-widget-check legend').waitFor();
      },
    },
    {
      id: 'lesson-data-modeling-revealed',
      path: '/design/topics/sd-data-modeling',
      setup: async (p) => {
        await feedReady(p);
        await p.locator('app-feed-model-widget .cards button', { hasText: 'Denormalize the feed?' }).click();
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^It about halves/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^From / })
          .waitFor();
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
  states.push(...reliabilityStates());
  return [...states, ...everyBoard(states)];
}
