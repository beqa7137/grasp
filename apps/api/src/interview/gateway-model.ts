import { fetchGatewayCatalog, GATEWAY_URL, parseGatewayCatalog, type GatewayModel } from './gateway-catalog.js';

/**
 * The catalog entry production runs (checked 2026-09-30), used only when the catalog cannot be reached at startup, so
 * a cold start during a catalog outage still bounds spend with verified prices instead of losing the AI interviewer.
 */
export const BUILT_IN_MODELS = parseGatewayCatalog({
  data: [
    {
      id: 'openai/gpt-6-luna',
      context_window: 1_050_000,
      max_tokens: 128_000,
      supported_parameters: ['max_tokens', 'reasoning', 'response_format', 'structured_outputs'],
      reasoning_options: [{ type: 'toggle' }, { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] }],
      pricing: {
        input: '0.0000001',
        input_tiers: [{ cost: '0.0000001' }, { cost: '0.0000002' }],
        output: '0.0000005',
        output_tiers: [{ cost: '0.0000005' }, { cost: '0.00000075' }],
        input_cache_read: '0.00000001',
        input_cache_read_tiers: [{ cost: '0.00000001' }, { cost: '0.00000002' }],
        input_cache_write: '0.000000125',
        input_cache_write_tiers: [{ cost: '0.000000125' }, { cost: '0.00000025' }],
        regional: {
          us: {
            input: '0.00000011',
            input_tiers: [{ cost: '0.00000011' }, { cost: '0.00000022' }],
            output: '0.00000055',
            output_tiers: [{ cost: '0.00000055' }, { cost: '0.000000825' }],
            input_cache_read: '0.000000011',
            input_cache_read_tiers: [{ cost: '0.000000011' }, { cost: '0.000000022' }],
            input_cache_write: '0.0000001375',
            input_cache_write_tiers: [{ cost: '0.0000001375' }, { cost: '0.000000275' }],
          },
        },
      },
    },
  ],
});

export type LoadedGatewayModel = { model: GatewayModel; source: 'catalog' | 'built-in' } | { model: null; reason: string };

export async function loadGatewayModel(
  id: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5_000,
  baseUrl = GATEWAY_URL,
): Promise<LoadedGatewayModel> {
  let catalog: Map<string, GatewayModel>;
  try {
    catalog = await fetchGatewayCatalog(fetchFn, baseUrl, AbortSignal.timeout(timeoutMs));
  } catch {
    const known = BUILT_IN_MODELS.get(id);
    return known
      ? { model: known, source: 'built-in' }
      : { model: null, reason: `The AI Gateway catalog is unreachable and ${id} has no built-in prices.` };
  }
  const model = catalog.get(id);
  return model ? { model, source: 'catalog' } : { model: null, reason: `${id} is not a priced text model in the AI Gateway catalog.` };
}
