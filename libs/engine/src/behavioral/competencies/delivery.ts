import type { Competency } from '../types.js';
import { questions } from './question.js';

export const DELIVERY: Competency = {
  id: 'delivery',
  why: 'This checks whether you ship what you commit to, and what you do when the plan breaks. A junior finishes a scoped task; a senior cuts scope, manages dependencies and warns people early.',
  strongSignals: [
    'States the deadline, what drove it, and what was at stake if it slipped.',
    'Names the scope they cut or deferred to land on time, and who agreed to it.',
    'Raised the risk early, with a date and a fallback, not on the day of the deadline.',
    'Describes how they unblocked a dependency instead of waiting on it.',
    'Reports the result with a number: date hit, adoption, revenue or latency.',
  ],
  redFlags: [
    'Hit the date by quietly skipping tests, then shipped a regression.',
    'Only mentions long hours as the way they delivered.',
    'Surprised stakeholders with a slip on or after the due date.',
    'Cannot say what happened after the work shipped.',
    'Picks a story with no real pressure, so nothing had to be traded off.',
  ],
  questions: questions('delivery', [
    [
      'Tell me about a time you delivered a project under a tight deadline.',
      'How you plan, cut scope and keep quality when time is short.',
      [
        'What did you leave out to make the date?',
        'How did you decide what was safe to cut?',
        'What happened to the deferred work afterward?',
      ],
    ],
    [
      'Describe a project that slipped. When did you know, and what did you do?',
      'Whether you surface bad news early and come with options, not just a new date.',
      ['Who did you tell first, and how?', 'What options did you offer them?', 'Looking back, what early sign did you miss?'],
    ],
    [
      'What is the most important thing you shipped in the last year?',
      'Your sense of impact, and whether you can describe your own part in it.',
      [
        'Why did this matter more than the other things you worked on?',
        'What part would not have happened without you?',
        'How did you measure whether it worked?',
      ],
    ],
    [
      'Tell me about a time a dependency on another team put your delivery at risk.',
      'Whether you manage dependencies actively rather than waiting and blaming.',
      [
        'When did you first engage the other team?',
        'What did you build or change to reduce the dependency?',
        'How did the final date compare with the original one?',
      ],
    ],
    [
      'Describe a time you had to choose between shipping on time and shipping with the quality you wanted.',
      'Your judgment on the quality bar, and whether you own the consequences of the call.',
      ['What quality risk did you accept, exactly?', 'What was your plan if that risk hit users?', 'Would you make the same call again?'],
    ],
    [
      'Tell me about a large project you broke into milestones. How did you choose what came first?',
      'Whether you plan in milestones that reduce risk and give stakeholders something real to see.',
      [
        'What did stakeholders get to see at the first milestone?',
        'How did you track progress against the plan?',
        'When did the plan change, and what did you do?',
      ],
    ],
    [
      'Tell me about a high-severity incident you helped resolve while on call.',
      'How you act under pressure in an incident, and whether you fix what caused it afterward.',
      ['What did you do in the first ten minutes?', 'How did you keep stakeholders informed?', 'What changed after the postmortem?'],
    ],
  ]),
};
