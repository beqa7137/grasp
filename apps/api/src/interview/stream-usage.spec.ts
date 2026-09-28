import type Anthropic from '@anthropic-ai/sdk';
import { StreamUsage } from './stream-usage.js';

function start(): Anthropic.MessageStreamEvent {
  return {
    type: 'message_start',
    message: {
      usage: {
        input_tokens: 1000,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_creation: null,
        inference_geo: 'global',
        service_tier: 'standard',
      },
    },
  } as Anthropic.MessageStreamEvent;
}

function delta(usage: Record<string, unknown>): Anthropic.MessageStreamEvent {
  return { type: 'message_delta', usage } as unknown as Anthropic.MessageStreamEvent;
}

describe('stream billing protocol', () => {
  it('requires initial usage before claiming the stream can be reconciled', () => {
    expect(new StreamUsage('claude-sonnet-5', 2048).supported).toBe(false);
  });

  it('does not let a second message reset cumulative usage', () => {
    const tracking = new StreamUsage('claude-sonnet-5', 2048);
    tracking.observe(start());
    tracking.observe(delta({ output_tokens: 1000 }));
    tracking.observe(start());
    tracking.observe(delta({ output_tokens: 40 }));
    expect(tracking.supported).toBe(false);
  });

  it('keeps a delta received before its initial message uncertain', () => {
    const tracking = new StreamUsage('claude-sonnet-5', 2048);
    tracking.observe(delta({ output_tokens: 40 }));
    tracking.observe(start());
    expect(tracking.supported).toBe(false);
  });

  it('accepts increasing cumulative counters and nullable unchanged input counters', () => {
    const tracking = new StreamUsage('claude-sonnet-5', 2048);
    tracking.observe(start());
    tracking.observe(delta({ input_tokens: 1500, output_tokens: 30, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 }));
    tracking.observe(delta({ input_tokens: null, output_tokens: 40, cache_read_input_tokens: null, cache_creation_input_tokens: null }));
    expect(tracking.supported).toBe(true);
  });

  it('bounds an interrupted stream by its reported input and every allowed output token', () => {
    const tracking = new StreamUsage('claude-sonnet-5', 2048);
    expect(tracking.costBoundUsd()).toBeNull();
    tracking.observe(start());
    tracking.observe(delta({ input_tokens: 1500, output_tokens: 40, cache_read_input_tokens: 100 }));
    expect(tracking.costBoundUsd()).toBeCloseTo(((1500 * 2 + 100 * 0.2 + 2048 * 10) * 1.1) / 1_000_000, 10);
    tracking.observe(start());
    expect(tracking.costBoundUsd()).toBeNull();
  });
});
