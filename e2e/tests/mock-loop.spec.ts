import AxeBuilder from '@axe-core/playwright';
import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, synced, test } from './fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const STAR = {
  Situation: 'Two weeks before launch, QA found that payment retries could double charge some customers.',
  Task: 'I owned the payment client, and product wanted to keep the launch date.',
  Action: 'I ran the load test myself, measured the failure rate and proposed a one-week fix plan to product.',
  Result: 'We launched a week late with no double charges in the first quarter.',
  Reflection: 'Next time I would bring the data to the first meeting, not the second.',
};
const FOLLOW_UP = 'I wrote the retry fix myself, paired with QA on the test plan, and checked the dashboards every morning for two weeks.';

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include('app-mock-loop')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

/** Talks through a coding or design round until End & score shows, then scores it. */
async function talkAndScore(page: Page) {
  const input = page.getByRole('textbox', { name: /Think out loud/ });
  for (const text of [
    'Can the input be empty, and how large can it get? I would confirm the constraints first.',
    'I would start simple, then cache the hot path and shard by key, trading consistency for latency.',
  ]) {
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(input).toBeEditable({ timeout: 30_000 });
  }
  await page.getByRole('button', { name: 'End & score' }).click();
  await expect(page.getByText('Scorecard · scripted practice estimate')).toBeVisible({ timeout: 60_000 });
}

async function answerBehavioral(page: Page) {
  const session = page.locator('app-interview-session');
  for (const [label, text] of Object.entries(STAR)) await session.getByLabel(label, { exact: true }).fill(text);
  await session.getByRole('button', { name: 'Give answer' }).click();
  const composer = page.getByRole('textbox', { name: 'Your follow-up answer' });
  for (let i = 0; i < 3; i++) {
    await expect(composer).toBeEditable({ timeout: 30_000 });
    await composer.fill(FOLLOW_UP);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  }
  await expect(composer).toBeDisabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'End & score' }).click();
  await expect(page.getByText('Scorecard · scripted practice estimate')).toBeVisible({ timeout: 60_000 });
}

/** A calendar day this many days from today, where the browser lives. */
const localDay = (page: Page, days: number) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

test('a signed-out learner runs a scripted loop of three rounds to one debrief, kept on the device', async ({ page }) => {
  await page.goto('/interview');
  await page.getByRole('link', { name: /Full mock loop/ }).click();
  await expect(page).toHaveURL(/\/interview\/loop$/);
  const loop = page.locator('app-mock-loop');
  await expect(loop.getByRole('heading', { name: 'A full interview loop', level: 1 })).toBeVisible();
  await expect(loop.locator('.plan li')).toHaveText([
    /^Coding · about 45 min$/,
    /^System design · about 45 min$/,
    /^Behavioral · about 20 min$/,
  ]);
  await expect(loop.getByRole('button', { name: 'Scripted practice' })).toHaveAttribute('aria-pressed', 'true');
  await expect(loop.getByText('Guided prompts and a practice estimate for each round. No AI or sign-in needed.')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  const created: { track: string; mode: string }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/interview/sessions') created.push(r.postDataJSON());
  });
  await loop.getByRole('button', { name: 'Start the loop' }).click();
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Mock loop · round 1 of 3')).toBeVisible();
  await talkAndScore(page);
  await page.getByRole('link', { name: 'Back to your mock loop' }).click();

  await expect(loop.getByRole('heading', { name: 'Round 2 of 3', level: 1 })).toBeVisible();
  await expect(loop.getByText(/^Round done\. Take five minutes/)).toBeVisible();
  await expect(loop.locator('.round').first()).toContainText(/Scored: /);
  expect(await seriousViolations(page)).toEqual([]);

  await page.reload();
  await expect(loop.getByRole('heading', { name: 'Round 2 of 3', level: 1 })).toBeVisible();
  await loop.getByRole('button', { name: 'Start the system design round' }).click();
  await expect(page.getByText('Mock loop · round 2 of 3')).toBeVisible();
  await talkAndScore(page);
  await page.getByRole('link', { name: 'Back to your mock loop' }).click();

  await loop.getByRole('button', { name: 'Start the behavioral round' }).click();
  await expect(page.getByText('Mock loop · round 3 of 3')).toBeVisible();
  await answerBehavioral(page);
  expect(created.map((c) => [c.track, c.mode])).toEqual([
    ['coding', 'offline'],
    ['system-design', 'offline'],
    ['behavioral', 'offline'],
  ]);

  const completed = synced(page, 'mock.completed');
  const upload = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      r.url().endsWith('/api/progress/events') &&
      (r.postDataJSON() as { events: { type: string }[] }).events.some((e) => e.type === 'mock.completed'),
  );
  await page.getByRole('link', { name: 'See your loop debrief' }).click();
  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  await expect(loop.getByText('Practice read, not a hiring decision')).toBeVisible();
  await expect(loop.getByText(/Scripted practice scored every round: it checks which rubric areas you covered/)).toBeVisible();
  const focus = loop.locator('.focus > li');
  await expect(focus).toHaveCount(3);
  await expect(focus.getByRole('link')).toHaveCount(3);
  await expect(loop.locator('.round')).toHaveCount(3);
  await expect(loop.getByRole('link', { name: 'Scorecard and transcript' })).toHaveCount(3);
  await completed;
  const event = ((await upload).postDataJSON() as { events: Record<string, unknown>[] }).events.find(
    (e) => e['type'] === 'mock.completed',
  )!;
  expect(event['id']).toMatch(/^mock-[0-9a-f-]{36}$/);
  expect((event['rounds'] as { track: string }[]).map((r) => r.track)).toEqual(['coding', 'system-design', 'behavioral']);
  expect(await seriousViolations(page)).toEqual([]);

  await page.reload();
  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.grasp.events') ?? '[]'));
  expect((Array.isArray(events) ? events : events.events).filter((e: { type: string }) => e.type === 'mock.completed')).toHaveLength(1);

  await loop.getByRole('button', { name: 'Start a new loop' }).click();
  await expect(loop.getByRole('heading', { name: 'A full interview loop', level: 1 })).toBeFocused();
});

