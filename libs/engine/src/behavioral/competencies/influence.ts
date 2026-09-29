import type { Competency } from '../types.js';
import { questions } from './question.js';

export const INFLUENCE: Competency = {
  id: 'influence',
  why: 'This tests whether you can change what people do when you cannot tell them to. It is a core senior signal: the bigger the group you moved, and the less authority you had, the higher the scope.',
  strongSignals: [
    'Starts from what the other team cared about, not from what the candidate needed from them.',
    'Built the case with evidence: a prototype, a cost estimate, user data or an incident.',
    'Won over one or two key people first and let them carry the message.',
    'Changed their own proposal based on pushback, and says what changed.',
    'Names the concrete change: a roadmap item, a standard adopted, a migration done.',
  ],
  redFlags: [
    'Escalated to a manager to force the outcome and calls that influence.',
    'Describes persuading people who already reported to them.',
    'Treats resistance as the other side being wrong rather than having different goals.',
    'Got verbal agreement but cannot say what actually changed.',
    'Never adjusted the idea in response to feedback.',
  ],
  questions: questions('influence', [
    [
      'Tell me about a time you convinced another team to change their plans.',
      'Whether you move people with competing priorities through their incentives, not pressure.',
      [
        'What did that team gain from saying yes?',
        'Who was the hardest person to convince, and why?',
        'Did you have to give anything up to get a yes?',
      ],
    ],
    [
      'Describe a time you drove adoption of a new tool, practice or standard across teams.',
      'Whether you can make a change stick beyond your own team.',
      ['How did you pick the first teams to adopt it?', 'How did you measure adoption?', 'What did you do about the teams that refused?'],
    ],
    [
      'Tell me about a time you tried to influence a decision and failed.',
      'Whether you learn from losing, and read people and timing better afterward.',
      ['Why do you think it did not land?', 'What would you change about the pitch?', 'Did the decision change later on?'],
    ],
    [
      'Tell me about a time you pitched an idea to someone much more senior who was skeptical.',
      'Whether you build credibility and frame an idea so a skeptical senior audience takes it seriously.',
      ['What made them skeptical?', 'How did you prepare for that conversation?', 'Where did they land in the end?'],
    ],
    [
      'Describe a time you had to get buy-in for work with no immediate payoff, like paying down tech debt.',
      'Whether you can translate an engineering need into business terms that others will fund.',
      [
        'How did you put a cost on doing nothing?',
        'What did you have to promise in exchange?',
        'Did the payoff show up, and did you report it back?',
      ],
    ],
    [
      'Tell me about a time you changed your own position after listening to the people you were trying to persuade.',
      'Whether influence runs both ways for you, or you only broadcast.',
      [
        'What did they know that you did not?',
        'How did you explain the change to your own team?',
        'Was the final plan better, and how do you know?',
      ],
    ],
    [
      'Tell me about a technical direction you set that other teams adopted.',
      'Whether your technical judgment shapes how work gets done beyond your own team.',
      ['How did you write it up?', 'Who objected?', 'How many teams follow it today?'],
    ],
  ]),
};
