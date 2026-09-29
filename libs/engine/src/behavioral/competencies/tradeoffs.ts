import type { Competency } from '../types.js';
import { questions } from './question.js';

export const TRADEOFFS: Competency = {
  id: 'tradeoffs',
  why: 'This tests whether you choose well when you cannot do everything. Committees look for explicit criteria and data; a senior answer shows saying no to good work and owning the cost of what was dropped.',
  strongSignals: [
    'States the options and the criteria used to rank them, such as impact, cost and risk.',
    'Uses numbers to compare the options, even rough estimates.',
    'Names what they chose not to do and who was disappointed.',
    'Got the people affected to agree on the priority, or at least understand it.',
    'Revisits the choice later and says whether it was right.',
  ],
  redFlags: [
    'Tried to do everything and worked nights to make it fit.',
    'Let whoever shouted loudest set the priority.',
    'Cannot name anything they deprioritized.',
    'Explains the choice only as what their manager told them to do.',
    'Presents a trade-off where one option was obviously better.',
  ],
  questions: questions('tradeoffs', [
    [
      'Tell me about a time you had more work than you could possibly do. How did you decide what to drop?',
      'Whether you prioritize with explicit criteria rather than urgency or noise.',
      [
        'What criteria did you use to rank the work?',
        'Who did you tell about what was dropped?',
        'Did anything you dropped come back to bite you?',
      ],
    ],
    [
      'Tell me about a significant technical trade-off you made. What did you give up?',
      'Whether you understand the costs of your design choices and can defend them with reasons.',
      [
        'What was the alternative you rejected?',
        'What would have to change for you to pick the other option?',
        'Did the cost turn out the way you expected?',
      ],
    ],
    [
      'Tell me about a time you chose to take on tech debt on purpose.',
      'Whether you take on debt deliberately, with a known cost and a plan to pay it back.',
      ['What did the shortcut buy you?', 'How did you record the debt so it was not forgotten?', 'Did it get paid back, and when?'],
    ],
    [
      'Tell me about a time two stakeholders wanted conflicting things from your team. How did you decide?',
      "Whether you settle competing demands with explicit criteria and keep both sides' trust.",
      ['What did each side stand to lose?', 'Who did you bring the decision to, if anyone?', 'How did the side that lost take it?'],
    ],
    [
      'Describe a time you prioritized something that was not the obvious choice.',
      'Whether you can see value others missed and make the case for it.',
      [
        'What did you see that others did not?',
        'How did you convince people to back it?',
        'How did the result compare with what you expected?',
      ],
    ],
    [
      'Tell me about a prioritization call you got wrong.',
      'Whether you judge your own calls honestly and adjust how you weigh work.',
      ['What made the call look right at the time?', 'How did you find out it was wrong?', 'What do you weigh differently now?'],
    ],
    [
      'What is the project with the largest scope you have led?',
      'Whether your scope matches your level, and which calls about scope and priority were yours.',
      ['How many teams were involved?', 'What decision was yours alone?', 'What would have gone differently without you?'],
    ],
  ]),
};
