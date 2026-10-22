import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { CASE_LABS, SCENARIO_CATALOG } from '@grasp/engine';
import { expect, test } from './fixtures';

/** Every board the Lab opens: the 9 missions and the 27 case builds. */
const BOARDS = [
  ...SCENARIO_CATALOG.map((s) => `/design/missions/${s.id}`),
  ...Object.keys(CASE_LABS).map((id) => `/design/cases/${id}/build`),
];

/** The nodes whose box leaves the canvas, by name. */
async function outsideCanvas(page: Page): Promise<string[]> {
  await page.locator('app-sandbox g.node').first().waitFor();
  return page.evaluate(() => {
    const canvas = document.querySelector('app-sandbox svg[aria-label="Design canvas"]')!.getBoundingClientRect();
    return [...document.querySelectorAll<SVGGElement>('app-sandbox g.node')]
      .filter((node) => {
        const box = node.querySelector('rect.body')!.getBoundingClientRect();
        return box.left < canvas.left || box.right > canvas.right || box.top < canvas.top || box.bottom > canvas.bottom;
      })
      .map((node) => node.getAttribute('aria-label')!);
  });
}

test.describe('the desktop Lab canvas', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'The desktop canvas starts at 1024px; phones keep their layout until R22.'));

  for (const width of [1280, 1024]) {
    test(`opens every mission and case build with all its nodes in view at ${width}px`, { tag: '@lab' }, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 768 });
      for (const path of BOARDS) {
        await page.goto(path);
        expect(await outsideCanvas(page), path).toEqual([]);
      }
    });
  }

  for (const width of [1024, 1280, 1440]) {
    test(`lays the dock under the canvas and tools, across their width, at ${width}px`, { tag: '@lab' }, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/design/cases/url-shortener/build');
      const dock = page.getByRole('region', { name: 'Run' });
      await expect(dock).toBeVisible();
      const canvas = (await page.locator('app-sandbox .canvas').boundingBox())!;
      const tools = (await page.getByRole('group', { name: 'Add component' }).boundingBox())!;
      const box = (await dock.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
      expect(box.x).toBeLessThanOrEqual(tools.x + 1);
      expect(box.x + box.width).toBeGreaterThanOrEqual(canvas.x + canvas.width - 1);
    });
  }

  for (const width of [1024, 1280]) {
    test(`keeps a selected node and the zoom controls clear of the floating inspector at ${width}px`, { tag: '@lab' }, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [path, label] of [
        ['/design/missions/first-scale-up', /^DB, Primary DB/],
        ['/design/cases/video-streaming/build', /^Replica, Read Replicas/],
        ['/design/cases/email-service/build', /^Replica, Read Replicas/],
      ] as const) {
        await page.goto(path);
        const node = page.getByRole('button', { name: label });
        await node.focus();
        await page.keyboard.press('Enter');
        const inspector = page.getByRole('region', { name: 'Inspector' });
        await expect(inspector).toBeVisible();
        const panel = (await inspector.boundingBox())!;
        const clear = (b: { x: number; y: number; width: number; height: number }) =>
          b.x + b.width <= panel.x || b.y >= panel.y + panel.height || b.x >= panel.x + panel.width;
        await expect.poll(async () => clear((await node.locator('rect.body').boundingBox())!), path).toBe(true);
        expect(clear((await page.getByRole('group', { name: 'Zoom' }).boundingBox())!), path).toBe(true);
        // Escape closes it from inside and gives focus back to the node.
        await inspector.getByRole('button').first().focus();
        await page.keyboard.press('Escape');
        await expect(inspector).toHaveCount(0);
        await expect(node).toBeFocused();
        // And from the node itself.
        await page.keyboard.press('Enter');
        await expect(inspector).toBeVisible();
        await node.focus();
        await page.keyboard.press('Escape');
        await expect(inspector).toHaveCount(0);
        await expect(node).toBeFocused();
      }
    });
  }

  test('colors Free Build against its goals, and a case build says it has none', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/lab');
    const dock = page.getByRole('region', { name: 'Run' });
    await expect(dock).toContainText('Your goals');
    const p99 = dock.locator('.kpi', { hasText: /p99/i });
    const errors = dock.locator('.kpi', { hasText: /errors/i });
    await expect(dock.locator('.kpi', { hasText: /cost/i })).toContainText('no budget');
    // The starter's three app servers cannot serve 5k requests a second, so p99 and errors miss their goals.
    await expect(p99).toHaveAttribute('data-verdict', 'fail');
    await expect(p99).toContainText('≤ 200 ms, missed');
    await expect(errors).toHaveAttribute('data-verdict', 'fail');

    // Traffic is a handle on the client: at 1k a second the same board meets both.
    const traffic = page.getByRole('slider', { name: 'Traffic' });
    await expect(traffic).toHaveAttribute('aria-valuetext', '5.0k requests per second');
    await traffic.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(traffic).toHaveAttribute('aria-valuetext', '1.0k requests per second');
    await expect(p99).toHaveAttribute('data-verdict', 'pass');
    await expect(p99).toContainText('≤ 200 ms, met');
    await expect(errors).toHaveAttribute('data-verdict', 'pass');
    await expect(traffic).toBeFocused();

    await page.goto('/design/cases/url-shortener/build');
    await expect(dock).toContainText('No goals for this build yet');
    await expect(dock.locator('[data-verdict]')).toHaveCount(0);
  });

  test(
    'offers only the workload controls a build declares, and Escape closes the popover back to its button',
    { tag: '@lab' },
    async ({ page }) => {
      await page.goto('/design/cases/rate-limiter/build');
      const workload = page.getByRole('button', { name: /^Workload/ });
      await workload.click();
      const popover = page.getByRole('group', { name: 'Workload' });
      await expect(popover.getByRole('slider')).toHaveCount(2);
      await expect(popover.getByRole('slider', { name: /^Bots 60k rps/ })).toBeVisible();
      await popover.getByRole('slider', { name: /^Reads/ }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(popover.getByRole('slider', { name: /^Reads 89.9%/ })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(workload).toBeFocused();
      await expect(workload).toHaveAttribute('aria-expanded', 'false');

      await page.goto('/design/cases/url-shortener/build');
      await page.getByRole('button', { name: /^Workload/ }).click();
      await expect(page.getByRole('group', { name: 'Workload' }).getByRole('slider')).toHaveCount(1);
      // A press outside the popover closes it.
      await page.locator('app-sandbox .help').click();
      await expect(page.getByRole('group', { name: 'Workload' })).toHaveCount(0);

      // A mission is graded at its own load, so it offers no workload controls.
      await page.goto('/design/missions/first-scale-up');
      await page.locator('app-sandbox g.node').first().waitFor();
      await expect(page.getByRole('button', { name: /^Workload/ })).toHaveCount(0);
      await expect(page.getByRole('slider', { name: 'Traffic' })).toHaveCount(0);
    },
  );

  test('explains the model in plain words', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/missions/first-scale-up');
    const model = page.getByRole('button', { name: /^Model/ });
    await model.click();
    await expect(page.getByRole('group', { name: 'Model' })).toContainText('service time divided by (1 − utilization)');
    await model.click();
    await expect(page.getByRole('group', { name: 'Model' })).toHaveCount(0);
  });

  test('traces a request down the busiest path with the time at each hop', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/cases/url-shortener/build');
    await page.getByRole('button', { name: 'Trace a request' }).click();
    const summary = page.getByRole('status').filter({ hasText: /^Request 1:/ });
    // The cache answers 90% of reads itself, so the typical request ends there.
    await expect(summary).toHaveText(/^Request 1: Users → LB → App → Cache, \d+(\.\d)? ms on the busiest path\.$/);
    // Each node's own time over it, and the internet's 40 ms into the LB on its edge.
    await expect(page.locator('app-lab-overlay .hop:not(.net)')).toHaveCount(3);
    await expect(page.locator('app-lab-overlay .hop.net')).toHaveText(['+40 ms']);
    // Any change to the board clears it, so its numbers are always the board's.
    await page.getByRole('slider', { name: 'Traffic' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(summary).toHaveCount(0);
    await expect(page.locator('app-lab-overlay .hop')).toHaveCount(0);
  });

  test('pins insights to their nodes by name, and a callout opens the inspector beside its node', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/missions/first-scale-up');
    const callout = page.locator('app-lab-overlay .callout', { hasText: 'App Servers overloaded' });
    await callout.click();
    const inspector = page.locator('app-sandbox .float');
    await expect(inspector.getByRole('heading', { name: 'App Servers' })).toBeVisible();
    const box = (await inspector.boundingBox())!;
    const app = (await page.locator('app-sandbox g.node[data-node="app"] rect.body').boundingBox())!;
    expect(app.x + app.width <= box.x || app.y >= box.y + box.height, 'the selected node sits under the inspector').toBe(true);
    expect(
      await new AxeBuilder({ page })
        .include('app-sandbox')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
        .then((r) => r.violations.map((v) => v.id)),
    ).toEqual([]);
  });

  test('calls a named node by its name in its callout', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/missions/reconnect-storm');
    await expect(page.locator('app-lab-overlay .callout', { hasText: /^(Critical|Warning): Control plane/ })).toBeVisible();
  });

  test('draws a case role with its own glyph and names it', { tag: '@lab' }, async ({ page }) => {
    await page.goto('/design/cases/stock-exchange/build');
    await expect(page.getByRole('button', { name: /^Sequencer, Message Queue as a sequencer, / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Matching engines, Workers as a matching engine, / })).toBeVisible();
    await expect(page.locator('g.node[data-node="engines"] use')).toHaveAttribute('href', '#g-sys-matcher');
  });
});

