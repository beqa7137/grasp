import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { fakeAnthropic, type FakeResponse } from '../../test/support/fake-anthropic.js';
import { ClaudeInterviewer, FALLBACK_SCORE_SUMMARY, REDIRECT_REPLY } from './claude.interviewer.js';
import type { InterviewSession, InterviewTrack } from './interview.types.js';
import { PROBLEMS } from './problems.js';
import { RUBRICS } from './prompts.js';
import { inputTokenBound, maximumCostUsd } from './pricing.js';
import type { SpendGuard } from './spend-guard.js';

const MODEL = 'claude-sonnet-5';

function session(track: InterviewTrack = 'coding', said: { content: string; hint?: boolean }[] = []): InterviewSession {
  const problem = PROBLEMS.find((p) => p.track === track)!;
  return {
    id: 's1',
    learnerId: 'l1',
    track,
    problem,
    hintsUsed: said.filter((m) => m.hint).length,
    status: 'active',
    createdAt: '2026-09-01T00:00:00.000Z',
    messages: [
      { role: 'interviewer', content: problem.opening, at: '' },
      ...said.map((m) => ({ role: 'candidate' as const, at: '', ...m })),
    ],
  };
}

function setup(respond: (body: Record<string, any>, index: number) => FakeResponse, maxRetries = 0, model = MODEL) {
  const fake = fakeAnthropic(respond, { maxRetries });
  const spend = {
    reserve: vi.fn(async (maximum: number) => ({ id: crypto.randomUUID(), maximum })),
    settle: vi.fn(async (_reservation: unknown, _cost: number | null) => {}),
  };
  return { ...fake, spend, interviewer: new ClaudeInterviewer(fake.client, { model }, spend as unknown as SpendGuard) };
}

const signal = () => new AbortController().signal;

function validCard(track: InterviewTrack, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    verdict: 'hire',
    summary: 'Clear reasoning and a correct linear-time approach.',
    dimensions: RUBRICS[track].map((r, i) => ({ name: r.name, score: 2 + (i % 3), evidence: `Evidence for ${r.name}.` })),
    strengths: ['Clarified constraints early'],
    improvements: ['State space complexity without prompting'],
    weakPatterns: ['monotonic-stack'],
    ...overrides,
  });
}

function schemaKeywords(schema: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => schemaKeywords(s, found));
  else if (schema && typeof schema === 'object') {
    for (const [key, value] of Object.entries(schema)) {
      found.add(key);
      if (key !== 'enum' && key !== 'required') schemaKeywords(key === 'properties' ? Object.values(value as object) : value, found);
    }
  }
  return found;
}

beforeAll(() => {
  Logger.overrideLogger(false);
});
afterEach(() => vi.restoreAllMocks());

/** What a request reserves: its own input bound, not the model's whole context. */
const reservedFor = (body: Record<string, unknown>, maxTokens: number, cache: boolean, model = MODEL) => {
  const { stream: _stream, ...params } = body;
  return maximumCostUsd(model, maxTokens, cache, inputTokenBound(params));
};

