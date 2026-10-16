import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, expectSectionLit, openStartSheet, startMockRound, synced, test } from './fixtures';

const DAY_MS = 86_400_000;
const STORY_DRAFT = {
  situation: 'Two weeks before launch, QA found the payment retries could double charge.',
  task: 'I owned the payment client, and product wanted to keep the date.',
  action: 'We agreed to slip the date after I showed the failure rate from the load test and proposed a one-week fix plan.',
  result: 'We launched a week late with no double charges in the first quarter.',
  reflection: 'I would bring the data to the first meeting, not the second.',
};
const OPENING = 'Tell me about a time you disagreed with a teammate on a technical decision. Take a moment, then answer in STAR form.';
const FOLLOW_UPS = ['What did you do yourself?', 'How did you know the fix worked?', 'Where does the relationship stand now?'];
const CLOSING = 'Thanks, that gives me what I need. Press End & score when you are ready.';
const QUOTE = 'We agreed to slip the date';
const FIX = 'I proposed slipping the date by one week, and I showed product the [number] failed retries.';

/**
 * A story told once just now, so it is next due tomorrow unless an interview flags its competency. Seeded before the
 * first page loads: WebKit reports the imports and requests a page abandoned mid-load had in flight.
 */
async function seedToldStory(page: Page) {
  await page.addInitScript(
    ({ draft, due }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'CapacitorStorage.grasp.behavioral.stories',
        JSON.stringify([
          {
            id: 'launch',
            title: 'The launch date',
            competencyIds: ['conflict'],
            draft,
            updatedAt: new Date().toISOString(),
            rehearsal: { step: 0, told: 1, due },
          },
        ]),
      );
    },
    { draft: STORY_DRAFT, due: new Date(Date.now() + DAY_MS).toISOString() },
  );
}

/** Opens `path` once the current page has finished loading, so WebKit does not report the requests it would abandon. */
async function settledGoto(page: Page, path: string) {
  await page.waitForLoadState('networkidle');
  await page.goto(path);
}

const message = (role: 'interviewer' | 'candidate', content: string) => ({ role, content, at: new Date().toISOString() });

/**
 * Stands in for the AI interviewer, which the e2e server has no key for: the catalog reports AI as available, and the
 * session, its replies and its score come from here. Progress still syncs to the real API.
 */
