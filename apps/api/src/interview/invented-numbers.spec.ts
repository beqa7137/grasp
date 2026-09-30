import { replaceInventedNumbers } from './invented-numbers.js';

const WE_HEAVY = [
  'We had a flaky deploy pipeline that failed about a third of the time and slowed everyone down.',
  'It was just a lot better, people stopped complaining.',
];
const STRONG = [
  'Checkout p99 fell from 1.2 s to 280 ms, mobile conversion recovered the 3%, worth about $4M a quarter, and chargebacks stayed flat at 0.08%.',
  'I ran it on 5% of traffic for two weeks, and we moved to Postgres 15.4 in 2024 for 1,000 merchants.',
];

describe('replaceInventedNumbers', () => {
  it.each([
    [
      'The pipeline failure rate dropped from ~33% to <5%, cutting average build time by 2 minutes per run.',
      'The pipeline failure rate dropped from ~[number]% to <[number]%, cutting average build time by [number] minutes per run.',
      3,
    ],
    [
      'After sharding, the number of support tickets related to CI dropped by 80%.',
      'After sharding, the number of support tickets related to CI dropped by [number]%.',
      1,
    ],
    ['Builds got 2x faster, saving $1.2M and 15 ms a call.', 'Builds got [number]x faster, saving $[number]M and [number] ms a call.', 3],
    ['It took 10–20 minutes for a 3-person team.', 'It took [number]–[number] minutes for a [number]-person team.', 3],
  ])('replaces the numbers of %j that the candidate never gave', (text, expected, count) => {
    expect(replaceInventedNumbers(text, WE_HEAVY)).toEqual({ text: expected, invented: count });
  });

  it('reuses numbers the candidate said, whatever their spacing, separators or trailing zeros', () => {
    const text = 'p99 went from 1.20 s to 280ms, the 3 % recovered $4 M a quarter, and 1000 merchants moved in 2024.';
    expect(replaceInventedNumbers(text, STRONG)).toEqual({ text, invented: 0 });
    expect(replaceInventedNumbers('We had 1,500 merchants', ['1500 merchants'])).toEqual({ text: 'We had 1,500 merchants', invented: 0 });
  });

  it('replaces a year, a version or a decimal the candidate did not say, as a whole numeral', () => {
    expect(replaceInventedNumbers('In 2023 we ran Postgres 15.4, then 16.1 and 15.', STRONG)).toEqual({
      text: 'In [number] we ran Postgres 15.4, then [number] and [number].',
      invented: 3,
    });
  });

  it('keeps numbers inside a quote of the candidate, and replaces only what the fix adds', () => {
    expect(replaceInventedNumbers('Instead of "I ran it on 5% of traffic", say "I ran it on 5% of traffic for 14 days".', STRONG)).toEqual({
      text: 'Instead of "I ran it on 5% of traffic", say "I ran it on 5% of traffic for [number] days".',
      invented: 1,
    });
  });

  it('keeps step numbers, list markers, ordinals, a 1:1, and numbers that are part of a name', () => {
    const text = 'Step 2: book a 1:1 or a 1-on-1.\n1. Say what you did in your 2nd month.\n2) Name the p99, v2.3.1, EC2 and GPT-4 changes.';
    expect(replaceInventedNumbers(text, WE_HEAVY)).toEqual({ text, invented: 0 });
  });

  it('leaves placeholders alone, but replaces a bracketed invented figure whole', () => {
    expect(replaceInventedNumbers('From [about 67%] to [95%] in [number] days, [X] hours, [p99 latency], [2024].', STRONG)).toEqual({
      text: 'From [number] to [number] in [number] days, [X] hours, [p99 latency], [2024].',
      invented: 2,
    });
  });

  it('changes nothing in text without digits', () => {
    expect(replaceInventedNumbers('Say what you did yourself, and what changed.', [])).toEqual({
      text: 'Say what you did yourself, and what changed.',
      invented: 0,
    });
  });
});
