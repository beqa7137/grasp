import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, daysLeftLabel } from './options.js';

describe('the interview countdown', () => {
  it('counts calendar days and names the last two', () => {
    expect(calendarDaysBetween('2026-10-02', '2026-10-25')).toBe(23);
    expect(daysLeftLabel(23)).toBe('23 days left');
    expect(daysLeftLabel(1)).toBe('interview tomorrow');
    expect(daysLeftLabel(0)).toBe('interview today');
    expect(daysLeftLabel(-1)).toBe('date passed');
  });
});
