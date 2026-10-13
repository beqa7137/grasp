import { INTERVIEW_RUBRICS } from '@grasp/engine';
import { randomUUID } from 'node:crypto';
import { BASE, goto, settle } from '../lib.mjs';

const STORIES = [
  {
    id: 'a1',
    title: 'The billing export',
    competencyIds: ['ownership', 'delivery'],
    draft: {
      situation: 'Our nightly billing export failed silently for a week before finance noticed the gap.',
      task: 'Nobody owned the export, and I had the most context on the pipeline that fed it.',
      action:
        'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
      result: 'Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.',
      reflection: '',
    },
  },
  {
    id: 'a2',
    title: 'Pushing back on the launch date',
    competencyIds: ['conflict', 'tradeoffs', 'influence', 'customer'],
    draft: { situation: '', task: '', action: '', result: '', reflection: '' },
  },
];

const seedStories = async (p) => {
  await p.evaluate((stories) => localStorage.setItem('CapacitorStorage.grasp.behavioral.stories', JSON.stringify(stories)), STORIES);
  await p.reload();
  await p.getByRole('link', { name: /The billing export/ }).waitFor();
};

const FOLLOW_UPS = ['What did you do yourself?', 'How did you know it worked?', 'Where does the relationship stand now?'];

/**
 * Opens a behavioral interview whose AI interviewer is played here (no server needs a key): a STAR answer, up to three
 * follow-ups, then a scorecard with flaws and a flagged competency. A story tagged with the competency is on the device.
 */
async function openBehavioralInterview(p) {
  const id = randomUUID();
  const at = () => new Date().toISOString();
  let session = {
    id,
    track: 'behavioral',
    problem: { id: 'conflict-1', title: 'Conflict & Disagreement', track: 'behavioral', patternIds: [], competencyId: 'conflict' },
    messages: [{ role: 'interviewer', content: 'Tell me about a time you disagreed with a teammate on a technical decision.', at: at() }],
    hintsUsed: 0,
    status: 'active',
    createdAt: at(),
    mode: 'ai',
    aiAccess: 'available',
  };
  await p.route(`**/api/interview/sessions/${id}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/messages')) {
      const body = route.request().postDataJSON();
      const turns = session.messages.filter((m) => m.role === 'candidate').length;
      const reply = {
        role: 'interviewer',
        content: FOLLOW_UPS[turns] ?? 'Thanks, that gives me what I need. Press End & score when you are ready.',
        at: at(),
      };
      const candidate = body.star
        ? { role: 'candidate', content: '[STAR ANSWER]', at: at(), star: body.star }
        : { role: 'candidate', content: body.content, at: at() };
      session = { ...session, messages: [...session.messages, candidate, reply] };
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ message: reply })}\n\n`,
      });
    }
    if (path.endsWith('/score')) {
      session = {
        ...session,
        status: 'scored',
        scoredAt: at(),
        scorecard: {
          verdict: 'lean-no-hire',
          summary: 'Say what you did yourself, and what changed because of it.',
          dimensions: ['Competency fit', 'Ownership & specificity', 'Impact & results', 'Judgment & reflection', 'Follow-up handling'].map(
            (name, i) => ({ name, score: 1 + (i % 4), evidence: 'The answer says "we" for most steps.' }),
          ),
          strengths: ['Brought data to the disagreement.'],
          improvements: ['Say "I" for the steps you took.'],
          weakPatterns: [],
          mode: 'ai',
          flaws: [
            {
              id: 'we-not-i',
              quote: 'We agreed to slip the date',
              fix: 'I proposed slipping the date by one week, and I showed product the [number] failed retries.',
            },
            { id: 'no-result', quote: null, fix: 'It cut double charges from [number] to zero.' },
          ],
          weakCompetencies: ['conflict', 'ownership'],
        },
      };
    }
    return route.fulfill({ json: session });
  });
  await p.evaluate(
    (stories) => localStorage.setItem('CapacitorStorage.grasp.behavioral.stories', JSON.stringify(stories)),
    [{ ...STORIES[1], id: 'a3', title: 'The launch date', draft: { ...STORIES[0].draft } }],
  );
  await goto(p, `/mock/${id}`);
}

async function giveBehavioralAnswer(p) {
  await p.getByRole('button', { name: 'The launch date' }).click();
  await p.getByRole('button', { name: 'Give answer' }).click();
  await p.getByText(FOLLOW_UPS[0], { exact: true }).waitFor();
  await settle(p, 400);
}

