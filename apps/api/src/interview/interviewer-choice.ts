import type { AppConfig } from '../config.js';
import { priceFor } from './pricing.js';

export type InterviewerChoice =
  | { provider: 'gateway'; model: string; credential: 'api-key' | 'oidc' }
  | { provider: 'anthropic'; model: string }
  | { provider: 'offline'; reason: string; misconfigured: boolean };

type Settings = Pick<
  AppConfig,
  'interviewAiProvider' | 'interviewAiModel' | 'aiGatewayApiKey' | 'vercelOidc' | 'anthropicApiKey' | 'anthropicModel'
>;

/**
 * The gateway is the default wherever it has a credential, so a Vercel deployment uses it without an API key; a
 * misconfigured paid interviewer falls back to scripted practice rather than taking sign-in and progress down with it.
 */
export function chooseInterviewer(config: Settings, env: NodeJS.ProcessEnv = process.env): InterviewerChoice {
  const credential = config.aiGatewayApiKey ? 'api-key' : config.vercelOidc ? 'oidc' : null;
  const provider = config.interviewAiProvider ?? (credential ? 'gateway' : 'anthropic');
  if (provider === 'gateway') {
    return credential
      ? { provider, model: config.interviewAiModel, credential }
      : offline('INTERVIEW_AI_PROVIDER=gateway needs AI_GATEWAY_API_KEY or a Vercel OIDC token.', true);
  }
  if (!config.anthropicApiKey) return offline('No AI_GATEWAY_API_KEY, Vercel OIDC token or ANTHROPIC_API_KEY.', false);
  const baseUrl = env['ANTHROPIC_BASE_URL']?.replace(/\/$/, '');
  if (!priceFor(config.anthropicModel)) return offline('ANTHROPIC_MODEL must have verified pricing and request limits.', true);
  if (env['ANTHROPIC_CUSTOM_HEADERS']?.trim()) {
    return offline('ANTHROPIC_CUSTOM_HEADERS is incompatible with verified AI spend limits.', true);
  }
  if (baseUrl && baseUrl !== 'https://api.anthropic.com') {
    return offline('ANTHROPIC_BASE_URL must use the standard Anthropic endpoint for verified AI spend limits.', true);
  }
  return { provider, model: config.anthropicModel };
}

const offline = (reason: string, misconfigured: boolean): InterviewerChoice => ({ provider: 'offline', reason, misconfigured });
