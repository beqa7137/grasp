import Anthropic, { RetryableError } from '@anthropic-ai/sdk';
import { setTimeout as sleep } from 'node:timers/promises';
import type { SpendGuard } from './spend-guard.js';

interface MeteredRequest<T> {
  spend: SpendGuard;
  maximumCostUsd: number;
  maxRetries: number;
  request: (streamConnected: () => void) => Promise<T>;
  costUsd: (result: T) => number | null;
  /** The most a request that fails after its stream started can have cost, when the stream reported enough to say. */
  costBoundAfterStart?: () => number | null;
  signal?: AbortSignal;
}

export async function meteredRequest<T>(options: MeteredRequest<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(options.signal);
    const reservation = await options.spend.reserve(options.maximumCostUsd);
    if (options.signal?.aborted) {
      await options.spend.settle(reservation, 0);
      throw new Anthropic.APIUserAbortError();
    }
    let streaming = false;
    try {
      const result = await options.request(() => {
        streaming = true;
      });
      await options.spend.settle(reservation, options.costUsd(result));
      return result;
    } catch (error) {
      const failedResponse =
        !streaming && error instanceof Anthropic.APIError && typeof error.status === 'number' && error.status >= 400 && error.status < 600;
      await options.spend.settle(reservation, failedResponse ? 0 : streaming ? (options.costBoundAfterStart?.() ?? null) : null);
      if (streaming || attempt >= options.maxRetries || !retryable(error)) throw error;
      throwIfAborted(options.signal);
      try {
        await sleep(retryDelay(error, attempt), undefined, { signal: options.signal });
      } catch (waitError) {
        throwIfAborted(options.signal);
        throw waitError;
      }
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Anthropic.APIUserAbortError();
}

function retryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError || error instanceof RetryableError) return true;
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) return false;
  const override = error.headers?.get('x-should-retry');
  if (override === 'true') return true;
  if (override === 'false') return false;
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

function retryDelay(error: unknown, attempt: number): number {
  const headers = error instanceof Anthropic.APIError ? error.headers : undefined;
  let delay = Number.parseFloat(headers?.get('retry-after-ms') ?? '');
  const after = headers?.get('retry-after');
  if ((!delay || Number.isNaN(delay)) && after) {
    const seconds = Number.parseFloat(after);
    delay = Number.isNaN(seconds) ? Date.parse(after) - Date.now() : seconds * 1000;
  }
  return delay > 0 && delay <= 2 ** 31 - 1 ? delay : Math.min(500 * 2 ** attempt, 8000) * (1 - Math.random() * 0.25);
}
