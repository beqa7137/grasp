import AxeBuilder from '@axe-core/playwright';
import type { Page, Route } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { type GitHubUser, signInToGitHub } from '../support/github';
import { expect, synced, test } from './fixtures';
import { typeFindings } from './type-rules';

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
  await expect(page.getByText('Scorecard · Scripted: rubric checks')).toBeVisible({ timeout: 60_000 });
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
  await expect(page.getByText('Scorecard · Scripted: rubric checks')).toBeVisible({ timeout: 60_000 });
}

/** A calendar day this many days from today, where the browser lives. */
const localDay = (page: Page, days: number) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

test('a signed-out learner runs a scripted loop of three rounds to one debrief, kept on the device', async ({ page }) => {
  await page.goto('/mock');
  await page.getByRole('link', { name: /^Full loop/ }).click();
  await expect(page).toHaveURL(/\/mock\/loop$/);
  const loop = page.locator('app-mock-loop');
  await expect(loop.getByRole('heading', { name: 'A mock interview loop', level: 1 })).toBeVisible();
  await expect(loop.locator('.plan li')).toHaveText([
    /^Coding · about 45 min$/,
    /^System design · about 45 min$/,
    /^Behavioral · about 20 min, one question with follow-ups$/,
  ]);
  await expect(loop.getByText(/Questions lean toward/)).toHaveCount(0);
  await expect(loop.getByRole('radio', { name: 'Mid-level' })).toHaveAttribute('aria-checked', 'true');
  await expect(loop.getByRole('button', { name: 'Scripted', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(
    loop.getByText('Scripted follow-ups for each round, scored by rubric checks. No AI or sign-in needed.', { exact: false }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  const created: { track: string; mode: string; level?: string }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/interview/sessions') created.push(r.postDataJSON());
  });
  await loop.getByRole('button', { name: 'Start the loop' }).click();
  await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
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
  // The loop is complete the moment its last round is scored, before the debrief is opened.
  const completed = synced(page, 'mock.completed');
  const upload = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      r.url().endsWith('/api/progress/events') &&
      (r.postDataJSON() as { events: { type: string }[] }).events.some((e) => e.type === 'mock.completed'),
  );
  await answerBehavioral(page);
  await completed;
  expect(created.map((c) => [c.track, c.mode, c.level])).toEqual([
    ['coding', 'offline', undefined],
    ['system-design', 'offline', undefined],
    ['behavioral', 'offline', 'mid'],
  ]);

  await page.getByRole('link', { name: 'See your loop debrief' }).click();
  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  await expect(loop.getByText('Coverage estimate from scripted rounds, not a hiring decision')).toBeVisible();
  await expect(loop.getByText(/Every round was scripted: scripted rounds check which rubric areas you covered/)).toBeVisible();
  await expect(loop.getByText(/A simple practice rule, not how any one company decides/)).toBeVisible();
  await expect(loop.getByRole('heading', { name: 'Practice next', level: 2 })).toBeVisible();
  const focus = loop.locator('.focus > li');
  await expect(focus).toHaveCount(3);
  await expect(focus.getByRole('link')).toHaveCount(3);
  expect((await focus.locator('.eyebrow').allTextContents()).filter((t) => t.includes('3 of 4'))).toEqual([]);
  await expect(loop.locator('.round')).toHaveCount(3);
  await expect(loop.getByRole('link', { name: 'Scorecard and transcript' })).toHaveCount(3);
  const event = ((await upload).postDataJSON() as { events: Record<string, unknown>[] }).events.find(
    (e) => e['type'] === 'mock.completed',
  )!;
  expect(event['id']).toMatch(/^mock-[0-9a-f-]{36}$/);
  const rounds = event['rounds'] as { track: string; at: string }[];
  expect(rounds.map((r) => r.track)).toEqual(['coding', 'system-design', 'behavioral']);
  expect(event['at']).toBe(rounds[2].at);
  expect(await seriousViolations(page)).toEqual([]);
  // REDESIGN.md 3.2: the debrief's prompts were the cramped Space Grotesk headings that Inter 600 replaces.
  expect(await typeFindings(page)).toEqual({ small: [], titles: [], display: [], labels: [] });

  await page.reload();
  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.grasp.events') ?? '[]'));
  expect((Array.isArray(events) ? events : events.events).filter((e: { type: string }) => e.type === 'mock.completed')).toHaveLength(1);

  await loop.getByRole('button', { name: 'Start a new loop' }).click();
  await expect(loop.getByRole('heading', { name: 'A mock interview loop', level: 1 })).toBeFocused();
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
    await route.fulfill({ response, json: { ...(await response.json()), aiAccess: 'available', aiRounds: { limit: 3, used: 1 } } });
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
  await page.goto('/mock/loop');
  const loop = page.locator('app-mock-loop');
  await loop.getByRole('button', { name: 'AI interviewer' }).click();
  await expect(loop.getByRole('button', { name: 'AI interviewer' })).toHaveAttribute('aria-pressed', 'true');
  await loop.getByRole('radio', { name: 'Senior' }).click();
  await expect(
    loop.getByText(
      /An AI loop is 3 AI interviews in a row\. It costs you nothing, but each round takes one of your AI rounds for the hour/,
    ),
  ).toBeVisible();
  await expect(loop.getByText(/The debrief itself makes no AI call\./)).toBeVisible();
  await expect(
    loop.getByText('You have 2 AI rounds left this hour and this loop has 3. The rest can switch to scripted when you reach them.'),
  ).toBeVisible();
  const completed = synced(page, 'mock.completed');
  await loop.getByRole('button', { name: 'Start the loop' }).click();

  for (const round of [1, 2, 3]) {
    await expect(page.getByText(`Mock loop · round ${round} of 3`)).toBeVisible();
    await page.getByRole('button', { name: 'End & score' }).click();
    await expect(page.getByText('Scorecard · AI interviewer')).toBeVisible();
    await page.getByRole('link', { name: round < 3 ? 'Back to your mock loop' : 'See your loop debrief' }).click();
    if (round < 3) await loop.getByRole('button', { name: /^Start the / }).click();
  }
  expect(created).toEqual([
    expect.objectContaining({ track: 'coding', mode: 'ai' }),
    expect.objectContaining({ track: 'system-design', mode: 'ai' }),
    expect.objectContaining({ track: 'behavioral', mode: 'ai', level: 'senior' }),
  ]);

  await completed;
  await expect(loop.getByRole('heading', { name: 'Loop debrief', level: 1 })).toBeVisible();
  await expect(loop.getByRole('heading', { name: 'lean no hire', level: 2 })).toBeVisible();
  await expect(loop.getByText('Practice read, not a hiring decision')).toBeVisible();
  await expect(loop.getByText('Your system design round was a no hire. Treat it as the first thing to fix.')).toBeVisible();
  await expect(loop.getByText(/rounds were scripted/)).toHaveCount(0);
  const focus = loop.locator('.focus > li');
  await expect(focus.locator('h3')).toHaveText(['Estimation', 'Follow-up handling', 'Problem understanding']);
  await expect(focus.locator('.eyebrow')).toHaveText(['System design · 1 of 4', 'Behavioral · 2 of 4', 'Coding · 3 of 4']);
  await expect(focus.getByRole('link', { name: 'Read the Estimation lesson' })).toHaveAttribute('href', '/design/topics/sd-estimation');
  await expect(focus.getByRole('link', { name: 'Reread how this round went' })).toHaveAttribute('href', /^\/mock\/[0-9a-f-]{36}$/);
  await expect(focus.getByRole('link', { name: /guide$/ })).toHaveAttribute('href', '/behavioral/conflict');
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/today/plan');
  const plan = page.locator('app-plan');
  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  await plan.getByRole('button', { name: 'Save plan' }).click();
  const today = plan.getByRole('region', { name: /^Today/ });
  for (const round of ['coding', 'system design', 'behavioral']) {
    await expect(today.getByRole('link', { name: `Done: Mock loop: ${round} round` })).toHaveAttribute('href', '/mock/loop');
  }
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the loop setup and a loop in progress pass axe, and a loop can be ended', async ({ page }) => {
      await page.goto('/mock/loop');
      const loop = page.locator('app-mock-loop');
      await expect(loop.getByRole('heading', { name: 'A mock interview loop', level: 1 })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await loop.getByRole('button', { name: 'Start the loop' }).click();
      await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
      await page.goto('/mock/loop');
      await expect(loop.getByRole('heading', { name: 'Round 1 of 3', level: 1 })).toBeFocused();
      await expect(loop.getByText(/^Mock loop · Scripted · started /)).toBeVisible();
      await expect(loop.getByRole('button', { name: 'Continue the coding round' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await loop.getByRole('button', { name: 'End this loop' }).click();
      await expect(loop.getByRole('button', { name: 'Yes, end it' })).toBeFocused();
      await expect(
        loop.getByText('End this loop? Rounds you finished keep their scorecards, but this loop gets no debrief.'),
      ).toBeVisible();
      await loop.getByRole('button', { name: 'Keep going' }).click();
      await expect(loop.getByRole('button', { name: 'End this loop' })).toBeFocused();
      await loop.getByRole('button', { name: 'End this loop' }).click();
      await loop.getByRole('button', { name: 'Yes, end it' }).click();
      await expect(loop.getByRole('heading', { name: 'A mock interview loop', level: 1 })).toBeFocused();
    });
  });
}

test.describe('a round whose session is gone', () => {
  test.use({ expectedConsoleErrors: [/status of 404/] });

  test('starts again, and says so', async ({ page }) => {
    await page.goto('/mock/loop');
    const loop = page.locator('app-mock-loop');
    await loop.getByRole('button', { name: 'Start the loop' }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.route(`**/api/interview/sessions/${id}`, (route) =>
      route.fulfill({ status: 404, json: { statusCode: 404, message: 'Interview not found' } }),
    );
    await page.goto('/mock/loop');
    await expect(loop.getByText("We couldn't find your coding round, so it starts again.")).toBeVisible();
    await expect(loop.getByRole('button', { name: 'Start the coding round' })).toBeVisible();
  });
});

test.describe('a refused AI start', () => {
  test.use({ expectedConsoleErrors: [/status of 403/] });

  test('offers to sign in again, or to switch the remaining rounds to scripted', async ({ page }) => {
    let refuse = true;
    const created: { mode: string }[] = [];
    await page.route('**/api/interview/problems', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), aiAccess: 'available' } });
    });
    await page.route('**/api/interview/sessions', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      created.push(route.request().postDataJSON());
      if (!refuse) return route.continue();
      return route.fulfill({
        status: 403,
        json: {
          statusCode: 403,
          message: 'Sign in to use the AI interviewer, or choose the scripted interviewer.',
          code: 'ai_sign_in_required',
        },
      });
    });
    await page.goto('/mock/loop');
    const loop = page.locator('app-mock-loop');
    await loop.getByRole('button', { name: 'AI interviewer' }).click();
    await loop.getByRole('button', { name: 'Start the loop' }).click();
    await expect(loop.getByRole('heading', { name: 'Round 1 of 3', level: 1 })).toBeVisible();
    await expect(loop.getByRole('alert')).toHaveText('Sign in to use the AI interviewer, or choose the scripted interviewer.');
    const panel = loop.getByRole('region', { name: 'Sign in again to keep your AI loop' });
    await expect(panel.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    refuse = false;
    await panel.getByRole('button', { name: 'Switch the remaining rounds to scripted' }).click();
    await expect(loop.getByRole('heading', { name: 'Round 1 of 3', level: 1 })).toBeFocused();
    await expect(loop.getByText(/^Mock loop · Scripted/)).toBeVisible();
    await loop.getByRole('button', { name: 'Start the coding round' }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
    expect(created.map((c) => c.mode)).toEqual(['ai', 'offline']);
  });
});

