import type { Competency } from '../types.js';
import { questions } from './question.js';

export const AMBIGUITY: Competency = {
  id: 'ambiguity',
  why: 'This tests whether you move forward when nobody hands you a spec. Level shows in how much ambiguity you absorb: a junior clarifies a task, a senior defines the problem and aligns others on it.',
  strongSignals: [
    'Explains what was unclear: the goal, the users, the owner or the constraints.',
    'Names the questions they asked, and who they asked, to shrink the unknowns.',
    'Made a reversible call to start moving, and said what would make them change it.',
    'Wrote down the plan and its assumptions and shared them for pushback.',
    'Shows how the direction changed as they learned more, and why.',
  ],
  redFlags: [
    'Waited for someone else to clarify before doing anything.',
    'Picked a direction alone and never checked it with the people affected.',
    'Describes a problem that was actually well defined.',
    'Cannot say which assumptions turned out to be wrong.',
    'Treats every unknown as needing a full investigation before any action.',
  ],
  questions: questions('ambiguity', [
    [
      'Tell me about a time you had to make progress without clear requirements.',
      'Whether you turn a vague ask into a concrete plan without waiting to be told.',
      [
        'What was the first thing you did to reduce the uncertainty?',
        'Which assumption turned out to be wrong?',
        'How did you know you had enough clarity to start?',
      ],
    ],
    [
      'Describe a project where the goal changed partway through. How did you handle it?',
      "How you adapt to a shifting goal without losing the work already done or the team's morale.",
      [
        'How much of the earlier work did you keep?',
        'How did you explain the change to your team?',
        'What would you do at the start next time to limit the churn?',
      ],
    ],
    [
      'Tell me about a time you had to make a decision with incomplete data.',
      'Whether you weigh the cost of waiting against the cost of being wrong.',
      [
        'What data did you wish you had?',
        'Could you reverse the decision, and how did that shape it?',
        'How did it turn out, and what did it teach you about your judgment?',
      ],
    ],
    [
      'Tell me about a time you had to pick a direction before the data could settle it.',
      'Whether you commit to a direction under real uncertainty and bring others along with it.',
      [
        'What options were you choosing between?',
        'How did you get others to back a call the data could not prove?',
        'What would have made you change course?',
      ],
    ],
    [
      'Tell me about a time a stakeholder asked for a specific solution and the real problem turned out to be different.',
      'Whether you dig for the underlying need instead of building the literal request.',
      [
        'What did you build in the end?',
        'What questions did you ask to find the real need?',
        'How did you handle it when they held on to the original request?',
      ],
    ],
    [
      'Tell me about a time you went in the wrong direction because the problem was unclear.',
      'Whether you notice a wrong turn quickly and are honest about it.',
      ['How long did it take you to notice?', 'What did the wrong turn cost the project?', 'What signal would have told you sooner?'],
    ],
    [
      'Tell me about a time you had to change code that no one available could explain to you.',
      'How you make safe progress when the person who knows the answer is not there to ask.',
      ['What did you do on the first day?', 'Who did you lean on instead?', 'Which assumption turned out wrong?'],
    ],
  ]),
};
