import type { Competency } from '../types.js';
import { questions } from './question.js';

export const FAILURE: Competency = {
  id: 'failure',
  why: 'This tests self-awareness and whether you learn from mistakes. Committees want a real mistake with a real cost, clearly owned; the higher the level, the bigger the stakes and the more systemic the fix.',
  strongSignals: [
    'Picks a genuine mistake that was their own, not a disguised strength.',
    'States the cost plainly: downtime, lost users, wasted weeks or a missed launch.',
    'Explains the reasoning that led to the mistake, not just what happened.',
    'Describes a change to how they work, and a later time it helped.',
    'Fixed the process or the system, not just the one instance.',
  ],
  redFlags: [
    'Offers a humblebrag, such as working too hard or caring too much.',
    'Blames circumstances, other teams or unclear requirements for the whole outcome.',
    'Chooses a failure with no real consequences.',
    'Gives a vague lesson, like "communicate more", with no specific change.',
    'Gets defensive or evasive when asked about their own part.',
  ],
  questions: questions('failure', [
    [
      'Tell me about a time you failed.',
      'Whether you own a real mistake and can say concretely what you changed.',
      ['What was your part in it, specifically?', 'How did you find out it had gone wrong?', 'When did the lesson help you later?'],
    ],
    [
      'Describe a production incident you caused. What happened next?',
      'How you respond under pressure, and whether you fix the system that let the mistake through.',
      [
        'How long did it take to mitigate, and how?',
        'What did the review find as the root cause?',
        'What guardrail exists now that did not before?',
      ],
    ],
    [
      'Tell me about a decision you made that turned out to be wrong.',
      'Whether you can separate a bad outcome from a bad decision, and learn from the reasoning.',
      ['With what you knew then, was it still a reasonable call?', 'When did you realize it was wrong?', 'How did you unwind it?'],
    ],
    [
      'Tell me about a project you worked on that got canceled or never shipped.',
      'Whether you can reflect on wasted effort without bitterness and take something from it.',
      [
        'Could you have seen the cancellation coming earlier?',
        'What from that work was reused?',
        'How did you keep the team motivated at the end?',
      ],
    ],
    [
      'What is a piece of critical feedback you received, and what did you do with it?',
      'Whether you are coachable and act on feedback rather than defend against it.',
      ['How did you react when you first heard it?', 'What did you change, specifically?', 'How did you check that the change stuck?'],
    ],
    [
      'Tell me about a time you missed something important in a code review or design review.',
      'Whether you take shared responsibility for what gets through review, not just your own code.',
      ['Why do you think you missed it?', 'What did it cost once it shipped?', 'How do you review differently now?'],
    ],
    [
      'What is the biggest technical mistake you have made?',
      'Whether you can own a costly technical call and say what changed because of it.',
      ['What was your reasoning at the time?', 'How much did it cost?', 'What exists now so no one repeats it?'],
    ],
  ]),
};