async function fakeAiInterviewer(page: Page, { failFirstAnswer = false } = {}) {
  let failing = failFirstAnswer;
  const id = randomUUID();
  const sent: unknown[] = [];
  let session: Record<string, unknown> & { messages: ReturnType<typeof message>[] } = {
    id,
    track: 'behavioral',
    problem: { id: 'conflict-1', title: 'Conflict & Disagreement', track: 'behavioral', patternIds: [], competencyId: 'conflict' },
    messages: [message('interviewer', OPENING)],
    hintsUsed: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    mode: 'ai',
    aiAccess: 'available',
  };
  await page.route('**/api/interview/problems', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), aiAccess: 'available', aiRounds: { limit: 3, used: 1 } } });
  });
  await page.route('**/api/interview/sessions**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/interview/sessions') {
      if (request.method() !== 'POST') return route.continue();
      sent.push(request.postDataJSON());
      return route.fulfill({ json: session });
    }
    if (path === `/api/interview/sessions/${id}`) return route.fulfill({ json: session });
    if (path.endsWith('/messages')) {
      const body = request.postDataJSON() as { star?: typeof STORY_DRAFT; content?: string };
      sent.push(body);
      if (failing) {
        failing = false;
        return route.fulfill({ status: 500, json: { message: 'The interviewer did not respond. Try again.' } });
      }
      const turns = session.messages.filter((m) => m.role === 'candidate').length;
      const reply = message('interviewer', turns < FOLLOW_UPS.length ? FOLLOW_UPS[turns] : CLOSING);
      const candidate = body.star
        ? { ...message('candidate', '[STAR ANSWER]'), star: body.star }
        : message('candidate', body.content ?? '');
      session = { ...session, messages: [...session.messages, candidate, reply] };
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: delta\ndata: ${JSON.stringify({ text: reply.content })}\n\nevent: done\ndata: ${JSON.stringify({ message: reply })}\n\n`,
      });
    }
    if (path.endsWith('/score')) {
      session = {
        ...session,
        status: 'scored',
        scoredAt: new Date().toISOString(),
        scorecard: {
          verdict: 'lean-no-hire',
          summary: 'Say what you did yourself, and what changed because of it.',
          dimensions: ['Competency fit', 'Ownership & specificity', 'Impact & results', 'Judgment & reflection', 'Follow-up handling'].map(
            (name) => ({ name, score: 2, evidence: 'Partial.' }),
          ),
          strengths: ['Brought data to the disagreement.'],
          improvements: ['Say "I" for the steps you took.'],
          weakPatterns: [],
          mode: 'ai',
          flaws: [
            { id: 'we-not-i', quote: QUOTE, fix: FIX },
            { id: 'no-result', quote: null, fix: 'It cut double charges from [number] to zero.' },
          ],
          weakCompetencies: ['conflict'],
        },
      };
      return route.fulfill({ json: session });
    }
    return route.continue();
  });
  return { id, sent };
}

test('the Behavioral start sheet picks a competency from the 13, at the level of the Target', async ({ page }) => {
  await page.goto('/mock');
  const sheet = await openStartSheet(page, 'Behavioral');
  const choices = sheet.locator('fieldset label');
  await expect(choices).toHaveCount(14);
  await expect(choices.first()).toHaveText('Surprise me');
  await expect(choices.nth(1)).toContainText('Ownership');
  await expect(sheet.getByText('One of its 7 questions, picked at random, scored at the Mid-level bar from your loop.')).toBeVisible();
  await expect(sheet.getByRole('link', { name: /drill/i })).toHaveCount(0);
});

test('a scripted behavioral single round is an API session: it records interview.scored with a verdict, with Mock lit throughout', async ({
  page,
}) => {
  await page.goto('/mock');
  await expectSectionLit(page, 'Mock');
  const created = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/interview/sessions');
  await startMockRound(page, 'Behavioral', /^Conflict & Disagreement/);
  expect((await created).postDataJSON()).toEqual({ track: 'behavioral', problemId: 'conflict', mode: 'offline', level: 'mid' });
  await expect(page).not.toHaveURL(/drill/);
  await expectSectionLit(page, 'Mock');
  const session = page.locator('app-interview-session');
  await expect(session.locator('.meta')).toContainText('Scripted');
  for (const [part, text] of Object.entries({ Situation: STORY_DRAFT.situation, Action: STORY_DRAFT.action, Result: STORY_DRAFT.result })) {
    await session.getByLabel(part, { exact: true }).fill(text);
  }
  await session.getByRole('button', { name: 'Give answer' }).click();
  const composer = page.getByRole('textbox', { name: 'Your follow-up answer' });
  for (let i = 0; i < 3; i++) {
    await expect(composer).toBeEditable({ timeout: 30_000 });
    await composer.fill('I wrote the retry fix myself and checked the failure dashboards every morning for two weeks after.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  }
  await expect(session.getByText(CLOSING, { exact: true })).toBeVisible({ timeout: 30_000 });
  const scored = synced(page, 'interview.scored');
  const upload = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/progress/events'));
  await page.getByRole('button', { name: 'End & score' }).click();
  await expect(page.getByText('Scorecard · Scripted: rubric checks')).toBeVisible({ timeout: 60_000 });
  const verdict = await session.locator('.scorecard .verdict').textContent();
  expect(verdict?.trim()).toMatch(/^(no|lean no|lean|strong)? ?hire$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const event = ((await upload).postDataJSON() as { events: Record<string, unknown>[] }).events.find(
    (e) => e['type'] === 'interview.scored',
  );
  expect(event).toMatchObject({ id: `interview-${id}`, track: 'behavioral', competencyId: 'conflict', weakPatterns: [] });
  expect(String(event!['verdict'])).toMatch(/^(no-hire|lean-no-hire|lean-hire|hire|strong-hire)$/);
  await scored;
  await expectSectionLit(page, 'Mock');
  await expect(session.getByRole('link', { name: /drill/i })).toHaveCount(0);

  await page.waitForLoadState('networkidle');
  await page.goto('/mock');
  await expectSectionLit(page, 'Mock');
  const behavioral = page.locator('app-interview-home .round').filter({ has: page.getByRole('heading', { name: 'Behavioral round' }) });
  await expect(behavioral).toContainText(/Last round: (No hire|Lean no hire|Lean hire|Hire|Strong hire), /);
  await expect(page.locator('app-interview-home h3.group')).toHaveText(['Behavioral']);
});

test('no route from Mock reaches the client-only STAR drill', async ({ page }) => {
  await page.goto('/mock');
  const hub = page.locator('app-interview-home');
  await expect(hub.locator('.round')).toHaveCount(3);
  const hrefs = await hub.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href')!));
  expect(hrefs.filter((h) => h.includes('drill'))).toEqual([]);
  for (const round of ['Coding', 'System design', 'Behavioral'] as const) {
    const sheet = await openStartSheet(page, round);
    expect(await sheet.locator('a[href*="drill"]').count()).toBe(0);
    await sheet.getByRole('button', { name: 'Close' }).click();
  }
  await page.goto('/mock/loop');
  await expect(page.locator('app-mock-loop a[href*="drill"]')).toHaveCount(0);
});

test.describe('the AI interviewer entry on a question', () => {
  test.use({ expectedConsoleErrors: [/status of 503/] });

  test('offers a scripted round with a verdict when the AI interviewer is unavailable', async ({ page }) => {
    await page.goto('/behavioral/question/conflict-1');
    await page.getByRole('button', { name: 'Practice with the AI interviewer' }).click();
    await expect(page.getByRole('alert')).toContainText('unavailable');
    const created = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/interview/sessions');
    await page.getByRole('button', { name: 'Practice it with scripted follow-ups instead' }).click();
    expect((await created).postDataJSON()).toEqual({ track: 'behavioral', problemId: 'conflict-1', mode: 'offline', level: 'mid' });
    await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
    await expect(page.locator('app-interview-session').getByText(OPENING, { exact: true })).toBeVisible();
  });
});

test('an AI behavioral interview starts from a story, takes three follow-ups, and flags the competency for rehearsal', async ({ page }) => {
  await seedToldStory(page);
  await page.goto('/behavioral/stories');
  await expect(page.getByRole('link', { name: /The launch date/ })).toContainText('Rehearse tomorrow');
  const { id, sent } = await fakeAiInterviewer(page);

  await settledGoto(page, '/mock');
  const sheet = await openStartSheet(page, 'Behavioral');
  await sheet.getByRole('radio', { name: 'AI interviewer' }).click();
  await expect(sheet.getByText('AI rounds left this hour: 2 of 3')).toBeVisible();
  await expect(sheet.getByText('Your answers, including any story you start from, are sent to the AI service.')).toBeVisible();
  await sheet.getByRole('radio', { name: /^Conflict & Disagreement/ }).check();
  await sheet.getByRole('button', { name: 'Start round' }).click();
  await expect(page).toHaveURL(new RegExp(`/mock/${id}$`));
  expect(sent[0]).toEqual({ track: 'behavioral', problemId: 'conflict', mode: 'ai', level: 'mid' });

  const session = page.locator('app-interview-session');
  await expect(session.getByText(OPENING, { exact: true })).toBeVisible();
  await expect(session.getByText('Your answers, including any story you start from, are sent to the AI service.')).toBeVisible();
  await expect(session.getByText(/shared code/)).toHaveCount(0);
  await expect(session.getByRole('button', { name: 'Hint' })).toHaveCount(0);
  await expect(session.getByRole('button', { name: 'Code', exact: true })).toHaveCount(0);
  await session.getByRole('button', { name: 'The launch date' }).click();
  await expect(session.getByLabel('Situation', { exact: true })).toHaveValue(STORY_DRAFT.situation);
  await expect(session.getByRole('button', { name: 'The launch date' })).toHaveCount(0);
  expect(sent).toHaveLength(1);
  await session.getByRole('button', { name: 'Give answer' }).click();
  expect(sent[1]).toEqual({ star: STORY_DRAFT });

  await expect(session.getByText(FOLLOW_UPS[0], { exact: true })).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Your follow-up answer' });
  await expect(composer, 'the composer takes focus from the answer form it replaces').toBeFocused();
  await session.getByText('Your answer', { exact: true }).click();
  await expect(session.locator('app-star-answer dt')).toHaveText(['Situation', 'Task', 'Action', 'Result', 'Reflection']);
  await expect(session.locator('app-star-answer')).toContainText(STORY_DRAFT.action);

  await expect(composer).toHaveAttribute('placeholder', 'Two or three specific sentences');
  const answers = [
    'I ran the load test myself and wrote the one-week plan.',
    'Double charges stayed at zero for the quarter.',
    'We still pair on payment changes.',
  ];
  for (const [i, answer] of answers.entries()) {
    await expect(page.getByText(`Follow-up ${i + 1} of up to 3`)).toBeVisible();
    await composer.fill(answer);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(session.getByText(i < 2 ? FOLLOW_UPS[i + 1] : CLOSING, { exact: true })).toBeVisible();
  }
  expect(sent.slice(2)).toEqual(answers.map((content) => ({ content, hint: false })));
  await expect(composer).toBeDisabled();
  const end = page.getByRole('button', { name: 'End & score' });
  await expect(end).toHaveClass(/primary/);
  await expect(end, 'focus moves to End & score once the composer closes').toBeFocused();

  const scored = synced(page, 'interview.scored');
  const upload = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/progress/events'));
  await end.click();
  const card = session.locator('.scorecard');
  await expect(card.getByRole('heading', { name: 'What to fix' })).toBeVisible();
  await expect(card.getByText('Says "we", so what the candidate did is unclear')).toBeVisible();
  await expect(card.locator('blockquote')).toHaveText(QUOTE);
  await expect(card.getByText(`Say it like this: ${FIX}`)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Add to story bank' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Practice this question' })).toHaveAttribute('href', '/behavioral/question/conflict-1');

  const events = (await upload).postDataJSON() as { events: Record<string, unknown>[] };
  expect(events.events.find((e) => e['type'] === 'interview.scored')).toMatchObject({
    id: `interview-${id}`,
    track: 'behavioral',
    weakPatterns: [],
    competencyId: 'conflict',
    weakCompetencies: ['conflict'],
  });
  await scored;
  const learnerId = await page.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId')!);
  const stored = await page.request.get('/api/progress/events', { headers: { 'x-learner-id': learnerId } });
  expect(((await stored.json()) as { events: Record<string, unknown>[] }).events.find((e) => e['id'] === `interview-${id}`)).toMatchObject({
    competencyId: 'conflict',
    weakCompetencies: ['conflict'],
  });

  const due = card.getByRole('link', { name: '1 story that covers it is due for rehearsal now' });
  await expect(card.getByText('Conflict & Disagreement is flagged:')).toBeVisible();
  await due.click();
  await expect(page).toHaveURL(/\/behavioral\/rehearse$/);
  await expect(page.getByText('Story 1 of 1 · Conflict & Disagreement')).toBeVisible();

  await settledGoto(page, '/behavioral');
  await expect(page.getByRole('link', { name: /Conflict & Disagreement/ })).toContainText('Flagged');
  await expect(page.getByRole('link', { name: /^Rehearse 1 story/ })).toHaveAttribute('href', '/behavioral/rehearse');
  await settledGoto(page, '/behavioral/stories');
  await expect(page.getByRole('link', { name: /The launch date/ })).toContainText('Rehearse now');
});

test.describe('an answer the interviewer could not take', () => {
  test.use({ expectedConsoleErrors: [/status of 500/] });

  test('comes back with focus on Give answer, and can be given again', async ({ page }) => {
    const { id, sent } = await fakeAiInterviewer(page, { failFirstAnswer: true });
    await page.goto(`/mock/${id}`);
    const session = page.locator('app-interview-session');
    for (const [part, text] of Object.entries({ Situation: STORY_DRAFT.situation, Action: STORY_DRAFT.action })) {
      await session.getByLabel(part, { exact: true }).fill(text);
    }
    const give = session.getByRole('button', { name: 'Give answer' });
    await give.click();
    await expect(page.getByRole('alert')).toContainText('did not respond');
    await expect(give).toBeFocused();
    await expect(session.getByLabel('Action', { exact: true })).toHaveValue(STORY_DRAFT.action);
    await give.click();
    await expect(session.getByText(FOLLOW_UPS[0], { exact: true })).toBeVisible();
    expect(sent).toHaveLength(2);
  });
});