test.describe('signing in mid-loop', () => {
  // A signed-in page that loads pulls progress before its session renews, and the API answers 401 once (see LOOP.md).
  test.use({ expectedConsoleErrors: [/status of 401/] });

  test('signing in to an existing account mid-loop keeps the loop and its scored round', async ({ page, context }) => {
    const id = randomInt(1, 2 ** 47);
    const user: GitHubUser = { id, login: `e2e-${id}`, emails: [{ email: `e2e-${id}@example.com`, primary: true, verified: true }] };
    await signInToGitHub(context, user);
    const signIn = async () => {
      await page.goto('/today/settings');
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Continue with GitHub' }).click();
      const consent = await popup;
      const closed = consent.waitForEvent('close');
      await consent.getByRole('button', { name: 'Authorize' }).click();
      await closed;
      await expect(page.getByText(user.emails[0].email, { exact: true })).toBeVisible();
    };
    await signIn();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();

    await page.goto('/mock/loop');
    const loop = page.locator('app-mock-loop');
    await loop.getByRole('button', { name: 'Start the loop' }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
    await talkAndScore(page);
    await page.getByRole('link', { name: 'Back to your mock loop' }).click();
    await expect(loop.getByRole('heading', { name: 'Round 2 of 3', level: 1 })).toBeVisible();

    await signIn();
    await page.goto('/mock/loop');
    await expect(loop.getByRole('heading', { name: 'Round 2 of 3', level: 1 })).toBeVisible();
    await expect(loop.locator('.round').first()).toContainText(/Scored: /);
    await expect(loop.getByText(/We couldn't find/)).toHaveCount(0);
  });
});

test.describe('when the recent interviews cannot be read', () => {
  test.use({ expectedConsoleErrors: [/status of 500/] });

  test('the loop page still opens and starts a loop', async ({ page }) => {
    await page.route('**/api/interview/sessions', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 500, json: { statusCode: 500, message: 'Unavailable' } })
        : route.continue(),
    );
    await page.goto('/mock/loop');
    const loop = page.locator('app-mock-loop');
    await expect(loop.getByRole('heading', { name: 'A mock interview loop', level: 1 })).toBeVisible();
    await expect(loop.getByRole('alert')).toHaveCount(0);
    await loop.getByRole('button', { name: 'Start the loop' }).click();
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
  });
});
