import { parseGatewayCatalog, type GatewayModel } from '../../src/interview/gateway-catalog.js';

export type FakeGatewayResponse =
  | { json: object }
  | { sse: (object | string)[]; unfinished?: boolean; endless?: boolean; delayMs?: number }
  | { hang: true }
  | { status: number; body: object | string; headers?: Record<string, string> }
  | { networkError: true };

export interface RecordedGatewayRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

/** Catalog entries shaped like https://ai-gateway.vercel.sh/v1/models (checked 2026-09-30). */
export const CATALOG = {
  object: 'list',
  data: [
    {
      id: 'anthropic/claude-sonnet-5.5',
      context_window: 1_000_000,
      max_tokens: 128_000,
      type: 'language',
      supported_parameters: ['max_tokens', 'reasoning', 'response_format', 'structured_outputs'],
      reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high', 'xhigh', 'max'] }],
      pricing: {
        input: '0.000002',
        output: '0.00001',
        input_cache_read: '0.0000002',
        input_cache_write: '0.0000025',
        regional: { us: { input: '0.0000022', output: '0.000011', input_cache_read: '0.00000022', input_cache_write: '0.00000275' } },
      },
    },
    {
      id: 'openai/gpt-6-luna',
      context_window: 1_050_000,
      max_tokens: 128_000,
      type: 'language',
      supported_parameters: ['max_tokens', 'reasoning', 'response_format', 'structured_outputs'],
      reasoning_options: [{ type: 'toggle' }, { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] }],
      pricing: {
        input: '0.0000001',
        input_tiers: [
          { cost: '0.0000001', min: 0, max: 272_001 },
          { cost: '0.0000002', min: 272_001 },
        ],
        output: '0.0000005',
        input_cache_read: '0.00000001',
        input_cache_write: '0.000000125',
        regional: { us: { input: '0.00000011', output: '0.00000055', output_tiers: [{ cost: '0.000000825', min: 272_001 }] } },
      },
    },
    {
      id: 'google/gemini-3-flash',
      context_window: 1_000_000,
      max_tokens: 65_000,
      type: 'language',
      supported_parameters: ['max_tokens', 'reasoning', 'response_format'],
      reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
      pricing: {
        input: '0.0000005',
        input_tiers: [
          { cost: '0.0000005', min: 0, max: 200_001 },
          { cost: '0.000001', min: 200_001 },
        ],
        output: '0.000003',
        input_cache_read: '0.00000005',
      },
    },
    {
      id: 'anthropic/claude-haiku-4.5',
      context_window: 200_000,
      max_tokens: 64_000,
      type: 'language',
      supported_parameters: ['max_tokens', 'reasoning', 'response_format'],
      reasoning_options: [{ type: 'toggle' }, { type: 'budget_tokens', min: 1024 }],
      pricing: { input: '0.000001', output: '0.000005', input_cache_read: '0.0000001', input_cache_write: '0.00000125' },
    },
    {
      id: 'alibaba/qwen3.7-plus',
      context_window: 1_000_000,
      max_tokens: 64_000,
      type: 'language',
      supported_parameters: ['max_tokens', 'reasoning'],
      reasoning_options: [{ type: 'effort', values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] }],
      pricing: { input: '0.0000004', output: '0.0000016', input_cache_read: '0.00000008', input_cache_write: '0.0000005' },
    },
    { id: 'openai/gpt-image-2', context_window: 1, max_tokens: 1, type: 'image', pricing: { image: '0.04' } },
  ],
};

export const gatewayModel = (id: string): GatewayModel => parseGatewayCatalog(CATALOG).get(id)!;

export const chunk = (delta: object, extra: object = {}) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta, finish_reason: null }],
  ...extra,
});

export const finish = (reason = 'stop') => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta: {}, finish_reason: reason }],
});

export const usageChunk = (usage: object, cost?: string) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  choices: [],
  usage,
  ...(cost ? { provider_metadata: { gateway: { cost } } } : {}),
});

export const completion = (content: string, usage: object, finishReason = 'stop', cost?: string) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content, ...(cost ? { provider_metadata: { gateway: { cost } } } : {}) },
      finish_reason: finishReason,
    },
  ],
  usage,
});

/**
 * Splits every event across two network reads so the SSE parser has to join them. An endless stream keeps sending
 * a token every `delayMs` until the request is aborted, like a model that never stops.
 */
function sseStream(
  r: { sse: (object | string)[]; unfinished?: boolean; endless?: boolean; delayMs?: number },
  signal: AbortSignal | null | undefined,
): ReadableStream<Uint8Array> {
  const text = [...r.sse, ...(r.unfinished || r.endless ? [] : ['[DONE]'])]
    .map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)
    .join('');
  const encoder = new TextEncoder();
  const pieces = text.match(/[\s\S]{1,23}/g) ?? [];
  if (!r.endless && !r.delayMs) {
    return new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    });
  }
  return new ReadableStream({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, r.delayMs ?? 0));
      if (signal?.aborted) return controller.error(new DOMException('aborted', 'AbortError'));
      const piece = pieces.shift();
      if (piece !== undefined) controller.enqueue(encoder.encode(piece));
      else if (r.endless) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk({ content: '.' }))}\n\n`));
      else controller.close();
    },
  });
}

export function fakeGateway(respond: (body: Record<string, any>, index: number) => FakeGatewayResponse) {
  const requests: (RecordedGatewayRequest & { signal?: AbortSignal | null })[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()), body, signal: init?.signal });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const r = respond(body, requests.length - 1);
    if ('networkError' in r) throw new TypeError('fetch failed');
    if ('hang' in r) {
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    }
    if ('json' in r) return new Response(JSON.stringify(r.json), { headers: { 'content-type': 'application/json' } });
    if ('sse' in r) return new Response(sseStream(r, init?.signal), { headers: { 'content-type': 'text/event-stream' } });
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}
