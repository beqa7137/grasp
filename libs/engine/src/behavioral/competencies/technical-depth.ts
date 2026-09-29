import type { Competency } from '../types.js';
import { questions } from './question.js';

export const TECHNICAL_DEPTH: Competency = {
  id: 'technical-depth',
  why: 'This checks that you understand the systems you worked on, down to the details. Interviewers dig until you run out of answers; a senior answer holds up several levels deep and says why the obvious fix failed.',
  strongSignals: [
    'Explains the problem precisely enough that a stranger could reproduce it.',
    'Walks through the hypotheses they ruled out and the evidence for each.',
    'Goes several levels deeper on any part when asked, without hand-waving.',
    'Explains why the obvious solution would not have worked.',
    'Quantifies the result: latency, error rate, cost or throughput before and after.',
  ],
  redFlags: [
    'Stays at the level of buzzwords and falls apart under follow-up questions.',
    'Describes a system the team built but cannot explain their own part in it.',
    'Cannot say what alternatives were considered.',
    'Claims a result without any measurement.',
    'Picks a story whose scope is below the level they are interviewing for.',
  ],
  questions: questions('technical-depth', [
    [
      'Tell me about the most technically challenging problem you have worked on.',
      'Whether the depth is real, and where your understanding stops.',
      [
        'Why was the obvious approach not enough?',
        'Which part was hardest to get right?',
        'If you rebuilt it today, what would you change?',
      ],
    ],
    [
      'Walk me through a hard bug you tracked down.',
      'Whether you debug methodically with hypotheses and evidence rather than luck.',
      [
        'What was your first hypothesis, and how did you rule it out?',
        'What tool or signal finally cracked it?',
        'What did you add so the next person finds it faster?',
      ],
    ],
    [
      'Describe a time you improved the performance of a system. What was the bottleneck?',
      'Whether you measure before optimizing and understand why the fix worked.',
      ['How did you find the bottleneck?', 'What were the numbers before and after?', 'What became the next bottleneck?'],
    ],
    [
      'Tell me about a design you proposed that was rejected or significantly changed in review.',
      'Whether you can take technical criticism and understand the flaws others found.',
      ['What was the main objection?', 'Did you agree with it at the time?', 'How did the final design differ from yours?'],
    ],
    [
      'Tell me about a time you had to go below an abstraction, like a library, the database or the network, to solve a problem.',
      'Whether you can go a layer deeper than your usual tools when a problem demands it.',
      ['What did you read or instrument to see inside it?', 'What was the abstraction hiding?', 'Was there a shortcut you missed?'],
    ],
    [
      'Tell me about a system you owned that hit its limits. What broke first?',
      'Whether you understand where your own system breaks, and what hitting its limits taught you.',
      [
        'How did you find out it was breaking?',
        'What did you change, and what did you choose not to change?',
        'What would you design differently from day one?',
      ],
    ],
    [
      'Tell me about a time you made a service more reliable. Where did you start?',
      'Whether you improve reliability from failure data, not guesses, and can prove the gain.',
      [
        'Which failure modes did you rank highest, and on what data?',
        'What did you try that did not help?',
        'How did the error rate or uptime change afterward?',
      ],
    ],
  ]),
};
