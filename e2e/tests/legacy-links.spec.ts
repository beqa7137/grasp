import type { Page } from '@playwright/test';
import {
  getAlgorithmSummary,
  getCaseSummary,
  getCompetencySummary,
  getPatternSummary,
  getScenarioSummary,
  getSdTopic,
} from '@grasp/engine';
import { expect, test } from './fixtures';

const input = encodeURIComponent(JSON.stringify({ nums: [1, 3, 5, 7, 9], target: 7 }));

/** Its line break renders no space. */
const TODAY = /^Build intuition,\s?not a problem count\.$/;

/** Every URL shape from before REDESIGN.md R5, where it lands, that page's h1 and the tab lit there. */
const LINKS: { old: string; url: string; h1: string | RegExp; tab: string }[] = [
  { old: '/', url: '/today', h1: TODAY, tab: 'today' },
  { old: '/learn', url: '/today', h1: TODAY, tab: 'today' },
  { old: '/learn/pattern/hashing', url: '/coding/patterns/hashing', h1: getPatternSummary('hashing')!.name, tab: 'coding' },
  { old: '/learn/design/sd-latency', url: '/design/topics/sd-latency', h1: getSdTopic('sd-latency')!.name, tab: 'design' },
  { old: '/visualize', url: '/coding/visualizers', h1: 'Watch the algorithm think.', tab: 'coding' },
  {
    old: '/visualize/binary-search',
    url: '/coding/visualizers/binary-search',
    h1: getAlgorithmSummary('binary-search')!.title,
    tab: 'coding',
  },
  {
    old: `/visualize/binary-search?input=${input}`,
    url: `/coding/visualizers/binary-search?input=${input}`,
    h1: getAlgorithmSummary('binary-search')!.title,
    tab: 'coding',
  },
  { old: '/design', url: '/design', h1: 'Learn it hands-on, then build it.', tab: 'design' },
  { old: '/design/case/url-shortener', url: '/design/cases/url-shortener', h1: getCaseSummary('url-shortener')!.title, tab: 'design' },
  { old: '/design/free-build', url: '/design/lab', h1: 'Free Build', tab: 'design' },
  { old: '/design/free-build?case=url-shortener', url: '/design/cases/url-shortener/build', h1: 'URL Shortener build', tab: 'design' },
  {
    old: '/design/first-scale-up',
    url: '/design/missions/first-scale-up',
    h1: getScenarioSummary('first-scale-up')!.title,
    tab: 'design',
  },
  {
    old: '/design/ledger-month-end?revisit=1',
    url: '/design/missions/ledger-month-end?revisit=1',
    h1: `${getScenarioSummary('ledger-month-end')!.title} · Revisit 1`,
    tab: 'design',
  },
  { old: '/drill', url: '/today/review', h1: "Today's review", tab: 'today' },
  { old: '/drill?pattern=hashing', url: '/coding/patterns/hashing/drill', h1: getPatternSummary('hashing')!.name, tab: 'coding' },
  { old: '/drill?pattern=sd-latency', url: '/design/topics/sd-latency/drill', h1: getSdTopic('sd-latency')!.name, tab: 'design' },
  { old: '/diagnostic', url: '/coding/placement', h1: 'Find your starting point', tab: 'coding' },
  { old: '/interview', url: '/mock', h1: 'Say it out loud.', tab: 'mock' },
  { old: '/interview/loop', url: '/mock/loop', h1: /loop/i, tab: 'mock' },
  { old: '/behavioral', url: '/behavioral', h1: 'Behavioral interviews', tab: 'behavioral' },
  { old: '/behavioral/conflict', url: '/behavioral/conflict', h1: getCompetencySummary('conflict')!.name, tab: 'behavioral' },
  {
    old: '/behavioral/question/conflict-1',
    url: '/behavioral/question/conflict-1',
    h1: /^Tell me about a time you disagreed/,
    tab: 'behavioral',
  },
  { old: '/behavioral/stories', url: '/behavioral/stories', h1: 'Your story bank', tab: 'behavioral' },
  { old: '/behavioral/rehearse', url: '/behavioral/rehearse', h1: 'Nothing to rehearse now', tab: 'behavioral' },
  {
    old: '/behavioral/mock?question=conflict-1',
    url: '/behavioral/drill?question=conflict-1',
    h1: /^Tell me about a time you disagreed/,
    tab: 'behavioral',
  },
  { old: '/code', url: '/coding/problems', h1: 'Write it. Run it. Watch it.', tab: 'coding' },
  { old: '/code/two-sum', url: '/coding/problems/two-sum', h1: 'Two Sum', tab: 'coding' },
  { old: '/plan', url: '/today/plan', h1: 'Plan to your interview', tab: 'today' },
  { old: '/settings', url: '/today/settings', h1: 'Settings', tab: 'today' },
  { old: '/no-such-page', url: '/today', h1: TODAY, tab: 'today' },
];

const shownH1 = (page: Page) => page.locator('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden) h1').first();
/** Focus routes hide the tab bar under 1024px, but its selected tab still says where the page belongs. */
const litTab = (page: Page) => page.locator('ion-tab-button.tab-selected');

async function expectLanded(page: Page, url: string, h1: string | RegExp, tab: string) {
  await expect(page).toHaveURL((actual) => decodeURIComponent(actual.pathname + actual.search) === decodeURIComponent(url));
  await expect(shownH1(page)).toHaveText(h1);
  await expect(litTab(page)).toHaveCount(1);
  await expect(litTab(page)).toHaveAttribute('tab', tab);
}

test('every old URL lands on its new place, with its heading and its tab lit', { tag: '@nav' }, async ({ page }) => {
  for (const { old, url, h1, tab } of LINKS) {
    await test.step(old, async () => {
      await page.goto(old);
      await expectLanded(page, url, h1, tab);
    });
  }
});

test('old interview and story links still open the session and the story', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/mock');
  await page.getByRole('button', { name: /Days Until Warmer/ }).click();
  await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
  const session = new URL(page.url()).pathname.split('/')[2];
  await page.goto(`/interview/${session}`);
  await expect(page).toHaveURL(new RegExp(`/mock/${session}$`));
  await expect(page.getByText(/daily temperatures/)).toBeVisible();
  await expect(litTab(page)).toHaveAttribute('tab', 'mock');

  await page.goto('/behavioral/stories');
  await page.getByRole('button', { name: 'New story' }).click();
  await expect(page).toHaveURL(/\/behavioral\/stories\/[\w-]+$/);
  const story = new URL(page.url()).pathname;
  await page.goto(story);
  await expect(page).toHaveURL((actual) => actual.pathname === story);
  await expect(page.getByLabel('Title')).toBeVisible();
  await expect(litTab(page)).toHaveAttribute('tab', 'behavioral');
});