describe('ClaudeInterviewer.reply', () => {
  it('streams text and sends a cache-friendly request', async () => {
    const { interviewer, requests } = setup(() => ({
      stream: ['What input ', 'sizes should we expect?'],
      usage: { input_tokens: 1200, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 300 },
    }));
    const deltas: string[] = [];
    const s = session('coding', [{ content: 'I would use a stack.' }]);

    const result = await interviewer.reply(s, (t) => deltas.push(t), signal());

    expect(deltas.join('')).toBe('What input sizes should we expect?');
    expect(result.text).toBe('What input sizes should we expect?');
    expect(result.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 30,
      cacheReadTokens: 900,
      cacheWriteTokens: 300,
      costUsd: (1200 * 2 + 30 * 10 + 300 * 2.5 + 900 * 0.2) / 1e6,
    });

    const [req] = requests;
    expect(req.url).toMatch(/\/v1\/messages$/);
    expect(req.headers['x-api-key']).toBe('sk-ant-test');
    expect(req.body).toMatchObject({
      model: MODEL,
      stream: true,
      max_tokens: 2048,
      cache_control: { type: 'ephemeral', ttl: '5m' },
      service_tier: 'standard_only',
      output_config: { effort: 'low' },
    });
    expect(req.body['system']).toContain(s.problem.referenceNotes);
    expect(req.body['messages']).toEqual([
      { role: 'user', content: '(The candidate joins the call.)' },
      { role: 'assistant', content: s.problem.opening },
      { role: 'user', content: 'I would use a stack.' },
    ]);
  });

  it('keeps system, settings and the message prefix identical across turns so the cache can hit', async () => {
    const { interviewer, requests } = setup(() => ({ stream: ['Why a stack?'] }));
    const s = session('coding', [{ content: 'Brute force is O(n^2).' }]);
    const first = await interviewer.reply(s, () => {}, signal());
    s.messages.push({ role: 'interviewer', content: first.text, at: '' });
    s.messages.push({ role: 'candidate', content: 'Each index is pushed and popped once.', at: '' });
    await interviewer.reply(s, () => {}, signal());

    const [a, b] = requests.map((r) => r.body);
    expect(b['system']).toBe(a['system']);
    expect(b['output_config']).toEqual(a['output_config']);
    expect(b['cache_control']).toEqual(a['cache_control']);
    expect(b['messages'].slice(0, a['messages'].length)).toEqual(a['messages']);
    const roles = b['messages'].map((m: { role: string }) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });

  it('marks hint requests and merges back-to-back candidate turns', async () => {
    const { interviewer, requests } = setup(() => ({ stream: ['Here is a nudge.'] }));
    await interviewer.reply(
      session('coding', [{ content: 'First thought.' }, { content: 'Could I get a hint?', hint: true }]),
      () => {},
      signal(),
    );
    expect(requests[0].body['messages'].at(-1)).toEqual({
      role: 'user',
      content: 'First thought.\n\n[HINT REQUESTED] Could I get a hint?',
    });
  });

  it('sends shared code inside the candidate turn, marked for the interviewer', async () => {
    const { interviewer, requests } = setup(() => ({ stream: ['Walk me through it.'] }));
    const s = session('coding', [{ content: 'My first attempt.' }]);
    s.messages[1].code = { language: 'python', source: 'def daily_temperatures(t):\n    return []' };
    await interviewer.reply(s, () => {}, signal());
    expect(requests[0].body['messages'].at(-1).content).toBe(
      'My first attempt.\n\n[CANDIDATE CODE: python]\n```python\ndef daily_temperatures(t):\n    return []\n```',
    );
  });

  it.each([
    ['a refusal', { stream: ['I cannot'], stopReason: 'refusal' }],
    ['an empty reply', { stream: [] as string[] }],
  ])('redirects the conversation instead of passing on %s', async (_label, response) => {
    const { interviewer } = setup(() => response);
    const result = await interviewer.reply(session('coding', [{ content: 'hello there' }]), () => {}, signal());
    expect(result.text).toBe(REDIRECT_REPLY);
  });

  it.each<[string, FakeResponse, new (...args: never[]) => Error, number]>([
    ['rate limiting', { status: 429, error: { type: 'rate_limit_error', message: 'slow down' } }, ServiceUnavailableException, 503],
    ['overload', { status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } }, ServiceUnavailableException, 503],
    ['a server error', { status: 500, error: { type: 'api_error', message: 'boom' } }, ServiceUnavailableException, 503],
    ['a network failure', { networkError: true }, ServiceUnavailableException, 503],
    ['a bad API key', { status: 401, error: { type: 'authentication_error', message: 'invalid x-api-key' } }, BadGatewayException, 502],
    ['an unknown model', { status: 404, error: { type: 'not_found_error', message: 'model: nope' } }, BadGatewayException, 502],
    [
      'overload mid-stream',
      { stream: ['Partial'], errorAfter: { type: 'overloaded_error', message: 'Overloaded' } },
      ServiceUnavailableException,
      503,
    ],
  ])('maps %s to a client-safe error', async (_label, response, type, status) => {
    const { interviewer } = setup(() => response);
    const error = await interviewer.reply(session('coding', [{ content: 'hi' }]), () => {}, signal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(type);
    expect((error as ServiceUnavailableException).getStatus()).toBe(status);
    expect((error as Error).message).not.toMatch(/x-api-key|model: nope/);
  });

  it('reserves each retry before dispatch, refunds provider errors, and disables hidden SDK retries', async () => {
    const { interviewer, requests, spend } = setup(
      (_body, i) =>
        i === 0
          ? { status: 529, error: { type: 'overloaded_error', message: 'Overloaded' }, headers: { 'retry-after-ms': '1' } }
          : { stream: ['Back.'] },
      1,
    );
    const result = await interviewer.reply(session('coding', [{ content: 'hi' }]), () => {}, signal());
    expect(result.text).toBe('Back.');
    expect(requests).toHaveLength(2);
    expect(spend.reserve.mock.calls).toEqual(requests.map((request) => [reservedFor(request.body, 2048, true)]));
    expect(spend.reserve.mock.calls[0][0]).toBeLessThan(maximumCostUsd(MODEL, 2048, true) / 20);
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0, 0.0024]);
    expect(requests.map((request) => request.headers['x-stainless-retry-count'])).toEqual(['0', '0']);
    expect(requests.every((request) => request.url.endsWith('/v1/messages'))).toBe(true);
  });

  it('retains a lost attempt while reserving its successful retry separately', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { interviewer, spend, requests } = setup(
      (_body, index) => (index === 0 ? { networkError: true } : { stream: ['Recovered.'] }),
      1,
    );
    await interviewer.reply(session(), () => {}, signal());
    expect(requests).toHaveLength(2);
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([null, 0.0024]);
    expect(spend.reserve).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch a retry when its reservation fails', async () => {
    const { interviewer, spend, requests } = setup(
      () => ({
        status: 529,
        error: { type: 'overloaded_error', message: 'busy' },
        headers: { 'retry-after-ms': '1' },
      }),
      2,
    );
    spend.reserve.mockRejectedValueOnce(new ServiceUnavailableException('Budget unavailable.'));
    await expect(interviewer.reply(session(), () => {}, signal())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(requests).toHaveLength(0);
    spend.reserve
      .mockResolvedValueOnce({ id: crypto.randomUUID(), maximum: 3 })
      .mockRejectedValueOnce(new ServiceUnavailableException('Budget unavailable.'));
    await expect(interviewer.reply(session(), () => {}, signal())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(requests).toHaveLength(1);
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0]);
  });

  it.each([
    { stream: ['partial'], errorAfter: { type: 'overloaded_error', message: 'busy' } },
    { stream: ['partial'], incomplete: true },
  ])('retains interrupted streams without retrying them', async (response) => {
    const { interviewer, spend, requests } = setup(() => response, 2);
    await expect(interviewer.reply(session(), () => {}, signal())).rejects.toThrow();
    expect(requests).toHaveLength(1);
    const [[, settled]] = spend.settle.mock.calls;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(spend.reserve.mock.calls[0][0]);
  });

  it('cancels before reservation or dispatch without leaving a paid hold', async () => {
    const { interviewer, spend, requests } = setup(() => ({ stream: ['unused'] }));
    const before = new AbortController();
    before.abort();
    await expect(interviewer.reply(session(), () => {}, before.signal)).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(spend.reserve).not.toHaveBeenCalled();
    const during = new AbortController();
    spend.reserve.mockImplementationOnce(async (maximum) => {
      during.abort();
      return { id: crypto.randomUUID(), maximum };
    });
    await expect(interviewer.reply(session(), () => {}, during.signal)).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(requests).toHaveLength(0);
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0]);
  });

  it('prices the actual geography without overriding workspace residency', async () => {
    const { interviewer, spend, requests } = setup(() => ({ stream: ['Ready.'], usage: { inference_geo: 'us' } }));
    const result = await interviewer.reply(session(), () => {}, signal());
    expect(result.usage?.costUsd).toBeCloseTo(0.00264, 10);
    expect(spend.settle.mock.calls[0][1]).toBeCloseTo(0.00264, 10);
    expect(requests[0].body).not.toHaveProperty('inference_geo');
  });

  it.each([
    { usage: { inference_geo: null } },
    { usage: { inference_geo: 'unknown' } },
    { usage: { service_tier: 'priority' as const } },
    { usage: { input_tokens: -1 } },
    { usage: { output_tokens: 2049 } },
    { usage: { cache_creation_input_tokens: 1, cache_creation: { ephemeral_1h_input_tokens: 1, ephemeral_5m_input_tokens: 0 } } },
    { usage: { server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } },
    { usage: { unknown_billable_feature: 1 } },
    { model: 'claude-opus-5-5' },
  ])('keeps the full hold for unverified final billing metadata: %j', async (metadata) => {
    const { interviewer, spend } = setup(() => ({ stream: ['A useful reply.'], ...metadata }));
    const result = await interviewer.reply(session(), () => {}, signal());
    expect(result.text).toBe('A useful reply.');
    expect(result.usage?.costUsd).toBeNull();
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([null]);
  });

  it.each([
    { unknown_billable_feature: 1 },
    { inference_geo: 'us' },
    { service_tier: 'priority' as const },
    { speed: 'fast' },
    { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 } },
  ])('retains billing metadata the SDK discards from late stream deltas: %j', async (delta) => {
    const { interviewer, spend } = setup(() => ({ stream: ['A useful reply.'], usageDeltas: [delta, {}] }));
    const received: string[] = [];
    const result = await interviewer.reply(session(), (text) => received.push(text), signal());
    expect(result.text).toBe('A useful reply.');
    expect(received.join('')).toBe('A useful reply.');
    expect(result.usage?.costUsd).toBeNull();
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([null]);
  });

  it.each([
    { usageDeltas: [{ output_tokens: 1000 }, { output_tokens: 0 }] },
    { usageDeltas: [{ input_tokens: 0 }] },
    { usage: { cache_read_input_tokens: 20 }, usageDeltas: [{ cache_read_input_tokens: 0 }] },
    { usage: { cache_creation_input_tokens: 20 }, usageDeltas: [{ cache_creation_input_tokens: 0 }] },
    { usageDeltas: [{ input_tokens: -1 }, { input_tokens: 1000 }] },
    { usageDeltas: [{ server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } }, { server_tool_use: null }] },
    { usageDeltas: [{ output_tokens_details: { thinking_tokens: 41 } }, { output_tokens_details: null }] },
    { usage: { input_tokens: -1 }, usageDeltas: [{ input_tokens: 1000 }] },
    {
      usage: { server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
      usageDeltas: [{ server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } }],
    },
  ])('retains contradictory billing metadata even when later events overwrite it: %j', async (metadata) => {
    const { interviewer, spend } = setup(() => ({ stream: ['A useful reply.'], ...metadata }));
    const result = await interviewer.reply(session(), () => {}, signal());
    expect(result.text).toBe('A useful reply.');
    expect(result.usage?.costUsd).toBeNull();
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([null]);
  });

  it('uses documented cumulative usage fields from the final stream delta', async () => {
    const { interviewer, spend } = setup(() => ({
      stream: ['A useful reply.'],
      usageDeltas: [
        {
          input_tokens: 1500,
          output_tokens: 50,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 0,
          server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
          output_tokens_details: { thinking_tokens: 5 },
        },
      ],
    }));
    const result = await interviewer.reply(session(), () => {}, signal());
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 0, costUsd: 0.003506 });
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0.003506]);
  });

  it('pins Haiku to its supported snapshot and omits unsupported effort', async () => {
    const { interviewer, requests, spend } = setup(() => ({ stream: ['Ready.'], usage: { inference_geo: null } }), 0, 'claude-haiku-4-5');
    const result = await interviewer.reply(session(), () => {}, signal());
    expect(requests[0].body).toMatchObject({ model: 'claude-haiku-4-5-20251001', service_tier: 'standard_only' });
    expect(requests[0].body).not.toHaveProperty('output_config');
    expect(requests[0].body).not.toHaveProperty('inference_geo');
    expect(result.usage?.costUsd).toBe(0.0012);
    expect(spend.reserve).toHaveBeenCalledWith(reservedFor(requests[0].body, 2048, true, 'claude-haiku-4-5'));
  });

  it('rejects unverified models before any paid call', () => {
    expect(() => setup(() => ({ stream: ['unused'] }), 0, 'claude-sonnet-5-20990101')).toThrow('verified pricing');
  });

  it.each([
    [429, 'warn', 'anthropic.busy'],
    [500, 'warn', 'anthropic.unavailable'],
    [401, 'error', 'anthropic.rejected'],
  ] as const)('does not log provider payloads or request identifiers on HTTP %s', async (status, level, operation) => {
    const logged = vi.spyOn(Logger.prototype, level).mockImplementation(() => {});
    const { interviewer } = setup(() => ({
      status,
      error: { type: 'private-provider-type', message: 'private-transcript api-key-secret' },
      headers: { 'request-id': 'private-provider-request' },
    }));

    await expect(interviewer.reply(session('coding', [{ content: 'private-candidate-answer' }]), () => {}, signal())).rejects.toThrow();

    expect(logged.mock.calls).toEqual([[{ operation, category: 'unknown', code: 'unknown' }]]);
  });

  it('keeps untrusted streamed error fields out of logs', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { interviewer } = setup(() => ({
      stream: ['Partial'],
      errorAfter: { type: 'private-stream-type', message: 'private-stream-message' },
    }));

    await expect(interviewer.reply(session(), () => {}, signal())).rejects.toBeInstanceOf(BadGatewayException);

    expect(logged.mock.calls).toEqual([[{ operation: 'anthropic.rejected', category: 'unknown', code: 'unknown' }]]);
  });

  it('keeps untrusted reply stop reasons out of logs', async () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { interviewer } = setup(() => ({ stream: [], stopReason: 'private-provider-stop-reason' }));

    expect((await interviewer.reply(session(), () => {}, signal())).text).toBe(REDIRECT_REPLY);

    expect(logged.mock.calls).toEqual([[{ operation: 'interview.empty-reply' }]]);
  });

  it('passes client disconnects through as aborts', async () => {
    const { interviewer, spend } = setup(() => ({ stream: ['one ', 'two ', 'three'], delayMs: 20 }));
    const abort = new AbortController();
    const pending = interviewer.reply(session('coding', [{ content: 'hi' }]), () => abort.abort(), abort.signal);
    await expect(pending).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    const [[, settled]] = spend.settle.mock.calls;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(spend.reserve.mock.calls[0][0]);
  });
});