/** Mock's Recent list, from two past sessions: one scored, one still in progress. */
async function showRecent(p) {
  const session = (id, problemId, title, createdAt, scorecard) => ({
    id,
    track: 'coding',
    problem: { id: problemId, title, track: 'coding', patternIds: [] },
    messages: [],
    hintsUsed: 0,
    status: scorecard ? 'scored' : 'active',
    createdAt,
    mode: 'offline',
    ...(scorecard && { scorecard }),
  });
  const sessions = [
    session('a7d1c0de-0000-4000-8000-000000000001', 'two-sum', 'Two Sum', '2026-09-14T15:30:00', { verdict: 'lean-hire' }),
    session('a7d1c0de-0000-4000-8000-000000000002', 'valid-parentheses', 'Valid Parentheses', '2026-09-12T09:05:00'),
  ];
  await p.route('**/api/interview/sessions', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: sessions }) : route.continue(),
  );
  await goto(p, '/mock');
  await p.getByRole('heading', { name: 'Recent' }).scrollIntoViewIfNeeded();
  await settle(p);
}

/** Each round of the seeded mock loop: how it scored and when, in minutes before now. */
const LOOP_ROUNDS = [
  { track: 'coding', verdict: 'hire', scores: [3, 3, 4, 3, 3], scoredAgo: 50 },
  { track: 'system-design', verdict: 'lean-no-hire', scores: [2, 1, 2, 3, 2], scoredAgo: 25 },
  { track: 'behavioral', verdict: 'lean-hire', scores: [3, 2, 3, 3, 3], scoredAgo: 5 },
];

/**
 * A scripted mock loop on the device with its first `scored` rounds scored. Their sessions are played here, so the
 * state needs no AI and writes nothing; ids are fixed so captures stay comparable.
 */
async function seedLoop(p, scored) {
  const { problems } = await (await p.request.get(`${BASE}/api/interview/problems`)).json();
  const now = await p.evaluate(() => Date.now());
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const rounds = LOOP_ROUNDS.map(({ track, verdict, scores, scoredAgo }, i) => {
    const problem = problems.find((x) => x.track === track);
    const sessionId = i < scored ? `00000000-0000-4000-8000-00000001000${i + 1}` : null;
    return { track, problem, sessionId, verdict, scores, scoredAgo };
  });
  for (const { track, problem, sessionId, verdict, scores, scoredAgo } of rounds.filter((r) => r.sessionId)) {
    const session = {
      id: sessionId,
      track,
      problem,
      messages: [{ role: 'interviewer', content: `Let's start with ${problem.title}.`, at: ago(scoredAgo + 20) }],
      hintsUsed: 0,
      status: 'scored',
      createdAt: ago(scoredAgo + 20),
      scoredAt: ago(scoredAgo),
      mode: 'offline',
      aiAccess: 'unavailable',
      scorecard: {
        verdict,
        summary: 'Covered most rubric areas; name the trade-offs out loud.',
        dimensions: INTERVIEW_RUBRICS[track].map(({ name }, d) => ({
          name,
          score: scores[d],
          evidence: 'Named it once, without an example.',
        })),
        strengths: ['Asked about the constraints first.'],
        improvements: ['Say why before how.'],
        weakPatterns: [],
        mode: 'offline',
      },
    };
    await p.route(`**/api/interview/sessions/${sessionId}**`, (route) => route.fulfill({ json: session }));
  }
  const learnerId = await p.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId'));
  const loop = {
    id: '00000000-0000-4000-8000-000000020000',
    mode: 'offline',
    level: 'mid',
    createdAt: ago(80),
    rounds: rounds.map(({ track, problem, sessionId }) => ({
      track,
      problemId: track === 'behavioral' ? problem.competencyId : problem.id,
      reason: 'any',
      sessionId,
    })),
    completedAt: scored === rounds.length ? ago(rounds.at(-1).scoredAgo) : null,
  };
  await p.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [`CapacitorStorage.grasp.interview.loop.${learnerId}`, JSON.stringify(loop)],
  );
  await p.reload();
}

