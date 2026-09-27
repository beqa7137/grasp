import type Anthropic from '@anthropic-ai/sdk';
import { providerUsage, supportedAuxiliaryUsage } from './pricing.js';

const COUNTERS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const;
const DELTA_FIELDS = new Set<string>([...COUNTERS, 'server_tool_use', 'output_tokens_details']);

export class StreamUsage {
  private verified = true;
  private previous: Record<(typeof COUNTERS)[number], number> | null = null;

  constructor(
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  get supported(): boolean {
    return this.verified && this.previous !== null;
  }

  observe(event: Anthropic.MessageStreamEvent): void {
    if (!this.verified) return;
    if (event.type === 'message_start') {
      if (this.previous) {
        this.verified = false;
        return;
      }
      const usage = providerUsage(this.model, this.maxTokens, true, event.message.usage);
      this.verified = usage.costUsd !== null;
      this.previous = {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
        cache_creation_input_tokens: usage.cacheWriteTokens,
      };
    } else if (event.type === 'message_delta') {
      const usage = event.usage;
      // The SDK discards unknown delta fields and overwrites cumulative counts before returning the final message.
      if (
        !this.previous ||
        Object.keys(usage).some((key) => !DELTA_FIELDS.has(key)) ||
        !supportedAuxiliaryUsage(usage, usage.output_tokens)
      ) {
        this.verified = false;
        return;
      }
      for (const key of COUNTERS) {
        const value = usage[key];
        if (key !== 'output_tokens' && value == null) continue;
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < this.previous[key]) {
          this.verified = false;
          return;
        }
        this.previous[key] = value;
      }
    }
  }
}
