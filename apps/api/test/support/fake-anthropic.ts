import Anthropic from '@anthropic-ai/sdk';

export type FakeUsage = Partial<Anthropic.Usage> & Record<string, unknown>;

export type FakeResponse =
  | {
      stream: string[];
      stopReason?: string;
      usage?: FakeUsage;
      usageDeltas?: FakeUsage[];
      model?: string;
      delayMs?: number;
      errorAfter?: { type: string; message: string };
      incomplete?: boolean;
    }
  | { text: string; stopReason?: string; usage?: FakeUsage; model?: string }
  | { malformed: string }
  | { status: number; error: { type: string; message: string }; headers?: Record<string, string> }
  | { networkError: true };

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

const DEFAULT_USAGE: FakeUsage = {
  input_tokens: 1000,
  output_tokens: 40,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  inference_geo: 'global',
  service_tier: 'standard',
  server_tool_use: null,
  output_tokens_details: null,
};

function completeUsage(usage: FakeUsage = {}): FakeUsage {
  return {
    ...DEFAULT_USAGE,
    cache_creation: { ephemeral_5m_input_tokens: usage.cache_creation_input_tokens ?? 0, ephemeral_1h_input_tokens: 0 },
    ...usage,
  };
}

const sse = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

function message(model: string, content: object[], stopReason: string | null, usage: FakeUsage) {
  return { id: 'msg_fake', type: 'message', role: 'assistant', model, content, stop_reason: stopReason, stop_sequence: null, usage };
}

function streamBody(model: string, r: Extract<FakeResponse, { stream: string[] }>, signal?: AbortSignal | null) {
  const usage = completeUsage(r.usage);
  const events = [
    sse('message_start', { message: message(model, [], null, { ...usage, output_tokens: 1 }) }),
    sse('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ...r.stream.map((text) => sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })),
  ];
  const tail = r.incomplete
    ? []
    : r.errorAfter
      ? [sse('error', { error: r.errorAfter })]
      : [
          sse('content_block_stop', { index: 0 }),
          ...(r.usageDeltas ?? [{}]).map((delta) =>
            sse('message_delta', {
              delta: { stop_reason: r.stopReason ?? 'end_turn', stop_sequence: null },
              usage: { output_tokens: usage.output_tokens, ...delta },
            }),
          ),
          sse('message_stop', {}),
        ];
  const chunks = [...events, ...tail].map((e) => new TextEncoder().encode(e));
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal?.aborted) return controller.error(new DOMException('aborted', 'AbortError'));
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      const next = chunks.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
}

/**
 * A real Anthropic client whose HTTP layer is scripted, so tests exercise the SDK's own request
 * serialization, streaming parser, retries and error classes.
 */
export function fakeAnthropic(respond: (body: Record<string, any>, index: number) => FakeResponse, options: { maxRetries?: number } = {}) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const r = respond(body, requests.length - 1);
    const model = 'model' in r && r.model ? r.model : (body.model as string);
    if ('networkError' in r) throw new TypeError('fetch failed');
    if ('status' in r) {
      return new Response(JSON.stringify({ type: 'error', error: r.error }), {
        status: r.status,
        headers: { 'content-type': 'application/json', 'request-id': 'req_fake', ...r.headers },
      });
    }
    if ('malformed' in r) return new Response(r.malformed, { status: 200, headers: { 'content-type': 'application/json' } });
    if ('stream' in r) {
      return new Response(streamBody(model, r, init?.signal), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    const content = [{ type: 'text', text: r.text }];
    return new Response(JSON.stringify(message(model, content, r.stopReason ?? 'end_turn', completeUsage(r.usage))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new Anthropic({ apiKey: 'sk-ant-test', fetch, maxRetries: options.maxRetries ?? 0 });
  return { client, requests };
}
