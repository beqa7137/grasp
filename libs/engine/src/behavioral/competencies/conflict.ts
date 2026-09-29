import type { Competency } from '../types.js';
import { questions } from './question.js';

export const CONFLICT: Competency = {
  id: 'conflict',
  why: "This checks whether you can disagree without damaging the relationship, then commit once a decision is made. Committees want arguments grounded in data. At senior levels they expect real stakes, such as a disagreement with a manager or another team's lead.",
  strongSignals: [
    "States the disagreement fairly, including the other person's strongest argument.",
    'Brought data, a prototype or an experiment instead of repeating their opinion louder.',
    'Talked to the person directly and privately before involving anyone else.',
    'Committed fully once the decision went against them, and says what that looked like.',
    'The working relationship was intact or better afterward, with an example.',
  ],
  redFlags: [
    'Paints the other person as unreasonable or incompetent.',
    'Tells it so they were plainly right and the other side had no real point.',
    "Went over the person's head as a first move.",
    'Kept relitigating the decision after it was made.',
    'Picks a trivial disagreement, like code style, to avoid a real one.',
  ],
  questions: questions('conflict', [
    [
      'Tell me about a time you disagreed with a teammate on a technical decision.',
      'Whether you argue on evidence and keep the relationship working.',
      [
        'What was the strongest point on their side?',
        'What evidence changed minds, or failed to?',
        'How is your relationship with them now?',
      ],
    ],
    [
      'Describe a time you disagreed with your manager.',
      'Whether you push back upward with respect and accept the call when it is theirs to make.',
      [
        'How did you raise it, and in what setting?',
        'What did your manager say that you had not considered?',
        'What did you do once the decision was final?',
      ],
    ],
    [
      'Tell me about a time you committed to a decision you disagreed with.',
      'Whether you can disagree and then commit fully, without quiet resistance.',
      [
        'What did committing look like in practice?',
        'Did the outcome change your view?',
        'Is there a point where you would not have committed?',
      ],
    ],
    [
      'Describe a conflict between two people on your team that you helped resolve.',
      'Whether you can mediate fairly and point people back at the shared goal.',
      [
        'How did you stay neutral between them?',
        'What was the root of the conflict, beyond the surface issue?',
        'How did you know it was really resolved?',
      ],
    ],
    [
      'Tell me about a conflict with a senior leader on another team.',
      'Whether you handle a power gap without folding or going around people.',
      [
        'What did they care about that you did not at first?',
        'Who else did you bring in, and when?',
        'Where does the relationship stand now?',
      ],
    ],
    [
      'Tell me about a disagreement you lost, where you later realized the other side was right.',
      'Intellectual honesty, and whether you can update your view without ego getting in the way.',
      ['What made you realize they were right?', 'Did you tell them?', 'How has it changed the way you argue now?'],
    ],
    [
      'Tell me about a time you pushed back on a deadline or scope your manager set.',
      'Whether you push back upward with data and alternatives, not just complaints.',
      ['What data did you bring?', 'What alternative did you offer?', 'What was decided?'],
    ],
  ]),
};
