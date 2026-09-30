import { randomUUID } from 'node:crypto';
import type { Page, Request } from '@playwright/test';
import { diagnosticItems } from '@grasp/engine';
import { expect, expectUnmoved, readOnly, recordedEvents, test, viewportTop } from './fixtures';

type ProgressEvent = { id: string; at: string; type: string; [key: string]: unknown };

const progressUrl = '/api/progress/events';
const eventsKey = 'CapacitorStorage.grasp.events';
const acknowledgedKey = 'CapacitorStorage.grasp.acknowledged.v1';

const isUpload = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === progressUrl;
const prediction = (at = new Date().toISOString()): ProgressEvent => ({
  id: randomUUID(),
  at,
  type: 'predict.answered',
  algorithmId: 'binary-search',
  patternId: 'binary-search',
  correct: true,
});

async function seedProgress(page: Page, events: ProgressEvent[]): Promise<string> {
  const learnerId = randomUUID();
  await page.addInitScript(
    (seed) => {
      if (localStorage.getItem('e2e.progressSeeded')) return;
      localStorage.setItem('CapacitorStorage.grasp.learnerId', seed.learnerId);
      localStorage.setItem('CapacitorStorage.grasp.events', JSON.stringify(seed.events));
      localStorage.setItem('e2e.progressSeeded', '1');
    },
    { learnerId, events },
  );
  return learnerId;
}

async function localEvents(page: Page): Promise<ProgressEvent[]> {
  return page.evaluate((key) => {
    const log = JSON.parse(localStorage.getItem(key) ?? '[]');
    return (Array.isArray(log) ? log : log.events) as ProgressEvent[];
  }, eventsKey);
}

async function acknowledgedIds(page: Page): Promise<string[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], acknowledgedKey);
}

async function serverEvents(page: Page, learnerId: string): Promise<ProgressEvent[]> {
  const response = await page.request.get(progressUrl, { headers: { 'x-learner-id': learnerId } });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { events: ProgressEvent[] };
  return body.events;
}

