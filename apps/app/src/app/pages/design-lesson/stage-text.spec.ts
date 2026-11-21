import { TEXT } from './latency-draw';
import { RELIABILITY_KEEP, RELIABILITY_PROSE_KEEP, wrapStage } from './reliability-text';

describe('the stage text', () => {
  it('wraps without parting a number from its unit, nor inside a kept pair', () => {
    const t =
      'Week 44: DB 2 carries the request. In this simulated year the request failed 35 times, 20.3 h in all: 19 × 1 h + 16 × 5 min.';
    for (let w = 60; w <= 400; w += 7) {
      const lines = wrapStage(t, 'cap', w);
      expect(lines.join(' ')).toBe(t);
      expect(lines).toEqual(TEXT.wrap(t, 'cap', w, Infinity, RELIABILITY_KEEP));
      for (let i = 1; i < lines.length; i++) {
        const join = `${lines[i - 1].split(' ').pop()} ${lines[i].split(' ')[0]}`;
        expect(join).not.toMatch(/^\d[\d.,]* (h|min|s|×|times)\b|^(Week|DB) \d|^× |^\d[\d.,]* ×$/);
      }
    }
    for (let w = 40; w <= 200; w += 9)
      for (const line of TEXT.wrap('p99 at 230 ms and the mean at 35 ms over 2.5 s', 'cap', w)) expect(line).not.toMatch(/^(ms|s)\b/);
  });

  it('keeps a product in parentheses, a count times a duration, hours and days, and a copy’s or a week’s name with its number whole in the prose', () => {
    const text =
      'Week 44: DB 2 carries it. 17 × 1 h and 24 × 5 min, 8.8 h or 36.5 d, in 30 days with 2 databases. The 3 of Top 10: (0.88 shared outages × 1 h) + 26 s (optional).';
    expect([...text.matchAll(RELIABILITY_PROSE_KEEP)].map((k) => k[0])).toEqual([
      'Week 44',
      'DB 2',
      '17 × 1 h',
      '24 × 5 min',
      '8.8 h',
      '36.5 d',
      '(0.88 shared outages × 1 h)',
      '26 s',
    ]);
  });
});
