import { CATALOG, gatewayModel } from '../../test/support/fake-gateway.js';
import { fetchGatewayCatalog, gatewayCostUsd, maximumGatewayCostUsd, parseGatewayCatalog, reasoningEffort } from './gateway-catalog.js';

describe('parseGatewayCatalog', () => {
  it('reads per-token rates, limits, structured output and effort levels', () => {
    const sonnet = gatewayModel('anthropic/claude-sonnet-5.5');
    expect(sonnet).toEqual({
      id: 'anthropic/claude-sonnet-5.5',
      contextTokens: 1_000_000,
      maxOutputTokens: 128_000,
      structuredOutput: true,
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      rates: { input: 0.000002, output: 0.00001, cacheRead: 0.0000002, cacheWrite: 0.0000025 },
      ceiling: { input: 0.0000022, output: 0.000011, cacheRead: 0.00000022, cacheWrite: 0.00000275 },
    });
  });

  it('bills cache classes a model does not price at its input rate and bounds spend by its dearest tier', () => {
    const gemini = gatewayModel('google/gemini-3-flash');
    expect(gemini.rates).toEqual({ input: 0.0000005, output: 0.000003, cacheRead: 0.00000005, cacheWrite: 0.0000005 });
    expect(gemini.ceiling.input).toBe(0.000001);
  });

  it('marks models without response_format and leaves out entries without text pricing', () => {
    const catalog = parseGatewayCatalog(CATALOG);
    expect(catalog.get('alibaba/qwen3.7-plus')!.structuredOutput).toBe(false);
    expect(catalog.has('openai/gpt-image-2')).toBe(false);
    expect(catalog.size).toBe(4);
  });

  it('rejects a catalog without a data list', () => {
    expect(() => parseGatewayCatalog({ models: [] })).toThrow();
  });

  it('fetches the public catalog without credentials', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(CATALOG)));
    const catalog = await fetchGatewayCatalog(fetch as unknown as typeof globalThis.fetch);
    expect(fetch).toHaveBeenCalledWith('https://ai-gateway.vercel.sh/v1/models');
    expect(catalog.has('google/gemini-3-flash')).toBe(true);
  });

  it('fails on an error response', async () => {
    const fetch = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchGatewayCatalog(fetch as unknown as typeof globalThis.fetch)).rejects.toThrow('503');
  });
});

describe('reasoningEffort', () => {
  it('uses the wanted level, the next stronger one, or none for models without effort', () => {
    expect(reasoningEffort(gatewayModel('anthropic/claude-sonnet-5.5'), 'low')).toBe('low');
    expect(reasoningEffort(gatewayModel('google/gemini-3-flash'), 'medium')).toBe('high');
    expect(reasoningEffort(gatewayModel('anthropic/claude-haiku-4.5'), 'medium')).toBeUndefined();
  });
});

describe('gateway cost', () => {
  it('prices each token class at the catalog rate', () => {
    const cost = gatewayCostUsd(gatewayModel('anthropic/claude-sonnet-5.5'), {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 10_000,
      cacheWriteTokens: 0,
    });
    expect(cost).toBeCloseTo(0.002 + 0.001 + 0.002, 10);
  });

  it('bounds a request by its input at the dearer of input and cache write plus every output token', () => {
    const sonnet = gatewayModel('anthropic/claude-sonnet-5.5');
    expect(maximumGatewayCostUsd(sonnet, 2048, 10_000)).toBeCloseTo(10_000 * 0.00000275 + 2048 * 0.000011, 10);
    expect(maximumGatewayCostUsd(gatewayModel('anthropic/claude-haiku-4.5'), 1, 5_000_000)).toBeCloseTo(
      200_000 * 0.00000125 + 0.000005,
      10,
    );
    expect(() => maximumGatewayCostUsd(sonnet, 128_001, 1)).toThrow(RangeError);
    expect(() => maximumGatewayCostUsd(sonnet, 0, 1)).toThrow(RangeError);
  });
});
