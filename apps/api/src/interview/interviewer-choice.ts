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
 * The gateway is the only default, so Claude runs only when the owner pins it; a Vercel deployment has the gateway's
 * credential without an API key. A misconfigured paid interviewer falls back to scripted practice rather than taking
 * sign-in and progress down with it.
 */
export function chooseInterviewer(config: Settings, env: NodeJS.ProcessEnv = process.env): InterviewerChoice {
  const credential = config.aiGatewayApiKey ? 'api-key' : config.vercelOidc ? 'oidc' : null;
  const provider = config.interviewAiProvider ?? 'gateway';
  if (provider === 'gateway') {
    if (credential) return { provider, model: config.interviewAiModel, credential };
    if (config.interviewAiProvider) return offline('INTERVIEW_AI_PROVIDER=gateway needs AI_GATEWAY_API_KEY or a Vercel OIDC token.', true);
    return config.anthropicApiKey
      ? offline('No AI_GATEWAY_API_KEY or Vercel OIDC token; ANTHROPIC_API_KEY is used only with INTERVIEW_AI_PROVIDER=anthropic.', true)
      : offline('No AI_GATEWAY_API_KEY or Vercel OIDC token.', false);
  }
  if (!config.anthropicApiKey) return offline('INTERVIEW_AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY.', true);
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
