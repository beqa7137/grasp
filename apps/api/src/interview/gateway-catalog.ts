import { z } from 'zod';
import type { TokenUsage } from './interview.types.js';

export const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';

/** USD per token. */
export interface TokenRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface GatewayModel {
  id: string;
  contextTokens: number;
  maxOutputTokens: number;
  /** Whether the catalog lists `response_format`, which is how chat completions request a JSON schema. */
  structuredOutput: boolean;
  efforts: string[];
  rates: TokenRates;
  /** The highest rate of each class across tiers and regions, for spend bounds. */
  ceiling: TokenRates;
}

const price = z.string().regex(/^\d+(\.\d+)?(e-?\d+)?$/i);
const tiers = z.array(z.object({ cost: price })).optional();
const rateFields = z.object({
  input: price,
  output: price,
  input_cache_read: price.optional(),
  input_cache_write: price.optional(),
});
const catalogModel = z.object({
  id: z.string(),
  context_window: z.number().int().positive(),
  max_tokens: z.number().int().positive(),
  supported_parameters: z.array(z.string()).optional(),
  reasoning_options: z.array(z.object({ type: z.string(), values: z.array(z.string()).optional() })).optional(),
  pricing: rateFields.extend({
    input_tiers: tiers,
    output_tiers: tiers,
    input_cache_read_tiers: tiers,
    input_cache_write_tiers: tiers,
    regional: z.record(z.string(), rateFields.partial()).optional(),
  }),
});

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function rates(p: z.infer<typeof rateFields>): TokenRates {
  const input = Number(p.input);
  return {
    input,
    output: Number(p.output),
    cacheRead: Number(p.input_cache_read ?? p.input),
    cacheWrite: Number(p.input_cache_write ?? p.input),
  };
}

function ceiling(p: z.infer<typeof catalogModel>['pricing']): TokenRates {
  const top = (base: number, ...more: (string | undefined)[]) => Math.max(base, ...more.filter((v) => v !== undefined).map(Number));
  const base = rates(p);
  const regions = Object.values(p.regional ?? {});
  const costs = (t: typeof p.input_tiers) => (t ?? []).map((x) => x.cost);
  return {
    input: top(base.input, ...costs(p.input_tiers), ...regions.map((r) => r.input)),
    output: top(base.output, ...costs(p.output_tiers), ...regions.map((r) => r.output)),
    cacheRead: top(base.cacheRead, ...costs(p.input_cache_read_tiers), ...regions.map((r) => r.input_cache_read)),
    cacheWrite: top(base.cacheWrite, ...costs(p.input_cache_write_tiers), ...regions.map((r) => r.input_cache_write)),
  };
}

/** Entries without per-token text pricing (image, embedding and video models) are left out. */
export function parseGatewayCatalog(json: unknown): Map<string, GatewayModel> {
  const data = z.object({ data: z.array(z.unknown()) }).parse(json).data;
  const models = new Map<string, GatewayModel>();
  for (const entry of data) {
    const parsed = catalogModel.safeParse(entry);
    if (!parsed.success) continue;
    const m = parsed.data;
    models.set(m.id, {
      id: m.id,
      contextTokens: m.context_window,
      maxOutputTokens: m.max_tokens,
      structuredOutput: m.supported_parameters?.includes('response_format') ?? false,
      efforts: (m.reasoning_options ?? []).flatMap((o) => (o.type === 'effort' ? (o.values ?? []) : [])),
      rates: rates(m.pricing),
      ceiling: ceiling(m.pricing),
    });
  }
  return models;
}

export async function fetchGatewayCatalog(fetchFn: typeof fetch = fetch, baseUrl = GATEWAY_URL): Promise<Map<string, GatewayModel>> {
  const response = await fetchFn(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`The gateway model catalog returned ${response.status}`);
  return parseGatewayCatalog(await response.json());
}

/** The wanted effort when the model offers it, else the nearest stronger one, else its strongest; none for models without effort. */
export function reasoningEffort(model: GatewayModel, wanted: string): string | undefined {
  const rank = (e: string) => EFFORTS.indexOf(e);
  const offered = model.efforts.filter((e) => rank(e) >= 0).sort((a, b) => rank(a) - rank(b));
  return offered.find((e) => rank(e) >= rank(wanted)) ?? offered.at(-1);
}

/**
 * Base rates: tiered prices start at 200k prompt tokens, far past an interview, and regional prices apply only
 * to requests pinned to a region, which these are not.
 */
export function gatewayCostUsd(model: GatewayModel, usage: Omit<TokenUsage, 'costUsd'>): number {
  const r = model.rates;
  return (
    usage.inputTokens * r.input +
    usage.outputTokens * r.output +
    usage.cacheReadTokens * r.cacheRead +
    usage.cacheWriteTokens * r.cacheWrite
  );
}

export function maximumGatewayCostUsd(model: GatewayModel, maxTokens: number, inputTokens: number): number {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > model.maxOutputTokens) {
    throw new RangeError('The AI output limit is outside the supported model range.');
  }
  const c = model.ceiling;
  return Math.min(inputTokens, model.contextTokens) * Math.max(c.input, c.cacheWrite) + maxTokens * c.output;
}