const message = (role: 'interviewer' | 'candidate', content: string) => ({ role, content, at: new Date().toISOString() });
const FAKE: Record<string, { problem: object; verdict: string; scores: number[]; names: string[]; weakPatterns: string[] }> = {
  coding: {
    problem: { id: 'warmer-days', title: 'Days Until Warmer', track: 'coding', patternIds: ['monotonic-stack'] },
    verdict: 'hire',
    scores: [3, 3, 4, 3, 3],
    names: ['Problem understanding', 'Approach', 'Complexity analysis', 'Correctness & edge cases', 'Communication'],
    weakPatterns: [],
  },
  'system-design': {
    problem: { id: 'url-shortener', title: 'Design a URL Shortener', track: 'system-design', patternIds: [] },
    verdict: 'no-hire',
    scores: [2, 1, 2, 2, 2],
    names: ['Requirements & scope', 'Estimation', 'High-level design', 'Deep dives & trade-offs', 'Communication'],
    weakPatterns: [],
  },
  behavioral: {
    problem: { id: 'conflict-1', title: 'Conflict & Disagreement', track: 'behavioral', patternIds: [], competencyId: 'conflict' },
    verdict: 'hire',
    scores: [3, 3, 3, 4, 2],
    names: ['Competency fit', 'Ownership & specificity', 'Impact & results', 'Judgment & reflection', 'Follow-up handling'],
    weakPatterns: [],
  },
};

/**
 * Stands in for the AI interviewer, which the e2e server has no key for: each round's session opens with two answers
 * given, so End & score is ready, and scores to a fixed card. Progress still syncs to the real API.
 */
async function fakeAiInterviewer(page: Page) {
  const sessions = new Map<string, Record<string, unknown>>();
  const created: unknown[] = [];
  await page.route('**/api/interview/problems', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), aiAccess: 'available' } });
  });
  await page.route('**/api/interview/sessions**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/interview/sessions') {
      if (request.method() !== 'POST') return route.continue();
      const body = request.postDataJSON() as { track: string };
      created.push(body);
      const id = randomUUID();
      const turns =
        body.track === 'behavioral' ? ['[STAR ANSWER]', 'I wrote the fix.', 'It held.', 'We still pair.'] : ['First.', 'Second.'];
      const session = {
        id,
        track: body.track,
        problem: FAKE[body.track].problem,
        messages: [
          message('interviewer', 'Opening question.'),
          ...turns.flatMap((t) => [message('candidate', t), message('interviewer', 'Go on.')]),
        ],
        hintsUsed: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        mode: 'ai',
        aiAccess: 'available',
      };
      sessions.set(id, session);
      return route.fulfill({ json: session });
    }
    const id = path.split('/')[4];
    const session = sessions.get(id);
    if (!session) return route.continue();
    if (path.endsWith('/score')) {
      const fake = FAKE[session['track'] as string];
      Object.assign(session, {
        status: 'scored',
        scoredAt: new Date().toISOString(),
        scorecard: {
          verdict: fake.verdict,
          summary: 'A fixed card for the test.',
          dimensions: fake.names.map((name, i) => ({ name, score: fake.scores[i], evidence: 'Seen.' })),
          strengths: [],
          improvements: [],
          weakPatterns: fake.weakPatterns,
          mode: 'ai',
          ...(session['track'] === 'behavioral' ? { flaws: [], weakCompetencies: [] } : {}),
        },
      });
    }
    return route.fulfill({ json: session });
  });
  return created;
}

