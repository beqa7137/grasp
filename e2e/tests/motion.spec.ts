import { getAlgorithm, pickCheckpoints } from '@grasp/engine';
import type { Page } from '@playwright/test';
import { expect, openPlayback, section, stepToCheckpoint, test } from './fixtures';

// These specs answer checkpoints from the list; picks.spec.ts covers answering on the picture.
test.use({ checkpoints: 'list' });

declare global {
  interface Window {
    Ionic?: { config?: { get: (key: string) => unknown } };
    animationsStarted?: number;
    /** What each script animation on the stage moved: its element's classes and text. */
    stageAnimations?: { classes: string; text: string }[];
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
  await section(page, 'Coding').click();
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

/** Records the element of every script animation started inside the player's stage. */
function recordStageAnimations() {
  const animate = Element.prototype.animate;
  window.stageAnimations = [];
  Element.prototype.animate = function (this: Element, ...args: Parameters<typeof animate>) {
    if (this.closest('.scene')) window.stageAnimations!.push({ classes: this.className, text: this.textContent!.trim() });
    return animate.apply(this, args);
  };
}

/** Turns Predict mode off, so stepping runs through the checkpoints. */
async function predictOff(page: Page) {
  await page.locator('app-player').getByText('Predict mode').click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).not.toBeChecked();
}

async function answerCheckpoint(page: Page) {
  await page.locator('app-player .predict .choice').first().click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByText('Your call')).toBeHidden();
}

const stage = (page: Page) => page.locator('app-player .scene');

test.describe("the stage's motion", { tag: '@player' }, () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(recordStageAnimations));

  test('a dequeue slides the front chip out of the queue', async ({ page }) => {
    await page.goto('/coding/visualizers/grid-bfs');
    const queue = page.locator('app-player g-list-view').filter({ hasText: 'queue' });
    await expect(queue.getByRole('listitem')).toHaveText(['(0,0)']);
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.locator('app-player g-transport .count')).toHaveText(/^2 \//);
    await expect
      .poll(() => page.evaluate(() => window.stageAnimations!.filter((a) => a.classes.includes('leaving'))))
      .toEqual([{ classes: expect.stringContaining('item'), text: '(0,0)' }]);
    await expect(queue.locator('.leaving')).toHaveCount(0);
  });

  test('holding → at 4× finishes each step before the next, and leaves nothing mid-animation', async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    await predictOff(page);
    const opened = await openPlayback(page);
    await page.locator('app-player').getByRole('radio', { name: '4×' }).click();
    if (opened) await page.locator('app-player').getByRole('button', { name: 'More playback controls' }).click();
    await stage(page).focus();
    const unfinished = await page.evaluate(async () => {
      const running = () =>
        document
          .querySelector('.scene')!
          .getAnimations({ subtree: true })
          .filter((a) => a.playState === 'running');
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      let left = 0;
      for (let i = 0; i < 10; i++) {
        const before = running();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await frame();
        await frame();
        left += before.filter((a) => a.playState !== 'finished').length;
      }
      return left;
    });
    expect(unfinished, 'every animation of a step ends before the next step').toBe(0);
    await expect(page.locator('app-player g-transport .count')).toHaveText('11 / 13');
    expect(await page.evaluate(() => window.stageAnimations!.length), 'the steps animated').toBeGreaterThan(0);
    await expect
      .poll(() => stage(page).evaluate((s) => s.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length))
      .toBe(0);
    await expect(stage(page).locator('.leaving, .landing-old, .landing-ring')).toHaveCount(0);
  });

  test('an answer plays the real step under a "you" tag, which then says whether it was right', async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    await stepToCheckpoint(page);
    await page.locator('app-player .predict .choice').first().click();
    const verdict = page.locator('app-player .you.verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('you:');
    await expect(page.locator('app-player .ptr', { hasText: 'lo' })).toHaveCSS('--i', '5');
    await expect.poll(() => page.evaluate(() => window.stageAnimations!.some((a) => a.classes.includes('ptr')))).toBe(true);
    await page.getByRole('button', { name: 'Continue →' }).click();
    await expect(verdict).toHaveCount(0);
  });
});

test.describe('with reduced motion', { tag: '@player' }, () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(recordStageAnimations));

  test('a step leaves trails instead of animating: a dashed pin where lo was, and the dequeued chip struck through', async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    await stepToCheckpoint(page);
    await answerCheckpoint(page);
    await expect(page.locator('app-player .ptr.trail')).toHaveText(['lo →']);
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.locator('app-player .ptr.trail')).toHaveCount(0);

    await page.goto('/coding/visualizers/grid-bfs');
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.locator('app-player g-list-view .item.trail')).toHaveText('(0,0)');
    expect(await page.evaluate(() => window.stageAnimations!.length)).toBe(0);
  });
});

