import { rotatedChoices } from './choices.js';
import { asNumber, asNumbers, randInt, shuffle } from './input.js';
import type { AlgorithmDef, Frame, SetView } from './types.js';

type Input = { nums: number[]; target: number };

const LOOKUP = ['Yes: return the pair', 'No: store x and keep scanning'];

const entry = (value: number, index: number) => `${value} → ${index}`;

export const twoSumHash: AlgorithmDef<Input> = {
  id: 'two-sum-hash',
  title: 'Two Sum (Hash Map)',
  patternId: 'hashing',
  difficulty: 'easy',
  summary: 'Scan once and remember each number with its index; the pair appears the moment a number finds its partner already in the map.',
  complexity: { time: 'O(n)', space: 'O(n)' },
  code: [
    'function twoSum(nums, target) {',
    '  const seen = new Map(); // value -> index',
    '  for (const [i, x] of nums.entries()) {',
    '    const need = target - x;',
    '    if (seen.has(need)) return [seen.get(need), i];',
    '    seen.set(x, i); // only after the check',
    '  }',
    '  return [];',
    '}',
  ],
  fields: [
    { key: 'nums', label: 'Numbers', kind: 'numbers' },
    { key: 'target', label: 'Target sum', kind: 'number' },
  ],
  defaultInput: { nums: [3, 8, 11, 5, 7, 2], target: 16 },

  randomInput(rand = Math.random) {
    const target = randInt(rand, 10, 20);
    const size = randInt(rand, 5, 8);
    const first = randInt(rand, 1, target - 1);
    const nums = rand() < 0.8 ? [first, target - first] : [];
    const used = new Set(nums);
    const pool = Array.from({ length: target + 4 }, (_, k) => k + 1);
    for (const value of shuffle(rand, pool)) {
      if (nums.length === size) break;
      if (used.has(value) || used.has(target - value)) continue;
      used.add(value);
      nums.push(value);
    }
    return { nums: shuffle(rand, nums), target };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums'), target: asNumber(raw['target'], 'target') };
  },

  trace({ nums, target }) {
    const frames: Frame[] = [];
    const seen = new Map<number, number>();
    let i = -1;
    let need: number | null = null;
    let stored = 0;
    let pair: [number, number] | null = null;
    let askedPlainMiss = false;

    const entries = () => [...seen].map(([value, index]) => entry(value, index));
    const mapText = () => `{${entries().join(', ')}}`;
    const seenView = (active?: string): SetView => ({ label: 'seen (value → index)', entries: entries(), active });

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const scanning = i >= 0 && i < nums.length;
      frames.push({
        line,
        note,
        vars: { target, i: scanning ? i : null, x: scanning ? nums[i] : null, need },
        array: {
          values: [...nums],
          pointers: scanning ? { i } : {},
          window: stored > 0 ? [0, stored - 1] : undefined,
          active: scanning ? [i] : [],
          settled: pair ? nums.map((_, k) => k).filter((k) => k > i) : [],
          found: pair ? [...pair] : [],
        },
        set: seenView(),
        ...extra,
      });
    };

    const lookupExplain = (x: number, complement: number) => {
      if (seen.has(complement)) {
        return `${complement} is a key in seen, stored when the scan passed an earlier ${complement}. ${complement} + ${x} = ${target}, so the pair is complete.`;
      }
      const later = nums.indexOf(complement, i + 1);
      if (complement === x) {
        const partner = later >= 0 ? ` The ${x} at index ${later} will find this one when the scan gets there.` : '';
        return `need equals x, but seen only holds numbers before index ${i}, and x is stored after this check. Checking first keeps ${x} from pairing with itself.${partner}`;
      }
      if (later >= 0) {
        return `${complement} is in nums, but at index ${later}, after i = ${i}. seen only holds numbers the scan has passed, so the ${complement} will find this ${x} once the scan reaches it.`;
      }
      return `${complement} is not a key in seen, so no number before index ${i} pairs with ${x}.`;
    };

    snap(
      2,
      `seen maps every number the scan has passed to its index, so asking "did my partner come earlier?" is one O(1) lookup instead of a scan back. Target: ${target}.`,
    );

    for (i = 0; i < nums.length; i++) {
      const x = nums[i];
      need = null;
      snap(3, i === 0 ? `The scan starts at i = 0 with x = ${x}.` : `Move to i = ${i}: x = ${x}.`);
      need = target - x;
      snap(4, `x = ${x} needs a partner of target - x = ${target} - ${x} = ${need}.`);

      const j = seen.get(need);
      const partnerInNums = nums.includes(need);
      // Lookups whose partner is somewhere in nums (already seen, x itself, or later) always teach something; a plain miss is asked once.
      if (i > 0 && (partnerInNums || !askedPlainMiss)) {
        askedPlainMiss ||= !partnerInNums;
        snap(5, `Look up need = ${need} in seen.`, {
          predict: {
            prompt: `target = ${target}, x = nums[${i}] = ${x}, so need = ${need}. seen = ${mapText()}. Is ${need} in seen?`,
            choices: LOOKUP,
            answer: j !== undefined ? 0 : 1,
            explain: lookupExplain(x, need),
          },
        });
      }

      if (j !== undefined) {
        const answer = `[${j}, ${i}]`;
        snap(5, `seen.has(${need}) is true: an earlier number completes the pair.`, {
          predict: {
            prompt: `target = ${target}, x = nums[${i}] = ${x}, and need = ${need} is in seen = ${mapText()}. What does twoSum return?`,
            ...rotatedChoices(answer, [`[${need}, ${x}]`, `[${need}, ${i}]`, `[${i}, ${i}]`], nums.length + i),
            explain: `seen.get(${need}) = ${j} is the index where ${need} was stored, and i = ${i} is the index of x. twoSum returns indices, not values: ${answer}.`,
          },
        });
        pair = [j, i];
        snap(
          5,
          `Return ${answer}: nums[${j}] + nums[${i}] = ${need} + ${x} = ${target}.${i < nums.length - 1 ? ' The scan stops here, so the rest of nums is never read.' : ''} Each step was one O(1) lookup and at most one O(1) store: O(n) time, O(n) space.`,
          { set: seenView(entry(need, j)) },
        );
        frames[frames.length - 1].vars['result'] = answer;
        return frames;
      }

      snap(
        5,
        i === 0
          ? `seen is empty, so ${need} is not there: nothing can pair with ${x} yet.${need === x ? ` Checking before storing is what stops ${x} from pairing with itself.` : ''}`
          : `seen.has(${need}) is false: no number before index ${i} is ${need}.`,
      );
      if (i === 0) {
        // This question always comes first, so offsetting by the length moves its answer between inputs.
        snap(6, 'No partner yet, so remember x for the numbers still to come.', {
          predict: {
            prompt: `target = ${target}, x = nums[0] = ${x}, and need = ${need} is not in the empty seen. What does seen hold after this step?`,
            ...rotatedChoices(`{${entry(x, 0)}}`, [`{${entry(need, 0)}}`, `{${entry(0, x)}}`, '{}'], nums.length),
            explain: `seen.set(x, i) uses the number as the key and its index as the value, so seen becomes {${entry(x, 0)}}. A later number that needs ${x} looks it up by value and reads back index 0.`,
          },
        });
      }

      const previous = seen.get(x);
      seen.set(x, i);
      stored = i + 1;
      snap(
        6,
        previous !== undefined
          ? `${x} is already a key, so set replaces its index ${previous} with ${i}. Either copy pairs the same way; a hit returns the newer index.`
          : `Store ${entry(x, i)}, so a later number that needs ${x} finds it in O(1).${i === 0 ? ' The shaded band marks the numbers seen holds.' : ''}`,
        { set: seenView(entry(x, i)) },
      );
    }

    need = null;
    snap(
      8,
      `The scan reached the end without a hit: no two numbers add up to ${target}, so return []. Each number cost one O(1) lookup and one O(1) store: O(n) time, O(n) space.`,
    );
    frames[frames.length - 1].vars['result'] = '[]';
    return frames;
  },
};