test('an AI loop says what it costs before starting, and its debrief weighs the weakest round', async ({ page }) => {
  const created = await fakeAiInterviewer(page);
  await page.goto('/interview/loop');
  const loop = page.locator('app-mock-loop');
  await loop.getByRole('button', { name: 'AI interviewer' }).click();
  await expect(loop.getByRole('button', { name: 'AI interviewer' })).toHaveAttribute('aria-pressed', 'true');
  await expect(
    loop.getByText(
      /An AI loop is 3 AI interviews in a row: every reply and each round's scorecard count toward your hourly AI interview limit/,
    ),
  ).toBeVisible();
  await expect(loop.getByText(/The debrief itself makes no AI call\./)).toBeVisible();
  await loop.getByRole('button', { name: 'Start the loop' }).click();

  for (const round of [1, 2, 3]) {
    await expect(page.getByText(`Mock loop · round ${round} of 3`)).toBeVisible();
    await page.getByRole('button', { name: 'End & score' }).click();
    await expect(page.getByText('Scorecard · AI feedback')).toBeVisible();
    await page.getByRole('link', { name: round < 3 ? 'Back to your mock loop' : 'See your loop debrief' }).click();
    if (round < 3) await loop.getByRole('button', { name: /^Start the / }).click();
  }
  expect(created).toEqual([
    expect.objectContaining({ track: 'coding', mode: 'ai' }),
    expect.objectContaining({ track: 'system-design', mode: 'ai' }),
    expect.objectContaining({ track: 'behavioral', mode: 'ai' }),
  ]);

  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  await expect(loop.getByRole('heading', { name: 'lean no hire', level: 2 })).toBeVisible();
  await expect(loop.getByText(/Your system design round held it down\./)).toBeVisible();
  await expect(loop.getByText(/Scripted practice scored/)).toHaveCount(0);
  const focus = loop.locator('.focus > li');
  await expect(focus.locator('h3')).toHaveText(['Estimation', 'Follow-up handling', 'Problem understanding']);
  await expect(focus.locator('.eyebrow')).toHaveText(['System design · 1 of 4', 'Behavioral · 2 of 4', 'Coding · 3 of 4']);
  await expect(focus.getByRole('link', { name: 'Read the Estimation lesson' })).toHaveAttribute('href', '/learn/design/sd-estimation');
  await expect(focus.getByRole('link', { name: /^Study / })).toHaveAttribute('href', '/learn/pattern/monotonic-stack');
  await expect(focus.getByRole('link', { name: /guide$/ })).toHaveAttribute('href', '/behavioral/conflict');
  await synced(page, 'mock.completed');
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/plan');
  const plan = page.locator('app-plan');
  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  await plan.getByRole('button', { name: 'Save plan' }).click();
  const today = plan.getByRole('region', { name: /^Today/ });
  for (const round of ['coding', 'system design', 'behavioral']) {
    await expect(today.getByRole('link', { name: `Done: Mock loop: ${round} round` })).toHaveAttribute('href', '/interview/loop');
  }
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the loop setup and a loop in progress pass axe, and a loop can be ended', async ({ page }) => {
      await page.goto('/interview/loop');
      const loop = page.locator('app-mock-loop');
      await expect(loop.getByRole('heading', { name: 'A full interview loop', level: 1 })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await loop.getByRole('button', { name: 'Start the loop' }).click();
      await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
      await page.goto('/interview/loop');
      await expect(loop.getByRole('heading', { name: 'Round 1 of 3', level: 1 })).toBeVisible();
      await expect(loop.getByRole('button', { name: 'Continue the coding round' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await loop.getByRole('button', { name: 'End this loop' }).click();
      await loop.getByRole('button', { name: 'End the loop' }).click();
      await expect(loop.getByRole('heading', { name: 'A full interview loop', level: 1 })).toBeFocused();
    });
  });
}
