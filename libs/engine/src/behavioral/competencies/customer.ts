import type { Competency } from '../types.js';
import { questions } from './question.js';

export const CUSTOMER: Competency = {
  id: 'customer',
  why: "This tests whether you start from the user's problem rather than the technology. Committees read how close you got to real users and data; a senior changed a roadmap or design because of them.",
  strongSignals: [
    'Names the specific user or customer and describes the problem in their words.',
    'Used real evidence: support tickets, usage data, interviews or watching someone use the product.',
    'Changed what they built because of what they learned about users.',
    "Weighed one loud customer's request against what most users needed.",
    'Reports the user outcome: fewer tickets, better retention, faster task completion.',
  ],
  redFlags: [
    'Talks only about the technology, with users as an afterthought.',
    'Built exactly what was asked without asking why.',
    'Treats users as the problem, as if they were using the product wrong.',
    'Cannot say how they knew users were better off.',
    "Mistakes an internal stakeholder's preference for a user need, with no evidence.",
  ],
  questions: questions('customer', [
    [
      'Tell me about a time you went above and beyond for a customer.',
      "Whether you care about users' outcomes, and where you draw sensible limits.",
      ['How did you find out about their problem?', 'What did it cost you or the team?', 'Did the fix help other customers too?'],
    ],
    [
      'Describe a time you used customer feedback or data to change what you were building.',
      'Whether evidence about users actually changes your decisions.',
      ['What exactly did the data show?', 'Who disagreed with the change, and why?', 'How did you check that the change helped?'],
    ],
    [
      'Tell me about a time you said no to a customer request.',
      'Whether you can protect the product and most users while still treating the customer well.',
      ['What was the underlying need behind the request?', 'What did you offer instead?', 'How did the customer take it?'],
    ],
    [
      'Describe a time you had to balance what a customer wanted with what was technically sound.',
      'Whether you find the option that serves the user without creating a mess you pay for later.',
      [
        'What were the options on the table?',
        'How did you explain the trade-off to someone who is not an engineer?',
        'What did it look like a year later?',
      ],
    ],
    [
      'Tell me about a launch where you checked whether users were actually better off.',
      'Whether you close the loop on impact instead of treating launch as the finish line.',
      [
        'What did you measure, and why that?',
        'Were the numbers what you hoped, and what did you do next?',
        'How soon after launch did you look?',
      ],
    ],
    [
      'Tell me about a time you shipped something that users did not want.',
      'Whether you admit a miss honestly and trace it back to how you understood the user.',
      [
        'What signal told you it had missed?',
        'What did you learn about the users too late?',
        'What did you do with the feature afterward?',
      ],
    ],
    [
      'Tell me about a time you worked directly with a user to diagnose their problem.',
      'Whether you get close enough to a user to see the real problem firsthand.',
      ['What did you see that the tickets missed?', 'What did you change as a result?', 'How did you follow up with them?'],
    ],
  ]),
};
