import { CATALOG } from '../../test/support/fake-gateway.js';
import { maximumGatewayCostUsd } from './gateway-catalog.js';
import { BUILT_IN_MODELS, loadGatewayModel } from './gateway-model.js';

const LUNA = 'openai/gpt-6-luna';
const catalogFetch = (json: object) => vi.fn(async () => new Response(JSON.stringify(json))) as unknown as typeof fetch;

describe('BUILT_IN_MODELS', () => {
  it("holds GPT-6 Luna's catalog prices, bounded by its dearest tier and region", () => {
    expect(BUILT_IN_MODELS.get(LUNA)).toEqual({
      id: LUNA,
      contextTokens: 1_050_000,
      maxOutputTokens: 128_000,
      structuredOutput: true,
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      rates: { input: 0.0000001, output: 0.0000005, cacheRead: 0.00000001, cacheWrite: 0.000000125 },
      ceiling: { input: 0.00000022, output: 0.000000825, cacheRead: 0.000000022, cacheWrite: 0.000000275 },
    });
    expect(maximumGatewayCostUsd(BUILT_IN_MODELS.get(LUNA)!, 2048, 10_000)).toBeCloseTo(10_000 * 0.000000275 + 2048 * 0.000000825, 12);
  });
});

describe('loadGatewayModel', () => {
  it('takes the model from the live catalog', async () => {
    const fetchFn = catalogFetch(CATALOG);
    const loaded = await loadGatewayModel('google/gemini-3-flash', fetchFn);
    expect(loaded).toMatchObject({ source: 'catalog', model: { id: 'google/gemini-3-flash' } });
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe('https://ai-gateway.vercel.sh/v1/models');
  });

  it('refuses a model the catalog does not price, even one with built-in prices', async () => {
    expect(await loadGatewayModel(LUNA, catalogFetch({ data: [] }))).toEqual({
      model: null,
      reason: `${LUNA} is not a priced text model in the AI Gateway catalog.`,
    });
  });

  it.each<[string, typeof fetch]>([
    ['a network failure', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch],
    ['an error status', vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch],
    ['a malformed catalog', catalogFetch({ models: [] })],
  ])('falls back to the built-in prices after %s', async (_name, fetchFn) => {
    expect(await loadGatewayModel(LUNA, fetchFn)).toEqual({ model: BUILT_IN_MODELS.get(LUNA), source: 'built-in' });
  });

  it('gives up on a catalog that does not answer in time', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))),
    ) as unknown as typeof fetch;
    expect(await loadGatewayModel(LUNA, hang, 20)).toMatchObject({ source: 'built-in' });
  });

  it('refuses a model with neither catalog nor built-in prices', async () => {
    const down = vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    expect(await loadGatewayModel('openai/gpt-oss-120b', down)).toEqual({
      model: null,
      reason: 'The AI Gateway catalog is unreachable and openai/gpt-oss-120b has no built-in prices.',
    });
  });
});
