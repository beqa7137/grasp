import { describe, expect, it } from 'vitest';
import {
  FIRST_RETRY_STOPS,
  LIFETIME_STOPS,
  LONGEST_STOPS,
  OUTAGE_STOPS,
  SMTP_RETRY,
  attemptTimes,
  bounceAfter,
  durationSpoken,
  durationText,
  retryWait,
  smtpRetry,
  smtpRetryCheckpoint,
  type SmtpReply,
  type SmtpRetrySettings,
} from './smtp-retry.js';

const REPLIES: SmtpReply[] = ['temporary', 'permanent'];

/** Every setting the controls allow. */
function* sweep(): Generator<SmtpRetrySettings> {
  for (const reply of REPLIES)
    for (const outageMin of OUTAGE_STOPS)
      for (const firstRetryMin of FIRST_RETRY_STOPS)
        for (const longestMin of LONGEST_STOPS)
          for (const lifetimeMin of LIFETIME_STOPS) yield { outageMin, firstRetryMin, longestMin, lifetimeMin, reply };
}

const base: SmtpRetrySettings = { outageMin: 360, firstRetryMin: 5, longestMin: 60, lifetimeMin: 7_200, reply: 'temporary' };

/**
 * Follows each message sent during the outage on its own: sent `age` minutes before the server is back, it bounces if its
 * give-up attempt came before then, and otherwise is delivered at its first attempt after.
 */
function everyMessage(s: SmtpRetrySettings) {
  const times = attemptTimes(s.firstRetryMin, s.longestMin, s.outageMin + s.lifetimeMin);
  const giveUp = bounceAfter(s);
  let queued = 0;
  let bounced = 0;
  let longestWait = 0;
  const sent = SMTP_RETRY.perMinute * s.outageMin;
  for (let i = 0; i < sent; i++) {
    const age = s.outageMin - i / SMTP_RETRY.perMinute;
    if (giveUp < age) {
      bounced++;
      continue;
    }
    queued++;
    longestWait = Math.max(longestWait, times.find((t) => t >= age)! - age);
  }
  return { queued, bounced, longestWait };
}

describe('attempt schedule', () => {
  it('doubles the wait from the first retry up to the cap, and sums the waits into attempt times', () => {
    expect([1, 2, 3, 4, 5].map((k) => retryWait(k, 5, 60))).toEqual([5, 10, 20, 40, 60]);
    expect(attemptTimes(5, 60, 360)).toEqual([0, 5, 15, 35, 75, 135, 195, 255, 315, 375]);
    for (const first of FIRST_RETRY_STOPS)
      for (const longest of LONGEST_STOPS) {
        const times = attemptTimes(first, longest, 10_080);
        times.slice(1).forEach((t, i) => expect(t - times[i]).toBe(retryWait(i + 1, first, longest)));
        expect(times.at(-1)).toBeGreaterThanOrEqual(10_080);
        expect(times.at(-2)).toBeLessThan(10_080);
      }
  });
});

