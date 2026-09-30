import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { getVercelOidcTokenSync } from '@vercel/oidc';
import type { AppConfig } from '../config.js';
import { ClaudeInterviewer } from './claude.interviewer.js';
import { GatewayClient } from './gateway-client.js';
import { loadGatewayModel } from './gateway-model.js';
import { GatewayInterviewer } from './gateway.interviewer.js';
import { chooseInterviewer } from './interviewer-choice.js';
import type { Interviewer } from './interviewer.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import type { SpendGuard } from './spend-guard.js';

export async function createInterviewer(config: AppConfig, spend: SpendGuard, fetchFn: typeof fetch = fetch): Promise<Interviewer> {
  const log = new Logger('Interviewer');
  const choice = chooseInterviewer(config);
  if (choice.provider === 'offline') {
    if (choice.misconfigured) log.error(`${choice.reason} Using the offline scripted interviewer.`);
    else log.warn(`${choice.reason} Using the offline scripted interviewer.`);
    return new OfflineInterviewer();
  }
  const deadlines = { replyDeadlineMs: config.interviewReplyDeadlineMs, scoreDeadlineMs: config.interviewScoreDeadlineMs };
  if (choice.provider === 'anthropic') {
    const client = new Anthropic({
      apiKey: config.anthropicApiKey,
      baseURL: 'https://api.anthropic.com',
      logLevel: 'off',
      timeout: config.anthropicTimeoutMs,
      maxRetries: config.anthropicMaxRetries,
    });
    log.log(`Interviewer: ${choice.model} through the Anthropic API.`);
    return new ClaudeInterviewer(client, { model: choice.model, ...deadlines }, spend);
  }
  const loaded = await loadGatewayModel(choice.model, fetchFn);
  if (!loaded.model) {
    log.error(`${loaded.reason} Using the offline scripted interviewer.`);
    return new OfflineInterviewer();
  }
  if (loaded.source === 'built-in') log.warn(`The AI Gateway catalog is unreachable; ${choice.model} uses its built-in prices.`);
  const apiKey = config.aiGatewayApiKey;
  const client = new GatewayClient(apiKey ? () => apiKey : getVercelOidcTokenSync, fetchFn);
  log.log(`Interviewer: ${choice.model} through the Vercel AI Gateway (${choice.credential}).`);
  return new GatewayInterviewer(client, loaded.model, spend, {
    timeoutMs: config.anthropicTimeoutMs,
    maxRetries: config.anthropicMaxRetries,
    ...deadlines,
  });
}
