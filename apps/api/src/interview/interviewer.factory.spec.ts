import { Logger } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { CATALOG, chunk, finish, usageChunk } from '../../test/support/fake-gateway.js';
import { ClaudeInterviewer } from './claude.interviewer.js';
import { GatewayInterviewer } from './gateway.interviewer.js';
import type { InterviewSession } from './interview.types.js';
import { createInterviewer } from './interviewer.factory.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { PROBLEMS } from './problems.js';
import type { SpendGuard } from './spend-guard.js';

const spend = {
  reserve: async () => ({ id: 'r', amountMicros: 1 }),
  settle: async () => {},
} as unknown as SpendGuard;

const session: InterviewSession = {
  id: 'session-1',
  learnerId: 'l1',
  track: 'coding',
  problem: PROBLEMS.find((p) => p.track === 'coding')!,
  hintsUsed: 0,
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  messages: [{ role: 'candidate', content: 'Hello.', at: '' }],
};

function gateway(catalog: object | null = CATALOG) {
  const authorizations: (string | null)[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/models')) return catalog ? new Response(JSON.stringify(catalog)) : new Response('down', { status: 503 });
    authorizations.push(new Headers(init?.headers).get('authorization'));
    const sse = [chunk({ content: 'Okay.' }), finish(), usageChunk({ prompt_tokens: 10, completion_tokens: 2 }), '[DONE]'];
    return new Response(sse.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''));
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, authorizations };
}

/** A JWT-shaped token that expires in an hour, as Vercel issues them. */
const oidcToken = (name: string) =>
  ['e30', Buffer.from(JSON.stringify({ sub: name, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'sig'].join('.');

const reply = (interviewer: unknown) => (interviewer as GatewayInterviewer).reply(session, () => {}, new AbortController().signal);

describe('createInterviewer', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('runs GPT-6 Luna from the live catalog through the gateway with the API key, and says so', async () => {
    const { fetchFn, authorizations } = gateway();
    const logged = vi.spyOn(Logger.prototype, 'log');
    const interviewer = await createInterviewer(loadConfig({ AI_GATEWAY_API_KEY: 'vck_0123456789abcdefghij' }), spend, fetchFn);
    expect(interviewer).toBeInstanceOf(GatewayInterviewer);
    expect((interviewer as GatewayInterviewer).model.id).toBe('openai/gpt-6-luna');
    await reply(interviewer);
    expect(authorizations).toEqual(['Bearer vck_0123456789abcdefghij']);
    expect(logged).toHaveBeenCalledWith('Interviewer: openai/gpt-6-luna through the Vercel AI Gateway (api-key).');
  });

  it("reads Vercel's OIDC token for each request, since it expires", async () => {
    const { fetchFn, authorizations } = gateway();
    const first = oidcToken('first');
    const second = oidcToken('second');
    vi.stubEnv('VERCEL_OIDC_TOKEN', first);
    const interviewer = await createInterviewer(loadConfig({ VERCEL_OIDC_TOKEN: first }), spend, fetchFn);
    await reply(interviewer);
    vi.stubEnv('VERCEL_OIDC_TOKEN', second);
    await reply(interviewer);
    expect(authorizations).toEqual([`Bearer ${first}`, `Bearer ${second}`]);
  });

  it('bounds spend with the built-in prices when the catalog is down at startup', async () => {
    const { fetchFn } = gateway(null);
    const warned = vi.spyOn(Logger.prototype, 'warn');
    const interviewer = await createInterviewer(loadConfig({ AI_GATEWAY_API_KEY: 'vck_0123456789abcdefghij' }), spend, fetchFn);
    expect(interviewer).toBeInstanceOf(GatewayInterviewer);
    expect(warned).toHaveBeenCalledWith('The AI Gateway catalog is unreachable; openai/gpt-6-luna uses its built-in prices.');
  });

  it('serves scripted practice, logged as an error, for a model it cannot price', async () => {
    const { fetchFn } = gateway();
    const failed = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const config = loadConfig({ AI_GATEWAY_API_KEY: 'vck_0123456789abcdefghij', INTERVIEW_AI_MODEL: 'openai/unknown' });
    expect(await createInterviewer(config, spend, fetchFn)).toBeInstanceOf(OfflineInterviewer);
    expect(failed).toHaveBeenCalledWith(
      'openai/unknown is not a priced text model in the AI Gateway catalog. Using the offline scripted interviewer.',
    );
  });

  it.each([
    ['an output limit below the scoring budget', { max_tokens: 8_000 }],
    ['a zero output price', { pricing: { input: '0.0000001', output: '0' } }],
    ['a zero input price', { pricing: { input: '0', output: '0.0000005' } }],
  ])('serves scripted practice, logged as an error, instead of failing startup for %s', async (_name, change) => {
    const luna = CATALOG.data.find((m) => m.id === 'openai/gpt-6-luna')!;
    const { fetchFn } = gateway({ data: [{ ...luna, ...change }] });
    const failed = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const config = loadConfig({ AI_GATEWAY_API_KEY: 'vck_0123456789abcdefghij' });
    expect(await createInterviewer(config, spend, fetchFn)).toBeInstanceOf(OfflineInterviewer);
    expect(failed).toHaveBeenCalledWith(expect.stringContaining('Using the offline scripted interviewer.'));
  });

  it('runs Claude direct only when pinned, and scripted practice without any key', async () => {
    const { fetchFn } = gateway();
    const pinned = { INTERVIEW_AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-api03-0123456789abcdef' };
    expect(await createInterviewer(loadConfig(pinned), spend, fetchFn)).toBeInstanceOf(ClaudeInterviewer);
    expect(await createInterviewer(loadConfig({}), spend, fetchFn)).toBeInstanceOf(OfflineInterviewer);
    expect(vi.mocked(fetchFn)).not.toHaveBeenCalled();
  });
});