describe('the retry model', () => {
  it('delivers a message at the first attempt at or after the outage, or bounces it at the first past its lifetime', () => {
    for (const s of sweep()) {
      if (s.reply === 'permanent') continue;
      const run = smtpRetry(s);
      const at = JSON.stringify(s);
      const times = attemptTimes(s.firstRetryMin, s.longestMin, Math.max(s.outageMin, s.lifetimeMin));
      const delivery = times.find((t) => t >= s.outageMin)!;
      const giveUp = times.find((t) => t >= s.lifetimeMin)!;
      expect(run.outcome, at).toBe(delivery <= giveUp ? 'delivered' : 'bounced');
      expect(run.atMin, at).toBe(Math.min(delivery, giveUp));
      expect(run.attempts, at).toEqual(times.filter((t) => t <= run.atMin));
      expect(run.afterRecoveryMin, at).toBe(run.outcome === 'delivered' ? delivery - s.outageMin : null);
      expect(run.afterRecoveryMin ?? 0).toBeLessThanOrEqual(s.longestMin);
    }
  });

  it("counts the queue and the bounces like following every message, and drains within the oldest message's interval", () => {
    const samples = [...sweep()].filter((s, i) => s.reply === 'temporary' && i % 37 === 0);
    expect(samples.length).toBeGreaterThan(50);
    for (const s of [...samples, base, { ...base, outageMin: 8_640 }]) {
      const run = smtpRetry(s);
      const each = everyMessage(s);
      const at = JSON.stringify(s);
      expect(run.queued, at).toBe(each.queued);
      expect(run.bounced, at).toBe(each.bounced);
      expect(run.queued + run.bounced).toBe(SMTP_RETRY.perMinute * s.outageMin);
      expect(each.longestWait, at).toBeLessThanOrEqual(run.drainMin);
      expect(each.longestWait, at).toBeGreaterThanOrEqual(run.drainMin - 1 / SMTP_RETRY.perMinute - 1e-9);
    }
  });

  it('bounces everything at once on a 5xx, retrying nothing', () => {
    for (const s of sweep()) {
      if (s.reply === 'temporary') continue;
      expect(smtpRetry(s)).toEqual({
        attempts: [0],
        outcome: 'bounced',
        atMin: 0,
        afterRecoveryMin: null,
        queued: 0,
        bounced: SMTP_RETRY.perMinute * s.outageMin,
        drainMin: 0,
      });
    }
  });

  it('handles an outage ending on an attempt, a give-up past the outage, and bad settings', () => {
    const onTime = smtpRetry({ ...base, outageMin: 15 });
    expect(onTime).toMatchObject({ outcome: 'delivered', atMin: 15, afterRecoveryMin: 0, queued: 300, drainMin: 10 });
    // Gives up at the first attempt at or after 4 h, 4 h 15 min, which is after the 4 h 10 min outage: delivered then.
    const late = smtpRetry({ ...base, outageMin: 250, lifetimeMin: 240 });
    expect(late).toMatchObject({ outcome: 'delivered', atMin: 255, bounced: 0, queued: 5_000 });
    expect(smtpRetry({ ...base, outageMin: 8_640 })).toMatchObject({ outcome: 'bounced', atMin: 7_215, queued: 144_300, bounced: 28_500 });
    expect(() => smtpRetry({ ...base, outageMin: 0 })).toThrow();
    expect(() => smtpRetry({ ...base, longestMin: 2 })).toThrow();
  });
});

describe('the retry checkpoint', () => {
  it("has exactly one right answer, the model's, among at least three distinct choices, on every setting", () => {
    const asked = new Set<string>();
    for (const s of sweep()) {
      const at = JSON.stringify(s);
      const run = smtpRetry(s);
      const c = smtpRetryCheckpoint(s, run);
      const right = c.choices[c.answer];
      if (c.prompt.endsWith('What happens to a message sent as the outage begins?')) {
        asked.add('fate');
        const expected =
          run.outcome === 'delivered'
            ? `Delivered after ${durationText(run.atMin)}`
            : run.atMin === 0
              ? 'Bounced at once, on the first attempt'
              : `Bounced after ${durationText(run.atMin)}`;
        expect(right, at).toBe(expected);
      } else if (c.prompt.includes('How many delivery attempts')) {
        asked.add('attempts');
        expect(right, at).toBe(`${run.attempts.length} attempt${run.attempts.length === 1 ? '' : 's'}`);
      } else {
        asked.add('drain');
        expect(right, at).toBe(durationText(run.drainMin));
      }
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
    expect([...asked].sort()).toEqual(['attempts', 'drain', 'fate']);
  });

  it('says waiting out the backoff is this model and Postfix by default, not a rule', () => {
    const c = smtpRetryCheckpoint(base);
    expect(c.prompt).toContain('how long until the last of them still queued is delivered?');
    expect(c.explain).toMatch(/^In this model, as in Postfix by default, nothing tells the queue the server is back/);
  });

  it('asks the fate for a 5xx, from the settings', () => {
    const c = smtpRetryCheckpoint({ ...base, reply: 'permanent' });
    expect(c.choices[c.answer]).toBe('Bounced at once, on the first attempt');
    expect(c.prompt).toContain('answers 550 (permanent failure)');
    expect(c.explain).toContain('must answer 4xx, never 5xx');
  });
});

describe('durations', () => {
  it('names days, hours and minutes, leaving out the zero parts', () => {
    expect([0, 0.5, 5, 60, 375, 1_440, 7_215, 10_080].map(durationText)).toEqual([
      '0 s',
      '30 s',
      '5 min',
      '1 h',
      '6 h 15 min',
      '1 d',
      '5 d 15 min',
      '7 d',
    ]);
    expect([1, 60, 375, 2_880].map(durationSpoken)).toEqual(['1 minute', '1 hour', '6 hours 15 minutes', '2 days']);
  });
});