test.describe('Trace a request with motion', () => {
  test.use({ motionOff: false });
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'Trace a request is on the desktop canvas.'));

  test('sends one numbered dot along the path and labels each hop as it arrives', { tag: '@lab' }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/design/cases/url-shortener/build');
    await page.getByRole('button', { name: 'Trace a request' }).click();
    const dot = page.locator('app-sandbox .particle.trace');
    await expect(dot).toHaveCount(1);
    await expect(dot).toHaveText('1');
    await expect(page.locator('app-lab-overlay .hop:not(.net)')).not.toHaveCount(3);
    await expect(page.getByRole('status').filter({ hasText: /^Request 1:/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('app-lab-overlay .hop:not(.net)')).toHaveCount(3);
  });

  test('animates nothing under Reduced motion and shows every hop at once', { tag: '@lab' }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      (window as unknown as { animations: number }).animations = 0;
      Element.prototype.animate = function (...args) {
        (window as unknown as { animations: number }).animations++;
        return animate.apply(this, args);
      };
    });
    await page.goto('/design/cases/url-shortener/build');
    await page.getByRole('button', { name: 'Trace a request' }).click();
    await expect(page.locator('app-lab-overlay .hop:not(.net)')).toHaveCount(3);
    await expect(page.getByRole('status').filter({ hasText: /^Request 1:/ })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { animations: number }).animations)).toBe(0);
  });
});
