import type { Competency } from '../types.js';
import { questions } from './question.js';

export const COLLABORATION: Competency = {
  id: 'collaboration',
  why: 'This checks whether shared work goes better because you were part of it: how you work with other roles, unblock people and share credit. A junior is a reliable partner on their own team; a senior makes projects across teams succeed without controlling them.',
  strongSignals: [
    'Brought other roles, such as design, product or SRE, in early and changed their own plan based on what they heard.',
    'Spent their own time to unblock someone else, and says what they set aside to do it.',
    'Names specific people and what each contributed, and made sure that work was seen.',
    'Shared knowledge so the team stopped depending on them: pairing, a walkthrough or written docs.',
    'Took on the awkward shared work nobody owned so the joint project could move.',
  ],
  redFlags: [
    'Treats other teams or roles as obstacles to route around.',
    'Claims a joint result as their own, or cannot name anyone else who contributed.',
    'Did the work for a struggling teammate without leaving them able to do it next time.',
    'Describes collaboration as attending meetings and sending status updates.',
    'Stayed the only person who understood a system and presents that as value.',
  ],
  questions: questions('collaboration', [
    [
      'Tell me about a time you worked closely with a designer or product manager to ship something.',
      'Whether you treat other roles as partners and raise engineering constraints early, not after the build.',
      [
        'When in the process did you first get involved?',
        'What did the designer or product manager change because of you?',
        'What did you change because of them?',
      ],
    ],
    [
      'Describe a time you unblocked another engineer or team when it was not your work.',
      'Whether you notice when others are stuck and spend your own time to move them.',
      [
        'How did you find out they were blocked?',
        'What did you put aside to help, and who agreed to it?',
        'How did you avoid becoming their permanent dependency?',
      ],
    ],
    [
      'Tell me about a project that depended on several teams, where you did not control the outcome. How did you help it succeed?',
      'Whether you can make shared work land through structure and effort when no one reports to you.',
      [
        'How did you split the work between the teams?',
        'Which team was hardest to keep on track, and why?',
        'What did you take on yourself that was not strictly yours?',
      ],
    ],
    [
      "Tell me about a time you made sure someone else's contribution got the recognition it deserved.",
      'Whether you share credit generously and accurately, or let it collect around you.',
      [
        'How did you make their work visible, and to whom?',
        'Was there a moment when it would have been easier to take the credit?',
        'How did the person react?',
      ],
    ],
    [
      'Describe a time you helped a peer who was struggling with their work.',
      'Whether you notice a teammate in trouble and help in a way that leaves them stronger, without taking over.',
      [
        'What made you notice they were struggling?',
        'How did you offer help without making them feel judged?',
        'What could they do on their own afterward?',
      ],
    ],
    [
      'Tell me about a time you spread knowledge so you were no longer the only one who understood something.',
      'Whether you remove yourself as a single point of failure through pairing, docs or teaching.',
      [
        'How did you choose who to teach first?',
        'How did you check that the knowledge actually transferred?',
        'What did you do with the time it freed up?',
      ],
    ],
    [
      'Tell me about a time you worked with an SRE or operations team to get a service ready for production.',
      'Whether you treat reliability partners as collaborators with real concerns rather than a gate to get past.',
      [
        'Which of their requirements did you disagree with at first?',
        'What did you learn from them about running the service?',
        'How do the two teams work together on it today?',
      ],
    ],
  ]),
};