test(
  "Describe lists the frame's values and what its step changed, from the header or D on the stage",
  { tag: '@player' },
  async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    await page.getByRole('button', { name: 'Step forward' }).click();
    await page.getByRole('button', { name: 'Describe this step' }).click();
    const describe = page.getByRole('region', { name: 'Describe · step 2' });
    await expect(describe.getByRole('heading', { name: 'Describe · step 2' })).toBeFocused();
    const array = describe.getByRole('table', { name: 'Array' });
    await expect(array.locator('tbody td:nth-of-type(1)')).toHaveText(['2', '5', '8', '12', '16', '23', '38', '56', '72', '91']);
    await expect(array.getByRole('row', { name: /^0 2 lo/ })).toBeVisible();
    await expect(describe.getByRole('listitem')).toHaveText(['Compare 0 <= 9.']);
    await describe.getByRole('button', { name: 'Close' }).click();
    await expect(describe).toHaveCount(0);
    await expect(stage(page)).toBeFocused();
    await page.keyboard.press('d');
    await expect(describe.getByRole('heading', { name: 'Describe · step 2' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(describe).toHaveCount(0);
    await expect(stage(page)).toBeFocused();
  },
);

test(
  'pins appearing and a stack growing leave the cells and the bottom of the stack where they were',
  { tag: '@player' },
  async ({ page }) => {
    await page.goto('/coding/visualizers/next-greater-element');
    // The last cell: the first one becomes current, which lifts it 2px.
    const cell = page.locator('app-player g-array-view .cells').first().locator('.cell').last();
    const stack = page.locator('app-player g-list-view.stack .items');
    const bottom = async () => {
      const box = (await stack.boundingBox())!;
      return box.y + box.height;
    };
    const before = { cell: (await cell.boundingBox())!.y, stack: await bottom() };
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.locator('app-player .ptr', { hasText: 'top' })).toBeVisible();
    await expect(page.locator('app-player g-list-view.stack [role="listitem"]')).toHaveCount(1);
    // A short stage (an iPhone in Safari) keeps only the frame's own pin rows and grows the stack from its top instead,
    // so the lists stay in view.
    test.skip((await stage(page).boundingBox())!.height < 360, 'A short stage trades these for keeping the lists in view.');
    expect((await cell.boundingBox())!.y).toBeCloseTo(before.cell, 0);
    expect(await bottom()).toBeCloseTo(before.stack, 0);
  },
);

test.describe('on a 320px phone', { tag: '@player' }, () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test("Next Greater Element's stack stays inside the stage at its first checkpoint", async ({ page }) => {
    await page.goto('/coding/visualizers/next-greater-element');
    const forward = page.getByRole('button', { name: 'Step forward' });
    for (const at of [2, 3]) {
      await forward.click();
      await expect(page.locator('app-player g-transport .count')).toHaveText(`${at} / 27`);
    }
    const inside = async () => {
      const chip = (await page.locator('app-player g-list-view.stack [role="listitem"]').first().boundingBox())!;
      const scene = (await stage(page).boundingBox())!;
      return chip.y >= scene.y && chip.y + chip.height <= scene.y + scene.height;
    };
    expect(await inside(), 'the stack chip at 3 / 27').toBe(true);
    await forward.click();
    await expect(page.getByText('Your call')).toBeVisible();
    expect(await inside(), 'the stack chip beside the open checkpoint').toBe(true);
  });
});

test(
  "arriving at Dijkstra's first checkpoint shows neither in the caption nor in Describe the note that answers it",
  { tag: '@player' },
  async ({ page }) => {
    const algo = getAlgorithm('dijkstra')!;
    const frames = algo.trace(algo.defaultInput);
    const at = pickCheckpoints(frames)[0];
    // The note works the sum out, "via 1 costs 7 + 10 = 17", which is the answer.
    const answer = frames[at].note.match(/costs (.+)\.$/)![1];
    await page.goto('/coding/visualizers/dijkstra');
    const forward = page.getByRole('button', { name: 'Step forward' });
    for (let step = 2; step <= at + 1; step++) {
      await forward.click();
      await expect(page.locator('app-player g-transport .count')).toHaveText(`${step} / ${frames.length}`);
    }
    await expect(page.getByText('Your call')).toBeHidden();
    const narration = page.locator('app-player .narration');
    await expect(narration).toContainText(frames[at].caption!);
    await expect(narration).not.toContainText(answer);
    await page.getByRole('button', { name: 'Describe this step' }).click();
    const describe = page.getByRole('region', { name: `Describe · step ${at + 1}` });
    await expect(describe).toBeVisible();
    await expect(describe).not.toContainText(answer);
    await expect(page.locator('app-player')).not.toContainText(answer);
  },
);
