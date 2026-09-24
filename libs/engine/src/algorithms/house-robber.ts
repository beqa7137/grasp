import { InputError } from './types.js';
import { rotatedChoices } from './choices.js';
import { asNumbers, randInt } from './input.js';
import type { AlgorithmDef, Frame, Prediction, TableLegend } from './types.js';

type Input = { nums: number[] };

/** One loop step: dp[i] picks between skipping house i - 1 and robbing it. */
interface Step {
  i: number;
  money: number;
  twoBack: number;
  skip: number;
  take: number;
}

const MAX_HOUSES = 10;
const LEGEND: TableLegend = { active: 'being filled', deps: 'reads from', path: 'robbed house i - 1' };

/** Walks back from dp[n]: where dp[k] equals dp[k - 1], house k - 1 was skipped; otherwise it was robbed. */
function robbedHouses(dp: number[]): number[] {
  const robbed: number[] = [];
  for (let k = dp.length - 1; k >= 1;) {
    if (dp[k] === dp[k - 1]) k--;
    else {
      robbed.unshift(k - 1);
      k -= 2;
    }
  }
  return robbed;
}

function robOrSkip({ i, money, twoBack, skip, take }: Step): Prediction {
  const house = i - 1;
  const neighbour = `Robbing house ${house} rules out its neighbour, house ${house - 1}, so it can only add to dp[${i - 2}], not to dp[${i - 1}].`;
  return {
    prompt: `dp[${i - 2}] = ${twoBack}, dp[${i - 1}] = ${skip}, and house ${house} holds ${money}. Rob house ${house} or skip it?`,
    choices: [`Rob house ${house}`, `Skip house ${house}`],
    answer: take > skip ? 0 : 1,
    explain:
      take > skip
        ? `Robbing gives dp[${i - 2}] + ${money} = ${take}, more than the ${skip} that skipping keeps. ${neighbour}`
        : `Skipping keeps dp[${i - 1}] = ${skip}, more than robbing gives: dp[${i - 2}] + ${money} = ${take}. ${neighbour}`,
  };
}

/** Distractors are the usual slips: robbing next to dp[i - 1], taking the smaller option, forgetting dp[i - 2], or reaching back too far. */
function dpValue({ i, money, twoBack, skip, take }: Step, threeBack: number | null, shift: number): Prediction | null {
  const house = i - 1;
  const best = Math.max(skip, take);
  const slips = [skip + money, Math.min(skip, take), Math.max(skip, money), twoBack, ...(threeBack === null ? [] : [threeBack + money])];
  const options = rotatedChoices(String(best), slips.map(String), shift);
  if (options.choices.length < 2) return null;
  return {
    prompt: `dp[${i - 2}] = ${twoBack}, dp[${i - 1}] = ${skip}, and house ${house} holds ${money}. What is dp[${i}]?`,
    ...options,
    explain:
      take > skip
        ? `Rob house ${house}: dp[${i - 2}] + ${money} = ${take} beats skipping it, which keeps ${skip}. Robbing adds to dp[${i - 2}], not dp[${i - 1}], because dp[${i - 1}] may already use house ${house - 1}, its neighbour.`
        : take < skip
          ? `Skip house ${house}: dp[${i - 1}] = ${skip} beats robbing it for dp[${i - 2}] + ${money} = ${take}, so the best total so far carries over.`
          : `Skipping keeps dp[${i - 1}] = ${skip} and robbing gives dp[${i - 2}] + ${money} = ${take}, a tie, so dp[${i}] = ${skip} either way.`,
  };
}

