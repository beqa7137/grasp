import { PATTERN_CATALOG } from '@grasp/engine';
import { answerFirst, openPlayback, settle, toEnd, toPredict } from '../lib.mjs';

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

/** The review summary keeps the scroll of the card it replaces; delete this with the LOOP.md follow-up's app fix. */
const toTop = (locator) => locator.evaluate((el) => el.closest('ion-content').scrollToTop(0));

/** Saves a plan for an interview in 20 days. */
async function setPlan(p) {
  await p.getByLabel('Interview date').fill(await inDays(p, 20));
  await p.getByRole('button', { name: 'Save plan' }).click();
  await p.getByRole('heading', { name: 'Interview in 20 days' }).waitFor();
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
  await toTop(summary);
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
    { id: 'today', path: '/today' },
    { id: 'coding-skill-map', path: '/coding' },
    { id: 'coding-visualizers', path: '/coding/visualizers' },
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
        await p.locator('ion-popover app-learn-menu').waitFor();
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
