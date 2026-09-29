import type { Competency } from '../types.js';
import { questions } from './question.js';

export const OWNERSHIP: Competency = {
  id: 'ownership',
  why: 'Interviewers ask this to see if you act on problems nobody assigned you. A junior owns a task end to end; a senior owns an outcome across teams and keeps owning it after launch.',
  strongSignals: [
    'Names a problem outside their assigned work and says why they picked it up.',
    'Describes the concrete steps they took, not what the team did in general.',
    'Follows through after launch: monitoring, fixing the follow-up bugs, handing off cleanly.',
    'Says what they set aside to make room, who agreed to it, and why it was worth it.',
    'Ties the result to a number: fewer pages, hours saved, a metric that moved.',
  ],
  redFlags: [
    'Says "we" throughout, so you cannot tell what they did themselves.',
    'Blames another team for the problem and stops there.',
    'Describes a task their manager assigned and calls it ownership.',
    "Took over someone else's work without telling them or their manager.",
    'Ends the story at launch, with no word on whether it worked.',
  ],
  questions: questions('ownership', [
    [
      'Tell me about a time you took on a problem that was outside your job description.',
      'Whether you notice gaps nobody owns and act on them instead of waiting.',
      [
        'Why did nobody else own it already?',
        'How did you make time for it alongside your own work?',
        'Who did you tell before you started, and how did they react?',
      ],
    ],
    [
      "Describe a time a problem in another team's system was hurting your users. What did you do?",
      'Whether you push across team lines respectfully, rather than filing a ticket and walking away.',
      [
        'How did you get the other team to prioritize it?',
        'What did you do for your users while the fix was pending?',
        'Would you handle the handoff the same way next time?',
      ],
    ],
    [
      'Tell me about something you built that you kept improving long after it shipped.',
      'Whether you own outcomes over time, not just the launch date.',
      [
        'How did you know it needed more work after launch?',
        'What did you decide to stop investing in, and when?',
        'Who owns it today, and how did it get to them?',
      ],
    ],
    [
      'Tell me about a time you dropped the ball on something you owned.',
      'Whether you take responsibility plainly when the outcome was bad and your part in it was real.',
      [
        'When did you first realize it was slipping?',
        'What did you tell the people depending on you?',
        'What did you put in place so it would not happen again?',
      ],
    ],
    [
      'Describe a time you had to decide whether to fix something yourself or escalate it.',
      'Your judgment on when ownership means doing the work and when it means raising it with the right people.',
      [
        'What made you choose that path over the other one?',
        'What would have happened if you had waited a week?',
        'How did the person you escalated to respond?',
      ],
    ],
    [
      'Tell me about a recurring issue, like a flaky test or a noisy alert, that everyone tolerated until you fixed it.',
      'Whether you remove chronic pain that others have learned to live with.',
      [
        'How much time was it costing the team before you fixed it?',
        'Why had nobody fixed it before?',
        'How did you make sure it stayed fixed?',
      ],
    ],
    [
      'Tell me about a time you noticed a risk nobody else was worried about.',
      "Whether you act on risks early, before they become someone else's incident.",
      ['What tipped you off?', 'How did you get others to take it seriously?', 'What would have happened otherwise?'],
    ],
  ]),
};
