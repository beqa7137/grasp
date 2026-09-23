import { addUsage, costUsd, priceFor } from './pricing.js';

const tokens = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };

describe('pricing', () => {
  it('prices every token class per model', () => {
    expect(costUsd('claude-sonnet-5', tokens)).toBeCloseTo(2 + 10 + 0.2 + 2.5);
    expect(costUsd('claude-opus-5-5', tokens)).toBeCloseTo(4 + 20 + 0.2 + 5);
    expect(costUsd('claude-haiku-4-5', tokens)).toBeCloseTo(1 + 5 + 0.1 + 1.25);
  });

  it('resolves dated snapshots and returns null for unknown models', () => {
    expect(priceFor('claude-haiku-4-5-20251001')).toEqual(priceFor('claude-haiku-4-5'));
    expect(costUsd('some-future-model', tokens)).toBeNull();
  });

  it('accumulates usage and keeps an unknown cost unknown', () => {
    const call = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1, costUsd: 0.5 };
    const twice = addUsage(addUsage(undefined, call), call);
    expect(twice).toEqual({ calls: 2, inputTokens: 20, outputTokens: 10, cacheReadTokens: 4, cacheWriteTokens: 2, costUsd: 1 });
    expect(addUsage(twice, { ...call, costUsd: null }).costUsd).toBeNull();
  });
});
