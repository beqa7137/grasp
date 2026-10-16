import type { Page } from '@playwright/test';
import { CODING_CATALOG } from '@grasp/engine';
import { TODAY_HEADING as TODAY, expect, section, shownPage, startMockRound, test } from './fixtures';

// The rail shows from 1024px (REDESIGN.md 2.6): 1024×768 is a small laptop and an iPad Mini held sideways.
const W1024 = { width: 1024, height: 768 };
const rail = (page: Page) => page.locator('app-rail');
const main = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const heading = (page: Page) => shownPage(page).locator('h1').first();
/** Clicks the shown page's back button once a transition has left one page shown. */
async function back(page: Page) {
  await expect(shownPage(page)).toHaveCount(1);
  await shownPage(page).locator('app-back ion-back-button').click();
}
const containerSize = (width: number) => (width < 640 ? 'narrow' : width < 900 ? 'medium' : 'wide');

const PAGES: { url: string; page: string | null; section: string | null }[] = [
  { url: '/today', page: 'Today', section: null },
  { url: '/coding', page: 'Skill map', section: 'Coding' },
  { url: '/coding/problems', page: 'Problems', section: 'Coding' },
  { url: '/coding/visualizers', page: 'Visualizers', section: 'Coding' },
  { url: '/design', page: 'Topics', section: 'Design' },
  { url: '/design/missions', page: 'Missions', section: 'Design' },
  { url: '/design/cases', page: 'Cases', section: 'Design' },
  { url: '/behavioral', page: 'Competencies', section: 'Behavioral' },
  { url: '/behavioral/questions', page: 'Questions', section: 'Behavioral' },
  { url: '/behavioral/stories', page: 'Stories', section: 'Behavioral' },
  { url: '/mock', page: 'Mock', section: null },
  { url: '/today/plan', page: 'Study plan', section: null },
  { url: '/today/settings', page: 'Settings', section: null },
  { url: '/today/review', page: null, section: 'Today' },
  { url: '/design/cases/url-shortener', page: null, section: 'Design' },
  { url: '/behavioral/guide', page: null, section: 'Behavioral' },
  { url: '/coding/visualizers/binary-search', page: null, section: 'Coding' },
];

test('one Main navigation and at most one current page, on a rail that never scrolls at 768px tall', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  for (const expected of PAGES) {
    await test.step(expected.url, async () => {
      await page.goto(expected.url);
      await expect(shownPage(page)).toHaveCount(1);
      await expect(main(page)).toHaveCount(1);
      await expect(rail(page)).toBeVisible();
      await expect(page.locator('ion-tab-bar')).toBeHidden();
      const current = main(page).locator('[aria-current="page"]');
      if (expected.page) {
        await expect(current).toHaveCount(1);
        await expect(current.locator('.label')).toHaveText(expected.page);
      } else await expect(current).toHaveCount(0);
      const inside = main(page).locator('[aria-current="true"]');
      if (expected.section) await expect(inside.locator('.label')).toHaveText(expected.section);
      else await expect(inside).toHaveCount(0);
      expect(await rail(page).evaluate((r) => r.scrollHeight - r.clientHeight)).toBeLessThanOrEqual(0);
      await page.waitForLoadState('networkidle');
    });
  }
});

test('sub-items show only under the active section, with the solved count beside Problems', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/design/missions');
  await expect(rail(page).locator('.sub .label')).toHaveText(['Topics', 'Missions', 'Cases']);
  await section(page, 'Coding').click();
  await expect(rail(page).locator('.sub .label')).toHaveText(['Skill map', 'Problems', 'Visualizers']);
  await expect(section(page, 'Problems')).toHaveAccessibleName(`Problems 0/${CODING_CATALOG.length}`);
  await section(page, 'Today').click();
  await expect(rail(page).locator('.sub')).toHaveCount(0);
  // No plan yet, so Study plan has no days left beside it.
  await expect(section(page, 'Study plan')).toHaveAccessibleName('Study plan');
});

test('utility items never stack two utility pages on the Today stack', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/today');
  await section(page, 'Settings').click();
  await expect(page).toHaveURL(/\/today\/settings$/);
  await expect(heading(page)).toHaveText('Settings');
  await section(page, 'Study plan').click();
  await expect(page).toHaveURL(/\/today\/plan$/);
  await expect(heading(page)).toHaveText('Plan to your interview');
  await back(page);
  await expect(page).toHaveURL(/\/today$/);
  await expect(heading(page)).toHaveText(TODAY);

  // From another section, Today's stack is restored under the page, and a utility on top of it is replaced.
  await section(page, 'Settings').click();
  await expect(page).toHaveURL(/\/today\/settings$/);
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await section(page, 'Study plan').click();
  await expect(page).toHaveURL(/\/today\/plan$/);
  await expect(section(page, 'Study plan')).toHaveAttribute('aria-current', 'page');
  await back(page);
  await expect(page).toHaveURL(/\/today$/);
  await expect(heading(page)).toHaveText(TODAY);
  await expect(page.locator('app-settings, app-plan')).toHaveCount(0);
});

