import { answerFirst, settle, toEnd, toPredict } from '../lib.mjs';

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
