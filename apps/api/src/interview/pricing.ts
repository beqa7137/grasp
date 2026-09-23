import type { SessionUsage, TokenUsage } from './interview.types.js';

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

/** USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-09). */
const PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite5m: 2.5, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite5m: 5, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite5m: 1.25, cacheRead: 0.1 },
};

export function priceFor(model: string): ModelPrice | null {
  return PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, '')] ?? null;
}

export function costUsd(model: string, usage: Omit<TokenUsage, 'costUsd'>): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const micro =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheWriteTokens * price.cacheWrite5m +
    usage.cacheReadTokens * price.cacheRead;
  return micro / 1_000_000;
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
