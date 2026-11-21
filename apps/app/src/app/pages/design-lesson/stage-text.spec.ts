import { TEXT } from './latency-draw';
import { RELIABILITY_KEEP, RELIABILITY_PROSE_KEEP, wrapStage } from './reliability-text';
import { fontMeasure, proseLines } from './stage-text';

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

  it('breaks HTML prose so every line stops short of its box by the slack, keeping a kept run whole', () => {
    const body = fontMeasure({ body: { font: 'w400', size: 13 } });
    const t = 'The model: 200 keys of equal size, each hashed once. Under hash mod N a node that goes down is dropped from N.';
    for (let w = 120; w <= 400; w += 3) {
      const lines = proseLines(t, 13, w, [/\bhash mod N\b|\d+ keys/g]);
      expect(lines.join(' ')).toBe(t);
      for (const line of lines) expect(body.tw(line, 'body')).toBeLessThanOrEqual(w - 6);
      for (const line of lines) expect(line).not.toMatch(/\b(?:hash|mod|200)$/);
    }
    expect(proseLines(t, 13, 300, [], 40)).toEqual(body.wrap(t, 'body', 260));
  });

  it('flows a "·"-separated clause that fits a line onto one line, and opens no line on the "·"', () => {
    const parts = [
      ['66.7% busy', 'capB'],
      [' · 10,000/s spare · limit 30,000/s · if zone A fails, limit 20,000/s', 'cap'],
    ] as const;
    const text = (lines: ReturnType<typeof TEXT.flow>) => lines.map((ln) => ln.map((p) => p[0]).join(''));
    const w = Math.max(TEXT.partsWidth([parts[0], [' · 10,000/s spare', 'cap']]), TEXT.tw('limit 30,000/s · if zone A fails,', 'cap')) + 1;
    expect(TEXT.tw('if zone A fails, limit 20,000/s', 'cap')).toBeLessThan(w);
    expect(text(TEXT.flow(parts, w))).toEqual(['66.7% busy · 10,000/s spare', 'limit 30,000/s', 'if zone A fails, limit 20,000/s']);
    // A clause wider than a line still breaks inside, as words do.
    expect(text(TEXT.flow(parts, TEXT.tw('if zone A fails,', 'cap') + 8)).join(' | ')).toContain('if zone A fails, | limit 20,000/s');
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
