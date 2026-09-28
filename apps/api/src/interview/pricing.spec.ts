import { addUsage, costUsd, inputTokenBound, maximumCostUsd, messageUsage, priceFor } from './pricing.js';

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
    for (const model of ['claude-sonnet-5-20260901', 'claude-haiku-4-5-20990101', 'constructor', '__proto__']) {
      expect(priceFor(model)).toBeNull();
      expect(() => maximumCostUsd(model, 2048, true)).toThrow('verified pricing');
    }
  });

  it.each([
    ['claude-sonnet-5', 2.772528, 2.376],
    ['claude-opus-5-5', 5.545056, 4.752],
    ['claude-haiku-4-5', 0.26024, 0.28],
  ] as const)('bounds each %s attempt by full context, requested output and worst allowed geography', (model, reply, score) => {
    expect(maximumCostUsd(model, 2048, true)).toBeCloseTo(reply, 10);
    expect(maximumCostUsd(model, 16000, false)).toBeCloseTo(score, 10);
  });

  it('bounds input by the request size when it is below the context window', () => {
    const request = { system: 'Interviewer', messages: [{ role: 'user', content: 'héllo' }] };
    expect(inputTokenBound(request)).toBe(Buffer.byteLength(JSON.stringify(request)) + 8192);
    expect(maximumCostUsd('claude-sonnet-5', 2048, true, 10_000)).toBeCloseTo(((10_000 * 2.5 + 2048 * 10) * 1.1) / 1_000_000, 10);
    expect(maximumCostUsd('claude-sonnet-5', 2048, true, 10_000_000)).toBe(maximumCostUsd('claude-sonnet-5', 2048, true));
  });

  it.each([0, -1, 1.5, NaN, Infinity, 128001])('rejects invalid output limit %s before dispatch', (maxTokens) => {
    expect(() => maximumCostUsd('claude-sonnet-5', maxTokens, true)).toThrow(RangeError);
  });

  it('uses the lower Haiku output ceiling', () => {
    expect(() => maximumCostUsd('claude-haiku-4-5', 64001, false)).toThrow(RangeError);
    expect(maximumCostUsd('claude-haiku-4-5', 64000, false)).toBe(0.52);
  });

  it('includes geography premiums only on models that support them', () => {
    expect(costUsd('claude-sonnet-5', tokens, 'us')).toBeCloseTo(14.7 * 1.1);
    expect(costUsd('claude-haiku-4-5', tokens, 'us')).toBeCloseTo(7.35);
  });

  it('accumulates usage and keeps an unknown cost unknown', () => {
    const call = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1, costUsd: 0.5 };
    const twice = addUsage(addUsage(undefined, call), call);
    expect(twice).toEqual({ calls: 2, inputTokens: 20, outputTokens: 10, cacheReadTokens: 4, cacheWriteTokens: 2, costUsd: 1 });
    expect(addUsage(twice, { ...call, costUsd: null }).costUsd).toBeNull();
  });
});

describe('complete message billing', () => {
  const base = {
    model: 'claude-sonnet-5',
    type: 'message',
    role: 'assistant',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Ready.' }],
    usage: {
      input_tokens: 1000,
      output_tokens: 40,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 10,
      cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 0 },
      inference_geo: 'global',
      service_tier: 'standard',
      server_tool_use: null,
      output_tokens_details: null,
    },
  };

  it('prices validated final usage and keeps the bound above all permitted token categories', () => {
    expect(messageUsage(base.model, 2048, true, base).costUsd).toBeCloseTo(0.002429, 12);
    for (const model of ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001']) {
      const price = priceFor(model)!;
      const message = {
        ...base,
        model,
        usage: {
          ...base.usage,
          input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: price.contextTokens,
          output_tokens: 2048,
          inference_geo: price.supportsInferenceGeo ? 'us' : null,
          cache_creation: { ephemeral_5m_input_tokens: price.contextTokens, ephemeral_1h_input_tokens: 0 },
        },
      };
      expect(messageUsage(model, 2048, true, message).costUsd).toBeCloseTo(maximumCostUsd(model, 2048, true), 12);
    }
  });

  it.each([
    { input_tokens: 1_000_001 },
    { input_tokens: 999980 },
    { input_tokens: 0.5 },
    { input_tokens: null },
    { output_tokens: Infinity },
    { output_tokens: 2049 },
    { cache_read_input_tokens: undefined },
    { cache_creation_input_tokens: undefined },
    { inference_geo: undefined },
    { inference_geo: null },
    { inference_geo: 'regional' },
    { service_tier: undefined },
    { service_tier: null },
    { service_tier: 'priority' },
    { speed: 'fast' },
    { speed: 'future-mode' },
    { cache_creation: null },
    { cache_creation: [] },
    { cache_creation: { ephemeral_5m_input_tokens: 9, ephemeral_1h_input_tokens: 0 } },
    { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 1 } },
    { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 0, extra: 1 } },
    { server_tool_use: { web_search_requests: 1 } },
    { server_tool_use: { unknown_feature: 0 } },
    { server_tool_use: [] },
    { output_tokens_details: { thinking_tokens: 41 } },
    { output_tokens_details: { thinking_tokens: -1 } },
    { output_tokens_details: { unknown_charge: 0 } },
    { future_cost: 10 },
  ])('retains uncertainty for unsupported usage %j', (usage) => {
    expect(messageUsage(base.model, 2048, true, { ...base, usage: { ...base.usage, ...usage } }).costUsd).toBeNull();
  });

  it('rejects cache usage on a request that did not enable caching', () => {
    expect(messageUsage(base.model, 16000, false, base).costUsd).toBeNull();
  });

  it.each([
    null,
    {},
    { ...base, model: 'claude-opus-5-5' },
    { ...base, content: [{ type: 'server_tool_use' }] },
    { ...base, stop_reason: null },
    { ...base, stop_reason: 'pause_turn' },
    { ...base, type: undefined },
    { ...base, role: undefined },
  ])('retains uncertainty for an incomplete or unexpected message', (message) => {
    expect(messageUsage(base.model, 2048, true, message).costUsd).toBeNull();
  });
});
