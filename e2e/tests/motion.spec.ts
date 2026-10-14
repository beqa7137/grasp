import type { Page } from '@playwright/test';
import { expect, openPlayback, test } from './fixtures';

declare global {
  interface Window {
    Ionic?: { config?: { get: (key: string) => unknown } };
    animationsStarted?: number;
  }
}

/**
 * Counts the Web Animations started on the page, which is how Ionic runs its page transitions. Counting the calls, rather
 * than sampling `getAnimations()` by frame, also sees a transition WebKit draws in a frame or two under load; CSS
 * animations and transitions are the global rule's to shorten and never count.
 */
function countAnimations() {
  const animate = Element.prototype.animate;
  window.animationsStarted = 0;
  Element.prototype.animate = function (this: Element, ...args: Parameters<typeof animate>) {
    window.animationsStarted!++;
    return animate.apply(this, args);
  };
}

test.beforeEach(({ page }) => page.addInitScript(countAnimations));

async function watchTransitions(page: Page) {
  await page.evaluate(() => (window.animationsStarted = 0));
}

const transitionsSeen = (page: Page) => page.evaluate(() => window.animationsStarted!);

const ionicAnimates = (page: Page) => page.evaluate(() => window.Ionic?.config?.get('animated'));

const motionRadio = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Motion' }).getByRole('radio', { name });

async function chooseMotion(page: Page, name: string) {
  await motionRadio(page, name).click();
  await expect(motionRadio(page, name)).toHaveAttribute('aria-checked', 'true');
}

/** Pushes a visualizer from the Visualize list and counts the transition's animations. */
async function openVisualizers(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Coding' }).click();
  await page.locator('app-hub:not(.ion-page-hidden)').getByRole('link', { name: 'Visualizers' }).click();
}

async function pushVisualizer(page: Page): Promise<number> {
  await watchTransitions(page);
  await page.locator('app-visualizers a[href="/coding/visualizers/binary-search"]').first().click();
  await expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  // The heading shows and the list leaves before Ionic starts the animation, which waits for the entering page to be
  // ready; Ionic hides the hub only once the transition has finished, animated or not.
  await expect(page.locator('app-hub:not(.ion-page-hidden)')).toHaveCount(0);
  return transitionsSeen(page);
}

test.describe('the Motion setting', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('Reduced turns off page transitions after a restart, and Full brings them back', async ({ page }) => {
    await page.goto('/today/settings');
    expect(await ionicAnimates(page)).toBe(true);
    await chooseMotion(page, 'Reduced');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await openVisualizers(page);
    expect(await pushVisualizer(page), 'page transitions follow only after a restart').toBeGreaterThan(0);

    await page.goto('/coding/visualizers');
    expect(await ionicAnimates(page)).toBe(false);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    expect(await pushVisualizer(page)).toBe(0);

    await page.goto('/today/settings');
    await expect(motionRadio(page, 'Reduced')).toHaveAttribute('aria-checked', 'true');
    await chooseMotion(page, 'Full');
    await page.goto('/coding/visualizers');
    expect(await ionicAnimates(page)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    expect(await pushVisualizer(page)).toBeGreaterThan(0);
  });

  test.describe('on a device that reduces motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('System follows the device, and Full overrides it', async ({ page }) => {
      await page.goto('/today/settings');
      await expect(motionRadio(page, 'System')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('html')).not.toHaveAttribute('data-motion');
      expect(await ionicAnimates(page)).toBe(false);
      await openVisualizers(page);
      expect(await pushVisualizer(page)).toBe(0);

      await page.goto('/today/settings');
      await chooseMotion(page, 'Full');
      await page.goto('/coding/visualizers');
      expect(await ionicAnimates(page)).toBe(true);
      expect(await pushVisualizer(page)).toBeGreaterThan(0);
    });
  });

  test('smooth scrolling in the player follows Motion and the test mode, and Instant turns it off on the stage', async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    const player = page.locator('app-player');
    const scrolling = () =>
      player.evaluate((p) => ['g-array-view', 'g-code-panel'].map((tag) => getComputedStyle(p.querySelector(tag)!).scrollBehavior));
    await expect.poll(scrolling).toEqual(['smooth', 'smooth']);
    for (const mode of ['reduced', 'off']) {
      await page.locator('html').evaluate((html, value) => html.setAttribute('data-motion', value), mode);
      await expect.poll(scrolling, mode).toEqual(['auto', 'auto']);
    }
    await page.locator('html').evaluate((html) => html.removeAttribute('data-motion'));
    await openPlayback(page);
    await player.getByRole('radio', { name: 'Instant' }).click();
    await expect.poll(scrolling, 'Instant stills the stage only').toEqual(['auto', 'smooth']);
  });

  test("a case study leaves its page scroller instant, so Ionic's own scroll animations never lag", async ({ page }) => {
    await page.goto('/design/cases/url-shortener');
    const scrolling = () =>
      page.locator('app-case-study ion-content').evaluate((c) => {
        const scroller = c.shadowRoot?.querySelector('[part~="scroll"]');
        return scroller && getComputedStyle(scroller).scrollBehavior;
      });
    await expect.poll(scrolling).toBe('auto');
  });

  test.describe('on a device that reduces motion, scrolling', () => {
    test.use({ reducedMotion: 'reduce' });

    test('is instant under System and smooth under Full', async ({ page }) => {
      await page.goto('/coding/visualizers/binary-search');
      const view = page.locator('app-player g-array-view').first();
      await expect(view).toHaveCSS('scroll-behavior', 'auto');
      await page.locator('html').evaluate((html) => html.setAttribute('data-motion', 'full'));
      await expect(view).toHaveCSS('scroll-behavior', 'smooth');
    });
  });

  test('?motion=off is the test mode, and the URL loses the parameter', async ({ page }) => {
    await page.goto('/coding/visualizers?motion=off');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    await expect(page).toHaveURL(/\/coding\/visualizers$/);
    expect(await ionicAnimates(page)).toBe(false);
    expect(await pushVisualizer(page)).toBe(0);
  });
});

test('the test mode the fixtures set runs no page transition, whatever Motion says', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.motion', 'full'));
  await page.goto('/coding/visualizers');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  expect(await pushVisualizer(page)).toBe(0);
  expect(await ionicAnimates(page)).toBe(false);
});
