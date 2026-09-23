import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { fakeAnthropic, type FakeResponse } from '../../test/support/fake-anthropic.js';
import { ClaudeInterviewer, FALLBACK_SCORE_SUMMARY, REDIRECT_REPLY } from './claude.interviewer.js';
import type { InterviewSession, InterviewTrack } from './interview.types.js';
import { PROBLEMS } from './problems.js';
import { RUBRICS } from './prompts.js';

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

function setup(respond: (body: Record<string, any>, index: number) => FakeResponse, maxRetries = 0) {
  const fake = fakeAnthropic(respond, { maxRetries });
  return { ...fake, interviewer: new ClaudeInterviewer(fake.client, { model: MODEL }) };
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
      cache_control: { type: 'ephemeral' },
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

  it('lets the SDK retry transient failures before giving up', async () => {
    const { interviewer, requests } = setup(
      (_body, i) =>
        i === 0
          ? { status: 529, error: { type: 'overloaded_error', message: 'Overloaded' }, headers: { 'retry-after-ms': '1' } }
          : { stream: ['Back.'] },
      1,
    );
    const result = await interviewer.reply(session('coding', [{ content: 'hi' }]), () => {}, signal());
    expect(result.text).toBe('Back.');
    expect(requests).toHaveLength(2);
  });

  it('passes client disconnects through as aborts', async () => {
    const { interviewer } = setup(() => ({ stream: ['one ', 'two ', 'three'], delayMs: 20 }));
    const abort = new AbortController();
    const pending = interviewer.reply(session('coding', [{ content: 'hi' }]), () => abort.abort(), abort.signal);
    await expect(pending).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
  });
});

describe('ClaudeInterviewer.score', () => {
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
});
