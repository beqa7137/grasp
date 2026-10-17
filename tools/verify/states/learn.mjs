import { PATTERN_CATALOG, itemsForTopic } from '@grasp/engine';
import { answerFirst, goto, openPlayback, settle, toEnd, toPredict } from '../lib.mjs';

const TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`;

/** A calendar day this many days from the page's today, as the date field takes it. */
const inDays = (p, days) =>
  p.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

/** Journey 1 (REDESIGN.md 2.14): a level, "3 weeks", "Build my plan". */
async function buildPlan(p) {
  await p.getByRole('button', { name: 'Mid-level' }).click();
  await p.getByRole('button', { name: '3 weeks' }).click();
  await p.getByRole('button', { name: 'Build my plan' }).click();
  await p.locator('app-plan-today').waitFor();
  await settle(p);
}

/**
 * A Mid-level loop three weeks out at 2 h a day, a streak, and the first coding unit solved today: Today with progress.
 * Seeded on the device and reloaded, as the events would arrive from a sync.
 */
async function seedProgress(p) {
  await p.evaluate(
    (itemIds) => {
      const day = (offset) => {
        const d = new Date(Date.now() + offset * 86_400_000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const at = (offset) => new Date(Date.now() + offset * 86_400_000 - 3_600_000).toISOString();
      let n = 0;
      const event = (offset, body) => ({ id: `today-seed-${++n}`, at: at(offset), ...body });
      const reviews = [-2, -1, 0].flatMap((offset) =>
        itemIds.map((itemId) => event(offset, { type: 'review.graded', itemId, rating: 3, correct: true, durationMs: 9000 })),
      );
      const events = [
        event(-3, { type: 'target.set', target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } }),
        event(-3, {
          type: 'plan.set',
          plan: { interviewDate: day(21), minutesPerDay: 120, rounds: ['coding', 'design', 'behavioral'], level: 'new' },
        }),
        ...reviews,
        event(0, { type: 'code.submitted', problemId: 'longest-consecutive-sequence', language: 'typescript', passed: 12, total: 12 }),
      ];
      localStorage.setItem('CapacitorStorage.grasp.events', JSON.stringify({ events, cursor: null }));
    },
    itemsForTopic('hashing')
      .slice(0, 2)
      .map((item) => item.id),
  );
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('app-plan-today').waitFor();
  await settle(p);
}

/** Saves a plan for an interview in 20 days. */
async function setPlan(p) {
  await p.getByLabel('Interview date').fill(await inDays(p, 20));
  await p.getByRole('button', { name: 'Save plan' }).click();
  await p.getByRole('heading', { name: /^20 days to / }).waitFor();
  await settle(p);
}

/** Answers the whole placement check: every fourth question "I haven't learned this", the rest with the first choice. */
async function takePlacement(p) {
  await p.getByRole('button', { name: /^Start/ }).click();
  for (let n = 1; n <= PATTERN_CATALOG.length; n++) {
    await p.getByText(`${n}/${PATTERN_CATALOG.length}`, { exact: true }).waitFor();
    if (n % 4 === 0) await p.getByRole('button', { name: "I haven't learned this" }).click();
    else await p.locator('g-question-card .choice').first().click();
  }
  await p.getByText('Your starting point', { exact: true }).waitFor();
  await settle(p);
}

/** Answers today's review with the first choice until its summary shows; missed cards come back, so the count varies. */
async function finishReview(p) {
  const summary = p.getByText(/reviews · \d+ min/);
  for (let answered = 0; !(await summary.isVisible()); answered++) {
    if (answered === 40) throw new Error('the review did not end');
    await p.locator('g-question-card .choice').first().click();
    await p.locator('g-question-card .verdict').waitFor();
    await p.getByRole('button', { name: /^(Got it|Continue)/ }).click();
    await summary.or(p.locator('g-question-card .choice:enabled')).first().waitFor();
  }
  await settle(p);
}

/** Answers a practice set with the first choice until its summary shows. */
async function finishPractice(p) {
  const summary = p.getByText(/practice answers · \d+ min/);
  for (let answered = 0; !(await summary.isVisible()); answered++) {
    if (answered === 20) throw new Error('the practice did not end');
    await p.locator('g-question-card .choice').first().click();
    await p.getByRole('button', { name: /^Next/ }).click();
    await summary.or(p.locator('g-question-card .choice:enabled')).first().waitFor();
  }
  await settle(p);
}

/** Learn, visualizers, review and practice, patterns, coding, settings and the app shell's dialogs. */
export function learnStates() {
  const players = [
    'binary-search',
    'lcs',
    'dijkstra',
    'two-sum-hash',
    'subsets-backtracking',
    'linked-list-reversal',
    'kruskal-mst',
    'minimum-xor-sum',
  ].flatMap((id) => [
    { id: `player-${id}`, path: `/coding/visualizers/${id}` },
    {
      id: `player-${id}-predict`,
      path: `/coding/visualizers/${id}`,
      setup: async (p) => ((await toPredict(p)) ? settle(p, 500) : 'no predict'),
    },
    {
      id: `player-${id}-answered`,
      path: `/coding/visualizers/${id}`,
      setup: async (p) => ((await toPredict(p)) ? answerFirst(p, '.predict .choice') : 'no predict'),
    },
  ]);
  return [
    { id: 'today', path: '/today', setup: (p) => p.locator('app-loop-card').waitFor() },
    {
      id: 'today-loop-details',
      path: '/today',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Senior' }).click();
        await p.getByRole('button', { name: 'Pick a date' }).click();
        await p.getByRole('button', { name: /^Details/ }).click();
        await settle(p);
      },
    },
    {
      id: 'today-not-now',
      path: '/today',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Not now' }).click();
        await p.getByRole('heading', { name: 'Assuming a Mid-level loop' }).waitFor();
        await p.locator('app-up-next-card').waitFor();
        await settle(p);
      },
    },
    { id: 'today-plan', path: '/today', setup: buildPlan },
    { id: 'today-progress', path: '/today', setup: seedProgress },
    {
      id: 'today-edit',
      path: '/today',
      setup: async (p) => {
        await seedProgress(p);
        await p.getByRole('button', { name: 'Edit' }).click();
        await p.locator('app-loop-card').waitFor();
        await settle(p);
      },
    },
    {
      id: 'today-pilot',
      path: '/today/plan',
      setup: async (p) => {
        await setPlan(p);
        await goto(p, '/today');
        await p.getByText('Your level?').waitFor();
        await settle(p);
      },
    },
    { id: 'coding-skill-map', path: '/coding' },
    { id: 'coding-visualizers', path: '/coding/visualizers' },
    { id: 'coding-visualizers-trees', path: '/coding/visualizers?structure=trees' },
    {
      id: 'coding-skill-map-placed',
      path: '/coding/placement',
      setup: async (p) => {
        await takePlacement(p);
        await goto(p, '/coding');
      },
    },
    ...players,
    {
      id: 'player-binary-search-intro',
      path: '/coding/visualizers/binary-search',
      setup: async (p) => {
        await p.getByRole('button', { name: 'About this visualizer' }).click();
        await p.getByRole('dialog', { name: 'Binary Search' }).waitFor();
        await settle(p, 500);
      },
    },
    { id: 'player-binary-search-playback', path: '/coding/visualizers/binary-search', setup: openPlayback },
    {
      // The rail (REDESIGN.md 2.6) is shown from 1024px; a focus route collapses it until it is expanded there.
      id: 'rail-expanded-player',
      path: '/coding/visualizers/binary-search',
      setup: async (p) => {
        const expand = p.locator('app-rail').getByRole('button', { name: 'Expand menu' });
        if (!(await expand.isVisible())) return 'no rail';
        await expand.click();
        await settle(p);
      },
    },
    {
      id: 'rail-collapsed-plan',
      path: '/today',
      setup: async (p) => {
        await buildPlan(p);
        await goto(p, '/coding/visualizers/binary-search');
        await p.locator('app-player h1').waitFor();
        await p.keyboard.press('Tab');
        await settle(p);
      },
    },
    {
      id: 'rail-skip-link',
      path: '/today',
      setup: async (p) => {
        await p.locator('app-loop-card').waitFor();
        await p.keyboard.press('Tab');
        return (await p.getByRole('link', { name: 'Skip to content' }).isVisible()) ? undefined : 'no rail';
      },
    },
    {
      // Mid-drag, held on the first checkpoint with its chip showing.
      id: 'player-binary-search-guard',
      path: '/coding/visualizers/binary-search',
      setup: async (p) => {
        await openPlayback(p);
        const thumb = await p.locator('g-transport .drag').boundingBox();
        const tick = await p.locator('g-transport .tick').first().boundingBox();
        await p.mouse.move(thumb.x + 8, thumb.y + thumb.height / 2);
        await p.mouse.down();
        await p.mouse.move(tick.x + tick.width / 2 + 6, thumb.y + thumb.height / 2, { steps: 4 });
        await settle(p, 500);
      },
    },
    {
      // Binary search's default run asks three times; its answers are choices 2, 3 and 1.
      id: 'player-binary-search-ticks',
      path: '/coding/visualizers/binary-search',
      setup: async (p) => {
        for (const choice of [1, 0]) {
          await toPredict(p);
          await p.locator('.predict .choice').nth(choice).click();
          await p.getByRole('button', { name: 'Continue →' }).click();
          await p.locator('.predict').waitFor({ state: 'detached' });
        }
        await toPredict(p);
        await p.locator('.predict .skip').click();
        await openPlayback(p);
        await settle(p, 500);
      },
    },
    { id: 'player-subsets-backtracking-end', path: '/coding/visualizers/subsets-backtracking', setup: toEnd },
    { id: 'player-linked-list-reversal-end', path: '/coding/visualizers/linked-list-reversal', setup: toEnd },
    {
      id: 'player-linked-list-reversal-whole',
      path: `/coding/visualizers/linked-list-reversal?input=${encodeURIComponent(JSON.stringify({ values: [1, 2, 3, 4, 5], left: 1, right: 5 }))}`,
      setup: toEnd,
    },
    { id: 'player-kruskal-mst-end', path: '/coding/visualizers/kruskal-mst', setup: toEnd },
    { id: 'player-minimum-xor-sum-end', path: '/coding/visualizers/minimum-xor-sum', setup: toEnd },
    {
      id: 'player-minimum-xor-sum-four',
      path: `/coding/visualizers/minimum-xor-sum?input=${encodeURIComponent(JSON.stringify({ nums1: [12, 7, 3, 9], nums2: [5, 14, 8, 1] }))}`,
      setup: toEnd,
    },
    {
      id: 'player-kruskal-mst-disconnected',
      path: `/coding/visualizers/kruskal-mst?input=${encodeURIComponent(
        JSON.stringify({
          n: 5,
          edges: [
            [0, 1, 3],
            [1, 2, 1],
            [0, 2, 2],
            [3, 4, 5],
          ],
        }),
      )}`,
      setup: toEnd,
    },
    { id: 'review-question', path: '/today/review' },
    { id: 'review-answered', path: '/today/review', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'review-summary', path: '/today/review', setup: finishReview },
    {
      id: 'review-caught-up',
      path: '/today/settings',
      setup: async (p) => {
        await p.getByRole('radiogroup', { name: 'New cards per day' }).getByRole('radio', { name: '0', exact: true }).click();
        await p.goto(new URL('/today/review', p.url()).href);
        await p.getByText('All caught up', { exact: true }).waitFor();
        await settle(p);
      },
    },
    { id: 'practice-summary', path: '/coding/patterns/binary-search/drill', setup: finishPractice },
    { id: 'practice-question', path: '/coding/patterns/binary-search/drill' },
    { id: 'practice-answered', path: '/coding/patterns/binary-search/drill', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'pattern-binary-search', path: '/coding/patterns/binary-search' },
    { id: 'pattern-linked-list-reversal', path: '/coding/patterns/linked-list-reversal' },
    { id: 'pattern-minimum-spanning-tree', path: '/coding/patterns/minimum-spanning-tree' },
    { id: 'pattern-bitmask-dp', path: '/coding/patterns/bitmask-dp' },
    { id: 'lesson-binary-search', path: '/coding/patterns/binary-search' },
    {
      id: 'lesson-dp-2d-revealed',
      path: '/coding/patterns/dp-2d',
      setup: async (p) => {
        const example = p.locator('app-worked-example').first();
        await example.getByRole('button', { name: /key move/ }).click();
        await example.getByRole('button', { name: 'Walk through it' }).click();
        await example.getByRole('button', { name: 'Show all' }).click();
        await p.locator('details.follow-up summary').first().click();
      },
    },
    { id: 'settings', path: '/today/settings' },
    {
      id: 'settings-scrolled',
      path: '/today/settings',
      setup: async (p) => {
        await p.getByRole('heading', { name: 'Your data' }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'plan-empty', path: '/today/plan' },
    { id: 'plan-set', path: '/today/plan', setup: setPlan },
    {
      id: 'plan-clear-confirm',
      path: '/today/plan',
      setup: async (p) => {
        await setPlan(p);
        await p.getByRole('button', { name: 'Clear plan' }).click();
        await p.locator('ion-alert').getByRole('button', { name: 'Clear plan' }).waitFor();
        await settle(p, 600);
      },
    },
    {
      id: 'plan-cleared-undo',
      path: '/today/plan',
      setup: async (p) => {
        await setPlan(p);
        await p.getByRole('button', { name: 'Clear plan' }).click();
        await p.locator('ion-alert').getByRole('button', { name: 'Clear plan' }).click();
        await p.getByRole('button', { name: 'Undo' }).waitFor();
        await settle(p, 600);
      },
    },
    { id: 'coding-problems', path: '/coding/problems' },
    { id: 'coding-problems-graphs', path: '/coding/problems?track=graphs' },
    {
      id: 'coding-problems-filters',
      path: '/coding/problems?track=graphs&difficulty=hard',
      setup: async (p) => {
        // A phone opens the sheet; wider screens show the same controls beside the list.
        const open = p.getByRole('button', { name: /^Filters/ });
        if (await open.isVisible()) await open.click();
        await settle(p, 500);
      },
    },
    {
      id: 'coding-problems-mixed',
      path: '/coding/problems',
      setup: async (p) => {
        await p.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Mixed' }).click();
        await settle(p, 400);
      },
    },
    { id: 'coding-problems-empty', path: '/coding/problems?q=zzzz' },
    { id: 'code-two-sum', path: '/coding/problems/two-sum' },
    {
      id: 'code-python-trace-note',
      path: '/coding/problems/two-sum',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Trace', exact: true }).click();
        await p.getByText('Trace steps through JavaScript or TypeScript code.').waitFor();
        await settle(p, 400);
      },
    },
    { id: 'code-reverse-linked-list-ii', path: '/coding/problems/reverse-linked-list-ii' },
    { id: 'code-critical-mst-edges', path: '/coding/problems/critical-mst-edges' },
    { id: 'code-maximum-students', path: '/coding/problems/maximum-students' },
    {
      id: 'code-two-sum-run',
      path: '/coding/problems/two-sum',
      setup: async (p) => {
        await p.getByRole('button', { name: /Run/ }).first().click();
        await p.waitForSelector('.outcome', { timeout: 30_000 });
        await settle(p, 400);
      },
    },
    {
      id: 'code-two-sum-accepted',
      path: '/coding/problems/two-sum',
      setup: async (p) => {
        await p.getByRole('radio', { name: 'JavaScript' }).click();
        await p.getByRole('textbox', { name: 'Two Sum solution' }).click();
        // The editor selects all with the page's own platform key, which on the ipad profile is not the host's.
        const apple = await p.evaluate(() => /Mac|iPhone|iPad/.test(`${navigator.platform} ${navigator.userAgent}`));
        await p.keyboard.press(`${apple ? 'Meta' : 'Control'}+a`);
        await p.keyboard.insertText(TWO_SUM);
        await p.getByRole('button', { name: 'Submit' }).click();
        const verdict = p.getByText('Accepted.');
        await verdict.waitFor({ timeout: 30_000 });
        // The editor keeps the horizontal scroll of the long pasted line; delete this with the LOOP.md follow-up's app fix.
        await p.locator('.cm-scroller').evaluate((scroller) => (scroller.scrollLeft = 0));
        await verdict.scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    { id: 'diagnostic-intro', path: '/coding/placement' },
    {
      id: 'diagnostic-question',
      path: '/coding/placement',
      setup: async (p) => {
        await p.getByRole('button', { name: /^Start/ }).click();
        await p.getByText(`1/${PATTERN_CATALOG.length}`, { exact: true }).waitFor();
        await settle(p, 400);
      },
    },
    { id: 'diagnostic-results', path: '/coding/placement', setup: takePlacement },
    {
      id: 'feedback-dialog',
      path: '/today',
      setup: async (p) => {
        await p.getByRole('button', { name: 'More options' }).click();
        await p.locator('ion-popover').getByRole('button', { name: 'Send feedback' }).click();
        await p.waitForSelector('ion-modal app-feedback-sheet');
        await settle(p, 600);
      },
    },
    {
      id: 'today-more-menu',
      path: '/today',
      setup: async (p) => {
        await p.getByRole('button', { name: 'More options' }).click();
        await p.locator('ion-popover app-today-menu').waitFor();
        await settle(p, 600);
      },
    },
    {
      id: 'pilot-welcome',
      path: '/today',
      fresh: true,
      setup: async (p) => {
        await p.waitForSelector('ion-modal app-pilot-notice');
        await settle(p, 600);
      },
    },
  ];
}
