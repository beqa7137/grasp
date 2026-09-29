import type { Competency } from '../types.js';
import { questions } from './question.js';

export const FEEDBACK: Competency = {
  id: 'feedback',
  why: 'This checks whether you can say hard things so they land, and hear hard things without getting defensive. A junior shows they act on criticism; a senior gives feedback upward and across teams, on people, process and decisions, and checks that it worked.',
  strongSignals: [
    'Gave the feedback early and privately, about specific behavior and its effect, not about the person.',
    'Brought evidence, such as a benchmark, a log or examples, so the feedback was hard to dismiss.',
    'Received criticism with questions instead of a defense, then changed something others could see.',
    'Followed up later to check whether the feedback landed and adjusted if it had not.',
    'Gave feedback upward on a decision or process, with a proposal and respect for who owns the call.',
  ],
  redFlags: [
    'Softened the message until it was lost, or waited until the problem became a performance issue.',
    'Delivered hard feedback in public, or only in written review comments, when a conversation was needed.',
    'Explains why the criticism they received was unfair instead of what they did with it.',
    'Says they "gave feedback" but cannot quote what they said or what changed.',
    'Never gives feedback upward, or does it by complaining to peers instead.',
  ],
  questions: questions('feedback', [
    [
      'Tell me about a time you gave feedback to an engineer on another team whose work was causing problems for yours.',
      'Whether you raise problems across team lines directly and specifically, instead of escalating first or complaining to your own team.',
      [
        'How did you open the conversation?',
        'What did they push back on, and how did you respond?',
        'How do your two teams work together now?',
      ],
    ],
    [
      'Describe a code review where you had to push back hard on a change. How did you deliver it?',
      'Whether you hold the quality bar in review without making it personal or blocking by decree.',
      [
        'Why did you comment, call or meet instead of the other options?',
        'How did you separate the must-fix issues from preferences?',
        'What did the author say about the review afterward?',
      ],
    ],
    [
      'Tell me about a time you asked for feedback on your own work. What did you hear, and what did you change?',
      'Whether you go looking for criticism instead of waiting for it, take it without defensiveness and act on it in a way others can see.',
      [
        'What was your first reaction, honestly?',
        'How did the person who gave it know you had acted on it?',
        'Is there any part of that feedback you still disagree with?',
      ],
    ],
    [
      'Tell me about a time you gave feedback to someone more senior than you, such as your manager or tech lead.',
      'Whether you give honest feedback upward, with tact and evidence, rather than staying quiet.',
      [
        'What made you decide it was worth the risk?',
        'How did you frame it so it was easy to hear?',
        'How did they respond, then and later?',
      ],
    ],
    [
      'Describe a time you gave feedback on a team process or a decision you thought was not working.',
      'Whether you raise problems with how work is done, with a proposal, instead of complaining about it.',
      [
        'Who owned the process, and how did you approach them?',
        'What data showed it was not working?',
        'What changed, and how did you know it stuck?',
      ],
    ],
    [
      'Tell me about feedback you gave that did not land the first time. What did you do next?',
      'Whether you follow up to check the effect of your feedback and change your approach when it fails.',
      [
        'How did you notice it had not landed?',
        'What did you do differently the second time?',
        'What do you do now to check that feedback landed?',
      ],
    ],
    [
      'Tell me about a time you received feedback you disagreed with.',
      'Whether you can separate the useful part of criticism from the part you reject, and say so calmly.',
      ['What part of it turned out to be true?', 'How did you tell the person you disagreed?', 'Would you respond the same way today?'],
    ],
  ]),
};
