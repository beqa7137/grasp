import { PATTERN_CATALOG } from '@grasp/engine';
import { answerFirst, settle, toEnd, toPredict } from '../lib.mjs';

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

/** The summary and the saved plan keep the scroll of the card or form they replace; delete this with the LOOP.md follow-up's app fix. */
const toTop = (locator) => locator.evaluate((el) => el.closest('ion-content').scrollToTop(0));

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
    { id: 'player-linked-list-reversal-end', path: '/visualize/linked-list-reversal', setup: toEnd },
    {
      id: 'player-linked-list-reversal-whole',
      path: `/visualize/linked-list-reversal?input=${encodeURIComponent(JSON.stringify({ values: [1, 2, 3, 4, 5], left: 1, right: 5 }))}`,
      setup: toEnd,
    },
    { id: 'player-kruskal-mst-end', path: '/visualize/kruskal-mst', setup: toEnd },
    { id: 'player-minimum-xor-sum-end', path: '/visualize/minimum-xor-sum', setup: toEnd },
    {
      id: 'player-minimum-xor-sum-four',
      path: `/visualize/minimum-xor-sum?input=${encodeURIComponent(JSON.stringify({ nums1: [12, 7, 3, 9], nums2: [5, 14, 8, 1] }))}`,
      setup: toEnd,
    },
    {
      id: 'player-kruskal-mst-disconnected',
      path: `/visualize/kruskal-mst?input=${encodeURIComponent(
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
    { id: 'review-question', path: '/drill' },
    { id: 'review-answered', path: '/drill', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'review-summary', path: '/drill', setup: finishReview },
    { id: 'practice-question', path: '/drill?pattern=binary-search' },
    { id: 'practice-answered', path: '/drill?pattern=binary-search', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'pattern-binary-search', path: '/learn/pattern/binary-search' },
    { id: 'pattern-linked-list-reversal', path: '/learn/pattern/linked-list-reversal' },
    { id: 'pattern-minimum-spanning-tree', path: '/learn/pattern/minimum-spanning-tree' },
    { id: 'pattern-bitmask-dp', path: '/learn/pattern/bitmask-dp' },
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
    { id: 'settings', path: '/settings' },
    { id: 'plan-empty', path: '/plan' },
    {
      id: 'plan-set',
      path: '/plan',
      setup: async (p) => {
        await p.getByLabel('Interview date').fill(await inDays(p, 20));
        await p.getByRole('button', { name: 'Save plan' }).click();
        const heading = p.getByRole('heading', { name: 'Interview in 20 days' });
        await heading.waitFor();
        await toTop(heading);
        await settle(p);
      },
    },
    { id: 'code-list', path: '/code' },
    { id: 'code-two-sum', path: '/code/two-sum' },
    { id: 'code-reverse-linked-list-ii', path: '/code/reverse-linked-list-ii' },
    { id: 'code-critical-mst-edges', path: '/code/critical-mst-edges' },
    { id: 'code-maximum-students', path: '/code/maximum-students' },
    {
      id: 'code-two-sum-run',
      path: '/code/two-sum',
      setup: async (p) => {
        await p.getByRole('button', { name: /Run/ }).first().click();
        await p.waitForSelector('.outcome', { timeout: 30_000 });
        await settle(p, 400);
      },
    },
    {
      id: 'code-two-sum-accepted',
      path: '/code/two-sum',
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
    { id: 'diagnostic-intro', path: '/diagnostic' },
    {
      id: 'diagnostic-question',
      path: '/diagnostic',
      setup: async (p) => {
        await p.getByRole('button', { name: /^Start/ }).click();
        await p.getByText(`1/${PATTERN_CATALOG.length}`, { exact: true }).waitFor();
        await settle(p, 400);
      },
    },
    { id: 'diagnostic-results', path: '/diagnostic', setup: takePlacement },
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