test('a page opened from a utility goes with it when another utility opens', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/today');
  await page.getByRole('button', { name: 'Mid-level' }).click();
  await page.getByRole('button', { name: '3 weeks' }).click();
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await expect(page.locator('app-plan-today')).toBeVisible();
  await section(page, 'Study plan').click();
  await page.locator('app-plan').getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page).toHaveURL(/\/today\/review$/);
  await section(page, 'Settings').click();
  await expect(heading(page)).toHaveText('Settings');
  await back(page);
  await expect(page).toHaveURL(/\/today$/);
  await expect(heading(page)).toHaveText(TODAY);
  await expect(page.locator('app-settings, app-plan, app-drill')).toHaveCount(0);
});

test('two utilities opened in the same moment from another section keep Today under the second', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/today');
  await expect(heading(page)).toHaveText(TODAY);
  // Marks Today's page, so a new one built after it was lost would show.
  await page.locator('app-today').evaluate((today) => today.setAttribute('data-kept', ''));
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await rail(page).evaluate((r) => {
    for (const href of ['/today/settings', '/today/plan']) r.querySelector<HTMLElement>(`a[href="${href}"]`)!.click();
  });
  await expect(page).toHaveURL(/\/today\/plan$/);
  await expect(heading(page)).toHaveText('Plan to your interview');
  await back(page);
  await expect(page).toHaveURL(/\/today$/);
  await expect(heading(page)).toHaveText(TODAY);
  await expect(page.locator('app-settings, app-plan')).toHaveCount(0);
  await expect(page.locator('app-today')).toHaveCount(1);
  await expect(page.locator('app-today[data-kept]')).toHaveCount(1);
});

/** Records whether Today's page is ever shown from now on, as a step between pages would show it. */
const watchToday = (page: Page) =>
  page.evaluate(() => {
    const today = document.querySelector('app-today')!;
    const w = window as unknown as { todayShown: boolean };
    w.todayShown = false;
    // Only a change from hidden to shown counts: Ionic's end of the tab transition touches Today's classes while it stays hidden.
    let hidden = today.classList.contains('ion-page-hidden');
    new MutationObserver(() => {
      const now = today.classList.contains('ion-page-hidden');
      if (hidden && !now) w.todayShown = true;
      hidden = now;
    }).observe(today, { attributes: true, attributeFilter: ['class'] });
  });
const todayShown = (page: Page) => page.evaluate(() => (window as unknown as { todayShown: boolean }).todayShown);

test(
  'a utility opens in one navigation: Today never shows on the way, and browser back skips a replaced utility',
  { tag: '@nav' },
  async ({ page }) => {
    await page.setViewportSize(W1024);
    await page.goto('/today');
    await expect(heading(page)).toHaveText(TODAY);
    await section(page, 'Coding').click();
    await expect(page).toHaveURL(/\/coding$/);
    await expect(page.locator('app-today')).toHaveClass(/ion-page-hidden/);
    await watchToday(page);
    await section(page, 'Settings').click();
    await expect(heading(page)).toHaveText('Settings');
    await section(page, 'Study plan').click();
    await expect(page).toHaveURL(/\/today\/plan$/);
    await expect(heading(page)).toHaveText('Plan to your interview');
    expect(await todayShown(page)).toBe(false);

    // Study plan replaced Settings in the history as on the stack, so back returns to Coding.
    await page.goBack();
    await expect(page).toHaveURL(/\/coding$/);
    await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');

    // Today reopens at the page it last showed, with Today itself under it.
    await section(page, 'Today').click();
    await expect(page).toHaveURL(/\/today\/plan$/);
    await back(page);
    await expect(heading(page)).toHaveText(TODAY);
    await section(page, 'Settings').click();
    await expect(heading(page)).toHaveText('Settings');
    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
    await expect(heading(page)).toHaveText(TODAY);
  },
);

