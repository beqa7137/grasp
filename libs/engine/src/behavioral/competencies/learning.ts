import type { Competency } from '../types.js';
import { questions } from './question.js';

export const LEARNING: Competency = {
  id: 'learning',
  why: 'This checks how fast you become useful on unfamiliar ground, and whether you have a method rather than luck. A junior ramps up on a codebase with help; a senior learns a new language or domain under pressure and turns it into docs or training that speed up others.',
  strongSignals: [
    'Describes a deliberate plan, such as tracing one real request end to end, not just "reading the docs".',
    'Tried on their own first, then asked focused questions, and says who they asked and why.',
    'Ran small experiments or throwaway prototypes to test their understanding before building on it.',
    'Names what they misunderstood at first and how they caught it before it shipped.',
    'Turned what they learned into something others use: a doc, a talk, a runbook or a review habit.',
  ],
  redFlags: [
    'Says they "just picked it up", with no method anyone could repeat.',
    'Read documentation for weeks before touching the code or talking to anyone.',
    'Never asked for help, or asked before trying anything themselves.',
    'Shipped on a guess about how the system worked and learned only when it broke.',
    'Cannot name anything they learned recently or how it changed their work.',
  ],
  questions: questions('learning', [
    [
      'Walk me through how you learned a large codebase you had never seen before.',
      'Whether you have a repeatable method for reading code, beyond hoping it sinks in.',
      [
        'Where did you start reading, and why there?',
        'How did you check that your mental model was right?',
        'What would you do differently on the next codebase?',
      ],
    ],
    [
      'Tell me about a time you had to learn a new programming language to deliver something.',
      'How you carry over what you know and find the idioms that differ, under a deadline.',
      [
        'What did you get wrong by writing it like your old language?',
        'How did you get feedback on whether your code was idiomatic?',
        'How long until you were reviewing code in it yourself?',
      ],
    ],
    [
      'Describe a time you had to understand a business domain, like payments or healthcare, to build the right thing.',
      'Whether you learn a domain from the people who work in it, not only from the code.',
      [
        'Who taught you the most, and how did you find them?',
        'Which domain rule surprised you?',
        'How did you check your understanding before designing around it?',
      ],
    ],
    [
      'Tell me about a question you asked while ramping up that saved you a lot of time.',
      'Whether you ask well-prepared questions at the right moment, rather than too early or too late.',
      ['What had you tried before asking?', 'How did you decide who to ask?', 'When do you keep digging on your own instead of asking?'],
    ],
    [
      'Tell me about a small experiment or prototype you built only to understand how something worked.',
      'Whether you test your understanding cheaply before betting real work on it.',
      [
        'What did you expect, and what actually happened?',
        'How much time did you give it before stopping?',
        'What did you throw away afterward, and what did you keep?',
      ],
    ],
    [
      'How do you stay current in your field? Give me a recent example that changed how you work.',
      'Whether you keep learning deliberately and apply it, rather than collecting headlines.',
      [
        'How do you decide what is worth your time to learn?',
        'How did you try it before bringing it to your team?',
        'What popular trend did you decide to skip, and why?',
      ],
    ],
    [
      'Tell me about a time you taught your team something you had only recently learned yourself.',
      'Whether you turn your own learning into shared knowledge and are honest about its limits.',
      [
        'How did you make it stick beyond a single session?',
        'What question could you not answer, and what did you do about it?',
        'How did you know the team had actually learned it?',
      ],
    ],
  ]),
};
