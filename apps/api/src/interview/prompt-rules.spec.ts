import { behavioralSession, STRONG_STAR } from '../../test/support/behavioral-session.js';
import { behavioralInterviewerPrompt, behavioralScorerPrompt } from './behavioral.prompts.js';
import type { InterviewSession, InterviewTrack } from './interview.types.js';
import { PROBLEMS } from './problems.js';
import { interviewerSystemPrompt, scorerSystemPrompt } from './prompts.js';

function session(track: InterviewTrack, said: string[] = []): InterviewSession {
  const problem = PROBLEMS.find((p) => p.track === track)!;
  return {
    id: 's1',
    learnerId: 'l1',
    track,
    problem,
    hintsUsed: 0,
    status: 'active',
    createdAt: '2026-09-30T00:00:00.000Z',
    messages: [
      { role: 'interviewer', content: problem.opening, at: '' },
      ...said.map((content) => ({ role: 'candidate' as const, content, at: '' })),
    ],
  };
}

/** Rules every model broke in blind grading, whatever model runs the interview. */
describe('interviewer and scorer prompt rules', () => {
  const interviewers = [
    ['coding', interviewerSystemPrompt(session('coding'))],
    ['system design', interviewerSystemPrompt(session('system-design'))],
    ['behavioral', behavioralInterviewerPrompt(behavioralSession())],
  ];
  const scorers = [
    ['coding', scorerSystemPrompt(session('coding'))],
    ['behavioral', behavioralScorerPrompt(behavioralSession())],
  ];

  it.each(interviewers)('the %s interviewer asks exactly one question and gives nothing away', (_track, prompt) => {
    expect(prompt).toMatch(/[Ee]xactly one question[^.]*: never two, and never a question with a second part/);
    expect(prompt).toContain('not even to say you cannot share them');
    expect(prompt).toMatch(/[Nn]o praise/);
    expect(prompt).toMatch(/never (confirm that an answer or a number is right|supply numbers or answers)/);
    expect(prompt).toMatch(/Plain text only: no markdown[^.]*and no em dashes/);
  });

  it.each(scorers)('the %s scorer writes plain text that never names the hidden material', (_track, prompt) => {
    expect(prompt).toMatch(
      /Write every field in plain text for the candidate: no markdown or em dashes\. Never mention the reference notes/,
    );
  });

  it.each([
    ['coding', interviewerSystemPrompt, session('coding'), session('coding', ['A stack.', 'O(n).'])],
    ['behavioral', behavioralInterviewerPrompt, behavioralSession(), behavioralSession(STRONG_STAR, ['I told the lead first.'])],
  ] as const)('keeps the %s system prompt byte-identical across turns', (_track, prompt, opening, later) => {
    expect(prompt(later)).toBe(prompt(opening));
  });
});
