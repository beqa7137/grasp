import { spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { asText, rangeOf } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame } from './types.js';

type Input = { s: string };

const CHOICES = ['Expand: add it to the window', 'Shrink from the left first'];

const CODE = [
  'function longestUnique(s) {',
  '  const seen = new Set();',
  '  let left = 0, best = 0;',
  '  for (let right = 0; right < s.length; right++) {',
  '    while (seen.has(s[right])) {',
  '      seen.delete(s[left]);',
  '      left++;',
  '    }',
  '    seen.add(s[right]);',
  '    best = Math.max(best, right - left + 1);',
  '  }',
  '  return best;',
  '}',
];

const SPANS = spansOf(CODE, {
  3: 'let left = 0, best = 0',
  5: 'seen.has(s[right])',
  7: 'left++',
  9: 'seen.add(s[right])',
  10: 'best = Math.max(best, right - left + 1)',
  12: 'return best',
});

export const longestUnique: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 's', label: 'Text', kind: 'text', hint: 'Up to 24 characters' }],
  defaultInput: { s: 'abcabcbbxyz' },
  presets: [
    { label: 'One letter over and over', input: { s: 'bbbbb' } },
    { label: 'No repeats at all', input: { s: 'abcdef' } },
    { label: 'Repeat in the middle', input: { s: 'pwwkew' } },
  ],

  randomInput(rand = Math.random) {
    const alphabet = 'abcdef';
    const len = randInt(rand, 8, 14);
    return { s: Array.from({ length: len }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('') };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const s = asText(raw['s'], 's');
    // The notes quote characters back, and a backtick there would open a code span.
    if (s.includes('`')) throw new InputError('s cannot contain a backtick');
    return { s };
  },

  trace({ s }) {
    const frames: Frame[] = [];
    const chars = [...s];
    const seen = new Set<string>();
    let left = 0;
    let best = 0;
    let bestRange: [number, number] | null = null;
    let right = -1;
    let chapter = 'Set up';

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const pointers: Record<string, number> = { left };
      if (right >= 0) pointers['right'] = right;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { left, right: right >= 0 ? right : null, 's[right]': right >= 0 ? chars[right] : null, best },
        array: {
          values: [...chars],
          pointers,
          window: right >= left ? [left, right] : undefined,
          settled: rangeOf(0, left - 1),
          active: right >= 0 ? [right] : [],
          found: bestRange ? rangeOf(...bestRange) : [],
        },
        set: { label: 'seen', entries: [...seen], active: right >= 0 ? chars[right] : undefined },
        ...extra,
      });
    };

    snap(
      3,
      'The window starts empty; right will visit each character once.',
      'Empty window. left marks where the window starts; right will scan every character once.',
      { lens: 'left = 0, best = 0' },
    );

    for (right = 0; right < chars.length; right++) {
      const c = chars[right];
      const dup = seen.has(c);
      chapter = `right = ${right}: '${c}'`;
      const n = chars.length;
      snap(
        5,
        right === 0 ? `'${c}' arrives in the empty window.` : `'${c}' arrives. Is it already in the window?`,
        `\`right = ${right}\` brings in '${c}'. Is it already in the window?`,
        {
          // An empty window can only expand, so the first ask is about the whole run instead.
          predict:
            right === 0
              ? {
                  ...rotatedChoices(
                    `"${s}" has ${n} characters, and left only ever moves right. At most how many times can left move in the whole run?`,
                    `At most ${n}, once per character`,
                    [`Up to ${n * n}, ${n} per character`, `Up to ${(n * (n - 1)) / 2}, once per pair`, 'Exactly once'],
                  ),
                  explain: `left never passes right, so each character leaves the window at most once: at most ${n} moves in all. That is why the inner while still adds up to O(n).`,
                }
              : {
                  prompt: `'${c}' wants to join window {${[...seen].join(', ')}}. What happens?`,
                  ...fixedChoices(CHOICES, dup ? 1 : 0),
                  explain: dup
                    ? `'${c}' is already inside, so the window would contain a repeat. Evict from the left until the old '${c}' is gone.`
                    : `'${c}' is new, so the window stays valid: just extend it.`,
                },
        },
      );
      while (seen.has(c)) {
        seen.delete(chars[left]);
        const evicted = chars[left];
        left++;
        const still = seen.has(c);
        snap(
          7,
          evicted === c
            ? `Evict the old '${c}': left moves to ${left}, so the new '${c}' fits.`
            : `Evict '${evicted}': left moves to ${left}.${still ? ` '${c}' is still inside.` : ''}`,
          `Evict '${evicted}' and move left to ${left}.${still ? ` '${c}' is still inside: keep shrinking.` : ''}`,
          { lens: `left = ${left}` },
        );
      }
      seen.add(c);
      snap(9, `Add '${c}': the window has no repeats.`, `Add '${c}'. Window "${chars.slice(left, right + 1).join('')}" has no repeats.`, {
        lens: `window "${chars.slice(left, right + 1).join('')}"`,
      });
      const len = right - left + 1;
      const was = best;
      if (len > best) {
        best = len;
        bestRange = [left, right];
        snap(10, `Length ${len} is the longest so far.`, `New best length: ${best}.`, { lens: `max(${was}, ${len}) = ${best}` });
      } else {
        snap(10, `Length ${len} does not beat the best, ${best}.`, `Length ${len} does not beat best ${best}.`, {
          lens: `max(${was}, ${len}) = ${best}`,
        });
      }
    }

    right = chars.length - 1;
    chapter = 'Result';
    snap(
      12,
      `Done: the longest stretch without a repeat has length ${best}.`,
      `Done. Each character entered and left the window at most once → O(n). Answer: ${best}.`,
    );
    frames[frames.length - 1].vars['result'] = best;
    return frames;
  },
};
