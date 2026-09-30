import { loadConfig } from '../config.js';
import { chooseInterviewer } from './interviewer-choice.js';

const GATEWAY_KEY = 'vck_0123456789abcdefghij';
const ANTHROPIC_KEY = 'sk-ant-api03-0123456789abcdef';

const choose = (env: Record<string, string>, processEnv: NodeJS.ProcessEnv = {}) => chooseInterviewer(loadConfig(env), processEnv);

describe('chooseInterviewer', () => {
  it('runs GPT-6 Luna through the gateway whenever the gateway has a key, even with an Anthropic key', () => {
    expect(choose({ AI_GATEWAY_API_KEY: GATEWAY_KEY, ANTHROPIC_API_KEY: ANTHROPIC_KEY })).toEqual({
      provider: 'gateway',
      model: 'openai/gpt-6-luna',
      credential: 'api-key',
    });
  });

  it.each<Record<string, string>>([{ VERCEL_OIDC_TOKEN: 'eyJ.oidc.token' }, { VERCEL_ENV: 'production' }])(
    "uses Vercel's OIDC token without a gateway key (%o)",
    (env) => {
      expect(choose({ ...env, ANTHROPIC_API_KEY: ANTHROPIC_KEY })).toEqual({
        provider: 'gateway',
        model: 'openai/gpt-6-luna',
        credential: 'oidc',
      });
    },
  );

  it('keeps Anthropic direct without a gateway credential', () => {
    expect(choose({ ANTHROPIC_API_KEY: ANTHROPIC_KEY })).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5' });
  });

  it('lets the owner pin Anthropic or another gateway model', () => {
    expect(choose({ INTERVIEW_AI_PROVIDER: 'anthropic', AI_GATEWAY_API_KEY: GATEWAY_KEY, ANTHROPIC_API_KEY: ANTHROPIC_KEY })).toMatchObject(
      {
        provider: 'anthropic',
      },
    );
    expect(choose({ AI_GATEWAY_API_KEY: GATEWAY_KEY, INTERVIEW_AI_MODEL: 'anthropic/claude-sonnet-5.5' })).toMatchObject({
      model: 'anthropic/claude-sonnet-5.5',
    });
  });

  it('serves scripted practice without any AI credential, as a warning', () => {
    expect(choose({})).toMatchObject({ provider: 'offline', misconfigured: false });
  });

  it.each<[string, Record<string, string>, NodeJS.ProcessEnv]>([
    ['the gateway without a credential', { INTERVIEW_AI_PROVIDER: 'gateway', ANTHROPIC_API_KEY: ANTHROPIC_KEY }, {}],
    ['an unpriced Anthropic model', { ANTHROPIC_API_KEY: ANTHROPIC_KEY, ANTHROPIC_MODEL: 'claude-unknown' }, {}],
    ['custom Anthropic headers', { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, { ANTHROPIC_CUSTOM_HEADERS: 'x-a: b' }],
    ['another Anthropic endpoint', { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, { ANTHROPIC_BASE_URL: 'https://proxy.example' }],
  ])('serves scripted practice for %s, as an error', (_name, env, processEnv) => {
    expect(choose(env, processEnv)).toMatchObject({ provider: 'offline', misconfigured: true });
  });
});
