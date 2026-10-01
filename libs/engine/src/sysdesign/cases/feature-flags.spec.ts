import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from './feature-flags.js';
import { CASE_LABS } from './labs.js';

const estimates = FEATURE_FLAGS.stages.flatMap((s) => (s.estimate ? [s.estimate] : []));
const text = JSON.stringify(FEATURE_FLAGS);

describe('feature flag case', () => {
  it('works its estimates out from the stated assumptions', () => {
    expect(estimates.map((e) => e.answer)).toEqual([5_000_000, 667]);
    expect(estimates[0].working[0]).toContain('250,000 requests a second × 20 flags each = 5,000,000');
    expect(estimates[1].working.at(-1)).toContain('667 MB a second, about 5.3 Gbit/s');
  });

  it('sizes the Design Lab build to the client evaluations and summaries it describes', () => {
    const { workload } = CASE_LABS['feature-flags'];
    expect(text).toContain('(25,000 requests a second), plus 667 summary uploads a second');
    expect(text).toContain(`about ${workload.rps.toLocaleString('en-US')} requests a second, ${workload.readRatio * 100}% reads`);
  });

  it('runs the bucketing and propagation models after the stage asks the learner to commit', () => {
    const widgets = FEATURE_FLAGS.stages.filter((s) => s.widget);
    expect(widgets.map((s) => s.widget)).toEqual(['bucketing', 'propagation']);
    for (const s of widgets) expect(Boolean(s.decision || s.estimate), s.title).toBe(true);
  });

  it('quotes the numbers its models give', () => {
    expect(text).toContain('63% of 30-second polls see a change and download the whole ruleset again, 422 MB/s');
    expect(text).toContain('cuts it to 1.7 MB/s, and a stream carries only the changes, 1.3 MB/s');
    expect(text).toContain('over 5 requests, 41% of users see both');
    expect(text).toContain('serve the new checkout to buckets below 1,000');
    expect(text).toContain('reaches every instance in about 0.7 s');
    expect(text).toContain('up to 601 s, about 10 minutes');
    expect(text).toContain('20,000 instances need 2 stream servers');
    expect(text).toContain('20,000 × 1 MB = 20 GB');
    expect(text).toContain('moves from 0.5% to 0.505%');
  });

  it('keeps one example rollout and error rates across the text', () => {
    expect(text).not.toMatch(/fails 2%|fails 0\.1%/);
    expect(text.match(/fails 0\.5% of requests today; the new path, it turns out, fails 1%/g)).toHaveLength(1);
    expect(text).toContain('shows 1% against 0.5%, double, even at 1%');
  });
});