describe('ClaudeInterviewer.score', () => {
  it('settles an invalid scorecard before the next attempt can fail', async () => {
    const { interviewer, spend, requests } = setup((_body, index) => {
      if (index === 0) return { text: 'invalid json' };
      expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0.0024]);
      return { networkError: true };
    });
    await expect(interviewer.score(session())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(requests).toHaveLength(2);
    expect(spend.reserve.mock.calls).toEqual(requests.map((request) => [reservedFor(request.body, 16000, false)]));
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([0.0024, null]);
  });

  it('keeps a malformed successful response charged conservatively without retrying it', async () => {
    const { interviewer, requests, spend } = setup(() => ({ malformed: '{not-json' }), 2);
    await expect(interviewer.score(session())).rejects.toBeInstanceOf(BadGatewayException);
    expect(requests).toHaveLength(1);
    expect(spend.settle.mock.calls.map(([, cost]) => cost)).toEqual([null]);
  });

  it('uses structured outputs without unsupported effort on Haiku', async () => {
    const { interviewer, requests } = setup(() => ({ text: validCard('coding'), usage: { inference_geo: null } }), 0, 'claude-haiku-4-5');
    await interviewer.score(session());
    expect(requests[0].body.output_config).toHaveProperty('format');
    expect(requests[0].body.output_config).not.toHaveProperty('effort');
    expect(requests[0].body).not.toHaveProperty('cache_control');
  });
  it('requests a strict JSON schema that uses only supported keywords', async () => {
    const { interviewer, requests } = setup(() => ({ text: validCard('system-design', { weakPatterns: [] }) }));
    await interviewer.score(session('system-design', [{ content: 'We need 10k QPS.' }]));

    const body = requests[0].body;
    expect(body['output_config']['effort']).toBe('medium');
    const format = body['output_config']['format'];
    expect(format.type).toBe('json_schema');
    expect(format.schema.properties.dimensions.items.properties.name.enum).toEqual(RUBRICS['system-design'].map((r) => r.name));
    expect(format.schema.properties.dimensions.items.properties.score.enum).toEqual([1, 2, 3, 4]);
    expect(format.schema.properties.weakPatterns.items.enum).toContain('monotonic-stack');

    const keywords = schemaKeywords(format.schema);
    for (const unsupported of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'multipleOf', 'maxItems', '$schema']) {
      expect(keywords.has(unsupported)).toBe(false);
    }
    expect(body['messages'][0].content).toContain('Candidate: We need 10k QPS.');
  });

  it('returns a normalized AI scorecard with per-call usage', async () => {
    const { interviewer } = setup(() => ({ text: validCard('coding'), usage: { input_tokens: 3000, output_tokens: 500 } }));
    const { scorecard, usage } = await interviewer.score(session('coding', [{ content: 'A monotonic stack gives O(n).' }]));
    expect(scorecard.mode).toBe('ai');
    expect(scorecard.verdict).toBe('hire');
    expect(scorecard.dimensions.map((d) => d.name)).toEqual(RUBRICS.coding.map((r) => r.name));
    expect(usage).toHaveLength(1);
    expect(usage![0].costUsd).toBeCloseTo((3000 * 2 + 500 * 10) / 1e6, 10);
  });

  it.each<[string, FakeResponse]>([
    ['a missing dimension', { text: validCard('coding', { dimensions: [] }) }],
    ['truncated output', { text: '{"verdict":"hi', stopReason: 'max_tokens' }],
    ['a refusal', { text: 'I cannot help with that.', stopReason: 'refusal' }],
  ])('retries once after %s', async (_label, bad) => {
    const { interviewer, requests } = setup((_b, i) => (i === 0 ? bad : { text: validCard('coding') }));
    const { scorecard, usage } = await interviewer.score(session('coding', [{ content: 'hi' }]));
    expect(scorecard.mode).toBe('ai');
    expect(requests).toHaveLength(2);
    expect(usage).toHaveLength(2);
  });

  it('falls back to the offline heuristic when both attempts are unusable', async () => {
    const { interviewer, requests } = setup(() => ({ text: 'not json' }));
    const { scorecard, usage } = await interviewer.score(session('coding', [{ content: 'not sure' }]));
    expect(requests).toHaveLength(2);
    expect(usage).toHaveLength(2);
    expect(scorecard.mode).toBe('offline');
    expect(scorecard.summary).toBe(FALLBACK_SCORE_SUMMARY);
    expect(scorecard.dimensions).toHaveLength(5);
  });

  it('surfaces API failures instead of silently degrading', async () => {
    const { interviewer } = setup(() => ({ status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } }));
    await expect(interviewer.score(session('coding', [{ content: 'hi' }]))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not log provider text when rejecting a scorecard', async () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { interviewer } = setup(() => ({ text: 'private-scorecard-content', stopReason: 'private-provider-stop-reason' }));

    expect((await interviewer.score(session())).scorecard.mode).toBe('offline');

    expect(logged.mock.calls).toEqual([
      [{ operation: 'interview.invalid-scorecard', attempt: 1, category: 'unknown', code: 'unknown' }],
      [{ operation: 'interview.invalid-scorecard', attempt: 2, category: 'unknown', code: 'unknown' }],
    ]);
  });
});
