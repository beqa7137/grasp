import type { Competency } from '../types.js';
import { questions } from './question.js';

export const LEADERSHIP: Competency = {
  id: 'leadership',
  why: "This checks whether you make the people and work around you better, with or without a title. A junior helps a peer; a senior grows engineers and raises a team's bar. At staff level, you set direction across teams.",
  strongSignals: [
    'Names the person they mentored and what that person can do now that they could not before.',
    'Adapted their approach to the person, rather than using one style for everyone.',
    'Delegated real ownership, including the risk of the person failing.',
    'Raised a team standard, such as review quality or on-call health, and shows how it spread.',
    'Gave hard feedback directly and kindly, and says what changed after.',
  ],
  redFlags: [
    'Describes mentoring as answering questions when asked.',
    "Takes credit for the mentee's work.",
    'Kept the interesting work and delegated the rest.',
    "Avoided a hard conversation until it became a manager's problem.",
    'Cannot point to anyone who grew because of them.',
  ],
  questions: questions('leadership', [
    [
      'Tell me about someone you mentored. How did they grow?',
      'Whether you invest in others deliberately and can point to real growth.',
      [
        'What did they need that was different from others you have helped?',
        'How did you know they were ready for more?',
        'What did you learn from mentoring them?',
      ],
    ],
    [
      'Describe a time you had to give difficult feedback to a peer or someone junior.',
      'Whether you address problems directly and kindly instead of avoiding them.',
      ['How did you prepare for the conversation?', 'How did they take it in the moment?', 'What changed in the weeks after?'],
    ],
    [
      'Tell me about a time you led a project without being the manager.',
      'Whether you set direction and coordinate people through clarity and trust, not authority.',
      ['How did you divide the work?', 'How did you keep everyone aligned on the goal?', 'What would the team say about how you led?'],
    ],
    [
      'Tell me about a time you raised the bar for your team.',
      'Whether you improve how the whole team works, not only your own output.',
      [
        'What was the standard before, and what is it now?',
        'Who resisted, and how did you bring them along?',
        'How do you know the new standard held?',
      ],
    ],
    [
      'Describe a time you delegated something important and it did not go well.',
      'Whether you hand over real ownership and support people without taking the work back.',
      [
        'What support did you give them before it went wrong?',
        'When did you step in, and how?',
        'How would you set it up differently next time?',
      ],
    ],
    [
      'How have you helped a new team member get productive quickly?',
      'Whether you treat onboarding as something you can shape, not something to wait out.',
      [
        'What did their first week look like?',
        'What part of onboarding did you change for the next person?',
        'How long until they shipped something real?',
      ],
    ],
    [
      'Tell me about a time you worked with a teammate who was underperforming.',
      "Whether you address underperformance directly and fairly before it becomes a manager's problem.",
      ['What did you think the cause was?', 'What did you say to them, and when?', 'When did you involve their manager?'],
    ],
  ]),
};
