export interface StarDraft {
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

export type StarPart = keyof StarDraft;

export const EMPTY_STAR_DRAFT: StarDraft = { situation: '', task: '', action: '', result: '', reflection: '' };
export const isEmptyDraft = (draft: StarDraft) => Object.values(draft).every((text) => !text.trim());

export interface StarCheck {
  id: 'complete' | 'action-weight' | 'ownership' | 'measured' | 'reflection' | 'length';
  ok: boolean;
  message: string;
}

export interface StarReview {
  words: number;
  /** Spoken at an interview pace of about 150 words a minute. */
  seconds: number;
  checks: StarCheck[];
}

const WORDS_PER_MINUTE = 150;
const MIN_PART_WORDS = 8;
const SHORTEST_SECONDS = 90;
const LONGEST_SECONDS = 180;
const REQUIRED: readonly StarPart[] = ['situation', 'task', 'action', 'result'];
const LABELS: Record<StarPart, string> = {
  situation: 'Situation',
  task: 'Task',
  action: 'Action',
  result: 'Result',
  reflection: 'Reflection',
};

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)?.length ?? 0;
}

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'twice',
  'half',
  'doubled',
  'halved',
  'tripled',
  'percent',
];

export function hasNumber(text: string): boolean {
  return /\d/.test(text) || new RegExp(`\\b(?:${NUMBER_WORDS.join('|')})\\b`, 'iu').test(text);
}

function pronouns(text: string, words: readonly string[]): number {
  return text.match(new RegExp(`\\b(?:${words.join('|')})\\b`, 'giu'))?.length ?? 0;
}

export function reviewStar(draft: StarDraft): StarReview {
  const counts = Object.fromEntries(Object.entries(draft).map(([part, text]) => [part, countWords(text)])) as Record<StarPart, number>;
  const words = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const seconds = Math.round((words / WORDS_PER_MINUTE) * 60);
  const thin = REQUIRED.filter((part) => counts[part] < MIN_PART_WORDS);
  const mine = pronouns(draft.action, ['i', "i'm", "i've", "i'd", 'me', 'my']);
  const ours = pronouns(draft.action, ['we', "we're", "we've", "we'd", 'us', 'our']);
  const setup = counts.situation + counts.task;
  const checks: StarCheck[] = [
    {
      id: 'complete',
      ok: thin.length === 0,
      message: thin.length
        ? `Say more in ${thin.map((part) => LABELS[part]).join(', ')}: each part needs at least a sentence.`
        : 'Situation, Task, Action and Result are all there.',
    },
    {
      id: 'action-weight',
      ok: counts.action > 0 && counts.action >= setup,
      message:
        counts.action >= setup && counts.action > 0
          ? 'The Action is at least as long as the setup. That is where the interviewer listens hardest.'
          : 'The setup is longer than the Action. Cut the background and spend the time on what you did.',
    },
    {
      id: 'ownership',
      ok: mine > 0 && mine >= ours,
      message:
        mine > 0 && mine >= ours
          ? 'The Action says what you did, not only what the team did.'
          : mine === 0 && ours === 0
            ? 'Say "I" in the Action so it is clear which decisions were yours.'
            : 'The Action says "we" more than "I". Interviewers hire you, not the team: name your own decisions.',
    },
    {
      id: 'measured',
      ok: hasNumber(draft.result),
      message: hasNumber(draft.result)
        ? 'The Result has a number.'
        : 'Add a number if the story has one: time saved, errors cut, users reached, or a date hit. If it has none, name the concrete change.',
    },
    {
      id: 'reflection',
      ok: counts.reflection >= MIN_PART_WORDS,
      message:
        counts.reflection >= MIN_PART_WORDS
          ? 'It ends with what you learned.'
          : 'End with what you learned or would do differently: it answers the most common follow-up before it is asked.',
    },
    {
      id: 'length',
      ok: seconds >= SHORTEST_SECONDS && seconds <= LONGEST_SECONDS,
      message:
        seconds < SHORTEST_SECONDS
          ? 'Under a minute and a half: add the detail that shows your judgment.'
          : seconds > LONGEST_SECONDS
            ? 'Over three minutes: trim the setup or the smaller steps so the interviewer has time for follow-ups.'
            : 'Between a minute and a half and three minutes, a good length to say aloud.',
    },
  ];
  return { words, seconds, checks };
}