test.describe('progress sync retention', () => {
  test.skip(readOnly, 'These regressions write to the local test API.');

  test('acknowledges eligible progress but retains future progress through reload and retry', async ({ page }) => {
    const eligible = prediction();
    const future = prediction(new Date(Date.now() + 24 * 60 * 60_000).toISOString());
    const learnerId = await seedProgress(page, [eligible, future]);
    const firstUpload = page.waitForResponse((response) => isUpload(response.request()));

    await page.goto('/learn');
    expect(await (await firstUpload).json()).toMatchObject({
      acknowledgedIds: [eligible.id],
      deferredFutureIds: [future.id],
    });
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByRole('alert')).toContainText('future date and cannot sync yet');
    expect((await serverEvents(page, learnerId)).map((event) => event.id)).toEqual([eligible.id]);
    expect(await acknowledgedIds(page)).toContain(eligible.id);
    expect(await acknowledgedIds(page)).not.toContain(future.id);

    const reloadUpload = page.waitForResponse((response) => isUpload(response.request()));
    await page.reload();
    expect(((await reloadUpload).request().postDataJSON() as { events: ProgressEvent[] }).events.map((event) => event.id)).toEqual([
      future.id,
    ]);
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'pending');
    expect((await localEvents(page)).map((event) => event.id)).toEqual([eligible.id, future.id]);

    const retryUpload = page.waitForResponse((response) => isUpload(response.request()));
    const retryButton = page.getByRole('alert').getByRole('button');
    await retryButton.focus();
    await page.keyboard.press('Enter');
    const retry = await retryUpload;
    expect((retry.request().postDataJSON() as { events: ProgressEvent[] }).events.map((event) => event.id)).toEqual([future.id]);
    expect((await retry.json()).deferredFutureIds).toEqual([future.id]);
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'pending');
    await expect(retryButton).toBeFocused();
    expect((await serverEvents(page, learnerId)).map((event) => event.id)).toEqual([eligible.id]);
  });

  test('keeps one oversized update locally while valid neighbors reach the server', async ({ page }) => {
    const first = prediction();
    const oversized: ProgressEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      type: 'settings.changed',
      settings: { budgetMinutes: 10 },
      padding: 'x'.repeat(262_144),
    };
    const last = prediction();
    const learnerId = await seedProgress(page, [first, oversized, last]);
    const uploadedIds: string[][] = [];
    page.on('request', (request) => {
      if (isUpload(request)) uploadedIds.push((request.postDataJSON() as { events: ProgressEvent[] }).events.map((event) => event.id));
    });

    await page.goto('/learn');
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByRole('alert')).toContainText('too large to sync');
    expect(uploadedIds).toEqual([[first.id, last.id]]);
    expect((await serverEvents(page, learnerId)).map((event) => event.id).sort()).toEqual([first.id, last.id].sort());
    expect((await acknowledgedIds(page)).sort()).toEqual([first.id, last.id].sort());
    expect((await localEvents(page)).map((event) => event.id)).toEqual([first.id, oversized.id, last.id]);

    await page.reload();
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByRole('alert')).toContainText('too large to sync');
    expect((await localEvents(page)).map((event) => event.id)).toContain(oversized.id);
  });

  test('sends 500 valid diagnostic updates in bounded byte batches with real acknowledgements', async ({ page }) => {
    test.setTimeout(90_000);
    const answers = diagnosticItems(() => 0.5).map((itemId) => ({ itemId, outcome: 'correct', durationMs: 1_000 }));
    const at = new Date().toISOString();
    const events = Array.from({ length: 500 }, (): ProgressEvent => ({ id: randomUUID(), at, type: 'diagnostic.completed', answers }));
    const learnerId = await seedProgress(page, events);
    const uploads: { bytes: number; sent: string[]; acknowledged: string[]; deferred: string[] }[] = [];
    await page.route('**/api/progress/events*', async (route) => {
      if (!isUpload(route.request())) return route.continue();
      const request = route.request();
      const response = await route.fetch();
      const body = (await response.json()) as { acknowledgedIds: string[]; deferredFutureIds: string[] };
      uploads.push({
        bytes: Buffer.byteLength(request.postData() ?? ''),
        sent: (request.postDataJSON() as { events: ProgressEvent[] }).events.map((event) => event.id),
        acknowledged: body.acknowledgedIds,
        deferred: body.deferredFutureIds,
      });
      await route.fulfill({ response });
    });

    await page.goto('/learn');
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'synced', { timeout: 60_000 });
    expect(uploads.length).toBeGreaterThan(1);
    for (const upload of uploads) {
      expect(upload.bytes).toBeLessThanOrEqual(262_144);
      expect(upload.sent.length).toBeLessThanOrEqual(500);
      expect(upload.acknowledged).toEqual(upload.sent);
      expect(upload.deferred).toEqual([]);
    }
    const ids = events.map((event) => event.id).sort();
    expect(uploads.flatMap((upload) => upload.acknowledged).sort()).toEqual(ids);
    expect((await acknowledgedIds(page)).sort()).toEqual(ids);
    expect((await serverEvents(page, learnerId)).map((event) => event.id).sort()).toEqual(ids);
  });

  test('retains a whole batch after a malformed success response and uploads it on retry', async ({ page }) => {
    const events = [prediction(), prediction()];
    const learnerId = await seedProgress(page, events);
    let uploads = 0;
    await page.route('**/api/progress/events*', async (route) => {
      if (!isUpload(route.request())) return route.continue();
      uploads++;
      if (uploads === 1) return route.fulfill({ status: 200, json: { accepted: 2 } });
      return route.continue();
    });

    await page.goto('/learn');
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'offline');
    expect(await acknowledgedIds(page)).toEqual([]);
    expect(await serverEvents(page, learnerId)).toEqual([]);
    expect((await localEvents(page)).map((event) => event.id)).toEqual(events.map((event) => event.id));

    const retryUpload = page.waitForResponse((response) => isUpload(response.request()) && response.status() === 200);
    await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
    expect((await (await retryUpload).json()).acknowledgedIds).toEqual(events.map((event) => event.id));
    await expect(page.locator('.sync')).toHaveAttribute('data-status', 'synced');
    expect(uploads).toBe(2);
    expect((await acknowledgedIds(page)).sort()).toEqual(events.map((event) => event.id).sort());
    expect((await serverEvents(page, learnerId)).map((event) => event.id).sort()).toEqual(events.map((event) => event.id).sort());
  });

  test.describe('transport failures', () => {
    test.use({ expectedConsoleErrors: [/Failed to load resource|net::ERR_FAILED/] });

    test('recovers a committed update whose response was lost without uploading it twice', async ({ page }) => {
      const event = prediction();
      const learnerId = await seedProgress(page, [event]);
      let uploads = 0;
      await page.route('**/api/progress/events*', async (route) => {
        if (!isUpload(route.request())) return route.continue();
        uploads++;
        if (uploads > 1) return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        expect((await response.json()).acknowledgedIds).toEqual([event.id]);
        await route.abort('failed');
      });

      await page.goto('/learn');
      await expect(page.locator('.sync')).toHaveAttribute('data-status', 'offline');
      expect((await serverEvents(page, learnerId)).map((stored) => stored.id)).toEqual([event.id]);
      expect(await acknowledgedIds(page)).not.toContain(event.id);

      await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
      await expect(page.locator('.sync')).toHaveAttribute('data-status', 'synced');
      expect(uploads).toBe(1);
      expect(await acknowledgedIds(page)).toContain(event.id);
      expect((await serverEvents(page, learnerId)).map((stored) => stored.id)).toEqual([event.id]);
    });

    for (const status of [503, 429]) {
      test(`preserves a ${status} upload and retry focus until the server accepts it`, async ({ page }) => {
        const event = prediction();
        const learnerId = await seedProgress(page, [event]);
        let uploads = 0;
        let releaseRetry!: () => void;
        const retryGate = new Promise<void>((resolve) => (releaseRetry = resolve));
        await page.route('**/api/progress/events*', async (route) => {
          if (!isUpload(route.request())) return route.continue();
          uploads++;
          if (uploads === 1) return route.fulfill({ status, json: { message: 'Sync unavailable' } });
          await retryGate;
          return route.continue();
        });

        await page.goto('/learn');
        const alert = page.getByRole('alert').filter({ hasText: 'Sync is unavailable' });
        const retry = alert.getByRole('button');
        const hero = page.locator('.hero');
        await expect(alert).toBeVisible();
        expect(await acknowledgedIds(page)).not.toContain(event.id);
        expect(await serverEvents(page, learnerId)).toEqual([]);
        const heroTop = await viewportTop(hero);

        await retry.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.sync')).toHaveAttribute('data-status', 'syncing');
        await expect(alert).toBeFocused();
        await expect(retry).toBeDisabled();
        await expectUnmoved(hero, heroTop, 'the hero while retrying progress sync');

        releaseRetry();
        await expect(page.locator('.sync')).toHaveAttribute('data-status', 'synced');
        await expect(alert).toHaveCount(0);
        await expect(page.locator('.sync')).toBeFocused();
        expect(uploads).toBe(2);
        expect(await acknowledgedIds(page)).toContain(event.id);
        expect((await serverEvents(page, learnerId)).map((stored) => stored.id)).toEqual([event.id]);
      });
    }
  });
});

test.describe('reconnecting', () => {
  test.use({ expectedConsoleErrors: [/ERR_INTERNET_DISCONNECTED|Failed to load resource|WebKit encountered an internal error/] });

  test('an answer given offline reaches the server as soon as the device is back online, with nothing else to prompt it', async ({
    page,
    context,
  }) => {
    test.skip(readOnly, 'It writes progress.');
    await page.goto('/drill', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    await page.locator('g-question-card .choice').first().click();
    await page.getByRole('button', { name: /^(Got it|Continue)/ }).click();
    await expect.poll(async () => (await recordedEvents(page)).some((event) => event.type === 'review.graded')).toBe(true);
    // The upload runs 1.5 s after an answer; waiting past it lets that offline attempt fail, so only reconnecting can send it.
    await page.waitForTimeout(2_000);

    const uploaded = page.waitForRequest(
      (request) => isUpload(request) && JSON.stringify(request.postDataJSON()).includes('review.graded'),
    );
    await context.setOffline(false);
    await uploaded;
  });
});
