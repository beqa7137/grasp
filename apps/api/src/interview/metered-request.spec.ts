import Anthropic from '@anthropic-ai/sdk';
import { meteredRequest } from './metered-request.js';
import type { SpendGuard } from './spend-guard.js';

function setup(error: unknown, options: { connected?: boolean; maxRetries?: number; signal?: AbortSignal } = {}) {
  const order: string[] = [];
  const spend = {
    reserve: vi.fn(async () => {
      order.push('reserve');
      return { id: crypto.randomUUID() };
    }),
    settle: vi.fn(async (_reservation: unknown, cost: number | null) => {
      order.push(`settle:${cost}`);
    }),
  };
  const request = vi.fn(async (connected: () => void) => {
    order.push('request');
    if (request.mock.calls.length === 1) {
      if (options.connected) connected();
      throw error;
    }
    return 0.25;
  });
  const pending = meteredRequest({
    spend: spend as unknown as SpendGuard,
    maximumCostUsd: 3,
    maxRetries: options.maxRetries ?? 1,
    request,
    costUsd: (result) => result,
    signal: options.signal,
  });
  return { spend, request, order, pending };
}

afterEach(() => vi.restoreAllMocks());

describe('metered provider retries', () => {
  it.each([408, 409, 429, 500, 529])('releases a definite HTTP%s failure before reserving its retry', async (status) => {
    const error = new Anthropic.APIError(status, {}, '', new Headers({ 'retry-after-ms': '1' }));
    const { pending, order } = setup(error);
    await expect(pending).resolves.toBe(0.25);
    expect(order).toEqual(['reserve', 'request', 'settle:0', 'reserve', 'request', 'settle:0.25']);
  });

  it('honors the provider retry override for normally permanent responses', async () => {
    const error = new Anthropic.APIError(400, {}, '', new Headers({ 'x-should-retry': 'true', 'retry-after-ms': '1' }));
    await expect(setup(error).pending).resolves.toBe(0.25);
  });

  it.each([
    new Anthropic.APIError(429, {}, '', new Headers({ 'x-should-retry': 'false' })),
    new Anthropic.APIError(401, {}, '', new Headers()),
  ])('honors nonretryable HTTP responses', async (error) => {
    const { pending, request, spend } = setup(error);
    await expect(pending).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
    expect(spend.settle.mock.calls[0][1]).toBe(0);
  });

  it('retains timed out attempts instead of refunding them before retries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { pending, order } = setup(new Anthropic.APIConnectionTimeoutError());
    await expect(pending).resolves.toBe(0.25);
    expect(order).toEqual(['reserve', 'request', 'settle:null', 'reserve', 'request', 'settle:0.25']);
  });

  it('aborts a long Retry-After wait without allocating another reservation', async () => {
    const abort = new AbortController();
    const error = new Anthropic.APIError(529, {}, '', new Headers({ 'retry-after': '60' }));
    const { pending, request, spend } = setup(error, { signal: abort.signal });
    const rejected = expect(pending).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    await vi.waitFor(() => expect(spend.settle).toHaveBeenCalled());
    abort.abort();
    await rejected;
    expect(request).toHaveBeenCalledTimes(1);
    expect(spend.reserve).toHaveBeenCalledTimes(1);
  });

  it('does not retry or refund a failure after the stream connects', async () => {
    const error = new Anthropic.APIError(529, {}, '', new Headers());
    const { pending, order } = setup(error, { connected: true });
    await expect(pending).rejects.toBe(error);
    expect(order).toEqual(['reserve', 'request', 'settle:null']);
  });

  it('does not refund malformed successful responses or unknown errors', async () => {
    const error = new SyntaxError('Unexpected JSON');
    const { pending, order } = setup(error);
    await expect(pending).rejects.toBe(error);
    expect(order).toEqual(['reserve', 'request', 'settle:null']);
  });
});
