import Anthropic from '@anthropic-ai/sdk';
import { GATEWAY_URL } from './gateway-catalog.js';

export interface GatewayUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export interface GatewayCompletion {
  text: string;
  finishReason: string | null;
  usage: GatewayUsage | null;
  /** What the gateway says it charged (`provider_metadata.gateway.cost`), when it says. */
  billedCostUsd: number | null;
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Sent as `x-session-affinity` so the provider can keep a conversation's prompt cache warm. */
  affinity?: string;
}

/**
 * OpenAI-compatible chat completions over plain fetch. Failures are raised as the Anthropic SDK's error classes
 * so the metered retry and the learner-facing error mapping stay one implementation for every provider.
 */
export class GatewayClient {
  /** `credential` runs per request: a Vercel OIDC token comes with each request and expires. */
  constructor(
    private readonly credential: () => string | Promise<string>,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = GATEWAY_URL,
  ) {}

  async complete(body: object, options: RequestOptions = {}): Promise<GatewayCompletion> {
    const { response, done, failure } = await this.send(body, options);
    try {
      const json = parseJson(await response.text());
      const choice = record(array(json['choices'])[0]);
      const message = record(choice['message']);
      return {
        text: typeof message['content'] === 'string' ? message['content'] : '',
        finishReason: typeof choice['finish_reason'] === 'string' ? choice['finish_reason'] : null,
        usage: usageOf(json['usage']),
        billedCostUsd: billedCost(message) ?? billedCost(json),
      };
    } catch (err) {
      throw failure(err);
    } finally {
      done();
    }
  }

  async stream(body: object, onDelta: (text: string) => void, options: RequestOptions & { onConnect?: () => void } = {}) {
    const { response, done, failure } = await this.send({ ...body, stream: true, stream_options: { include_usage: true } }, options);
    done();
    options.onConnect?.();
    const result: GatewayCompletion = { text: '', finishReason: null, usage: null, billedCostUsd: null };
    let finished = false;
    try {
      for await (const data of sseData(response.body!)) {
        if (data === '[DONE]') {
          finished = true;
          break;
        }
        const chunk = parseJson(data);
        if (chunk['error']) throw new Anthropic.APIError(undefined, chunk, undefined, undefined);
        const choice = record(array(chunk['choices'])[0]);
        const delta = record(choice['delta']);
        if (typeof delta['content'] === 'string' && delta['content']) {
          result.text += delta['content'];
          onDelta(delta['content']);
        }
        if (typeof choice['finish_reason'] === 'string') result.finishReason = choice['finish_reason'];
        result.usage = usageOf(chunk['usage']) ?? result.usage;
        result.billedCostUsd = billedCost(delta) ?? billedCost(chunk) ?? result.billedCostUsd;
      }
    } catch (err) {
      throw failure(err);
    }
    if (!finished) throw new Anthropic.APIConnectionError({ message: 'The gateway stream ended before it finished.' });
    return result;
  }

  /** `done` clears the timeout: after the headers for a stream, after the body otherwise. */
  private async send(body: object, options: RequestOptions) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 60_000);
    const done = () => clearTimeout(timer);
    const failure = (err: unknown): unknown => {
      if (err instanceof Anthropic.APIError) return err;
      if (options.signal?.aborted) return new Anthropic.APIUserAbortError();
      if (timeout.signal.aborted) return new Anthropic.APIConnectionTimeoutError();
      return new Anthropic.APIConnectionError({ message: 'The gateway connection failed.', cause: err instanceof Error ? err : undefined });
    };
    let token: string;
    try {
      token = await this.credential();
    } catch {
      done();
      throw Anthropic.APIError.generate(401, { message: 'No AI Gateway credential for this request.' }, undefined, new Headers());
    }
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(options.affinity ? { 'x-session-affinity': options.affinity } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal,
      });
    } catch (err) {
      done();
      throw failure(err);
    }
    if (!response.ok) {
      done();
      const text = await response.text().catch(() => '');
      let error: object | undefined;
      try {
        error = JSON.parse(text);
      } catch {
        error = text ? { message: text } : undefined;
      }
      throw Anthropic.APIError.generate(response.status, error, undefined, response.headers);
    }
    return { response, done, failure };
  }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop()!;
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      if (data.length) yield data.join('\n');
    }
  }
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return record(JSON.parse(text));
  } catch {
    throw new Anthropic.APIConnectionError({ message: 'The gateway sent a response that is not JSON.' });
  }
}

function usageOf(raw: unknown): GatewayUsage | null {
  const usage = record(raw);
  const prompt = usage['prompt_tokens'];
  const completion = usage['completion_tokens'];
  const cached = record(usage['prompt_tokens_details'])['cached_tokens'] ?? 0;
  if (!count(prompt) || !count(completion) || !count(cached) || cached > prompt) return null;
  return { promptTokens: prompt, completionTokens: completion, cachedTokens: cached };
}

function billedCost(holder: Record<string, unknown>): number | null {
  const cost = record(record(holder['provider_metadata'])['gateway'])['cost'];
  const usd = typeof cost === 'string' || typeof cost === 'number' ? Number(cost) : NaN;
  return Number.isFinite(usd) && usd >= 0 ? usd : null;
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
