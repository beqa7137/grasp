import type { StarDraft } from '@grasp/engine';
import { starText } from '../../src/interview/behavioral.prompts.js';
import { pickBehavioralProblem } from '../../src/interview/behavioral-problems.js';
import type { InterviewSession } from '../../src/interview/interview.types.js';

export const STRONG_STAR: StarDraft = {
  situation: 'Our checkout service timed out for one in fifty orders during the spring sale, and no team owned the payment client.',
  task: 'I was on the search team, but I took on stopping the timeouts before the next sale, two weeks out.',
  action:
    'I traced the slow calls to a retry loop in the client, I wrote up the fix and walked the payments lead through it, I capped the retries and added a circuit breaker, and I load tested it at twice the sale traffic before I shipped it behind a flag.',
  result: 'Timeouts fell from 2% to 0.1%, and the next sale took 40% more orders without a single page.',
  reflection: 'I learned to load test the client, not only the server, and I now ask who owns a shared library before a launch.',
};

/** A behavioral session on the first ownership question, opened with a STAR answer and followed by the given answers. */
export function behavioralSession(star: StarDraft = STRONG_STAR, followUps: string[] = [], interviewer: string[] = []): InterviewSession {
  const problem = pickBehavioralProblem('ownership-1')!;
  const messages: InterviewSession['messages'] = [
    { role: 'interviewer', content: problem.opening, at: '' },
    { role: 'candidate', content: starText(star), at: '', star },
  ];
  followUps.forEach((content, i) => {
    messages.push({ role: 'interviewer', content: interviewer[i] ?? `Follow-up ${i + 1}?`, at: '' });
    messages.push({ role: 'candidate', content, at: '' });
  });
  return {
    id: 'b1',
    learnerId: 'l1',
    track: 'behavioral',
    problem,
    messages,
    hintsUsed: 0,
    status: 'active',
    createdAt: '2026-09-30T00:00:00.000Z',
    mode: 'ai',
  };
}
