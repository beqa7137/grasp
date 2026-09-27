import type { SessionUsage, TokenUsage } from './interview.types.js';

interface ModelPrice {
  model: string;
  contextTokens: number;
  maxOutputTokens: number;
  supportsEffort: boolean;
  supportsInferenceGeo: boolean;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

/** USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-09). */
const PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-5': {
    model: 'claude-sonnet-5',
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsEffort: true,
    supportsInferenceGeo: true,
    input: 2,
    output: 10,
    cacheWrite5m: 2.5,
    cacheRead: 0.2,
  },
  'claude-opus-5-5': {
    model: 'claude-opus-5-5',
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsEffort: true,
    supportsInferenceGeo: true,
    input: 4,
    output: 20,
    cacheWrite5m: 5,
    cacheRead: 0.2,
  },
  'claude-haiku-4-5-20251001': {
    model: 'claude-haiku-4-5-20251001',
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    supportsEffort: false,
    supportsInferenceGeo: false,
    input: 1,
    output: 5,
    cacheWrite5m: 1.25,
    cacheRead: 0.1,
  },
};

export function priceFor(model: string): ModelPrice | null {
  const key = model === 'claude-haiku-4-5' ? 'claude-haiku-4-5-20251001' : model;
  return Object.hasOwn(PRICES, key) ? PRICES[key] : null;
}

export function maximumCostUsd(model: string, maxTokens: number, cacheEnabled: boolean): number {
  const price = priceFor(model);
  if (!price) throw new RangeError('The AI model has no verified pricing and limits.');
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > price.maxOutputTokens) {
    throw new RangeError('The AI output limit is outside the supported model range.');
  }
  // Token counting is an estimate. The provider context ceiling covers hidden format prompts too.
  const inputRate = cacheEnabled ? price.cacheWrite5m : price.input;
  return ((price.contextTokens * inputRate + maxTokens * price.output) * (price.supportsInferenceGeo ? 1.1 : 1)) / 1_000_000;
}

export function costUsd(model: string, usage: Omit<TokenUsage, 'costUsd'>, inferenceGeo: 'global' | 'us' = 'global'): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const micro =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheWriteTokens * price.cacheWrite5m +
    usage.cacheReadTokens * price.cacheRead;
  return (micro * (inferenceGeo === 'us' && price.supportsInferenceGeo ? 1.1 : 1)) / 1_000_000;
}

const USAGE_FIELDS = new Set([
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'cache_creation',
  'inference_geo',
  'service_tier',
  'server_tool_use',
  'output_tokens_details',
  'speed',
]);

export function messageUsage(model: string, maxTokens: number, cacheEnabled: boolean, message: unknown): TokenUsage {
  const response = object(message);
  const usage = providerUsage(model, maxTokens, cacheEnabled, response?.['usage']);
  const unknown = { ...usage, costUsd: null };
  if (response?.['model'] !== priceFor(model)?.model || response?.['type'] !== 'message' || response?.['role'] !== 'assistant') {
    return unknown;
  }
  if (
    !['end_turn', 'max_tokens', 'stop_sequence', 'refusal', 'model_context_window_exceeded'].includes(response['stop_reason'] as string)
  ) {
    return unknown;
  }
  const content = response['content'];
  if (
    !Array.isArray(content) ||
    content.some((block) => !['text', 'thinking', 'redacted_thinking'].includes(object(block)?.['type'] as string))
  ) {
    return unknown;
  }
  return usage;
}

export function providerUsage(model: string, maxTokens: number, cacheEnabled: boolean, rawUsage: unknown): TokenUsage {
  const usage = object(rawUsage);
  const input = usage?.['input_tokens'];
  const output = usage?.['output_tokens'];
  const read = usage?.['cache_read_input_tokens'];
  const write = usage?.['cache_creation_input_tokens'];
  const tokens = {
    inputTokens: tokenCount(input) ? input : 0,
    outputTokens: tokenCount(output) ? output : 0,
    cacheReadTokens: tokenCount(read) ? read : 0,
    cacheWriteTokens: tokenCount(write) ? write : 0,
  };
  const unknown = { ...tokens, costUsd: null };
  const price = priceFor(model);
  if (!price || !usage) return unknown;
  if (!tokenCount(input) || !tokenCount(output) || !tokenCount(read) || !tokenCount(write)) return unknown;
  if (input + read + write > price.contextTokens || output > maxTokens) return unknown;
  if (Object.keys(usage).some((key) => !USAGE_FIELDS.has(key))) return unknown;
  if (usage['service_tier'] !== 'standard' || (usage['speed'] != null && usage['speed'] !== 'standard')) return unknown;
  const geo = usage['inference_geo'];
  if (price.supportsInferenceGeo ? geo !== 'global' && geo !== 'us' : geo !== 'global' && geo !== null) return unknown;
  if (!cacheEnabled && (read !== 0 || write !== 0)) return unknown;
  const cache = object(usage['cache_creation']);
  if (cache) {
    if (Object.keys(cache).some((key) => key !== 'ephemeral_5m_input_tokens' && key !== 'ephemeral_1h_input_tokens')) return unknown;
    if (cache['ephemeral_5m_input_tokens'] !== write || cache['ephemeral_1h_input_tokens'] !== 0) return unknown;
  } else if (write !== 0 || usage['cache_creation'] != null) return unknown;
  if (!supportedAuxiliaryUsage(usage, output)) return unknown;
  return { ...tokens, costUsd: costUsd(model, tokens, geo === 'us' ? 'us' : 'global') };
}

export function supportedAuxiliaryUsage(rawUsage: unknown, output: number): boolean {
  const usage = object(rawUsage);
  if (!usage) return false;
  const tools = object(usage['server_tool_use']);
  if (tools) {
    if (Object.keys(tools).some((key) => key !== 'web_search_requests' && key !== 'web_fetch_requests')) return false;
    if (Object.values(tools).some((value) => value !== 0)) return false;
  } else if (usage['server_tool_use'] != null) return false;
  const details = object(usage['output_tokens_details']);
  if (details) {
    if (Object.keys(details).some((key) => key !== 'thinking_tokens')) return false;
    if (!tokenCount(details['thinking_tokens']) || details['thinking_tokens'] > output) return false;
  } else if (usage['output_tokens_details'] != null) return false;
  return true;
}

function tokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function addUsage(total: SessionUsage | undefined, usage: TokenUsage): SessionUsage {
  const base = total ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  return {
    calls: base.calls + 1,
    inputTokens: base.inputTokens + usage.inputTokens,
    outputTokens: base.outputTokens + usage.outputTokens,
    cacheReadTokens: base.cacheReadTokens + usage.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + usage.cacheWriteTokens,
    costUsd: base.costUsd === null || usage.costUsd === null ? null : base.costUsd + usage.costUsd,
  };
}