/** Mock interviews and the behavioral area. */
export function interviewStates() {
  return [
    { id: 'mock', path: '/mock' },
    { id: 'mock-recent', path: '/mock', setup: showRecent },
    { id: 'mock-behavioral', path: '/mock', setup: (p) => p.getByRole('button', { name: /^Behavioral/ }).click() },
    { id: 'interview-behavioral-answer', path: '/mock', setup: openBehavioralInterview },
    { id: 'mock-loop-setup', path: '/mock/loop' },
    {
      id: 'mock-loop-running',
      path: '/mock/loop',
      setup: async (p) => {
        await seedLoop(p, 1);
        await p.getByRole('heading', { name: 'Round 2 of 3' }).waitFor();
        await settle(p);
      },
    },
    {
      id: 'mock-loop-debrief',
      path: '/mock/loop',
      setup: async (p) => {
        await seedLoop(p, 3);
        await p.getByRole('heading', { name: 'Loop debrief' }).waitFor();
        await settle(p);
      },
    },
    {
      id: 'interview-behavioral-follow-up',
      path: '/mock',
      setup: async (p) => {
        await openBehavioralInterview(p);
        await giveBehavioralAnswer(p);
        await p.getByText('Your answer', { exact: true }).click();
      },
    },
    {
      id: 'interview-behavioral-scorecard',
      path: '/mock',
      setup: async (p) => {
        await openBehavioralInterview(p);
        await giveBehavioralAnswer(p);
        const composer = p.getByRole('textbox', { name: 'Your follow-up answer' });
        const replies = [FOLLOW_UPS[1], FOLLOW_UPS[2], 'Thanks, that gives me what I need. Press End & score when you are ready.'];
        for (const [i, answer] of [
          'I ran the load test myself.',
          'Double charges stayed at zero.',
          'We still pair on payment changes.',
        ].entries()) {
          await composer.fill(answer);
          await p.getByRole('button', { name: 'Send', exact: true }).click();
          await p.getByText(replies[i], { exact: true }).waitFor();
        }
        await p.getByRole('button', { name: 'End & score' }).click();
        await p.getByRole('heading', { name: 'What to fix' }).waitFor();
        await settle(p, 400);
      },
    },
    { id: 'behavioral-competencies', path: '/behavioral' },
    { id: 'behavioral-competency', path: '/behavioral/conflict' },
    { id: 'behavioral-competency-new', path: '/behavioral/feedback' },
    {
      id: 'behavioral-examples-checked',
      path: '/behavioral/conflict',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Show why it works' }).click();
        const exercise = p.locator('app-spot-flaws').first();
        await exercise.getByRole('checkbox', { name: 'Blames others' }).check();
        await exercise.getByRole('checkbox', { name: 'No measurable result' }).check();
        await exercise.getByRole('button', { name: 'Check' }).click();
      },
    },
    { id: 'behavioral-question', path: '/behavioral/question/conflict-1' },
    {
      id: 'behavioral-question-drafted',
      path: '/behavioral/question/ownership-1',
      setup: async (p) => {
        const fields = p.locator('app-star-practice textarea');
        await fields.nth(0).fill('Our nightly billing export failed silently for a week before finance noticed the gap.');
        await fields.nth(1).fill('Nobody owned the export, and I had the most context on the pipeline that fed it.');
        await fields
          .nth(2)
          .fill(
            'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
          );
        await fields.nth(3).fill('Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.');
      },
    },
    { id: 'behavioral-stories-empty', path: '/behavioral/stories' },
    { id: 'behavioral-stories', path: '/behavioral/stories', setup: seedStories },
    {
      id: 'behavioral-story',
      path: '/behavioral/stories',
      setup: async (p) => {
        await seedStories(p);
        await p.getByRole('link', { name: /The billing export/ }).click();
        await p.getByLabel('Title').waitFor();
      },
    },
    {
      id: 'behavioral-rehearse',
      path: '/behavioral/stories',
      setup: async (p) => {
        await seedStories(p);
        await p.getByRole('link', { name: 'Rehearse 1 due' }).click();
        await p.getByText('Peek at your story').click();
      },
    },
    { id: 'behavioral-rehearse-none', path: '/behavioral/rehearse' },
    { id: 'behavioral-drill', path: '/behavioral/drill' },
    {
      id: 'behavioral-drill-debrief',
      path: '/behavioral/drill',
      setup: async (p) => {
        const mock = p.locator('app-behavioral-mock');
        const next = mock.getByRole('button', { name: /^(Answer|Finish and see the debrief)$/ });
        for (let question = 0; question < 3; question++) {
          const draft = STORIES[0].draft;
          for (const [part, text] of Object.entries(draft))
            if (text) await mock.getByLabel(part[0].toUpperCase() + part.slice(1), { exact: true }).fill(text);
          await next.click();
          await mock.getByLabel('Your answer').fill('I would ask the data team to own it sooner, because an unowned job fails silently.');
          await next.click();
          await mock.getByLabel('Your answer').fill('Not sure.');
          await next.click();
        }
        await mock.getByRole('heading', { name: 'Debrief' }).waitFor();
      },
    },
  ];
}
