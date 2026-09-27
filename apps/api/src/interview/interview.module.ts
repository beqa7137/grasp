import Anthropic from '@anthropic-ai/sdk';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, ConfigError, type AppConfig } from '../config.js';
import { SpendStore } from '../persistence/spend.store.js';
import { ClaudeInterviewer } from './claude.interviewer.js';
import { InterviewController } from './interview.controller.js';
import { InterviewService } from './interview.service.js';
import { Interviewer } from './interviewer.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { priceFor } from './pricing.js';
import { SpendGuard } from './spend-guard.js';

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    {
      provide: SpendGuard,
      inject: [APP_CONFIG, SpendStore],
      useFactory: (config: AppConfig, store: SpendStore) => new SpendGuard(config.aiDailyBudgetUsd, store),
    },
    {
      provide: Interviewer,
      inject: [APP_CONFIG, SpendGuard],
      useFactory: (config: AppConfig, spend: SpendGuard) => {
        const log = new Logger('Interviewer');
        if (!config.anthropicApiKey) {
          log.warn('ANTHROPIC_API_KEY not set; using the offline scripted interviewer.');
          return new OfflineInterviewer();
        }
        if (!priceFor(config.anthropicModel)) {
          throw new ConfigError('ANTHROPIC_MODEL must have verified pricing and request limits.');
        }
        if (process.env['ANTHROPIC_CUSTOM_HEADERS']?.trim()) {
          throw new ConfigError('ANTHROPIC_CUSTOM_HEADERS is incompatible with verified AI spend limits.');
        }
        if (process.env['ANTHROPIC_BASE_URL'] && process.env['ANTHROPIC_BASE_URL'].replace(/\/$/, '') !== 'https://api.anthropic.com') {
          throw new ConfigError('ANTHROPIC_BASE_URL must use the standard Anthropic endpoint for verified AI spend limits.');
        }
        const client = new Anthropic({
          apiKey: config.anthropicApiKey,
          baseURL: 'https://api.anthropic.com',
          logLevel: 'off',
          timeout: config.anthropicTimeoutMs,
          maxRetries: config.anthropicMaxRetries,
        });
        return new ClaudeInterviewer(client, { model: config.anthropicModel }, spend);
      },
    },
  ],
  exports: [Interviewer],
})
export class InterviewModule {}