export const houseRobber: AlgorithmDef<Input> = {
  id: 'house-robber',
  title: 'House Robber',
  patternId: 'dp-1d',
  difficulty: 'medium',
  summary: 'dp[i] is the most money from the first i houses: skip house i - 1 and keep dp[i - 1], or rob it on top of dp[i - 2].',
  complexity: { time: 'O(n)', space: 'O(n)' },
  code: [
    'function rob(nums) {',
    '  const n = nums.length;',
    '  const dp = Array(n + 1).fill(0); // best of the first i houses',
    '  dp[0] = 0; // no houses, nothing to rob',
    '  dp[1] = nums[0]; // one house: rob it',
    '  for (let i = 2; i <= n; i++) {',
    '    dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i - 1]);',
    '  }',
    '  return dp[n];',
    '}',
  ],
  fields: [{ key: 'nums', label: 'Money in each house', kind: 'numbers', hint: `Up to ${MAX_HOUSES} houses, 0 to 99 each` }],
  defaultInput: { nums: [2, 7, 9, 3, 1, 5] },

  randomInput(rand = Math.random) {
    return { nums: Array.from({ length: randInt(rand, 5, 8) }, () => randInt(rand, 1, 15)) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums = asNumbers(raw['nums'], 'nums', { minValue: 0, maxValue: 99 });
    if (nums.length > MAX_HOUSES) throw new InputError(`nums can hold at most ${MAX_HOUSES} houses`);
    return { nums };
  },

  trace({ nums }) {
    const frames: Frame[] = [];
    const n = nums.length;
    const dp: number[] = Array(n + 1).fill(0);
    let filled = 0;
    let filling: number | null = null;
    let i: number | null = null;
    let robbed: number[] = [];
    let asked = 0;
    let valueQuestions = 0;

    const known = (k: number) => (k < filled ? dp[k] : null);

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const at = i;
      const cell = filling;
      frames.push({
        line,
        note,
        vars: {
          n,
          i: at,
          'nums[i - 1]': at === null ? null : nums[at - 1],
          'dp[i - 2]': at === null ? null : known(at - 2),
          'dp[i - 1]': at === null ? null : known(at - 1),
          'dp[i]': at === null ? null : known(at),
        },
        array: {
          values: [...nums],
          pointers: at === null ? {} : { 'i - 1': at - 1 },
          window: cell ? [0, cell - 1] : undefined,
          active: cell ? [cell - 1] : [],
          found: [...robbed],
        },
        table: {
          rowLabels: ['dp'],
          colLabels: dp.map((_, k) => String(k)),
          cells: [dp.map((_, k) => known(k))],
          active: cell === null ? undefined : [0, cell],
          deps: at === null ? undefined : [at - 2, at - 1].map((c): [number, number] => [0, c]),
          path: robbed.map((house): [number, number] => [0, house + 1]),
          legend: LEGEND,
        },
        ...extra,
      });
    };

    snap(
      3,
      `dp[i] will hold the most money you can take from the first i houses. With n = ${n}, that needs ${n + 1} slots, from dp[0] for no houses to dp[${n}] for all of them. Dashed slots are not filled in yet.`,
    );
    filling = 0;
    dp[0] = 0;
    filled = 1;
    snap(4, 'Base case: with no houses there is nothing to rob, so dp[0] = 0.');
    filling = 1;
    dp[1] = nums[0];
    filled = 2;
    snap(5, `Base case: with one house, rob it. dp[1] = nums[0] = ${nums[0]}.`);

    for (i = 2; i <= n; i++) {
      filling = i;
      const house = i - 1;
      const step: Step = { i, money: nums[house], twoBack: dp[i - 2], skip: dp[i - 1], take: dp[i - 2] + nums[house] };
      const { money, skip, take } = step;
      snap(6, `i = ${i}: dp[${i}] covers houses 0 to ${house}, and the newest one, house ${house}, holds ${money}.`);

      const decide = asked % 2 === 0 && take !== skip;
      const predict = decide ? robOrSkip(step) : dpValue(step, i >= 3 ? dp[i - 3] : null, valueQuestions);
      if (predict) {
        asked++;
        if (!decide) valueQuestions++;
        snap(7, `Weigh skipping house ${house} against robbing it.`, { predict });
      }

      dp[i] = Math.max(skip, take);
      filled = i + 1;
      snap(
        7,
        take > skip
          ? `Rob house ${house}: dp[${i - 2}] + ${money} = ${take} beats dp[${i - 1}] = ${skip}, so dp[${i}] = ${take}.`
          : take < skip
            ? `Skip house ${house}: dp[${i - 1}] = ${skip} beats dp[${i - 2}] + ${money} = ${take}, so dp[${i}] = ${skip} carries over.`
            : `Robbing and skipping house ${house} both give ${skip}, so dp[${i}] = ${skip} either way.`,
      );
    }

    i = null;
    filling = null;
    const best = dp[n];
    robbed = robbedHouses(dp);
    const haul =
      robbed.length === 1
        ? `house ${robbed[0]}, which holds ${best}`
        : `houses ${robbed.join(', ')}, which hold ${robbed.map((house) => nums[house]).join(' + ')} = ${best}`;
    const walkBack = robbed.length
      ? `Walking back, dp[i] = dp[i - 1] means house i - 1 was skipped, otherwise it was robbed: that gives ${haul}.`
      : 'Every house is empty, so nothing gets robbed.';
    snap(
      9,
      `Return dp[${n}] = ${best}. ${walkBack} One pass is O(n) time, and since each dp[i] reads only the two cells before it, two variables holding the last two values can replace the array for O(1) space.`,
    );
    frames[frames.length - 1].vars['result'] = best;
    return frames;
  },
};