test('selecting the active section returns to its root, and a sub-item pops to its hub', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/design/cases');
  await page.locator('app-case-library a[href="/design/cases/url-shortener"]').click();
  await expect(heading(page)).toHaveText('URL Shortener');
  await section(page, 'Design').click();
  await expect(page).toHaveURL(/\/design$/);
  await expect(heading(page)).toHaveText('System design');

  await page.locator('app-design-shelves a[href="/design/topics/sd-latency"]').click();
  await expect(page).toHaveURL(/\/design\/topics\/sd-latency$/);
  await section(page, 'Missions').click();
  await expect(page).toHaveURL(/\/design\/missions$/);
  await expect(page.locator('app-hub')).toHaveCount(1);
  await expect(shownPage(page).locator('app-design-lesson')).toHaveCount(0);
  await section(page, 'Cases').click();
  await expect(page).toHaveURL(/\/design\/cases$/);
  await expect(heading(page)).toHaveText('Cases');

  // On a hub segment the active section goes to the hub's root too, from the rail and from the tab bar.
  await section(page, 'Missions').click();
  await expect(page).toHaveURL(/\/design\/missions$/);
  await section(page, 'Design').click();
  await expect(page).toHaveURL(/\/design$/);
  await expect(heading(page)).toHaveText('System design');
  await page.setViewportSize({ width: 800, height: 768 });
  await page.waitForLoadState('networkidle');
  await page.goto('/coding/problems');
  await expect(heading(page)).toHaveText('Problems');
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
  await page.setViewportSize(W1024);

  // A focus route shows the rail as icons; its section item still takes the learner back to the hub.
  await page.waitForLoadState('networkidle');
  await page.goto('/coding/problems');
  await page.locator('app-problem-library a[href="/coding/problems/two-sum"]').click();
  await expect(page.locator('app-code-workspace h1')).toHaveText('Two Sum');
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
});

test(
  'container widths: medium beside the expanded rail at 1024px, wide on a focus route',
  { tag: ['@nav', '@player'] },
  async ({ page }) => {
    await page.setViewportSize(W1024);
    await page.goto('/coding/problems');
    const library = page.locator('app-problem-library .library');
    expect(containerSize(await library.evaluate((l) => l.clientWidth))).toBe('medium');
    // The library's filters sit beside the list from container medium.
    await expect(page.locator('app-problem-library .side')).toBeVisible();

    await page.waitForLoadState('networkidle');
    await page.goto('/coding/visualizers/binary-search');
    await expect(page.locator('app-player h1')).toHaveText('Binary Search');
    expect(await rail(page).evaluate((r) => r.getBoundingClientRect().width)).toBe(64);
    expect(containerSize(await page.locator('app-player .player').evaluate((p) => p.clientWidth))).toBe('wide');

    // Under 1024px the tab bar is back, and the page takes the whole width.
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.waitForLoadState('networkidle');
    await page.goto('/today');
    await expect(rail(page)).toBeHidden();
    await expect(page.getByRole('tab', { name: /^Today/ })).toBeVisible();
    expect(await shownPage(page).evaluate((p) => p.getBoundingClientRect().width)).toBe(1023);
  },
);

test(
  'a focus route collapses the rail, and expanding it there is remembered on this device',
  { tag: ['@nav', '@player'] },
  async ({ page }) => {
    await page.setViewportSize(W1024);
    await page.goto('/today');
    await expect(heading(page)).toHaveText(TODAY);
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).getByRole('button', { name: /menu$/ })).toHaveCount(0);

    // Leaving a page while its lazy chunks still load makes WebKit report a failed module import.
    await page.waitForLoadState('networkidle');
    await page.goto('/coding/visualizers/binary-search');
    await expect(page.locator('app-player h1')).toHaveText('Binary Search');
    const width = () => rail(page).evaluate((r) => r.getBoundingClientRect().width);
    expect(await width()).toBe(64);
    await rail(page).getByRole('button', { name: 'Expand menu' }).click();
    await expect.poll(width).toBe(232);
    await expect(rail(page).locator('.sub .label')).toHaveText(['Skill map', 'Problems', 'Visualizers']);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.locator('app-player h1')).toHaveText('Binary Search');
    expect(await width()).toBe(232);

    await rail(page).getByRole('button', { name: 'Collapse menu' }).click();
    await expect.poll(width).toBe(64);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.locator('app-player h1')).toHaveText('Binary Search');
    expect(await width()).toBe(64);
    // Elsewhere the rail stays expanded.
    await section(page, 'Today').click();
    await expect.poll(width).toBe(232);
  },
);

test('the Skip link comes first and moves focus to the page', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/today');
  await expect(heading(page)).toHaveText(TODAY);
  // The rail is its own chunk, which can arrive after the page.
  await expect(rail(page)).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toBeFocused();
  await expect(page).toHaveURL(/\/today$/);

  // A page without a heading gives its main content focus.
  await page.waitForLoadState('networkidle');
  await startMockRound(page, 'Coding', 'Days Until Warmer');
  await expect(shownPage(page).locator('h1')).toHaveCount(0);
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(shownPage(page).locator('ion-content')).toBeFocused();
});

test('Send feedback opens the feedback dialog from the rail', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize(W1024);
  await page.goto('/coding');
  await rail(page).getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
});
