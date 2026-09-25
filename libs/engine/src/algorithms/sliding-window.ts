import { fixedChoices } from './choices.js';
import { InputError } from './types.js';
import { asText, rangeOf } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame } from './types.js';

type Input = { s: string };

const CHOICES = ['Expand: add it to the window', 'Shrink from the left first'];

export const longestUnique: AlgorithmDefinition<Input> = {
  code: [
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
  ],
  fields: [{ key: 's', label: 'Text', kind: 'text', hint: 'Up to 24 characters' }],
  defaultInput: { s: 'abcabcbbxyz' },

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

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const pointers: Record<string, number> = { left };
      if (right >= 0) pointers['right'] = right;
      frames.push({
        line,
        note,
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

    snap(3, 'Empty window. left marks where the window starts; right will scan every character once.');

    for (right = 0; right < chars.length; right++) {
      const c = chars[right];
      const dup = seen.has(c);
      snap(5, `\`right = ${right}\` brings in '${c}'. Is it already in the window?`, {
        predict: {
          prompt: `'${c}' wants to join window {${[...seen].join(', ')}}. What happens?`,
          ...fixedChoices(CHOICES, dup ? 1 : 0),
          explain: dup
            ? `'${c}' is already inside, so the window would contain a repeat. Evict from the left until the old '${c}' is gone.`
            : `'${c}' is new, so the window stays valid: just extend it.`,
        },
      });
      while (seen.has(c)) {
        seen.delete(chars[left]);
        const evicted = chars[left];
        left++;
        snap(7, `Evict '${evicted}' and move left to ${left}.${seen.has(c) ? ` '${c}' is still inside: keep shrinking.` : ''}`);
      }
      seen.add(c);
      snap(9, `Add '${c}'. Window "${chars.slice(left, right + 1).join('')}" has no repeats.`);
      const len = right - left + 1;
      if (len > best) {
        best = len;
        bestRange = [left, right];
        snap(10, `New best length: ${best}.`);
      } else {
        snap(10, `Length ${len} does not beat best ${best}.`);
      }
    }

    right = chars.length - 1;
    snap(12, `Done. Each character entered and left the window at most once → O(n). Answer: ${best}.`);
    frames[frames.length - 1].vars['result'] = best;
    return frames;
  },
};
